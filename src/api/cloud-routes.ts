import type http from "node:http";
import {
  type CloudRouteState as AutonomousCloudRouteState,
  handleCloudRoute as handleAutonomousCloudRoute,
} from "@elizaos/autonomous/api/cloud-routes";
import type { CloudManager } from "@elizaos/autonomous/cloud/cloud-manager";
import type { AgentRuntime } from "@elizaos/core";
import type { ElizaConfig } from "../config/config";
import { saveElizaConfig } from "../config/config";
import { createIntegrationTelemetrySpan } from "../diagnostics/integration-observability";
import { disconnectUnifiedCloudConnection } from "./cloud-connection";
import { scrubCloudSecretsFromEnv } from "./cloud-secrets";

// Re-export the public API from the decoupled secrets module so existing
// consumers can still import from "./cloud-routes".
export {
  _resetCloudSecretsForTesting,
  getCloudSecret,
} from "./cloud-secrets";

export interface CloudRouteState {
  config: ElizaConfig;
  cloudManager: CloudManager | null;
  /** The running agent runtime — needed to persist cloud credentials to the DB. */
  runtime: AgentRuntime | null;
}

function toAutonomousState(state: CloudRouteState): AutonomousCloudRouteState {
  return {
    ...state,
    saveConfig: saveElizaConfig,
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
  if (method === "POST" && pathname === "/api/cloud/disconnect") {
    await disconnectUnifiedCloudConnection({
      cloudManager: state.cloudManager,
      config: state.config,
      runtime: state.runtime,
      saveConfig: saveElizaConfig,
    });
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, status: "disconnected" }));
    return true;
  }

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
