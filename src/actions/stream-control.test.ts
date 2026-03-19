import type { Action, HandlerOptions } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  goLiveAction,
  goOfflineAction,
  manageOverlayWidgetAction,
  setStreamDestinationAction,
  speakOnStreamAction,
} from "./stream-control";

function jsonResponse(data: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => data,
  };
}

async function callAction(
  action: Action,
  params: Record<string, unknown> = {},
) {
  return action.handler({} as never, {} as never, undefined, {
    parameters: params,
  } as HandlerOptions) as Promise<{ text: string; success: boolean }>;
}

describe("stream control actions", () => {
  const originalFetch = globalThis.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("starts the stream via POST /api/stream/live", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ live: true }));

    const result = await callAction(goLiveAction);

    expect(result.success).toBe(true);
    expect(result.text).toContain("now live");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:2138/api/stream/live",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces API errors when going live fails", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        { error: "stream manager unavailable" },
        { ok: false, status: 503 },
      ),
    );

    const result = await callAction(goLiveAction);

    expect(result.success).toBe(false);
    expect(result.text).toContain("stream manager unavailable");
  });

  it("stops the stream via POST /api/stream/offline", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await callAction(goOfflineAction);

    expect(result.success).toBe(true);
    expect(result.text).toContain("Now offline");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:2138/api/stream/offline",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("handles thrown errors when going offline fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("boom"));

    const result = await callAction(goOfflineAction);

    expect(result.success).toBe(false);
    expect(result.text).toContain("boom");
  });

  it("lists available destinations when no destination is provided", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        destinations: [{ id: "dest-1", name: "Twitch" }],
      }),
    );

    const result = await callAction(setStreamDestinationAction);

    expect(result.success).toBe(false);
    expect(result.text).toContain("Available destinations");
    expect(result.text).toContain("Twitch");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:2138/api/streaming/destinations",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("switches destinations by name using the destination API", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          destinations: [{ id: "dest-1", name: "Twitch" }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await callAction(setStreamDestinationAction, {
      destinationName: "Twitch",
    });

    expect(result.success).toBe(true);
    expect(result.text).toContain("Twitch");
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:2138/api/streaming/destination",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ destinationId: "dest-1" }),
      }),
    );
  });

  it("returns destination API errors when switching fails", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          destinations: [{ id: "dest-1", name: "Twitch" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: "stream is live" }, { ok: false, status: 409 }),
      );

    const result = await callAction(setStreamDestinationAction, {
      destinationId: "dest-1",
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain("stream is live");
  });

  it("requires text before speaking on stream", async () => {
    const result = await callAction(speakOnStreamAction, { text: "   " });

    expect(result.success).toBe(false);
    expect(result.text).toContain("text parameter is required");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("speaks on stream via POST /api/stream/voice/speak", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await callAction(speakOnStreamAction, {
      text: "Hello stream",
    });

    expect(result.success).toBe(true);
    expect(result.text).toContain("Hello stream");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:2138/api/stream/voice/speak",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Hello stream" }),
      }),
    );
  });

  it("fails when overlay layout cannot be fetched", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({}, { ok: false, status: 404 }),
    );

    const result = await callAction(manageOverlayWidgetAction, {
      widgetType: "viewer-count",
      action: "enable",
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain("Could not fetch overlay layout");
  });

  it("updates and saves overlay widget state", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          layout: {
            version: 1,
            name: "default",
            widgets: [{ id: "w1", type: "viewer-count", enabled: false }],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await callAction(manageOverlayWidgetAction, {
      widgetType: "viewer-count",
      action: "enable",
      destinationId: "dest-1",
    });

    expect(result.success).toBe(true);
    expect(result.text).toContain('Widget "viewer-count" enabled');
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:2138/api/stream/overlay-layout?destination=dest-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:2138/api/stream/overlay-layout?destination=dest-1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          layout: {
            version: 1,
            name: "default",
            widgets: [{ id: "w1", type: "viewer-count", enabled: true }],
          },
        }),
      }),
    );
  });

  it("short-circuits when the widget is already in the requested state", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        layout: {
          version: 1,
          name: "default",
          widgets: [{ id: "w1", type: "viewer-count", enabled: true }],
        },
      }),
    );

    const result = await callAction(manageOverlayWidgetAction, {
      widgetType: "viewer-count",
      action: "enable",
    });

    expect(result.success).toBe(true);
    expect(result.text).toContain("already enabled");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
