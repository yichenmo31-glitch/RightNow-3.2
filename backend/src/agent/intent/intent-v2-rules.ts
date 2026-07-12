import { normalizeIntentInput } from './intent-normalizer';
import { IntentClassifierInput, IntentDecision, IntentDecisionV2, ReadOnlyIntentRoute } from './intent-classifier.types';
import { resolveContextProfile, resolveReadSet } from './intent-policy';

function readOnlyDecision(
  route: ReadOnlyIntentRoute,
  resource: 'plan' | 'todo',
  scope: 'today' | 'week',
  ruleId: string,
): IntentDecisionV2 {
  const legacyDecision: IntentDecision = {
    intent: 'unknown_mixed', subIntent: route, confidence: 0.98, riskLevel: 'low',
    requiresContext: true, requiresKnowledge: false, requiresWriteTool: false,
    suggestedTools: [`${resource}.query`], responseMode: 'short_confirm', entities: {},
    clarifyingQuestion: null, classifier: 'rule',
  };
  const contextProfile = resolveContextProfile(resource, 'query');
  return {
    version: 'v2', legacyIntent: legacyDecision.intent, resource, operation: 'query', scope,
    subIntent: route, confidence: 0.98, riskLevel: 'low', requiresContext: true,
    requiresKnowledge: false, requestedWrite: false, explicitWriteEvidence: [],
    suggestedTools: legacyDecision.suggestedTools, entities: {}, clarifyingQuestion: null,
    classifier: 'rule', matchedRuleIds: [ruleId], selectedRoute: route, legacyDecision,
    contextProfile, selectedReadSet: resolveReadSet(contextProfile),
  };
}

export function classifyReadOnlyV2(input: IntentClassifierInput): IntentDecisionV2 | null {
  const { normalized, features } = normalizeIntentInput(input.message);
  if (!normalized) return null;

  // Safety and explicit mutation language must stay on the legacy policy path.
  if (/(typescript|javascript|python|java|代码|编程|文件|文档|readme|合同|发票|报销|股票|天气|翻译|写邮件|会议纪要|旅行|酒店|机票)/i.test(features)) return null;
  if (/(疼|痛|受伤|胸痛|头晕|昏厥|换成|替换|调整|修改|创建|新增|记录|提醒)/.test(features)) return null;

  if (/(未完成|没完成|待完成|剩余任务)/i.test(features)) {
    return readOnlyDecision('pending_todos', 'todo', 'today', 'read.todo.pending-today.v1');
  }
  if (/(今天|今日).{0,8}(todo|待办|任务)|(?:todo|待办|任务).{0,8}(今天|今日)/i.test(features)) {
    return readOnlyDecision('today_todos', 'todo', 'today', 'read.todo.today.v1');
  }
  if (/(这周|本周|这星期|这个星期).{0,10}(怎么练|练什么|练啥|训练|计划|安排)|(?:训练|计划|安排).{0,10}(这周|本周|这星期|这个星期)/.test(features)) {
    return readOnlyDecision('weekly_plan', 'plan', 'week', 'read.plan.week.v1');
  }
  if (/(今天|今日).{0,10}(计划|安排|练什么|练啥|怎么练|做什么)|(?:计划|安排).{0,8}(今天|今日)/.test(features)) {
    return readOnlyDecision('today_plan', 'plan', 'today', 'read.plan.today.v1');
  }
  return null;
}
