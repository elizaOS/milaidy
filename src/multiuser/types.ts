/**
 * Multi-user domain model scaffold for Milaidy.
 *
 * This file defines the canonical types used by auth, tenancy, permissions,
 * execution, and audit layers. It is intentionally storage-agnostic.
 */

export type Uuid = string;
export type IsoTimestamp = string;

export type UserRole = "owner" | "admin" | "member" | "viewer";

export type IntegrationId =
  | "polymarket"
  | "solana-wallet"
  | "evm-wallet"
  | "telegram"
  | "discord"
  | "other";

export type SecretScope = "workspace" | "user";

export type PolymarketPermissionLevel = "disabled" | "read_only" | "can_bet";

export type ConfirmationMode = "required" | "optional";

export interface User {
  id: Uuid;
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  disabledAt: IsoTimestamp | null;
}

export interface AuthSession {
  id: Uuid;
  userId: Uuid;
  refreshTokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: IsoTimestamp;
  lastSeenAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
  revokedAt: IsoTimestamp | null;
}

export interface PersonaSettings {
  personaName: string;
  stylePreset: string;
  systemPromptOverride: string | null;
}

export interface UserPolicySettings {
  canUseChat: boolean;
  canUseTools: boolean;
  canManageIntegrations: boolean;
  canManagePermissions: boolean;
}

export interface IntegrationPermissions {
  integrationId: IntegrationId;
  enabled: boolean;
  executionEnabled: boolean;
}

export interface PolymarketPermissions {
  level: PolymarketPermissionLevel;
  dailySpendLimitUsd: string;
  perTradeLimitUsd: string;
  confirmationMode: ConfirmationMode;
  cooldownSeconds: number;
}

export interface TenantSettings {
  userId: Uuid;
  persona: PersonaSettings;
  policies: UserPolicySettings;
  integrations: IntegrationPermissions[];
  polymarket: PolymarketPermissions;
  updatedAt: IsoTimestamp;
}

export interface IntegrationSecretRecord {
  id: Uuid;
  ownerUserId: Uuid;
  scope: SecretScope;
  integrationId: IntegrationId;
  secretKey: string;
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface ChatSession {
  id: Uuid;
  userId: Uuid;
  title: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  archivedAt: IsoTimestamp | null;
}

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  id: Uuid;
  sessionId: Uuid;
  userId: Uuid;
  role: ChatMessageRole;
  content: string;
  toolName: string | null;
  createdAt: IsoTimestamp;
}

export type ActionKind =
  | "permission_change"
  | "integration_secret_update"
  | "polymarket_bet_attempt"
  | "polymarket_bet_execute"
  | "polymarket_bet_blocked"
  | "wallet_sign_attempt"
  | "wallet_sign_execute";

export type ActionOutcome = "allowed" | "blocked" | "failed" | "executed";

export interface AuditLog {
  id: Uuid;
  actorUserId: Uuid;
  targetUserId: Uuid | null;
  sessionId: Uuid | null;
  actionKind: ActionKind;
  outcome: ActionOutcome;
  reason: string | null;
  metadataJson: string;
  createdAt: IsoTimestamp;
}

export interface ExecutionJob {
  id: Uuid;
  userId: Uuid;
  sessionId: Uuid;
  status:
    | "queued"
    | "running"
    | "waiting_confirmation"
    | "completed"
    | "failed";
  toolName: string;
  riskLevel: "safe" | "can_execute" | "can_spend";
  inputJson: string;
  outputJson: string | null;
  errorMessage: string | null;
  createdAt: IsoTimestamp;
  startedAt: IsoTimestamp | null;
  completedAt: IsoTimestamp | null;
}

export interface RateLimitPolicy {
  key: string;
  windowSeconds: number;
  maxRequests: number;
}

export interface QuotaPolicy {
  key: string;
  period: "day" | "month";
  maxUnits: number;
}
