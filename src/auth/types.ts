/**
 * Subscription auth types for milady.
 */

export interface OAuthCredentials {
  access: string;
  refresh: string;
  expires: number;
}

export type SubscriptionProvider = "anthropic-subscription" | "openai-codex";
export type SubscriptionProviderAlias = "openai-subscription";
export type SubscriptionProviderLike =
  | SubscriptionProvider
  | SubscriptionProviderAlias;

/** Maps subscription provider IDs to their model provider short names. */
export const SUBSCRIPTION_PROVIDER_MAP: Record<SubscriptionProvider, string> = {
  "anthropic-subscription": "anthropic",
  "openai-codex": "openai",
};

/**
 * UI/route aliases that normalize to persisted credential/config provider IDs.
 * Keep this map centralized so callers don't duplicate ad-hoc ternaries.
 */
export const SUBSCRIPTION_PROVIDER_ALIASES: Record<
  SubscriptionProviderAlias,
  SubscriptionProvider
> = {
  "openai-subscription": "openai-codex",
};

/**
 * Normalize any supported subscription provider identifier to the persisted key.
 * Returns null for unknown providers.
 */
export function normalizeSubscriptionProvider(
  provider: string,
): SubscriptionProvider | null {
  const normalized =
    SUBSCRIPTION_PROVIDER_ALIASES[
      provider as keyof typeof SUBSCRIPTION_PROVIDER_ALIASES
    ] ?? provider;

  if (
    normalized !== "anthropic-subscription" &&
    normalized !== "openai-codex"
  ) {
    return null;
  }

  return normalized;
}

export interface StoredCredentials {
  provider: SubscriptionProvider;
  credentials: OAuthCredentials;
  createdAt: number;
  updatedAt: number;
}
