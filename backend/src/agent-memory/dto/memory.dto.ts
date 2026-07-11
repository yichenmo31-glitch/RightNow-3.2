export enum MemoryCategory {
  ResponseStyle = 'RESPONSE_STYLE',
  ExercisePreference = 'EXERCISE_PREFERENCE',
  HealthRisk = 'HEALTH_RISK',
  Allergy = 'ALLERGY',
  ExecutionAuthorization = 'EXECUTION_AUTHORIZATION',
  Other = 'OTHER',
}

export enum MemorySource {
  UserExplicit = 'USER_EXPLICIT',
  UserConfirmed = 'USER_CONFIRMED',
  RepeatedObservation = 'REPEATED_OBSERVATION',
  SystemInferred = 'SYSTEM_INFERRED',
}

export enum MemoryStatus {
  Candidate = 'CANDIDATE',
  Confirmed = 'CONFIRMED',
  Rejected = 'REJECTED',
  Expired = 'EXPIRED',
  Superseded = 'SUPERSEDED',
}

export interface MemoryCandidate {
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  confidence: number;
  riskSensitive: boolean;
}

export interface ConfirmMemoryInput {
  userId: string;
  factId: string;
  source: MemorySource;
  confirmationSource?: string;
}

export interface ReplaceMemoryInput {
  userId: string;
  category: MemoryCategory;
  content: string;
  confirmationSource: string;
  confidence?: number;
}
