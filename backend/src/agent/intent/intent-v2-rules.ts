import { normalizeIntentInput } from './intent-normalizer';
import { IntentClassifierInput, IntentDecision, IntentDecisionV2, ReadOnlyIntentRoute } from './intent-classifier.types';
import { resolveContextProfile, resolveReadSet } from './intent-policy';

function readOnlyDecision(
  route: ReadOnlyIntentRoute,
  resource: 'plan' | 'todo' | 'diet' | 'training' | 'weight' | 'progress',
  scope: 'today' | 'week' | 'history' | 'latest' | 'current',
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
  if (/(疼|痛|受伤|胸痛|头晕|昏厥)/.test(features)) return null;

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
  if (/(今天|今日).{0,12}(吃了多少|吃过什么|饮食|摄入|热量|营养|食物)|(?:饮食|摄入|食物).{0,10}(今天|今日)/.test(features)) {
    return readOnlyDecision('today_diet', 'diet', 'today', 'read.diet.today.v1');
  }
  if (/(最近|过去|历史|之前|前几次).{0,12}(练了|训练|动作|运动记录)|(?:训练|运动).{0,8}(历史|记录)/.test(features)) {
    return readOnlyDecision('training_history', 'training', 'history', 'read.training.history.v1');
  }
  if (/(现在|当前|最新|最近一次|上次).{0,8}(体重|多重|多少斤)|(?:体重|称重).{0,8}(最新|最近一次|上次|是多少)/.test(features)) {
    return readOnlyDecision('latest_weight', 'weight', 'latest', 'read.weight.latest.v1');
  }
  if (/(进展|表现|进步|成果|效果|进度|变化).{0,8}(怎么样|如何|吗)|(?:分析|评估|看看).{0,8}(进展|表现|状态|进度)/.test(features)) {
    return readOnlyDecision('current_progress', 'progress', 'current', 'read.progress.current.v1');
  }
  if (/(换成|替换|调整|修改|创建|新增|记录|提醒)/.test(features)) return null;
  return null;
}
