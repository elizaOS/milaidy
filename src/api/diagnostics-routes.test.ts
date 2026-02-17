import { describe, expect, test, vi } from "vitest";
import { handleDiagnosticsRoutes } from "./diagnostics-routes";

type InvokeResult = {
  handled: boolean;
  status: number;
  payload: unknown;
};

async function invoke(args: {
  method: string;
  pathname: string;
  url?: string;
  logBuffer?: Array<{
    timestamp: number;
    level: string;
    source: string;
    tags: string[];
  }>;
  eventBuffer?: Array<{ type: string; eventId: string }>;
  relayPort?: number;
  checkRelayReachable?: (relayPort: number) => Promise<boolean>;
  resolveExtensionPath?: () => string | null;
}): Promise<InvokeResult> {
  let status = 200;
  let payload: unknown = null;

  const handled = await handleDiagnosticsRoutes({
    req: {} as never,
    res: {} as never,
    method: args.method,
    pathname: args.pathname,
    url: new URL(args.url ?? args.pathname, "http://localhost:2138"),
    logBuffer: args.logBuffer ?? [],
    eventBuffer: args.eventBuffer ?? [],
    relayPort: args.relayPort,
    checkRelayReachable: args.checkRelayReachable,
    resolveExtensionPath: args.resolveExtensionPath,
    json: (_res, data, code = 200) => {
      status = code;
      payload = data;
    },
  });

  return { handled, status, payload };
}

describe("diagnostics routes", () => {
  test("returns false for unrelated routes", async () => {
    const result = await invoke({ method: "GET", pathname: "/api/status" });

    expect(result.handled).toBe(false);
  });

  test("filters logs by source, level, tag, and since", async () => {
    const logs = [
      { timestamp: 1, level: "info", source: "runtime", tags: ["chat"] },
      {
        timestamp: 2,
        level: "error",
        source: "runtime",
        tags: ["chat", "provider"],
      },
      {
        timestamp: 3,
        level: "error",
        source: "api",
        tags: ["provider"],
      },
    ];

    const result = await invoke({
      method: "GET",
      pathname: "/api/logs",
      url: "/api/logs?source=runtime&level=error&tag=provider&since=2",
      logBuffer: logs,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toEqual({
      entries: [logs[1]],
      sources: ["api", "runtime"],
      tags: ["chat", "provider"],
    });
  });

  test("returns replayable autonomy events with after+limit", async () => {
    const events = [
      { type: "training_event", eventId: "evt-0" },
      { type: "agent_event", eventId: "evt-1" },
      { type: "heartbeat_event", eventId: "evt-2" },
      { type: "agent_event", eventId: "evt-3" },
    ];

    const result = await invoke({
      method: "GET",
      pathname: "/api/agent/events",
      url: "/api/agent/events?after=evt-1&limit=1",
      eventBuffer: events,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toEqual({
      events: [{ type: "heartbeat_event", eventId: "evt-2" }],
      latestEventId: "evt-2",
      totalBuffered: 3,
      replayed: true,
    });
  });

  test("returns extension relay status and path", async () => {
    const checkRelayReachable = vi.fn(async () => true);
    const resolveExtensionPath = vi.fn(
      () => "/tmp/milady/apps/chrome-extension",
    );

    const result = await invoke({
      method: "GET",
      pathname: "/api/extension/status",
      relayPort: 19999,
      checkRelayReachable,
      resolveExtensionPath,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(checkRelayReachable).toHaveBeenCalledWith(19999);
    expect(resolveExtensionPath).toHaveBeenCalled();
    expect(result.payload).toEqual({
      relayReachable: true,
      relayPort: 19999,
      extensionPath: "/tmp/milady/apps/chrome-extension",
    });
  });
});
