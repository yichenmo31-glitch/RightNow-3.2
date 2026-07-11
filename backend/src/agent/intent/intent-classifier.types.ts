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
