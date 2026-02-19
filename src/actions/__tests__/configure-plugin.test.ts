import { beforeEach, describe, expect, it, vi } from "vitest";
import { configurePluginAction } from "../../actions/configure-plugin";

describe("configurePluginAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("applies plugin config + enabled flag through local API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    const result = await configurePluginAction.handler?.(
      {} as never,
      {} as never,
      undefined,
      {
        parameters: {
          pluginId: "discord",
          enabled: "true",
          configJson: JSON.stringify({
            DISCORD_API_TOKEN: "abc123",
            SOME_NUM: 42,
          }),
        },
      },
    );

    expect(result?.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:2138/api/plugins/discord",
      expect.objectContaining({
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Milady-Agent-Action": "1",
        },
      }),
    );

    const body = JSON.parse(
      (fetchSpy.mock.calls[0]?.[1] as { body: string }).body,
    ) as Record<string, unknown>;
    expect(body.enabled).toBe(true);
    expect(body.config).toEqual({
      DISCORD_API_TOKEN: "abc123",
      SOME_NUM: "42",
    });
  });

  it("rejects invalid configJson payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await configurePluginAction.handler?.(
      {} as never,
      {} as never,
      undefined,
      {
        parameters: {
          pluginId: "telegram",
          configJson: "{bad json",
        },
      },
    );

    expect(result?.success).toBe(false);
    expect(result?.text).toContain("configJson");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces server-side validation errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        ok: false,
        validationErrors: [{ field: "TOKEN", message: "invalid" }],
      }),
    } as Response);

    const result = await configurePluginAction.handler?.(
      {} as never,
      {} as never,
      undefined,
      {
        parameters: {
          pluginId: "telegram",
          configJson: JSON.stringify({ TOKEN: "short" }),
        },
      },
    );

    expect(result?.success).toBe(false);
    expect(result?.text).toContain("Failed to configure telegram");
  });
});
