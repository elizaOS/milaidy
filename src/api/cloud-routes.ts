import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import {
  type CloudRouteState as AutonomousCloudRouteState,
  handleCloudRoute as handleAutonomousCloudRoute,
} from "@miladyai/autonomous/api/cloud-routes";
import type { CloudManager } from "@miladyai/autonomous/cloud/cloud-manager";
import type { MiladyConfig } from "../config/config";
import { saveMiladyConfig } from "../config/config";
import { createIntegrationTelemetrySpan } from "../diagnostics/integration-observability";

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
  return handleAutonomousCloudRoute(
    req,
    res,
    pathname,
    method,
    toAutonomousState(state),
  );
}
