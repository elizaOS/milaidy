import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { terminalAction } from "../../actions/terminal";
import { createMiladyPlugin } from "../../runtime/milady-plugin";

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

  it("is registered on the Milady plugin", () => {
    const plugin = createMiladyPlugin();
    const actionNames = (plugin.actions ?? []).map((action) => action.name);
    expect(actionNames).toContain("RUN_IN_TERMINAL");
  });

  it("supports CALL_MCP_TOOL compatibility alias", () => {
    expect(terminalAction.similes).toContain("CALL_MCP_TOOL");
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
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          command: "ls -la",
          clientId: "runtime-terminal-action",
        }),
      }),
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

  it("extracts command from natural language message when params are missing", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ ok: true }));

    const result = await terminalAction.handler(
      undefined,
      { roomId: "room", content: { text: "Can you run ls -la in the shell?" } },
      undefined,
      {},
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ command: "ls -la" });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://localhost:2138/api/terminal/run",
      expect.objectContaining({
        body: JSON.stringify({
          command: "ls -la",
          clientId: "runtime-terminal-action",
        }),
      }),
    );
  });

  it("extracts command from MCP-style JSON arguments", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ ok: true }));

    const result = await terminalAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { arguments: '{"command":"ls -la"}' } },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ command: "ls -la" });
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
