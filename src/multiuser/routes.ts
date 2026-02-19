/**
 * Route catalog for the multi-user rollout.
 *
 * This is a scaffold map used by both backend implementation and UI clients.
 * Handlers should validate payloads with the schemas in api-contracts.ts.
 */

export const MultiUserRoutes = {
  // Deployment/readiness checks
  preflight: "/api/v2/preflight",

  // Auth + sessions
  authSignup: "/api/v2/auth/signup",
  authLogin: "/api/v2/auth/login",
  authRefresh: "/api/v2/auth/refresh",
  authLogout: "/api/v2/auth/logout",
  authMe: "/api/v2/auth/me",

  // Tenant settings + persona
  settingsGet: "/api/v2/settings",
  settingsPatch: "/api/v2/settings",

  // Integrations + secrets + permissions
  integrationsList: "/api/v2/integrations",
  integrationsSecretUpsert: "/api/v2/integrations/secrets",
  integrationsSecretDelete:
    "/api/v2/integrations/secrets/:integrationId/:secretKey",
  permissionsGet: "/api/v2/permissions",
  permissionsPatch: "/api/v2/permissions",

  // Chat sessions + messages
  chatSessionsList: "/api/v2/chat/sessions",
  chatSessionCreate: "/api/v2/chat/sessions",
  chatMessagesList: "/api/v2/chat/sessions/:sessionId/messages",
  chatSend: "/api/v2/chat/messages",

  // Actions / execution / confirmations
  actionsPreview: "/api/v2/actions/preview",
  actionsConfirm: "/api/v2/actions/confirm",
  actionsExecute: "/api/v2/actions/execute",
  actionsStatus: "/api/v2/actions/:executionJobId",

  // Audit + governance
  auditList: "/api/v2/audit",
  rateLimitStatus: "/api/v2/limits",
  quotaStatus: "/api/v2/quotas",
} as const;

export type MultiUserRouteKey = keyof typeof MultiUserRoutes;
