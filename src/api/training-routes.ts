import { handleTrainingRoutes as handleAutonomousTrainingRoutes } from "@elizaos/autonomous/api/training-routes";
import type { AgentRuntime } from "@elizaos/core";
import { isLoopbackHost } from "../security/network-policy";
import type { RouteHelpers, RouteRequestContext } from "./route-helpers";
import type { TrainingServiceLike } from "./training-service-like";

export type TrainingRouteHelpers = RouteHelpers;

export interface TrainingRouteContext extends RouteRequestContext {
  runtime: AgentRuntime | null;
  trainingService: TrainingServiceLike;
}

export async function handleTrainingRoutes(
  ctx: TrainingRouteContext,
): Promise<boolean> {
  return handleAutonomousTrainingRoutes({
    ...ctx,
    isLoopbackHost,
  });
}
