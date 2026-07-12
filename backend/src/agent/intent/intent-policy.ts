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

function dateScope(message: string): IntentScope | null {
  if (/(明天|明日)/.test(message)) return 'tomorrow';
  if (/(这周|本周|这星期|这个星期)/.test(message)) return 'week';
  if (/(今天|今日)/.test(message)) return 'today';
  if (/(最近|过去|历史)/.test(message)) return 'history';
  return null;
}

function writeEvidence(message: string): string[] {
  const patterns = [
    /(?:记一下|记录|保存|吃了)/, /(?:创建|新增|加一个|提醒)/, /(?:换成|替换|调整|修改|改成)/,
    /(?:练完|做完|完成了|刚练|做了)/, /(?:体重|重了|瘦了).{0,8}\d+(?:\.\d+)?\s*(?:kg|公斤|斤)?/i,
  ];
  return patterns.flatMap((pattern) => message.match(pattern)?.[0] || []).slice(0, 4);
}
