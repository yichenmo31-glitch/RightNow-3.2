import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../common/push.service';
import { OpenClawClient, OpenClawChatMessage } from '../openclaw/openclaw.client'
import { OpenClawProvisioningService } from '../openclaw/openclaw-provisioning.service';
import { MemorySyncService } from '../agent-memory/memory-sync.service';
import { MemoryOrchestratorService } from '../agent-memory/memory-orchestrator.service';
import { IntentClassifierService } from '../agent/intent/intent-classifier.service';
import { IntentDecision } from '../agent/intent/intent-classifier.types';
import { DietService, FoodAnalysis } from '../diet/diet.service';
import { callChatLlm, ChatTurn } from './llm-chat.helper';
import { TodayPlanQueryService } from './today-plan-query.service';

const DEFAULT_HISTORY_WINDOW = 16;
const DEFAULT_SYSTEM_PROMPT =
  '你是 RightNow 的私人 AI 健身教练。回答要简短、具体、可执行，避免空话。';
const OUT_OF_DOMAIN_REPLY = '这个请求不属于 RightNow 的健身、饮食或健康管理范围，我不能在这里处理。';

interface RagSearchResult {
  sourceLayer: string;
  documents: string[];
}

interface BusinessAction {
  type: 'diet_analyzed' | 'diet_record_created' | 'training_record_created' | 'weight_record_created';
  recordId?: string;
  estimated?: FoodAnalysis;
  todoCompleted?: boolean;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly provisioningService: OpenClawProvisioningService,
    private readonly memorySyncService: MemorySyncService,
    private readonly pushService: PushService,
    private readonly openclawClient: OpenClawClient,
    private readonly memoryOrchestrator: MemoryOrchestratorService,
    private readonly intentClassifier: IntentClassifierService,
    private readonly dietService: DietService,
    private readonly todayPlanQueryService: TodayPlanQueryService,
  ) {}

  async createConversation(userId: string) {
    return this.prisma.chatConversation.create({
      data: { userId },
      select: { id: true, createdAt: true },
    });
  }

  async history(userId: string, page = 1, limit = 20, conversationId?: string) {
    if (conversationId) await this.assertConversationOwner(userId, conversationId);
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [total, descending] = await Promise.all([
      this.prisma.chatMessage.count({ where: { userId, conversationId: conversationId || null } }),
      this.prisma.chatMessage.findMany({
        where: { userId, conversationId: conversationId || null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: safeLimit,
      }),
    ]);

    const records = descending.reverse();

    return {
      data: records.map((r) => this.mapRecord(r)),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async send(
    userId: string,
    content: string,
    options: { systemPrompt?: string; source?: string; conversationId?: string } = {},
  ) {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException('content is required');
    }

    const conversationId = options.conversationId?.trim() || undefined;
    if (conversationId) await this.assertConversationOwner(userId, conversationId);
    const intentV2 = await this.intentClassifier.classifyV2({
      message: trimmed,
      channel: options.source || 'web',
      recentMessages: [],
      useModelFallback: false,
    });
    const intent = intentV2.legacyDecision;

    if (intentV2.selectedRoute) {
      const reply = await this.todayPlanQueryService.execute(userId, intentV2.selectedRoute);
      return this.persistReply(userId, conversationId, trimmed, reply);
    }

    if (intent.intent === 'out_of_domain') {
      return this.persistReply(userId, conversationId, trimmed, OUT_OF_DOMAIN_REPLY);
    }

    const dietAnalysis = intent.intent === 'diet_log'
      ? await this.dietService.analyzeText({ foodName: trimmed })
      : null;
    if (intent.intent === 'diet_log' ||
        (intent.intent === 'training_log' && intent.subIntent === 'complete_training')) {
      return this.persistBusinessReply(
        userId,
        conversationId,
        trimmed,
        intent,
        dietAnalysis,
        options.source || 'web',
      );
    }

    const historyWindow = this.historyWindow();
    const recent = historyWindow > 0
      ? await this.prisma.chatMessage.findMany({
          where: { userId, conversationId: conversationId || null },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: Math.max(0, historyWindow - 1),
        })
      : [];
    const ordered = [
      ...recent.reverse().map((message) => ({ role: message.role, content: message.content })),
      { role: 'user', content: trimmed },
    ];

    const systemPrompt = (options.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT) +
      `\n当前时间: ${this.shanghaiDateTime()}（Asia/Shanghai）` +
      `\n当前用户ID: ${userId}`;

    const messages: OpenClawChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...ordered.map((m): OpenClawChatMessage => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ];

    const rag = intent.requiresKnowledge
      ? await this.searchKnowledge(userId, trimmed, intent, options.source || 'web')
      : null;
    if (rag) {
      messages[0].content += this.knowledgePrompt(rag, intent.riskLevel === 'high');
    } else if (intent.riskLevel === 'high') {
      messages[0].content += this.highRiskPrompt();
    }

    let assistantReply: string;
    try {
      await this.provisioningService.ensureAgent(userId);
      await this.memorySyncService.synchronize(userId);
      const out = await this.openclawClient.chat({
        userId,
        sessionKey: this.openclawClient.toSessionKey(userId, conversationId),
        messages,
      });
      assistantReply = out.content;
    } catch (error) {
      if (!this.directChatFallbackEnabled()) throw error;
      this.logger.warn(`OpenClaw unavailable; using local direct-chat fallback: ${(error as Error).message}`);
      const directMessages = messages.map((message): ChatTurn => ({
        role: message.role === 'tool' ? 'user' : message.role,
        content: message.content,
      }));
      const direct = await callChatLlm(directMessages, {
        stepfunBaseUrl: this.configService.get<string>('STEPFUN_BASE_URL'),
        stepfunApiKey: this.configService.get<string>('STEPFUN_API_KEY'),
        stepfunModel: this.configService.get<string>('STEPFUN_CHAT_MODEL'),
        deepseekBaseUrl: this.configService.get<string>('DEEPSEEK_BASE_URL'),
        deepseekApiKey: this.configService.get<string>('DEEPSEEK_API_KEY'),
        deepseekModel: this.configService.get<string>('DEEPSEEK_CHAT_MODEL'),
      });
      assistantReply = direct.reply;
    }
    const baseAssistantContent = intent.riskLevel === 'high'
      ? `请先停止可能加重不适的活动，不要带伤继续训练。${assistantReply}`
      : assistantReply;

    const persisted = await this.prisma.$transaction(async (tx) => {
      await tx.chatMessage.create({
        data: { userId, conversationId, role: 'user', content: trimmed },
      });
      const businessAction = await this.applyDeterministicWrite(
        tx,
        userId,
        intent,
        trimmed,
        dietAnalysis,
        options.source || 'web',
      );
      const assistantContent = this.decorateBusinessReply(baseAssistantContent, businessAction);
      const assistant = await tx.chatMessage.create({
        data: {
          userId,
          conversationId,
          role: 'assistant',
          content: assistantContent,
        },
      });
      if (conversationId) {
        await tx.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      }
      return { assistant, assistantContent, businessAction };
    });

    const result = {
      ...this.mapRecord(persisted.assistant),
      ...(persisted.businessAction ? { businessAction: persisted.businessAction } : {}),
    };

    this.memoryOrchestrator.captureCandidates(userId, trimmed).catch((error) =>
      this.logger.warn(`Memory candidate capture failed: ${(error as Error).message}`),
    );

    // Chat replies are already persisted above; only deliver them to bound
    // channels here. pushToUser would persist a second identical assistant row.
    if (options.source !== 'wechat') {
      this.pushService.deliverExistingToUser(userId, persisted.assistantContent).catch((err) =>
        this.logger.warn(`deliverExistingToUser failed: ${(err as Error).message}`),
      );
    }

    return result;
  }

  private async persistReply(
    userId: string,
    conversationId: string | undefined,
    userContent: string,
    assistantContent: string,
  ) {
    const reply = await this.prisma.$transaction(async (tx) => {
      await tx.chatMessage.create({
        data: { userId, conversationId, role: 'user', content: userContent },
      });
      const assistant = await tx.chatMessage.create({
        data: { userId, conversationId, role: 'assistant', content: assistantContent },
      });
      if (conversationId) {
        await tx.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      }
      return assistant;
    });
    return this.mapRecord(reply);
  }

  private async persistBusinessReply(
    userId: string,
    conversationId: string | undefined,
    userContent: string,
    intent: IntentDecision,
    dietAnalysis: FoodAnalysis | null,
    channel: string,
  ) {
    const baseContent = intent.intent === 'diet_log'
      ? '营养数据来自常见份量估算。'
      : '本次训练完成信息已处理。';
    const persisted = await this.prisma.$transaction(async (tx) => {
      await tx.chatMessage.create({
        data: { userId, conversationId, role: 'user', content: userContent },
      });
      const businessAction = await this.applyDeterministicWrite(
        tx,
        userId,
        intent,
        userContent,
        dietAnalysis,
        channel,
      );
      const assistantContent = this.decorateBusinessReply(baseContent, businessAction);
      const assistant = await tx.chatMessage.create({
        data: { userId, conversationId, role: 'assistant', content: assistantContent },
      });
      if (conversationId) {
        await tx.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      }
      return { assistant, assistantContent, businessAction };
    });

    if (channel !== 'wechat') {
      this.pushService.deliverExistingToUser(userId, persisted.assistantContent).catch((error) =>
        this.logger.warn(`deliverExistingToUser failed: ${(error as Error).message}`),
      );
    }
    return {
      ...this.mapRecord(persisted.assistant),
      ...(persisted.businessAction ? { businessAction: persisted.businessAction } : {}),
    };
  }

  private async searchKnowledge(
    userId: string,
    query: string,
    intent: IntentDecision,
    channel: string,
  ): Promise<RagSearchResult | null> {
    const startedAt = Date.now();
    const ragUrl = (this.configService.get<string>('RAG_SERVICE_URL') || 'http://127.0.0.1:8000')
      .trim()
      .replace(/\/+$/, '');
    const collection = intent.riskLevel === 'high' ? 'l3' : undefined;
    let ok = false;
    let errorCode: string | undefined;
    let sourceLayer: string | undefined;
    try {
      const response = await fetch(`${ragUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, top_k: 5, ...(collection ? { collection } : {}) }),
      });
      if (!response.ok) {
        errorCode = `RAG_HTTP_${response.status}`;
        return null;
      }
      const payload: any = await response.json();
      const documents = payload?.results?.documents?.[0];
      if (!Array.isArray(documents)) {
        errorCode = 'RAG_INVALID_RESPONSE';
        return null;
      }
      sourceLayer = String(payload.source_layer ?? collection ?? 'unknown');
      if (collection === 'l3' && !['3', 'l3'].includes(sourceLayer.toLowerCase())) {
        errorCode = 'RAG_LAYER_MISMATCH';
        return null;
      }
      ok = true;
      return {
        sourceLayer,
        documents: documents.filter((value: unknown): value is string => typeof value === 'string').slice(0, 5),
      };
    } catch {
      errorCode = 'RAG_UNAVAILABLE';
      return null;
    } finally {
      await this.prisma.agentAuditLog.create({
        data: {
          userId,
          channel,
          channelUserId: userId,
          tool: 'knowledge.search',
          ok,
          errorCode,
          durationMs: Date.now() - startedAt,
          argsDigest: JSON.stringify({
            collection: collection ?? 'auto',
            sourceLayer: sourceLayer ?? null,
            intent: intent.intent,
          }),
        },
      });
    }
  }

  private knowledgePrompt(rag: RagSearchResult, highRisk: boolean): string {
    const context = rag.documents.join('\n---\n').slice(0, 12000);
    return `\n\n检索知识来源层: ${rag.sourceLayer}\n仅根据以下检索资料辅助回答，不要编造来源：\n${context}` +
      (highRisk ? this.highRiskPrompt() : '');
  }

  private highRiskPrompt(): string {
    return '\n\n这是高风险健康请求。必须建议立即停止可能加重伤情的活动，避免诊断、激进训练方案或带伤继续训练，并建议在持续、严重或恶化时寻求专业医疗评估。';
  }

  private directChatFallbackEnabled(): boolean {
    return this.configService.get<string>('CHAT_DIRECT_FALLBACK')?.trim().toLowerCase() === 'true';
  }

  private decorateBusinessReply(content: string, action: BusinessAction | null): string {
    if (!action) return content;
    if (action.type === 'diet_analyzed' && action.estimated) {
      return `这是估算结果，可随时纠正：约 ${action.estimated.calories} 千卡。${content}`;
    }
    if (action.type === 'diet_record_created') {
      const calories = action.estimated?.calories;
      const estimate = Number.isFinite(calories) ? `大致估算约 ${calories} 千卡。` : '已完成大致营养估算。';
      return `${estimate}已写入饮食记录，如份量不准确可以纠正。${content}`;
    }
    if (action.type === 'training_record_created') {
      return `训练已记录（记录 ID：${action.recordId}）${action.todoCompleted ? '，今日训练待办已完成' : ''}。${content}`;
    }
    return content;
  }

  private async applyDeterministicWrite(
    tx: any,
    userId: string,
    intent: IntentDecision,
    content: string,
    dietAnalysis: FoodAnalysis | null,
    channel: string,
  ): Promise<BusinessAction | null> {
    if (intent.intent === 'diet_log' && dietAnalysis) {
      if (!intent.requiresWriteTool) {
        return { type: 'diet_analyzed', estimated: dietAnalysis };
      }
      const record = await tx.dietRecord.create({
        data: {
          userId,
          name: dietAnalysis.name,
          calories: dietAnalysis.calories,
          protein: dietAnalysis.protein,
          fat: dietAnalysis.fat,
          carbs: dietAnalysis.carbs,
          mealType: dietAnalysis.mealType,
          date: this.shanghaiDate(),
        },
      });
      await tx.agentAuditLog.create({
        data: { userId, channel, channelUserId: userId, tool: 'diet.log.create', ok: true },
      });
      return { type: 'diet_record_created', recordId: record.id, estimated: dietAnalysis };
    }

    if (intent.intent === 'training_log' && intent.subIntent === 'complete_training') {
      const record = await tx.trainingRecord.create({
        data: {
          userId,
          description: content,
          date: this.shanghaiDate(),
          targetMuscle: intent.entities.exercise === '深蹲' ? 'legs' : undefined,
          rawInput: { source: 'chat' },
          structuredData: intent.entities,
        },
      });
      const todo = await tx.todo.findFirst({
        where: { userId, category: 'training', date: this.shanghaiDate(), completed: false },
        select: { id: true },
      });
      if (todo) {
        await tx.todo.update({
          where: { id: todo.id },
          data: { completed: true, completedSource: 'auto', completedAt: new Date() },
        });
      }
      await tx.agentAuditLog.create({
        data: { userId, channel, channelUserId: userId, tool: 'training.session.complete', ok: true },
      });
      return { type: 'training_record_created', recordId: record.id, todoCompleted: Boolean(todo) };
    }

    if (intent.intent === 'body_data_update' && intent.subIntent === 'weight_update') {
      const weight = Number(intent.entities.weightKg);
      if (!Number.isFinite(weight) || weight <= 0) return null;
      const record = await tx.weightRecord.create({
        data: { userId, date: this.shanghaiDate(), weight },
      });
      await tx.user.update({ where: { id: userId }, data: { weight } });
      await tx.agentAuditLog.create({
        data: { userId, channel, channelUserId: userId, tool: 'weight.record', ok: true },
      });
      return { type: 'weight_record_created', recordId: record.id };
    }
    return null;
  }

  private shanghaiDate(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private shanghaiDateTime(): string {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date());
  }

  private historyWindow(): number {
    const enabled = (this.configService.get<string>('OPENCLAW_USE_DB_HISTORY') || 'true')
      .trim()
      .toLowerCase();
    if (enabled === 'false' || enabled === '0') return 0;
    const configured = Number(this.configService.get<string>('OPENCLAW_DB_HISTORY_WINDOW'));
    if (!Number.isInteger(configured)) return DEFAULT_HISTORY_WINDOW;
    return Math.min(100, Math.max(0, configured));
  }

  private async assertConversationOwner(userId: string, conversationId: string): Promise<void> {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found.');
  }

  async assertConversation(userId: string, conversationId: string): Promise<void> {
    return this.assertConversationOwner(userId, conversationId);
  }

  private mapRecord(record: {
    id: string;
    role: string;
    content: string;
    createdAt: Date;
  }) {
    return {
      id: record.id,
      role: record.role as 'user' | 'assistant',
      content: record.content,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
