/**
 * Subscription auth types for milaidy.
 * OAuth credential types come from @mariozechner/pi-ai.
 */

import type { OAuthCredentials } from "@mariozechner/pi-ai";

export type { OAuthCredentials };

export type SubscriptionProvider = "anthropic-subscription" | "openai-codex";

export interface StoredCredentials {
  provider: SubscriptionProvider;
  credentials: OAuthCredentials;
  createdAt: number;
  updatedAt: number;
}
