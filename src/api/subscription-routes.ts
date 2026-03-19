import {
  type SubscriptionRouteState as AutonomousSubscriptionRouteState,
  handleSubscriptionRoutes as handleAutonomousSubscriptionRoutes,
} from "@elizaos/autonomous/api/subscription-routes";
import type { ElizaConfig } from "../config/config";
import type { RouteRequestContext } from "./route-helpers";

export type SubscriptionRouteState = Omit<
  AutonomousSubscriptionRouteState,
  "config"
> & {
  config: ElizaConfig;
};

export interface SubscriptionRouteContext extends RouteRequestContext {
  state: SubscriptionRouteState;
  saveConfig: (config: ElizaConfig) => void;
}

export async function handleSubscriptionRoutes(
  ctx: SubscriptionRouteContext,
): Promise<boolean> {
  return handleAutonomousSubscriptionRoutes({
    ...ctx,
    saveConfig: (config: unknown) => ctx.saveConfig(config as ElizaConfig),
    loadSubscriptionAuth: async () => (await import("../auth/index")) as never,
  } as never);
}
