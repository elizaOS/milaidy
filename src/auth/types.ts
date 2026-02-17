/**
 * Subscription auth types for milady.
 */

export interface OAuthCredentials {
  access: string;
  refresh: string;
  expires: number;
}

export type SubscriptionProvider = "anthropic-subscription" | "openai-codex";

export interface StoredCredentials {
  provider: SubscriptionProvider;
  credentials: OAuthCredentials;
  createdAt: number;
  updatedAt: number;
}
