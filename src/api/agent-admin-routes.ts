import {
  type AgentAdminRouteState,
  handleAgentAdminRoutes as handleAutonomousAgentAdminRoutes,
} from "@elizaos/autonomous/api/agent-admin-routes";
import type { ElizaConfig } from "../config/config";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

export type { AgentAdminRouteState };

export interface AgentAdminRouteContext
  extends Omit<
      import("@elizaos/autonomous/api/agent-admin-routes").AgentAdminRouteContext,
      "state"
    >,
    RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  state: AgentAdminRouteState & { config: ElizaConfig };
}

export async function handleAgentAdminRoutes(
  ctx: AgentAdminRouteContext,
): Promise<boolean> {
  return handleAutonomousAgentAdminRoutes(ctx);
}
