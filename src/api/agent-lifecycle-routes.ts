import {
  type AgentLifecycleRouteState,
  handleAgentLifecycleRoutes as handleAutonomousAgentLifecycleRoutes,
} from "@elizaos/autonomous/api/agent-lifecycle-routes";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

export type { AgentLifecycleRouteState };

export interface AgentLifecycleRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "error" | "json" | "readJsonBody"> {
  state: AgentLifecycleRouteState;
}

export async function handleAgentLifecycleRoutes(
  ctx: AgentLifecycleRouteContext,
): Promise<boolean> {
  return handleAutonomousAgentLifecycleRoutes(ctx);
}
