import { beforeEach, describe, expect, it, vi } from "vitest";
import { canIAction } from "../../actions/can-i.js";

describe("canIAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns allowed for auto-trade when trade mode is agent-auto", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        generatedAt: "2026-02-26T00:00:00.000Z",
        model: "openai/gpt-5.1",
        provider: "openai",
        automationMode: "full",
        tradePermissionMode: "agent-auto",
        shellEnabled: true,
        wallet: {
          hasWallet: true,
          hasEvm: true,
          evmAddressShort: "0x12...1234",
        },
        capabilities: {
          canTrade: true,
          canLocalTrade: true,
          canAutoTrade: true,
          canUseBrowser: true,
          canUseComputer: false,
          canRunTerminal: true,
          canInstallPlugins: true,
          canConfigurePlugins: true,
          canConfigureConnectors: true,
        },
      }),
    } as Response);

    const result = await canIAction.handler?.(
      {} as never,
      {} as never,
      undefined,
      {
        parameters: {
          capability: "auto-trade",
        },
      },
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Yes.");
    expect((result?.data as { allowed?: boolean }).allowed).toBe(true);
  });

  it("returns guidance when auto-trade is blocked by mode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        generatedAt: "2026-02-26T00:00:00.000Z",
        model: "openai/gpt-5.1",
        provider: "openai",
        automationMode: "full",
        tradePermissionMode: "user-sign-only",
        shellEnabled: true,
        wallet: {
          hasWallet: true,
          hasEvm: true,
          evmAddressShort: "0x12...1234",
        },
        capabilities: {
          canTrade: true,
          canLocalTrade: false,
          canAutoTrade: false,
          canUseBrowser: true,
          canUseComputer: false,
          canRunTerminal: true,
          canInstallPlugins: true,
          canConfigurePlugins: true,
          canConfigureConnectors: true,
        },
      }),
    } as Response);

    const result = await canIAction.handler?.(
      {} as never,
      {} as never,
      undefined,
      {
        parameters: {
          capability: "auto-trade",
        },
      },
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Not yet.");
    expect(result?.text).toContain("agent-auto");
    expect((result?.data as { allowed?: boolean }).allowed).toBe(false);
  });

  it("rejects unknown capability names", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await canIAction.handler?.(
      {} as never,
      {} as never,
      undefined,
      {
        parameters: {
          capability: "teleport",
        },
      },
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("Unknown capability");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
