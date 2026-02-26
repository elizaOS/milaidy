import type { Memory, State } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSelfStatusProvider } from "./self-status.js";

describe("self-status provider", () => {
  const provider = createSelfStatusProvider();
  const runtime = {} as never;
  const message = {} as Memory;
  const state = {} as State;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders authoritative self snapshot when endpoint is available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        generatedAt: "2026-02-26T00:00:00.000Z",
        state: "running",
        agentName: "Yuyuko",
        model: "openai/gpt-5.1",
        provider: "openai",
        automationMode: "full",
        tradePermissionMode: "agent-auto",
        shellEnabled: true,
        wallet: {
          mode: "privy",
          evmAddress: "0x1234",
          evmAddressShort: "0x12...1234",
          solanaAddress: null,
          solanaAddressShort: null,
          hasWallet: true,
          hasEvm: true,
          hasSolana: false,
          localSignerAvailable: false,
          managedBscRpcReady: true,
        },
        plugins: {
          totalActive: 3,
          active: ["openai", "browser", "polymarket"],
          aiProviders: ["openai"],
          connectors: [],
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

    const result = await provider.get(runtime, message, state);
    expect(result.text).toContain("Self status snapshot");
    expect(result.text).toContain("Model: openai/gpt-5.1");
    expect(result.text).toContain("Wallet: 0x12...1234");
    const values = result.values as Record<string, unknown>;
    expect(values.selfStatusAvailable).toBe(true);
    expect(values.canUseBrowser).toBe(true);
  });

  it("returns fallback instructions when endpoint is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("connection refused"),
    );

    const result = await provider.get(runtime, message, state);
    expect(result.text).toContain("Self status snapshot unavailable");
    const values = result.values as Record<string, unknown>;
    expect(values.selfStatusAvailable).toBe(false);
  });
});
