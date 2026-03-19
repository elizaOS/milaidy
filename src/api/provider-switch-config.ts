export * from "@elizaos/autonomous/api/provider-switch-config";

import { applyOnboardingConnectionConfig as upstreamApplyOnboardingConnectionConfig } from "@elizaos/autonomous/api/provider-switch-config";
import { applySubscriptionCredentials } from "../auth/index";

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function setEnvValue(
  config: Record<string, unknown>,
  key: string,
  value: string | undefined,
): void {
  const existingEnv = config.env as Record<string, string> | undefined;
  const env = existingEnv ?? {};
  config.env = env;
  if (value) {
    env[key] = value;
    process.env[key] = value;
    return;
  }

  delete env[key];
  delete process.env[key];
}

export async function applyOnboardingConnectionConfig(
  ...args: Parameters<typeof upstreamApplyOnboardingConnectionConfig>
): ReturnType<typeof upstreamApplyOnboardingConnectionConfig> {
  const [config, connection] = args;
  await upstreamApplyOnboardingConnectionConfig(...args);

  if (
    connection.kind === "local-provider" &&
    connection.provider === "anthropic-subscription"
  ) {
    const setupToken = trimToUndefined(connection.apiKey);
    if (setupToken?.startsWith("sk-ant-")) {
      await applySubscriptionCredentials(config);
      setEnvValue(
        config as Record<string, unknown>,
        "ANTHROPIC_API_KEY",
        setupToken,
      );
    }
  }
}
