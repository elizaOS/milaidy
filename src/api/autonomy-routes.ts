import { type AgentRuntime, AutonomyService, logger } from "@elizaos/core";
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

export async function ensureAutonomySvc(
  runtime: AgentRuntime | null,
): Promise<AutonomyServiceLike | null> {
  const sleep = async (ms: number): Promise<void> =>
    await new Promise((resolve) => setTimeout(resolve, ms));
  let svc = getAutonomySvc(runtime);
  if (svc || !runtime) return svc;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // If the runtime already knows about this service type, wait for its loader.
    try {
      if (runtime.hasService("AUTONOMY")) {
        await runtime.getServiceLoadPromise("AUTONOMY");
        svc = getAutonomySvc(runtime);
        if (svc) return svc;
      }
    } catch (err) {
      logger.debug(
        `[autonomy] waiting for runtime service load failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // continue to explicit start/registration fallback
    }

    // First attempt: core-provided start helper.
    try {
      await AutonomyService.start(runtime);
      svc = getAutonomySvc(runtime);
      if (svc) return svc;
    } catch (err) {
      logger.debug(
        `[autonomy] AutonomyService.start fallback failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // continue to explicit registration fallback
    }

    // Second attempt: explicit runtime service registration.
    try {
      await runtime.registerService(AutonomyService);
      svc = getAutonomySvc(runtime);
      if (svc) return svc;
      await runtime.getServiceLoadPromise("AUTONOMY");
      svc = getAutonomySvc(runtime);
      if (svc) return svc;
    } catch (err) {
      logger.debug(
        `[autonomy] runtime.registerService fallback failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // continue with retry backoff
    }

    if (attempt < 3) {
      await sleep(attempt * 200);
      svc = getAutonomySvc(runtime);
      if (svc) return svc;
    }
  }

  return getAutonomySvc(runtime);
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
          svc = await ensureAutonomySvc(runtime);
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
