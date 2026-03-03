import type { AgentRuntime } from "@elizaos/core";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

export interface AutonomyServiceLike {
  enableAutonomy(): Promise<void>;
  disableAutonomy(): Promise<void>;
  isLoopRunning(): boolean;
  getStatus?: () => {
    enabled?: boolean;
  };
}

/** Helper to retrieve the AutonomyService from a runtime (may be null). */
export function getAutonomySvc(
  runtime: AgentRuntime | null,
): AutonomyServiceLike | null {
  if (!runtime) return null;
  return runtime.getService("AUTONOMY") as AutonomyServiceLike | null;
}

export function getAutonomyState(runtime: AgentRuntime | null): {
  enabled: boolean;
  thinking: boolean;
} {
  const svc = getAutonomySvc(runtime);
  const statusEnabled = svc?.getStatus?.().enabled;
  const runtimeEnabled = runtime?.enableAutonomy === true;
  return {
    enabled:
      typeof statusEnabled === "boolean"
        ? statusEnabled
        : runtimeEnabled || Boolean(svc),
    thinking: svc?.isLoopRunning() ?? false,
  };
}

export interface AutonomyRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "readJsonBody" | "json"> {
  runtime: AgentRuntime | null;
}

export async function handleAutonomyRoutes(
  ctx: AutonomyRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, runtime, readJsonBody, json } = ctx;

  // ── POST /api/agent/autonomy ──────────────────────────────────────────
  // Backward-compatible endpoint that now reports and applies real state.
  if (method === "POST" && pathname === "/api/agent/autonomy") {
    const body = await readJsonBody<{ enabled?: boolean }>(req, res);
    if (!body) return true;

    const svc = getAutonomySvc(runtime);
    if (typeof body.enabled === "boolean" && svc) {
      if (body.enabled) await svc.enableAutonomy();
      else await svc.disableAutonomy();
    }

    const autonomy = getAutonomyState(runtime);
    json(res, {
      ok: true,
      autonomy: autonomy.enabled,
      thinking: autonomy.thinking,
    });
    return true;
  }

  // ── GET /api/agent/autonomy ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/agent/autonomy") {
    const autonomy = getAutonomyState(runtime);
    json(res, {
      enabled: autonomy.enabled,
      thinking: autonomy.thinking,
    });
    return true;
  }

  return false;
}
