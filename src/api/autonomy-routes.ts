import { AutonomyService, type AgentRuntime } from "@elizaos/core";
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
  return (
    (runtime.getService("AUTONOMY") as AutonomyServiceLike | null) ??
    (runtime.getService("autonomy") as AutonomyServiceLike | null)
  );
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

    if (typeof body.enabled === "boolean") {
      let svc = getAutonomySvc(runtime);
      // Some runtime boot paths may start without AUTONOMY service. When
      // enabling autonomy, attempt a lazy service start before failing.
      if (!svc && body.enabled && runtime) {
        try {
          await AutonomyService.start(runtime);
          svc = getAutonomySvc(runtime);
        } catch (err) {
          const autonomy = getAutonomyState(runtime);
          json(res, {
            ok: false,
            error:
              err instanceof Error
                ? `Autonomy service failed to start: ${err.message}`
                : "Autonomy service failed to start.",
            autonomy: autonomy.enabled,
            thinking: autonomy.thinking,
          });
          return true;
        }
      }

      if (!svc) {
        const autonomy = getAutonomyState(runtime);
        json(res, {
          ok: false,
          error: "Autonomy service unavailable on this runtime.",
          autonomy: autonomy.enabled,
          thinking: autonomy.thinking,
        });
        return true;
      }
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
