import type http from "node:http";
import {
  type CloudRouteState as AutonomousCloudRouteState,
  handleCloudRoute as handleAutonomousCloudRoute,
} from "@elizaos/autonomous/api/cloud-routes";
import type { CloudManager } from "@elizaos/autonomous/cloud/cloud-manager";
import type { AgentRuntime } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import { saveMiladyConfig } from "../config/config";
import { createIntegrationTelemetrySpan } from "../diagnostics/integration-observability";
import { scrubCloudSecretsFromEnv } from "./cloud-secrets";

// Re-export the public API from the decoupled secrets module so existing
// consumers can still import from "./cloud-routes".
export {
  _resetCloudSecretsForTesting,
  getCloudSecret,
} from "./cloud-secrets";

export interface CloudRouteState {
  config: MiladyConfig;
  cloudManager: CloudManager | null;
  /** The running agent runtime — needed to persist cloud credentials to the DB. */
  runtime: AgentRuntime | null;
}

function toAutonomousState(state: CloudRouteState): AutonomousCloudRouteState {
  return {
    ...state,
    saveConfig: saveMiladyConfig,
    createTelemetrySpan: createIntegrationTelemetrySpan,
  };
}

export async function handleCloudRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: CloudRouteState,
): Promise<boolean> {
  const result = await handleAutonomousCloudRoute(
    req,
    res,
    pathname,
    method,
    toAutonomousState(state),
  );

  // The upstream handler writes secrets to process.env — scrub them
  // immediately so they don't leak to child processes or env dumps.
  scrubCloudSecretsFromEnv();

  return result;
}
