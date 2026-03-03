/**
 * Unit tests for the POST /api/coding-agents/:sessionId/stop route.
 *
 * The route lives inside handleCodingAgentsFallback() in server.ts which is
 * not exported. We extract the route-matching and dispatch logic here to
 * verify correctness without spinning up a full HTTP server.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Extracted route logic (mirrors server.ts handleCodingAgentsFallback stop block)
// ---------------------------------------------------------------------------

interface PTYService {
  stopSession(id: string): Promise<void>;
}

interface RouteResult {
  handled: boolean;
  status?: number;
  body?: Record<string, unknown>;
}

async function handleStopRoute(
  pathname: string,
  method: string,
  getService: (name: string) => unknown,
): Promise<RouteResult> {
  const stopMatch = pathname.match(/^\/api\/coding-agents\/([^/]+)\/stop$/);
  if (method !== "POST" || !stopMatch) {
    return { handled: false };
  }

  const sessionId = decodeURIComponent(stopMatch[1]);
  const ptyService = getService("PTY_SERVICE") as PTYService | null;

  if (!ptyService?.stopSession) {
    return {
      handled: true,
      status: 503,
      body: { error: "PTY Service not available" },
    };
  }

  try {
    await ptyService.stopSession(sessionId);
    return { handled: true, status: 200, body: { ok: true } };
  } catch (e) {
    return {
      handled: true,
      status: 500,
      body: { error: `Failed to stop session: ${e}` },
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/coding-agents/:sessionId/stop", () => {
  const mockStopSession = vi.fn<[string], Promise<void>>();
  const mockGetService = vi.fn((name: string) => {
    if (name === "PTY_SERVICE") {
      return { stopSession: mockStopSession };
    }
    return null;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockStopSession.mockResolvedValue(undefined);
  });

  it("does not handle non-POST methods", async () => {
    const result = await handleStopRoute(
      "/api/coding-agents/sess-1/stop",
      "GET",
      mockGetService,
    );
    expect(result.handled).toBe(false);
  });

  it("does not handle non-matching paths", async () => {
    const result = await handleStopRoute(
      "/api/coding-agents/sess-1/send",
      "POST",
      mockGetService,
    );
    expect(result.handled).toBe(false);
  });

  it("returns 503 when PTY_SERVICE is not available", async () => {
    const result = await handleStopRoute(
      "/api/coding-agents/sess-1/stop",
      "POST",
      () => null,
    );
    expect(result).toEqual({
      handled: true,
      status: 503,
      body: { error: "PTY Service not available" },
    });
  });

  it("returns 503 when PTY_SERVICE lacks stopSession", async () => {
    const result = await handleStopRoute(
      "/api/coding-agents/sess-1/stop",
      "POST",
      () => ({ someOtherMethod: vi.fn() }),
    );
    expect(result).toEqual({
      handled: true,
      status: 503,
      body: { error: "PTY Service not available" },
    });
  });

  it("calls stopSession with decoded session ID", async () => {
    const result = await handleStopRoute(
      "/api/coding-agents/sess-1/stop",
      "POST",
      mockGetService,
    );
    expect(mockStopSession).toHaveBeenCalledWith("sess-1");
    expect(result).toEqual({ handled: true, status: 200, body: { ok: true } });
  });

  it("decodes URL-encoded session IDs", async () => {
    await handleStopRoute(
      "/api/coding-agents/sess%201%2F2/stop",
      "POST",
      mockGetService,
    );
    expect(mockStopSession).toHaveBeenCalledWith("sess 1/2");
  });

  it("returns 500 when stopSession throws", async () => {
    mockStopSession.mockRejectedValue(new Error("Session not found"));
    const result = await handleStopRoute(
      "/api/coding-agents/sess-1/stop",
      "POST",
      mockGetService,
    );
    expect(result).toEqual({
      handled: true,
      status: 500,
      body: { error: "Failed to stop session: Error: Session not found" },
    });
  });
});
