import {
  type SubscriptionRouteState as AutonomousSubscriptionRouteState,
  handleSubscriptionRoutes as handleAutonomousSubscriptionRoutes,
} from "@miladyai/autonomous/api/subscription-routes";
import type { MiladyConfig } from "../config/config";
import type { RouteRequestContext } from "./route-helpers";

export type SubscriptionRouteState = Omit<
  AutonomousSubscriptionRouteState,
  "config"
> & {
  config: MiladyConfig;
};

export interface SubscriptionRouteContext extends RouteRequestContext {
  state: SubscriptionRouteState;
  saveConfig: (config: MiladyConfig) => void;
}

export async function handleSubscriptionRoutes(
  ctx: SubscriptionRouteContext,
): Promise<boolean> {
  return handleAutonomousSubscriptionRoutes({
    ...ctx,
    saveConfig: (config: unknown) => ctx.saveConfig(config as MiladyConfig),
    loadSubscriptionAuth: async () => (await import("../auth/index")) as never,
  } as never);
}
