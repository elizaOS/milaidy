export * from "@elizaos/autonomous/api/provider-switch-config";

import { applyOnboardingConnectionConfig as upstreamApplyOnboardingConnectionConfig } from "@elizaos/autonomous/api/provider-switch-config";
import { applySubscriptionCredentials } from "@elizaos/autonomous/auth";

export async function applyOnboardingConnectionConfig(
  ...args: Parameters<typeof upstreamApplyOnboardingConnectionConfig>
): Promise<
  Awaited<ReturnType<typeof upstreamApplyOnboardingConnectionConfig>>
> {
  const [config, connection] = args;

  await upstreamApplyOnboardingConnectionConfig(...args);

  if (
    connection.kind === "local-provider" &&
    connection.provider === "anthropic-subscription" &&
    typeof connection.apiKey === "string" &&
    connection.apiKey.trim().startsWith("sk-ant-")
  ) {
    await applySubscriptionCredentials(config);
  }
}
