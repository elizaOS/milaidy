import type { AgentRuntime } from "@elizaos/core";
import { handleTrainingRoutes as handleAutonomousTrainingRoutes } from "@miladyai/autonomous/api/training-routes";
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
