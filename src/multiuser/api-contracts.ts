import { z } from "zod";

/**
 * HTTP contract scaffolding for multi-user backend routes.
 *
 * These schemas define request/response payloads and are intended to be used
 * in route handlers (validation + type inference).
 */

export const IdSchema = z.string().uuid();

export const SignupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  displayName: z.string().min(1).max(80),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const AuthTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
});

export const TenantSettingsUpdateSchema = z.object({
  persona: z
    .object({
      personaName: z.string().min(1).max(80),
      stylePreset: z.string().min(1).max(64),
      systemPromptOverride: z.string().max(8000).nullable(),
    })
    .optional(),
  policies: z
    .object({
      canUseChat: z.boolean(),
      canUseTools: z.boolean(),
      canManageIntegrations: z.boolean(),
      canManagePermissions: z.boolean(),
    })
    .optional(),
});

export const SecretUpsertRequestSchema = z.object({
  integrationId: z.string().min(1).max(64),
  secretKey: z.string().min(1).max(128),
  secretValue: z.string().min(1).max(4096),
  scope: z.enum(["workspace", "user"]).default("user"),
});

export const PermissionPatchSchema = z.object({
  integrationId: z.string().min(1).max(64),
  enabled: z.boolean().optional(),
  executionEnabled: z.boolean().optional(),
  polymarket: z
    .object({
      level: z.enum(["disabled", "read_only", "can_bet"]).optional(),
      dailySpendLimitUsd: z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/)
        .optional(),
      perTradeLimitUsd: z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/)
        .optional(),
      confirmationMode: z.enum(["required", "optional"]).optional(),
      cooldownSeconds: z.number().int().min(0).max(3600).optional(),
    })
    .optional(),
});

export const ChatCreateSessionRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const ChatSendMessageRequestSchema = z.object({
  sessionId: IdSchema,
  content: z.string().min(1).max(32000),
});

export const ConfirmActionRequestSchema = z.object({
  executionJobId: IdSchema,
  confirmationCode: z.string().min(6).max(12),
});

export const RateLimitStatusSchema = z.object({
  key: z.string(),
  remaining: z.number().int().min(0),
  resetAt: z.string(),
});

export type SignupRequest = z.infer<typeof SignupRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;
export type TenantSettingsUpdate = z.infer<typeof TenantSettingsUpdateSchema>;
export type SecretUpsertRequest = z.infer<typeof SecretUpsertRequestSchema>;
export type PermissionPatchRequest = z.infer<typeof PermissionPatchSchema>;
export type ChatCreateSessionRequest = z.infer<
  typeof ChatCreateSessionRequestSchema
>;
export type ChatSendMessageRequest = z.infer<
  typeof ChatSendMessageRequestSchema
>;
export type ConfirmActionRequest = z.infer<typeof ConfirmActionRequestSchema>;
