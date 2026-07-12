import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { callChatLlm } from '../../chat/llm-chat.helper';
import { classifyByRules } from './intent-rules';
import { classifyReadOnlyV2 } from './intent-v2-rules';
import { INTENTS, IntentClassifierInput, IntentDecision, IntentDecisionV2, RESPONSE_MODES, RISK_LEVELS } from './intent-classifier.types';
import { IntentSemanticService } from './intent-semantic.service';
import { compareShadowDecisions } from './intent-shadow';

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly semantic?: IntentSemanticService,
  ) {}

  async classify(input: IntentClassifierInput): Promise<IntentDecision> {
    const rule = classifyByRules(input);
    if (rule) return rule;
    if (input.useModelFallback !== false) {
      try { return await this.classifyWithModel(input); } catch { /* conservative fallback below */ }
    }
    return {
      intent: 'unknown_mixed', subIntent: null, confidence: 0.35, riskLevel: 'low',
      requiresContext: true, requiresKnowledge: false, requiresWriteTool: false,
      suggestedTools: ['memory.context.assemble'], responseMode: 'clarify', entities: {},
      clarifyingQuestion: '你希望我帮你记录数据、调整计划，还是给一些建议？', classifier: 'fallback',
    };
  }

  async classifyV2(input: IntentClassifierInput): Promise<IntentDecisionV2> {
    const legacyRule = classifyByRules(input);
    if (legacyRule && (
      legacyRule.intent === 'out_of_domain' ||
      legacyRule.intent === 'plan_adjustment' ||
      legacyRule.riskLevel === 'high' ||
      legacyRule.requiresWriteTool
    )) {
      return this.mapLegacyDecision(legacyRule);
    }
    const readOnly = classifyReadOnlyV2(input);
    if (readOnly) return readOnly;
    const legacyDecision = legacyRule ?? await this.classify(input);
    this.runShadow(input, legacyDecision);
    return this.mapLegacyDecision(legacyDecision);
  }

  private runShadow(input: IntentClassifierInput, legacyDecision: IntentDecision): void {
    if (this.config.get<string>('INTENT_CLASSIFIER_VERSION')?.trim().toLowerCase() !== 'v2-shadow') return;
    if (!this.semantic || legacyDecision.riskLevel === 'high' || legacyDecision.requiresWriteTool) return;
    const startedAt = Date.now();
    void this.semantic.classify(input).then((shadow) => {
      const executed = this.mapLegacyDecision(legacyDecision);
      const comparison = compareShadowDecisions(executed, shadow);
      this.logger.log(JSON.stringify({
        event: 'intent_v2_shadow', classifierVersion: 'v2-shadow', classifier: shadow.classifier,
        legacyIntent: legacyDecision.intent, resource: shadow.resource, operation: shadow.operation,
        scope: shadow.scope, confidence: shadow.confidence, riskLevel: shadow.riskLevel,
        selectedRoute: shadow.selectedRoute, differs: comparison.differs,
        differingFields: comparison.differingFields,
        meetsReadOnlyThreshold: shadow.confidence >= this.modelMinConfidence(),
        durationMs: Date.now() - startedAt,
      }));
    }).catch((error) => {
      this.logger.warn(JSON.stringify({
        event: 'intent_v2_shadow_error', classifierVersion: 'v2-shadow',
        errorType: this.shadowErrorType(error), durationMs: Date.now() - startedAt,
      }));
    });
  }

  private shadowErrorType(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/JSON|semantic/i.test(message)) return 'invalid_response';
    if (/429/.test(message)) return 'rate_limited';
    if (/abort|timeout/i.test(message)) return 'timeout';
    if (/No chat provider configured/.test(message)) return 'not_configured';
    return 'provider_error';
  }

  private modelMinConfidence(): number {
    const configured = Number(this.config.get<string>('INTENT_MODEL_MIN_CONFIDENCE'));
    return Number.isFinite(configured) && configured >= 0 && configured <= 1 ? configured : 0.8;
  }

  private mapLegacyDecision(legacyDecision: IntentDecision): IntentDecisionV2 {
    const requestedWrite = legacyDecision.requiresWriteTool || legacyDecision.intent === 'plan_adjustment';
    const operation = legacyDecision.intent === 'plan_adjustment'
      ? 'update'
      : legacyDecision.requiresWriteTool ? 'create'
        : legacyDecision.intent === 'fitness_advice' ? 'advise' : 'clarify';
    const resource = legacyDecision.intent === 'plan_adjustment' ? 'plan'
      : legacyDecision.intent === 'diet_log' ? 'diet'
        : legacyDecision.intent === 'training_log' ? 'training'
          : legacyDecision.intent === 'body_data_update' ? 'weight'
            : legacyDecision.intent === 'social_chat' ? 'social' : 'general';
    return {
      version: 'v2', legacyIntent: legacyDecision.intent, resource, operation,
      scope: null, subIntent: legacyDecision.subIntent, confidence: legacyDecision.confidence,
      riskLevel: legacyDecision.riskLevel, requiresContext: legacyDecision.requiresContext,
      requiresKnowledge: legacyDecision.requiresKnowledge, requestedWrite,
      explicitWriteEvidence: [], suggestedTools: legacyDecision.suggestedTools,
      entities: legacyDecision.entities, clarifyingQuestion: legacyDecision.clarifyingQuestion,
      classifier: legacyDecision.classifier, matchedRuleIds: [], selectedRoute: null,
      legacyDecision,
    };
  }

  private async classifyWithModel(input: IntentClassifierInput): Promise<IntentDecision> {
    const { reply } = await callChatLlm([
      { role: 'system', content: '你是 RightNow 意图分类器。只返回 JSON，不能编造输入中不存在的事实。意图只能是 diet_log, training_log, body_data_update, fitness_advice, plan_adjustment, social_chat, unknown_mixed, out_of_domain。代码、文档、旅行、财务等非健身任务必须选择 out_of_domain，且不读取上下文、不检索知识、不调用写工具。疼痛、伤病、头晕、极端节食必须为 high risk；健身领域内不确定时选择 unknown_mixed。输出字段：intent, subIntent, confidence, riskLevel, requiresContext, requiresKnowledge, requiresWriteTool, suggestedTools, responseMode, entities, clarifyingQuestion。' },
      { role: 'user', content: JSON.stringify(input) },
    ], {
      stepfunBaseUrl: this.config.get('STEPFUN_BASE_URL'), stepfunApiKey: this.config.get('STEPFUN_API_KEY'), stepfunModel: this.config.get('STEPFUN_CHAT_MODEL'),
      deepseekBaseUrl: this.config.get('DEEPSEEK_BASE_URL'), deepseekApiKey: this.config.get('DEEPSEEK_API_KEY'), deepseekModel: this.config.get('DEEPSEEK_CHAT_MODEL'),
    }, { temperature: 0.1, maxTokens: 600 });
    const parsed = JSON.parse(reply.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()) as Partial<IntentDecision>;
    if (!INTENTS.includes(parsed.intent as never) || !RISK_LEVELS.includes(parsed.riskLevel as never) || !RESPONSE_MODES.includes(parsed.responseMode as never)) throw new Error('Invalid classifier enum');
    return {
      intent: parsed.intent!, subIntent: typeof parsed.subIntent === 'string' ? parsed.subIntent : null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)), riskLevel: parsed.riskLevel!,
      requiresContext: Boolean(parsed.requiresContext), requiresKnowledge: Boolean(parsed.requiresKnowledge), requiresWriteTool: Boolean(parsed.requiresWriteTool),
      suggestedTools: Array.isArray(parsed.suggestedTools) ? parsed.suggestedTools.filter((x): x is string => typeof x === 'string') : [],
      responseMode: parsed.responseMode!, entities: parsed.entities && typeof parsed.entities === 'object' ? parsed.entities : {},
      clarifyingQuestion: typeof parsed.clarifyingQuestion === 'string' ? parsed.clarifyingQuestion : null, classifier: 'model',
    };
  }
}
