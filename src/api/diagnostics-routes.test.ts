import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";
import {
  __resetAuditFeedForTests,
  SandboxAuditLog,
} from "../security/audit-log";
import { handleDiagnosticsRoutes } from "./diagnostics-routes";

type InvokeResult = {
  handled: boolean;
  status: number;
  payload: unknown;
  req: EventEmitter;
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
  requestHeaders?: Record<string, string>;
  initSse?: (res: unknown) => void;
  writeSseData?: (res: unknown, data: string, event?: string) => void;
  writeSseJson?: (res: unknown, payload: object, event?: string) => void;
}): Promise<InvokeResult> {
  let status = 200;
  let payload: unknown = null;
  const req = new EventEmitter();
  const res = new EventEmitter() as EventEmitter & {
    writableEnded?: boolean;
    end?: () => void;
  };
  (req as EventEmitter & { headers?: Record<string, string> }).headers =
    args.requestHeaders ?? {};
  res.writableEnded = false;
  res.end = () => {
    res.writableEnded = true;
  };

  const handled = await handleDiagnosticsRoutes({
    req: req as never,
    res: res as never,
    method: args.method,
    pathname: args.pathname,
    url: new URL(args.url ?? args.pathname, "http://localhost:2138"),
    logBuffer: args.logBuffer ?? [],
    eventBuffer: args.eventBuffer ?? [],
    relayPort: args.relayPort,
    checkRelayReachable: args.checkRelayReachable,
    resolveExtensionPath: args.resolveExtensionPath,
    initSse: args.initSse as never,
    writeSseData: args.writeSseData as never,
    writeSseJson: args.writeSseJson as never,
    json: (_res, data, code = 200) => {
      status = code;
      payload = data;
    },
  });

  return { handled, status, payload, req };
}

describe("diagnostics routes", () => {
  test("returns security audit entries with filters", async () => {
    __resetAuditFeedForTests();
    const auditLog = new SandboxAuditLog({ console: false });
    const firstTs = Date.now() - 10_000;
    const secondTs = Date.now();

    vi.useFakeTimers();
    vi.setSystemTime(new Date(firstTs));
    auditLog.record({
      type: "policy_decision",
      summary: "allow",
      severity: "info",
    });
    vi.setSystemTime(new Date(secondTs));
    auditLog.record({
      type: "policy_decision",
      summary: "deny",
      severity: "warn",
    });
    vi.useRealTimers();

    const result = await invoke({
      method: "GET",
      pathname: "/api/security/audit",
      url: `/api/security/audit?type=policy_decision&severity=warn&since=${firstTs}&limit=1`,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toEqual({
      entries: [
        expect.objectContaining({
          type: "policy_decision",
          severity: "warn",
          summary: "deny",
        }),
      ],
      totalBuffered: 2,
      replayed: true,
    });
  });

  test("returns 400 for invalid security audit filters", async () => {
    __resetAuditFeedForTests();

    const badType = await invoke({
      method: "GET",
      pathname: "/api/security/audit",
      url: "/api/security/audit?type=not-a-type",
    });
    expect(badType.status).toBe(400);
    expect(badType.payload).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('Invalid "type"'),
      }),
    );

    const badSeverity = await invoke({
      method: "GET",
      pathname: "/api/security/audit",
      url: "/api/security/audit?severity=bad",
    });
    expect(badSeverity.status).toBe(400);
    expect(badSeverity.payload).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('Invalid "severity"'),
      }),
    );

    const badSince = await invoke({
      method: "GET",
      pathname: "/api/security/audit",
      url: "/api/security/audit?since=not-a-date",
    });
    expect(badSince.status).toBe(400);
    expect(badSince.payload).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('Invalid "since"'),
      }),
    );
  });

  test("streams security audit snapshot and matching updates", async () => {
    __resetAuditFeedForTests();
    const auditLog = new SandboxAuditLog({ console: false });
    const sseWrites: object[] = [];
    const writeSseJson = vi.fn((_res: unknown, payload: object) => {
      sseWrites.push(payload);
    });

    auditLog.record({
      type: "policy_decision",
      summary: "deny before stream",
      severity: "warn",
    });
    auditLog.record({
      type: "policy_decision",
      summary: "allow before stream",
      severity: "info",
    });

    const result = await invoke({
      method: "GET",
      pathname: "/api/security/audit",
      url: "/api/security/audit?stream=1&severity=warn",
      initSse: vi.fn(),
      writeSseJson,
    });

    expect(result.handled).toBe(true);
    expect(sseWrites[0]).toEqual(
      expect.objectContaining({
        type: "snapshot",
        entries: [
          expect.objectContaining({
            summary: "deny before stream",
            severity: "warn",
          }),
        ],
      }),
    );

    auditLog.record({
      type: "policy_decision",
      summary: "deny during stream",
      severity: "warn",
    });
    auditLog.record({
      type: "policy_decision",
      summary: "allow during stream",
      severity: "info",
    });

    expect(sseWrites).toContainEqual(
      expect.objectContaining({
        type: "entry",
        entry: expect.objectContaining({
          summary: "deny during stream",
          severity: "warn",
        }),
      }),
    );
    expect(sseWrites).not.toContainEqual(
      expect.objectContaining({
        type: "entry",
        entry: expect.objectContaining({
          summary: "allow during stream",
        }),
      }),
    );

    result.req.emit("close");

    const writesBeforeClose = sseWrites.length;
    auditLog.record({
      type: "policy_decision",
      summary: "deny after close",
      severity: "warn",
    });
    expect(sseWrites).toHaveLength(writesBeforeClose);
  });

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
