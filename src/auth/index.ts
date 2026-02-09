/**
 * Auth module — subscription-based OAuth for Claude Max and Codex Pro.
 *
 * Uses @mariozechner/pi-ai for OAuth flows (PKCE, token exchange, refresh).
 * Adds server-side credential storage and env var injection on top.
 */

// Anthropic (Claude Pro/Max)
export { startAnthropicLogin, refreshAnthropicToken } from "./anthropic.js";
export type { AnthropicFlow } from "./anthropic.js";

// OpenAI Codex (ChatGPT Plus/Pro)
export { startCodexLogin, refreshCodexToken } from "./openai-codex.js";
export type { CodexFlow } from "./openai-codex.js";

// Credential storage + management
export {
  saveCredentials,
  loadCredentials,
  deleteCredentials,
  hasValidCredentials,
  getAccessToken,
  getSubscriptionStatus,
  applySubscriptionCredentials,
} from "./credentials.js";

// Types
export type { OAuthCredentials, SubscriptionProvider, StoredCredentials } from "./types.js";
