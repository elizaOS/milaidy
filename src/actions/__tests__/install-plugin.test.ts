import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installPluginAction } from "../../actions/install-plugin";

function mockJsonResponse(response: {
  ok: boolean;
  status: number;
  body: unknown;
  jsonThrows?: boolean;
}): Response {
  return {
    ok: response.ok,
    status: response.status,
    json: response.jsonThrows
      ? vi.fn(async () => {
          throw new Error("invalid json");
        })
      : vi.fn(async () => response.body),
  } as unknown as Response;
}

describe("installPluginAction", () => {
  const originalApiPort = process.env.API_PORT;
  const originalServerPort = process.env.SERVER_PORT;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    process.env.API_PORT = "2138";
    process.env.SERVER_PORT = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.API_PORT = originalApiPort;
    process.env.SERVER_PORT = originalServerPort;
  });

  it("requires a plugin ID", async () => {
    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      undefined,
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("I need a plugin ID to install");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("prefixes short plugin IDs with @elizaos/plugin-", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        ok: true,
        status: 200,
        body: { ok: true },
      }),
    );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "telegram" } },
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://localhost:2138/api/plugins/install",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "@elizaos/plugin-telegram",
          autoRestart: true,
        }),
      }),
    );
  });

  it("returns API error message when response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        ok: false,
        status: 500,
        body: { error: "failed to install" },
      }),
    );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "discord" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain(
      "Failed to install discord: failed to install",
    );
  });

  it("falls back to HTTP status when error body is not parseable", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        ok: false,
        status: 502,
        body: null,
        jsonThrows: true,
      }),
    );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "discord" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe("Failed to install discord: HTTP 502");
  });

  it("returns a failure message when install service reports ok:false", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        ok: true,
        status: 200,
        body: { ok: false, error: "service rejected plugin" },
      }),
    );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "@elizaos/plugin-telegram" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain(
      "Failed to install @elizaos/plugin-telegram: service rejected plugin",
    );
  });

  it("uses plugin service response message when provided", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        ok: true,
        status: 200,
        body: {
          ok: true,
          message: "plugin-telegram installed and restart scheduled",
        },
      }),
    );

    const result = await installPluginAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { pluginId: "@elizaos/plugin-telegram" } },
    );

    expect(result.success).toBe(true);
    expect(result.text).toBe("plugin-telegram installed and restart scheduled");
  });
});
