import type { AgentRuntime } from "@elizaos/core";
import {
  type PermissionRouteState as AutonomousPermissionRouteState,
  handlePermissionRoutes as handleAutonomousPermissionRoutes,
} from "@miladyai/autonomous/api/permissions-routes";
import type { MiladyConfig } from "../config/config";
import type { RouteRequestContext } from "./route-helpers";

export interface PermissionState {
  id: string;
  status: string;
  lastChecked: number;
  canRequest: boolean;
}

export interface PermissionRouteState {
  runtime: AgentRuntime | null;
  config: MiladyConfig;
  permissionStates?: Record<string, PermissionState>;
  shellEnabled?: boolean;
}

export interface PermissionRouteContext extends RouteRequestContext {
  state: PermissionRouteState;
  saveConfig: (config: MiladyConfig) => void;
  scheduleRuntimeRestart: (reason: string) => void;
}

function toAutonomousState(
  state: PermissionRouteState,
): AutonomousPermissionRouteState {
  return state;
}

export async function handlePermissionRoutes(
  ctx: PermissionRouteContext,
): Promise<boolean> {
  return handleAutonomousPermissionRoutes({
    ...ctx,
    state: toAutonomousState(ctx.state),
    saveConfig: (config) => ctx.saveConfig(config as MiladyConfig),
  });
}
