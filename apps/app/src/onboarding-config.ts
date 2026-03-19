import type { OnboardingConnection } from "@elizaos/autonomous/contracts/onboarding";
import type { BuildOnboardingConnectionArgs } from "@milady/upstream-app-core-onboarding-config";
import { buildOnboardingConnectionConfig as upstreamBuildOnboardingConnectionConfig } from "@milady/upstream-app-core-onboarding-config";
import { ELIZA_TOOLS_OAUTH_PROVIDER } from "./onboarding-auth";

export * from "@milady/upstream-app-core-onboarding-config";

type ElizaToolsOAuthConnection = {
  kind: "eliza-tools-oauth";
  service: "elizacloud";
};

export function buildOnboardingConnectionConfig(
  args: BuildOnboardingConnectionArgs,
): OnboardingConnection | null {
  if (args.onboardingProvider === ELIZA_TOOLS_OAUTH_PROVIDER) {
    return {
      kind: "eliza-tools-oauth",
      service: "elizacloud",
    } as unknown as OnboardingConnection;
  }

  return upstreamBuildOnboardingConnectionConfig(args);
}

export function isElizaToolsOAuthConnection(
  connection: OnboardingConnection | null | undefined,
): connection is OnboardingConnection & ElizaToolsOAuthConnection {
  return (
    (connection as { kind?: unknown } | null | undefined)?.kind ===
    "eliza-tools-oauth"
  );
}
