import {
  type RegistryRouteContext as AutonomousRegistryRouteContext,
  handleRegistryRoutes as handleAutonomousRegistryRoutes,
} from "@elizaos/autonomous/api/registry-routes";
import { classifyRegistryPluginRelease } from "../runtime/release-plugin-policy";
import type { PluginManagerLike } from "../services/plugin-manager-types";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

export interface RegistryRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  url: URL;
  getPluginManager: () => PluginManagerLike;
  getLoadedPluginNames: () => string[];
  getBundledPluginIds: () => Set<string>;
}

function toAutonomousContext(
  ctx: RegistryRouteContext,
): AutonomousRegistryRouteContext {
  return {
    ...ctx,
    getPluginManager: () => ctx.getPluginManager() as never,
    classifyRegistryPluginRelease,
  };
}

export async function handleRegistryRoutes(
  ctx: RegistryRouteContext,
): Promise<boolean> {
  return handleAutonomousRegistryRoutes(toAutonomousContext(ctx));
}
