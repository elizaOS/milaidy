import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { terminalAction } from "../../actions/terminal";

function mockResponse(response: { ok: boolean }): Response {
  return {
    ok: response.ok,
  } as unknown as Response;
}

describe("terminalAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    process.env.API_PORT = "2138";
    process.env.SERVER_PORT = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires a command", async () => {
    const result = await terminalAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { command: "" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe("");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("fails when API returns error", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ ok: false }));

    const result = await terminalAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { command: "ls -la" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe("");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://localhost:2138/api/terminal/run",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("succeeds when API returns ok", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ ok: true }));

    const result = await terminalAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { command: "bun --version" } },
    );

    expect(result.success).toBe(true);
    expect(result.text).toBe("Running in terminal: `bun --version`");
    expect(result.data).toEqual({ command: "bun --version" });
  });

  it("handles fetch exceptions", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    const result = await terminalAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { command: "echo hi" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe("");
  });
});
