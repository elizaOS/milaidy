import type { AgentRuntime } from "@elizaos/core";
import { handleMemoryRoutes as handleAutonomousMemoryRoutes } from "@miladyai/autonomous/api/memory-routes";
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
