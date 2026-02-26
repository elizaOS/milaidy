import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MiladyConfig } from "../config/config.js";
import { type AgentSelfStatusInput, buildAgentSelfStatus } from "./server.js";

type RuntimeSource = AgentSelfStatusInput["runtime"];

function runtimeStub(opts?: {
  modelSetting?: unknown;
  plugins?: string[];
}): RuntimeSource {
  const plugins = (opts?.plugins ?? []).map((name) => ({ name }));
  return {
    getSetting: (key: string) =>
      key === "MODEL_PROVIDER" ? opts?.modelSetting : undefined,
    plugins: plugins as NonNullable<RuntimeSource>["plugins"],
  } as RuntimeSource;
}

describe("buildAgentSelfStatus", () => {
  const originalEnv = {
    MILADY_WALLET_MODE: process.env.MILADY_WALLET_MODE,
    EVM_PRIVATE_KEY: process.env.EVM_PRIVATE_KEY,
    NODEREAL_BSC_RPC_URL: process.env.NODEREAL_BSC_RPC_URL,
    QUICKNODE_BSC_RPC_URL: process.env.QUICKNODE_BSC_RPC_URL,
  };

  beforeEach(() => {
    process.env.MILADY_WALLET_MODE = "privy";
    delete process.env.EVM_PRIVATE_KEY;
    delete process.env.NODEREAL_BSC_RPC_URL;
    delete process.env.QUICKNODE_BSC_RPC_URL;
  });

  afterEach(() => {
    const restore = (key: keyof typeof originalEnv) => {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    };
    restore("MILADY_WALLET_MODE");
    restore("EVM_PRIVATE_KEY");
    restore("NODEREAL_BSC_RPC_URL");
    restore("QUICKNODE_BSC_RPC_URL");
  });

  it("derives provider, plugin categories, and trade capabilities from runtime snapshot", () => {
    const status = buildAgentSelfStatus({
      runtime: runtimeStub({
        modelSetting: "openai/gpt-5.1",
        plugins: [
          "@elizaos/plugin-openai",
          "@elizaos/plugin-browser",
          "@elizaos/plugin-discord",
        ],
      }),
      config: {} as MiladyConfig,
      state: "running",
      agentName: "Yuyuko",
      model: undefined,
      shellEnabled: true,
      agentAutomationMode: "full",
      tradePermissionMode: "manual-local-key",
      walletAddresses: {
        evmAddress: "0x1234567890123456789012345678901234567890",
        solanaAddress: null,
      },
      plugins: [
        { id: "openai", category: "ai-provider", enabled: true },
        { id: "browser", category: "feature", enabled: true },
        { id: "discord", category: "connector", enabled: true },
      ],
    });

    expect(status.provider).toBe("openai");
    expect(status.plugins.aiProviders).toContain("openai");
    expect(status.plugins.connectors).toContain("discord");
    expect(status.capabilities.canTrade).toBe(true);
    expect(status.capabilities.canLocalTrade).toBe(true);
    expect(status.capabilities.canAutoTrade).toBe(false);
    expect(status.capabilities.canUseBrowser).toBe(true);
    expect(status.capabilities.canRunTerminal).toBe(true);
  });

  it("blocks terminal and plugin mutations in connectors-only automation mode", () => {
    const status = buildAgentSelfStatus({
      runtime: runtimeStub({
        plugins: ["@elizaos/plugin-openai"],
      }),
      config: {} as MiladyConfig,
      state: "running",
      agentName: "Milady",
      model: "openai/gpt-5.1",
      shellEnabled: true,
      agentAutomationMode: "connectors-only",
      tradePermissionMode: "agent-auto",
      walletAddresses: {
        evmAddress: "0x1234567890123456789012345678901234567890",
        solanaAddress: null,
      },
      plugins: [{ id: "openai", category: "ai-provider", enabled: true }],
    });

    expect(status.capabilities.canRunTerminal).toBe(false);
    expect(status.capabilities.canInstallPlugins).toBe(false);
    expect(status.capabilities.canConfigurePlugins).toBe(false);
    expect(status.capabilities.canConfigureConnectors).toBe(true);
  });

  it("falls back to enabled config entries when runtime is unavailable", () => {
    const config = {
      plugins: {
        entries: {
          openai: { enabled: true },
          telegram: { enabled: true },
        },
      },
    } as MiladyConfig;

    const status = buildAgentSelfStatus({
      runtime: null,
      config,
      state: "stopped",
      agentName: "Milady",
      model: undefined,
      shellEnabled: false,
      agentAutomationMode: "full",
      tradePermissionMode: "user-sign-only",
      walletAddresses: { evmAddress: null, solanaAddress: null },
      plugins: [
        { id: "openai", category: "ai-provider", enabled: true },
        { id: "telegram", category: "connector", enabled: true },
      ],
    });

    expect(status.plugins.active).toContain("openai");
    expect(status.plugins.active).toContain("telegram");
    expect(status.plugins.connectors).toContain("telegram");
    expect(status.capabilities.canTrade).toBe(false);
    expect(status.capabilities.canRunTerminal).toBe(false);
  });
});
