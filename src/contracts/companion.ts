/**
 * Shared companion/gamification API contracts.
 */

export type CompanionAction = "feed" | "rest" | "manual_share";

export type CompanionSignal =
  | "chat"
  | "external-source"
  | "autopost-success"
  | "autopost-failure";

export type CompanionMoodTier =
  | "excited"
  | "calm"
  | "neutral"
  | "low"
  | "burnout";

export type CompanionPolicyLevel = "strict" | "balanced" | "aggressive";

export interface CompanionStats {
  mood: number;
  hunger: number;
  energy: number;
  social: number;
}

export interface CompanionCooldowns {
  feedAvailableAtMs: number;
  restAvailableAtMs: number;
  manualShareAvailableAtMs: number;
}

export interface CompanionDailyStats {
  dayKey: string;
  timezone: string;
  chatCount: number;
  externalCount: number;
  manualShareCount: number;
  autoPostCount: number;
  lastResetAtMs: number;
}

export interface CompanionAutopostState {
  enabled: boolean;
  dryRun: boolean;
  policyLevel: CompanionPolicyLevel;
  quietHoursStart: number;
  quietHoursEnd: number;
  maxPostsPerDay: number;
  intervalMinutes: number;
  jitterMinutes: number;
  nextAttemptAtMs: number;
  pauseUntilMs: number | null;
  failureWindowStartMs: number | null;
  failureCountInWindow: number;
  lastAttemptAtMs: number | null;
  lastSuccessAtMs: number | null;
  recentPostHashes: string[];
}

export interface CompanionActivityEvent {
  id: string;
  ts: number;
  kind:
    | "decay"
    | "action"
    | "signal"
    | "level-up"
    | "autopost"
    | "settings"
    | "system";
  message: string;
  metadata?: Record<string, unknown>;
}

export interface CompanionState {
  version: number;
  stats: CompanionStats;
  xp: number;
  level: number;
  streakDays: number;
  lastAppliedAtMs: number;
  cooldowns: CompanionCooldowns;
  daily: CompanionDailyStats;
  autopost: CompanionAutopostState;
  activity: CompanionActivityEvent[];
}

export interface CompanionThresholds {
  softPenalty: boolean;
  autopostEligible: boolean;
  reasons: string[];
}

export interface CompanionTodaySummary {
  timezone: string;
  dayKey: string;
  chatCount: number;
  chatCap: number;
  externalCount: number;
  externalCap: number;
  manualShareCount: number;
  manualShareCap: number;
  autoPostCount: number;
  autoPostCap: number;
}

export interface CompanionStateSnapshot {
  state: CompanionState;
  moodTier: CompanionMoodTier;
  nextLevelXp: number;
  thresholds: CompanionThresholds;
  today: CompanionTodaySummary;
}

export interface CompanionStateResponse {
  snapshot: CompanionStateSnapshot;
}

export interface CompanionActivityResponse {
  activity: CompanionActivityEvent[];
}

export interface RunCompanionActionRequest {
  action: CompanionAction;
}

export interface RunCompanionActionResponse {
  ok: boolean;
  error?: string;
  snapshot: CompanionStateSnapshot;
}

export interface UpdateCompanionSettingsRequest {
  timezone?: string;
  autopostEnabled?: boolean;
  autopostDryRun?: boolean;
  policyLevel?: CompanionPolicyLevel;
  quietHours?: {
    start: number;
    end: number;
  };
}

export interface UpdateCompanionSettingsResponse {
  snapshot: CompanionStateSnapshot;
}
