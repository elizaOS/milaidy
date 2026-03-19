/**
 * Unit tests for coding-agent fallback route behavior introduced in server.ts.
 *
 * We mirror the route logic here because handleCodingAgentsFallback is private.
 */
import { describe, expect, it, vi } from "vitest";

type ScratchStatus = "pending_decision" | "kept" | "promoted";
type ScratchTerminalEvent = "stopped" | "task_complete" | "error";
type ScratchRecord = {
  sessionId: string;
  label: string;
  path: string;
  status: ScratchStatus;
  createdAt: number;
  terminalAt: number;
  terminalEvent: ScratchTerminalEvent;
  expiresAt?: number;
};
type AgentPreflightRecord = {
  adapter?: string;
  installed?: boolean;
  installCommand?: string;
  docsUrl?: string;
};

type CodeTaskService = {
  getAgentPreflight?: () => Promise<unknown>;
  listAgentPreflight?: () => Promise<unknown>;
  preflightCodingAgents?: () => Promise<unknown>;
  preflight?: () => Promise<unknown>;
  listScratchWorkspaces?: () => Promise<unknown>;
  getScratchWorkspaces?: () => Promise<unknown>;
  listScratch?: () => Promise<unknown>;
  keepScratchWorkspace?: (sessionId: string) => Promise<unknown>;
  keepScratch?: (sessionId: string) => Promise<unknown>;
  deleteScratchWorkspace?: (sessionId: string) => Promise<unknown>;
  deleteScratch?: (sessionId: string) => Promise<unknown>;
  promoteScratchWorkspace?: (
    sessionId: string,
    name?: string,
  ) => Promise<unknown>;
  promoteScratch?: (sessionId: string, name?: string) => Promise<unknown>;
};

type RouteResult = {
  handled: boolean;
  status?: number;
  body?: Record<string, unknown> | unknown[];
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toScratchStatus = (value: unknown): ScratchStatus => {
  if (value === "kept" || value === "promoted") return value;
  return "pending_decision";
};

const toTerminalEvent = (value: unknown): ScratchTerminalEvent => {
  if (value === "stopped" || value === "error") return value;
  return "task_complete";
};

const normalizeScratchRecord = (value: unknown): ScratchRecord | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const sessionId =
    typeof raw.sessionId === "string" ? raw.sessionId.trim() : "";
  const pathValue = typeof raw.path === "string" ? raw.path.trim() : "";
  if (!sessionId || !pathValue) return null;
  const createdAt = toNumber(raw.createdAt, Date.now());
  const terminalAt = toNumber(raw.terminalAt, createdAt);
  const expiresAt = toNumber(raw.expiresAt, 0);
  return {
    sessionId,
    label:
      typeof raw.label === "string" && raw.label.trim().length > 0
        ? raw.label
        : sessionId,
    path: pathValue,
    status: toScratchStatus(raw.status),
    createdAt,
    terminalAt,
    terminalEvent: toTerminalEvent(raw.terminalEvent),
    ...(expiresAt > 0 ? { expiresAt } : {}),
  };
};

const parseSessionId = (raw: string): string | null => {
  let sessionId = "";
  try {
    sessionId = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!sessionId || sessionId.includes("/") || sessionId.includes("..")) {
    return null;
  }
  return sessionId;
};

async function handleFallbackRoute(
  pathname: string,
  method: string,
  service: CodeTaskService | null,
  body?: { name?: string },
): Promise<RouteResult> {
  if (method === "GET" && pathname === "/api/coding-agents/preflight") {
    try {
      const loaders: Array<(() => Promise<unknown>) | undefined> = [
        service?.getAgentPreflight,
        service?.listAgentPreflight,
        service?.preflightCodingAgents,
        service?.preflight,
      ];
      let rows: unknown[] = [];
      for (const loader of loaders) {
        if (!loader) continue;
        const maybeRows = await loader.call(service);
        if (Array.isArray(maybeRows)) {
          rows = maybeRows;
          break;
        }
      }
      const normalized = rows.flatMap((item): AgentPreflightRecord[] => {
        if (!item || typeof item !== "object") return [];
        const raw = item as Record<string, unknown>;
        const adapter =
          typeof raw.adapter === "string" ? raw.adapter.trim() : "";
        if (!adapter) return [];
        return [
          {
            adapter,
            installed: Boolean(raw.installed),
            installCommand:
              typeof raw.installCommand === "string"
                ? raw.installCommand
                : undefined,
            docsUrl: typeof raw.docsUrl === "string" ? raw.docsUrl : undefined,
          },
        ];
      });
      return { handled: true, status: 200, body: normalized };
    } catch (e) {
      return {
        handled: true,
        status: 500,
        body: { error: `Failed to get coding agent preflight: ${e}` },
      };
    }
  }

  if (method === "GET" && pathname === "/api/coding-agents/scratch") {
    try {
      const loaders: Array<(() => Promise<unknown>) | undefined> = [
        service?.listScratchWorkspaces,
        service?.getScratchWorkspaces,
        service?.listScratch,
      ];
      let rows: unknown[] = [];
      for (const loader of loaders) {
        if (!loader) continue;
        const maybeRows = await loader.call(service);
        if (Array.isArray(maybeRows)) {
          rows = maybeRows;
          break;
        }
      }
      const normalized = rows
        .map((item) => normalizeScratchRecord(item))
        .filter((item): item is ScratchRecord => item !== null);
      return { handled: true, status: 200, body: normalized };
    } catch (e) {
      return {
        handled: true,
        status: 500,
        body: { error: `Failed to list scratch workspaces: ${e}` },
      };
    }
  }

  const keepMatch = pathname.match(
    /^\/api\/coding-agents\/([^/]+)\/scratch\/keep$/,
  );
  if (method === "POST" && keepMatch) {
    const sessionId = parseSessionId(keepMatch[1]);
    if (!sessionId) {
      return {
        handled: true,
        status: 400,
        body: { error: "Invalid session ID" },
      };
    }
    const keeper = service?.keepScratchWorkspace ?? service?.keepScratch;
    if (!keeper) {
      return {
        handled: true,
        status: 503,
        body: { error: "Scratch keep is not available" },
      };
    }
    try {
      await keeper.call(service, sessionId);
      return { handled: true, status: 200, body: { ok: true } };
    } catch (e) {
      return {
        handled: true,
        status: 500,
        body: { error: `Failed to keep scratch workspace: ${e}` },
      };
    }
  }

  const deleteMatch = pathname.match(
    /^\/api\/coding-agents\/([^/]+)\/scratch\/delete$/,
  );
  if (method === "POST" && deleteMatch) {
    const sessionId = parseSessionId(deleteMatch[1]);
    if (!sessionId) {
      return {
        handled: true,
        status: 400,
        body: { error: "Invalid session ID" },
      };
    }
    const deleter = service?.deleteScratchWorkspace ?? service?.deleteScratch;
    if (!deleter) {
      return {
        handled: true,
        status: 503,
        body: { error: "Scratch delete is not available" },
      };
    }
    try {
      await deleter.call(service, sessionId);
      return { handled: true, status: 200, body: { ok: true } };
    } catch (e) {
      return {
        handled: true,
        status: 500,
        body: { error: `Failed to delete scratch workspace: ${e}` },
      };
    }
  }

  const promoteMatch = pathname.match(
    /^\/api\/coding-agents\/([^/]+)\/scratch\/promote$/,
  );
  if (method === "POST" && promoteMatch) {
    const sessionId = parseSessionId(promoteMatch[1]);
    if (!sessionId) {
      return {
        handled: true,
        status: 400,
        body: { error: "Invalid session ID" },
      };
    }
    const promoter =
      service?.promoteScratchWorkspace ?? service?.promoteScratch;
    if (!promoter) {
      return {
        handled: true,
        status: 503,
        body: { error: "Scratch promote is not available" },
      };
    }
    const name =
      typeof body?.name === "string" && body.name.trim().length > 0
        ? body.name.trim()
        : undefined;
    try {
      const promoted = await promoter.call(service, sessionId, name);
      const scratch = normalizeScratchRecord(promoted);
      return {
        handled: true,
        status: 200,
        body: { success: true, ...(scratch ? { scratch } : {}) },
      };
    } catch (e) {
      return {
        handled: true,
        status: 500,
        body: { error: `Failed to promote scratch workspace: ${e}` },
      };
    }
  }

  return { handled: false };
}

describe("coding-agents fallback routes", () => {
  it("parseSessionId rejects encoded slash and path traversal", async () => {
    const keep = vi.fn(async () => {});
    const service: CodeTaskService = { keepScratchWorkspace: keep };

    const badSlash = await handleFallbackRoute(
      "/api/coding-agents/sess%2F1/scratch/keep",
      "POST",
      service,
    );
    expect(badSlash).toEqual({
      handled: true,
      status: 400,
      body: { error: "Invalid session ID" },
    });
    expect(keep).not.toHaveBeenCalled();

    const badDots = await handleFallbackRoute(
      "/api/coding-agents/%2E%2E/scratch/keep",
      "POST",
      service,
    );
    expect(badDots).toEqual({
      handled: true,
      status: 400,
      body: { error: "Invalid session ID" },
    });
  });

  it("returns preflight records from first available loader", async () => {
    const service: CodeTaskService = {
      getAgentPreflight: vi.fn(async () => null),
      listAgentPreflight: vi.fn(async () => [
        {
          adapter: "claude",
          installed: true,
          installCommand: "brew install claude-code",
        },
        { adapter: " ", installed: true },
      ]),
    };
    const result = await handleFallbackRoute(
      "/api/coding-agents/preflight",
      "GET",
      service,
    );
    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual([
      {
        adapter: "claude",
        installed: true,
        installCommand: "brew install claude-code",
        docsUrl: undefined,
      },
    ]);
  });

  it("normalizes scratch list output", async () => {
    const service: CodeTaskService = {
      listScratchWorkspaces: vi.fn(async () => [
        {
          sessionId: "s-1",
          label: "",
          path: "/tmp/s-1",
          status: "bogus",
          createdAt: "100",
          terminalAt: "101",
          terminalEvent: "bogus",
        },
        { path: "/tmp/invalid" },
      ]),
    };
    const result = await handleFallbackRoute(
      "/api/coding-agents/scratch",
      "GET",
      service,
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual([
      {
        sessionId: "s-1",
        label: "s-1",
        path: "/tmp/s-1",
        status: "pending_decision",
        createdAt: 100,
        terminalAt: 101,
        terminalEvent: "task_complete",
      },
    ]);
  });

  it("handles keep/delete/promote success and service-unavailable paths", async () => {
    const service: CodeTaskService = {
      keepScratchWorkspace: vi.fn(async () => {}),
      deleteScratchWorkspace: vi.fn(async () => {}),
      promoteScratchWorkspace: vi.fn(async (_id: string, _name?: string) => ({
        sessionId: "s-1",
        label: "Promoted",
        path: "/tmp/s-1",
        status: "promoted",
        createdAt: 1,
        terminalAt: 2,
        terminalEvent: "task_complete",
      })),
    };

    const keep = await handleFallbackRoute(
      "/api/coding-agents/s-1/scratch/keep",
      "POST",
      service,
    );
    expect(keep).toEqual({ handled: true, status: 200, body: { ok: true } });

    const del = await handleFallbackRoute(
      "/api/coding-agents/s-1/scratch/delete",
      "POST",
      service,
    );
    expect(del).toEqual({ handled: true, status: 200, body: { ok: true } });

    const promote = await handleFallbackRoute(
      "/api/coding-agents/s-1/scratch/promote",
      "POST",
      service,
      { name: "  keep-me  " },
    );
    expect(promote.status).toBe(200);
    expect(promote.body).toEqual({
      success: true,
      scratch: {
        sessionId: "s-1",
        label: "Promoted",
        path: "/tmp/s-1",
        status: "promoted",
        createdAt: 1,
        terminalAt: 2,
        terminalEvent: "task_complete",
      },
    });

    const unavailable = await handleFallbackRoute(
      "/api/coding-agents/s-1/scratch/delete",
      "POST",
      {},
    );
    expect(unavailable).toEqual({
      handled: true,
      status: 503,
      body: { error: "Scratch delete is not available" },
    });
  });
});
