import {
  ContextProfile, ContextReadKey, IntentDecision, IntentOperation, IntentResource, IntentScope,
} from './intent-classifier.types';

export const CONTEXT_READ_SETS: Record<ContextProfile, readonly ContextReadKey[]> = {
  none: [],
  current_plan: ['active_plan', 'today_todos'],
  fitness_state: [
    'active_plan', 'fitness_plan', 'meal_plan', 'hydration_plan', 'recent_training_summary',
    'recent_diet_summary', 'latest_weight', 'progress_summary', 'confirmed_preferences',
  ],
  nutrition_state: [
    'meal_plan', 'recent_diet_summary', 'recent_training_summary', 'latest_weight',
    'goal_summary', 'confirmed_preferences',
  ],
  progress_review: [
    'active_plan', 'recent_training_summary', 'recent_diet_summary', 'weight_trend',
    'todo_completion_summary', 'progress_summary',
  ],
  memory_preferences: ['confirmed_preferences'],
};

export interface LegacyPolicyMapping {
  resource: IntentResource;
  operation: IntentOperation;
  scope: IntentScope | null;
  requestedWrite: boolean;
  explicitWriteEvidence: string[];
  matchedRuleIds: string[];
  contextProfile: ContextProfile;
  selectedReadSet: ContextReadKey[];
}

export function mapLegacyPolicy(decision: IntentDecision, message = ''): LegacyPolicyMapping {
  const normalized = message.normalize('NFKC').trim();
  const evidence = writeEvidence(normalized);
  let resource: IntentResource = 'general';
  let operation: IntentOperation = 'clarify';
  let scope: IntentScope | null = dateScope(normalized);
  let ruleId = 'fallback.legacy.v1';

  if (decision.intent === 'out_of_domain') {
    ruleId = 'safety.out-of-domain.v1';
  } else if (decision.riskLevel === 'high') {
    resource = decision.intent === 'body_data_update' ? 'progress' : 'training';
    operation = decision.requiresWriteTool ? 'update' : 'advise';
    ruleId = 'safety.high-risk.v1';
  } else if (decision.intent === 'plan_adjustment') {
    resource = 'plan'; operation = 'update'; ruleId = 'write.plan-explicit.v1';
  } else if (decision.subIntent === 'todo_create_request') {
    resource = 'todo'; operation = 'create'; ruleId = 'write.todo-explicit.v1';
  } else if (decision.intent === 'diet_log') {
    resource = 'diet';
    operation = decision.requiresWriteTool ? 'create' : 'analyze';
    ruleId = decision.requiresWriteTool ? 'write.diet-explicit.v1' : 'analyze.diet.v1';
  } else if (decision.intent === 'training_log') {
    resource = 'training';
    operation = decision.subIntent === 'complete_training' ? 'complete' : 'update';
    ruleId = decision.subIntent === 'complete_training' ? 'write.training-complete.v1' : 'write.training-update.v1';
  } else if (decision.intent === 'body_data_update') {
    resource = decision.subIntent === 'weight_update' ? 'weight' : 'progress';
    operation = decision.requiresWriteTool ? 'update' : 'analyze';
    ruleId = decision.subIntent === 'weight_update' ? 'write.weight-explicit.v1' : 'analyze.body-state.v1';
  } else if (decision.intent === 'fitness_advice') {
    resource = decision.subIntent === 'diet_advice' ? 'diet' : 'training';
    operation = 'advise'; ruleId = 'advice.fitness.v1';
  } else if (decision.intent === 'social_chat') {
    resource = 'social'; operation = 'advise'; ruleId = 'social.support.v1';
  } else if (decision.subIntent === 'memory_check') {
    resource = 'memory'; operation = 'query'; ruleId = 'read.memory.v1';
  }

  const requestedWrite = decision.riskLevel !== 'high' && ['create', 'update', 'complete', 'delete'].includes(operation) &&
    (decision.requiresWriteTool || decision.intent === 'plan_adjustment') && evidence.length > 0;
  const contextProfile = resolveContextProfile(resource, operation);
  return {
    resource, operation, scope, requestedWrite,
    explicitWriteEvidence: requestedWrite ? evidence : [],
    matchedRuleIds: [ruleId], contextProfile,
    selectedReadSet: [...CONTEXT_READ_SETS[contextProfile]],
  };
}

export function resolveContextProfile(resource: IntentResource, operation: IntentOperation): ContextProfile {
  if (resource === 'general' || resource === 'social') return 'none';
  if (resource === 'memory') return 'memory_preferences';
  if (resource === 'progress' || operation === 'analyze') return resource === 'diet' ? 'nutrition_state' : 'progress_review';
  if (resource === 'diet') return operation === 'query' ? 'nutrition_state' : 'nutrition_state';
  if (resource === 'plan' || resource === 'todo') return operation === 'query' ? 'current_plan' : 'fitness_state';
  if (resource === 'training' || resource === 'weight') return 'fitness_state';
  return 'none';
}

export function resolveReadSet(profile: ContextProfile): ContextReadKey[] {
  return [...CONTEXT_READ_SETS[profile]];
}

export function normalizeSemanticPolicy(
  resource: IntentResource,
  operation: IntentOperation,
  modelScope: IntentScope | null,
  message: string,
): { resource: IntentResource; operation: IntentOperation; scope: IntentScope | null; matchedRuleIds: string[] } {
  const normalized = message.normalize('NFKC').trim();
  const matchedRuleIds: string[] = [];
  let resolvedOperation = operation;
  let resolvedResource = resource;
  let scope = explicitScope(normalized);

  if (/(以后|之后|记住)/.test(normalized) && /(回答|推荐|安排|喜欢|偏好|不喜欢|不要)/.test(normalized)) {
    resolvedResource = 'memory'; resolvedOperation = 'update'; scope = 'current';
    matchedRuleIds.push('normalize.memory-preference.v1');
  } else if (/(提醒|待办|任务|todo|事项)/i.test(normalized) && /(创建|新增|加一个|加个|提醒)/.test(normalized)) {
    resolvedResource = 'todo'; resolvedOperation = 'create';
    matchedRuleIds.push('normalize.todo-create.v1');
  } else if (/(换成|替换|改成|调轻|调整|修改|减少|改练)/.test(normalized) &&
      /(计划|训练|深蹲|卧推|硬拉|跑步|有氧|骑车|练腿|练背|训练时长|训练顺序)/.test(normalized)) {
    resolvedResource = 'plan'; resolvedOperation = 'update';
    matchedRuleIds.push('normalize.plan-update.v1');
  } else if ((scope === 'today' || scope === 'week') &&
      /(计划|安排|练什么|练啥|怎么练|有什么训练|该做哪些运动|要练|训练日|几次训练)/.test(normalized) &&
      !/(历史|过去|最近练了|完成|做过)/.test(normalized)) {
    resolvedResource = 'plan'; resolvedOperation = 'query';
    matchedRuleIds.push('normalize.plan-query.v1');
  } else if (/(todo|待办|任务|事项|清单)/i.test(normalized) && operation === 'query') {
    resolvedResource = 'todo';
    matchedRuleIds.push('normalize.todo-query.v1');
  }

  if (/(计划执行|阶段成果|健身效果)/.test(normalized) && /(怎么样|如何|分析|评估|成果|效果)/.test(normalized)) {
    resolvedResource = 'progress'; resolvedOperation = 'analyze';
    matchedRuleIds.push('normalize.progress-review.v1');
  }

  if (resolvedResource === 'progress' && resolvedOperation === 'query' && /(怎么样|如何|表现|进展|趋势|变化|进步|成果|效果|执行)/.test(normalized)) {
    resolvedOperation = 'analyze';
    matchedRuleIds.push('normalize.progress-analyze.v1');
  }
  if (!scope && resolvedResource === 'todo' && ['query', 'create'].includes(resolvedOperation)) {
    scope = 'today';
    matchedRuleIds.push('scope.todo-default-today.v1');
  }
  if (!scope && resolvedResource === 'progress' && ['query', 'analyze'].includes(resolvedOperation)) {
    scope = 'current';
    matchedRuleIds.push('scope.progress-current.v1');
  }
  if (!scope && resolvedResource === 'weight' && /(最新|最近一次|最近体重|上次称重|现在|当前)/.test(normalized)) {
    scope = 'latest';
    matchedRuleIds.push('scope.weight-latest.v1');
  }
  if (!scope && ['training', 'diet'].includes(resolvedResource) && resolvedOperation === 'query' && /(最近|过去|历史|都练了|都吃了)/.test(normalized)) {
    scope = 'history';
    matchedRuleIds.push('scope.history-explicit.v1');
  }
  if (!scope && resolvedResource === 'memory') scope = 'current';
  return { resource: resolvedResource, operation: resolvedOperation, scope: scope ?? modelScope, matchedRuleIds };
}

function dateScope(message: string): IntentScope | null {
  if (/(明天|明日)/.test(message)) return 'tomorrow';
  if (/(这周|本周|这星期|这个星期)/.test(message)) return 'week';
  if (/(今天|今日)/.test(message)) return 'today';
  if (/(最近|过去|历史)/.test(message)) return 'history';
  return null;
}

function explicitScope(message: string): IntentScope | null {
  if (/(明天|明日)/.test(message)) return 'tomorrow';
  if (/(这周|本周|这星期|这个星期)/.test(message)) return 'week';
  if (/(今天|今日)/.test(message)) return 'today';
  return null;
}

function writeEvidence(message: string): string[] {
  const patterns = [
    /(?:记一下|记录|保存|吃了)/, /(?:创建|新增|加一个|提醒)/, /(?:换成|替换|调整|修改|改成)/,
    /(?:练完|做完|完成了|刚练|做了)/, /(?:体重|重了|瘦了).{0,8}\d+(?:\.\d+)?\s*(?:kg|公斤|斤)?/i,
  ];
  return patterns.flatMap((pattern) => message.match(pattern)?.[0] || []).slice(0, 4);
}
