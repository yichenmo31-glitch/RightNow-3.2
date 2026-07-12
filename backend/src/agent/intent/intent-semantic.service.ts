import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { callChatLlm } from '../../chat/llm-chat.helper';
import {
  INTENT_OPERATIONS, INTENT_RESOURCES, INTENT_SCOPES, IntentClassifierInput,
  IntentDecisionV2, IntentOperation, IntentResource, IntentScope, READ_ONLY_ROUTES,
  RISK_LEVELS,
} from './intent-classifier.types';
import { normalizeSemanticPolicy, resolveContextProfile, resolveReadSet } from './intent-policy';

interface SemanticPayload {
  resource?: unknown;
  operation?: unknown;
  scope?: unknown;
  subIntent?: unknown;
  confidence?: unknown;
  riskLevel?: unknown;
  requiresContext?: unknown;
  requiresKnowledge?: unknown;
  requestedWrite?: unknown;
  explicitWriteEvidence?: unknown;
  suggestedTools?: unknown;
  clarifyingQuestion?: unknown;
}

@Injectable()
export class IntentSemanticService {
  constructor(private readonly config: ConfigService) {}

  async classify(input: IntentClassifierInput): Promise<IntentDecisionV2> {
    const { reply } = await callChatLlm([
      {
        role: 'system',
        content: [
          '你是 RightNow V2 意图分类器，只返回 JSON。',
          '你不能调用工具、执行写入、决定身份，也不能补充输入中不存在的事实。',
          `resource 只能是: ${INTENT_RESOURCES.join(', ')}`,
          `operation 只能是: ${INTENT_OPERATIONS.join(', ')}`,
          `scope 只能是: ${INTENT_SCOPES.join(', ')} 或 null`,
          'resource 判定：plan=日程/周安排；todo=待办；training=训练记录或训练方法；diet=饮食；weight=体重；progress=阶段成果或趋势；memory=稳定偏好。',
          'operation 判定：query=读取事实；analyze=分析已有数据；advise=给方法建议；create/update/complete/delete=用户请求改变状态。',
          '示例：最近训练表现怎么样 -> progress/analyze/current；最近都练了哪些动作 -> training/query/history；新手怎么安排力量训练 -> training/advise/null。',
          '示例：把今天的深蹲换成腿举 -> plan/update/today；以后回答简短一些 -> memory/update/current。',
          '输出字段: resource, operation, scope, subIntent, confidence, riskLevel, requiresContext, requiresKnowledge, requestedWrite, explicitWriteEvidence, suggestedTools, clarifyingQuestion。',
          '绑定、删除、隐私、疼痛伤病和明确写入只做分类描述，不代表授权。',
        ].join('\n'),
      },
      { role: 'user', content: JSON.stringify(this.restrictedInput(input)) },
    ], {
      stepfunBaseUrl: this.config.get('INTENT_MODEL_BASE_URL') || this.config.get('STEPFUN_BASE_URL'),
      stepfunApiKey: this.config.get('INTENT_MODEL_API_KEY') || this.config.get('STEPFUN_API_KEY'),
      stepfunModel: this.config.get('INTENT_MODEL_NAME') || this.config.get('STEPFUN_CHAT_MODEL'),
      deepseekBaseUrl: this.config.get('DEEPSEEK_BASE_URL'),
      deepseekApiKey: this.config.get('DEEPSEEK_API_KEY'),
      deepseekModel: this.config.get('DEEPSEEK_CHAT_MODEL'),
    }, {
      temperature: 0.1,
      maxTokens: 500,
      timeoutMs: this.positiveInteger('INTENT_MODEL_TIMEOUT_MS', 7000),
      maxAttempts: this.positiveInteger('INTENT_MODEL_MAX_ATTEMPTS', 2),
    });
    return this.parse(reply, input.message);
  }

  private restrictedInput(input: IntentClassifierInput): Record<string, unknown> {
    const state: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(input.knownContextSummary || {})) {
      if (typeof value === 'boolean' && /^(has|is|can)[A-Z_]/.test(key)) state[key] = value;
    }
    return {
      message: input.message.slice(0, 2000),
      channel: (input.channel || 'unknown').slice(0, 32),
      hasImage: Boolean(input.hasImage),
      imageType: input.imageType || null,
      recentMessages: (input.recentMessages || []).slice(-4).map((message) => ({
        role: message.role,
        content: message.content.slice(0, 1000),
      })),
      state,
    };
  }

  private parse(raw: string, message: string): IntentDecisionV2 {
    const payload = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()) as SemanticPayload;
    if (!INTENT_RESOURCES.includes(payload.resource as IntentResource)) throw new Error('Invalid semantic resource');
    if (!INTENT_OPERATIONS.includes(payload.operation as IntentOperation)) throw new Error('Invalid semantic operation');
    const modelScope = this.normalizeScope(payload.scope);
    if (modelScope !== null && !INTENT_SCOPES.includes(modelScope)) throw new Error('Invalid semantic scope');
    if (!RISK_LEVELS.includes(payload.riskLevel as never)) throw new Error('Invalid semantic risk level');
    const confidence = Number(payload.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Invalid semantic confidence');
    const subIntent = typeof payload.subIntent === 'string' ? payload.subIntent.slice(0, 64) : null;
    const selectedRoute = READ_ONLY_ROUTES.includes(subIntent as never) ? subIntent as any : null;
    const modelResource = payload.resource as IntentResource;
    const modelOperation = payload.operation as IntentOperation;
    const normalizedPolicy = normalizeSemanticPolicy(
      modelResource, modelOperation, modelScope, message,
    );
    const resource = normalizedPolicy.resource;
    const operation = normalizedPolicy.operation;
    const contextProfile = resolveContextProfile(resource, operation);
    const legacyDecision = {
      intent: 'unknown_mixed' as const, subIntent, confidence,
      riskLevel: payload.riskLevel as any, requiresContext: Boolean(payload.requiresContext),
      requiresKnowledge: Boolean(payload.requiresKnowledge), requiresWriteTool: false,
      suggestedTools: [], responseMode: 'clarify' as const, entities: {},
      clarifyingQuestion: typeof payload.clarifyingQuestion === 'string' ? payload.clarifyingQuestion.slice(0, 200) : null,
      classifier: 'model' as const,
    };
    return {
      version: 'v2', legacyIntent: 'unknown_mixed', resource,
      operation, scope: normalizedPolicy.scope,
      subIntent, confidence, riskLevel: payload.riskLevel as any,
      requiresContext: Boolean(payload.requiresContext), requiresKnowledge: Boolean(payload.requiresKnowledge),
      requestedWrite: Boolean(payload.requestedWrite),
      explicitWriteEvidence: Array.isArray(payload.explicitWriteEvidence)
        ? payload.explicitWriteEvidence.filter((value): value is string => typeof value === 'string').slice(0, 4).map((value) => value.slice(0, 80)) : [],
      suggestedTools: Array.isArray(payload.suggestedTools)
        ? payload.suggestedTools.filter((value): value is string => typeof value === 'string').slice(0, 8).map((value) => value.slice(0, 80)) : [],
      entities: {}, clarifyingQuestion: legacyDecision.clarifyingQuestion,
      classifier: normalizedPolicy.matchedRuleIds.length ? 'hybrid' : 'model',
      matchedRuleIds: normalizedPolicy.matchedRuleIds, selectedRoute, legacyDecision,
      contextProfile, selectedReadSet: resolveReadSet(contextProfile),
    };
  }

  private positiveInteger(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private normalizeScope(value: unknown): IntentScope | null {
    if (value === null || value === undefined || value === '' ||
        (typeof value === 'string' && ['none', 'null', 'unspecified', 'n/a'].includes(value.toLowerCase()))) {
      return null;
    }
    return value as IntentScope;
  }
}
