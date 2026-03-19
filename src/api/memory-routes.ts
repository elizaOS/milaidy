import { handleMemoryRoutes as handleAutonomousMemoryRoutes } from "@elizaos/autonomous/api/memory-routes";
import type { AgentRuntime } from "@elizaos/core";
import type { RouteRequestContext } from "./route-helpers";

export interface MemoryRouteContext extends RouteRequestContext {
  url: URL;
  runtime: AgentRuntime | null;
  agentName: string;
}

export async function handleMemoryRoutes(
  ctx: MemoryRouteContext,
): Promise<boolean> {
  return handleAutonomousMemoryRoutes(ctx);
}
