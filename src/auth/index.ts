/**
 * Auth module — subscription-based OAuth for Claude Max and Codex Pro.
 *
 * OAuth flows are disabled.
 * Credential storage and env var injection remain for future use.
 */

export type { AnthropicFlow } from "./anthropic";
// Anthropic (Claude Pro/Max)
export { refreshAnthropicToken, startAnthropicLogin } from "./anthropic";

// Credential storage + management
export {
  applySubscriptionCredentials,
  deleteCredentials,
  getAccessToken,
  getSubscriptionStatus,
  hasValidCredentials,
  loadCredentials,
  saveCredentials,
} from "./credentials";
export type { CodexFlow } from "./openai-codex";
// OpenAI Codex (ChatGPT Plus/Pro)
export { refreshCodexToken, startCodexLogin } from "./openai-codex";

// Types
export type {
  OAuthCredentials,
  StoredCredentials,
  SubscriptionProvider,
} from "./types";
