/**
 * Handles Anthropic setup token (sk-ant-oat01-...) during onboarding.
 *
 * The API-key gate in the onboarding handler skips subscription providers
 * because getProviderOptions() returns envKey: null for them. This function
 * explicitly saves the token when the user selects anthropic-subscription.
 */
export function applySubscriptionSetupToken(
  body: { provider?: string; providerApiKey?: unknown },
  config: { env?: Record<string, string> },
): { saved: boolean; envKey?: string; token?: string } {
  if (
    body.provider === "anthropic-subscription" &&
    typeof body.providerApiKey === "string" &&
    body.providerApiKey.trim().startsWith("sk-ant-")
  ) {
    const token = body.providerApiKey.trim();
    process.env.ANTHROPIC_API_KEY = token;
    if (!config.env) config.env = {};
    config.env.ANTHROPIC_API_KEY = token;
    return { saved: true, envKey: "ANTHROPIC_API_KEY", token };
  }
  return { saved: false };
}
