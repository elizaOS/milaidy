import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseClampedInteger } from "../utils/number-parsing";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

interface LogEntryLike {
  timestamp: number;
  level: string;
  source: string;
  tags: string[];
}

interface StreamEventEnvelopeLike {
  type: string;
  eventId: string;
}

export interface DiagnosticsRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json"> {
  url: URL;
  logBuffer: LogEntryLike[];
  eventBuffer: StreamEventEnvelopeLike[];
  relayPort?: number;
  checkRelayReachable?: (relayPort: number) => Promise<boolean>;
  resolveExtensionPath?: () => string | null;
}

async function defaultCheckRelayReachable(relayPort: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${relayPort}/`, {
      method: "HEAD",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

function defaultResolveExtensionPath(): string | null {
  try {
    const serverDir = path.dirname(fileURLToPath(import.meta.url));
    const extensionPath = path.resolve(
      serverDir,
      "..",
      "..",
      "apps",
      "chrome-extension",
    );
    return fs.existsSync(extensionPath) ? extensionPath : null;
  } catch {
    return null;
  }
}

function isAutonomyEvent(event: StreamEventEnvelopeLike): boolean {
  return event.type === "agent_event" || event.type === "heartbeat_event";
}

export async function handleDiagnosticsRoutes(
  ctx: DiagnosticsRouteContext,
): Promise<boolean> {
  const {
    res,
    method,
    pathname,
    url,
    logBuffer,
    eventBuffer,
    relayPort: relayPortOverride,
    checkRelayReachable,
    resolveExtensionPath,
    json,
  } = ctx;

  // GET /api/logs
  if (method === "GET" && pathname === "/api/logs") {
    let entries = logBuffer;

    const sourceFilter = url.searchParams.get("source");
    if (sourceFilter) {
      entries = entries.filter((entry) => entry.source === sourceFilter);
    }

    const levelFilter = url.searchParams.get("level");
    if (levelFilter) {
      entries = entries.filter((entry) => entry.level === levelFilter);
    }

    const tagFilter = url.searchParams.get("tag");
    if (tagFilter) {
      entries = entries.filter((entry) => entry.tags.includes(tagFilter));
    }

    const sinceFilter = url.searchParams.get("since");
    if (sinceFilter) {
      const sinceTimestamp = Number(sinceFilter);
      if (!Number.isNaN(sinceTimestamp)) {
        entries = entries.filter((entry) => entry.timestamp >= sinceTimestamp);
      }
    }

    const sources = [...new Set(logBuffer.map((entry) => entry.source))].sort();
    const tags = [...new Set(logBuffer.flatMap((entry) => entry.tags))].sort();
    json(res, { entries: entries.slice(-200), sources, tags });
    return true;
  }

  // GET /api/agent/events?after=evt-123&limit=200
  if (method === "GET" && pathname === "/api/agent/events") {
    const limit = parseClampedInteger(url.searchParams.get("limit"), {
      min: 1,
      max: 1000,
      fallback: 200,
    });
    const afterEventId = url.searchParams.get("after");
    const autonomyEvents = eventBuffer.filter(isAutonomyEvent);

    let startIndex = 0;
    if (afterEventId) {
      const index = autonomyEvents.findIndex(
        (event) => event.eventId === afterEventId,
      );
      if (index >= 0) {
        startIndex = index + 1;
      }
    }

    const events = autonomyEvents.slice(startIndex, startIndex + limit);
    const latestEventId =
      events.length > 0 ? events[events.length - 1].eventId : null;

    json(res, {
      events,
      latestEventId,
      totalBuffered: autonomyEvents.length,
      replayed: true,
    });
    return true;
  }

  // GET /api/extension/status
  if (method === "GET" && pathname === "/api/extension/status") {
    const relayPort = relayPortOverride ?? 18792;
    const relayReachable = await (
      checkRelayReachable ?? defaultCheckRelayReachable
    )(relayPort);
    const extensionPath = (
      resolveExtensionPath ?? defaultResolveExtensionPath
    )();

    json(res, { relayReachable, relayPort, extensionPath });
    return true;
  }

  return false;
}
