export * from "@elizaos/agent/api/provider-switch-config";

import { applyOnboardingConnectionConfig as upstreamApplyOnboardingConnectionConfig } from "@elizaos/agent/api/provider-switch-config";

export async function applyOnboardingConnectionConfig(
  ...args: Parameters<typeof upstreamApplyOnboardingConnectionConfig>
): Promise<
  Awaited<ReturnType<typeof upstreamApplyOnboardingConnectionConfig>>
> {
  // The upstream call already invokes applySubscriptionCredentials for
  // anthropic-subscription connections.  Previously this override called it a
  // second time when connection.apiKey started with "sk-ant-", which could
  // overwrite the explicitly-provided API key with stale stored credentials.
  // See: provider-switch-config.test.ts — the double-call was masked by
  // assertions that did not check call count.
  await upstreamApplyOnboardingConnectionConfig(...args);
}
