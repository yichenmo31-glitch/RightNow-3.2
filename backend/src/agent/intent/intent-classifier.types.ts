export const INTENTS = [
  'diet_log', 'training_log', 'body_data_update', 'fitness_advice',
  'plan_adjustment', 'social_chat', 'unknown_mixed', 'out_of_domain',
] as const;

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export const RESPONSE_MODES = [
  'short_confirm', 'short_risk', 'medium_advice', 'plan_adjustment',
  'clarify', 'social_support',
] as const;

export type Intent = (typeof INTENTS)[number];
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type ResponseMode = (typeof RESPONSE_MODES)[number];

export interface IntentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface IntentClassifierInput {
  message: string;
  channel?: string;
  hasImage?: boolean;
  imageType?: 'food' | 'body' | 'unknown' | null;
  recentMessages?: IntentMessage[];
  knownContextSummary?: Record<string, unknown>;
  useModelFallback?: boolean;
}

export interface IntentDecision {
  intent: Intent;
  subIntent: string | null;
  confidence: number;
  riskLevel: RiskLevel;
  requiresContext: boolean;
  requiresKnowledge: boolean;
  requiresWriteTool: boolean;
  suggestedTools: string[];
  responseMode: ResponseMode;
  entities: Record<string, unknown>;
  clarifyingQuestion: string | null;
  classifier: 'rule' | 'model' | 'fallback';
}

export const INTENT_RESOURCES = [
  'plan', 'todo', 'training', 'diet', 'weight', 'progress', 'memory', 'social', 'general',
] as const;
export const INTENT_OPERATIONS = [
  'query', 'analyze', 'advise', 'create', 'update', 'complete', 'delete', 'clarify',
] as const;
export const INTENT_SCOPES = [
  'today', 'tomorrow', 'week', 'current', 'latest', 'history',
] as const;
export const READ_ONLY_ROUTES = [
  'today_plan', 'weekly_plan', 'today_todos', 'pending_todos',
] as const;
export const CONTEXT_PROFILES = [
  'none', 'current_plan', 'fitness_state', 'nutrition_state', 'progress_review', 'memory_preferences',
] as const;
export const CONTEXT_READ_KEYS = [
  'active_plan', 'today_todos', 'fitness_plan', 'meal_plan', 'hydration_plan',
  'recent_training_summary', 'recent_diet_summary', 'latest_weight', 'weight_trend',
  'progress_summary', 'todo_completion_summary', 'goal_summary', 'confirmed_preferences',
] as const;

export type IntentResource = (typeof INTENT_RESOURCES)[number];
export type IntentOperation = (typeof INTENT_OPERATIONS)[number];
export type IntentScope = (typeof INTENT_SCOPES)[number];
export type ReadOnlyIntentRoute = (typeof READ_ONLY_ROUTES)[number];
export type ContextProfile = (typeof CONTEXT_PROFILES)[number];
export type ContextReadKey = (typeof CONTEXT_READ_KEYS)[number];

export interface IntentDecisionV2 {
  version: 'v2';
  legacyIntent: Intent;
  resource: IntentResource;
  operation: IntentOperation;
  scope: IntentScope | null;
  subIntent: string | null;
  confidence: number;
  riskLevel: RiskLevel;
  requiresContext: boolean;
  requiresKnowledge: boolean;
  requestedWrite: boolean;
  explicitWriteEvidence: string[];
  suggestedTools: string[];
  entities: Record<string, unknown>;
  clarifyingQuestion: string | null;
  classifier: 'rule' | 'model' | 'hybrid' | 'fallback';
  matchedRuleIds: string[];
  selectedRoute: ReadOnlyIntentRoute | null;
  contextProfile: ContextProfile;
  selectedReadSet: ContextReadKey[];
  legacyDecision: IntentDecision;
}
