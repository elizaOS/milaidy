/**
 * Plugin Auto-Enable — Unit Tests
 *
 * Tests for:
 * - applyPluginAutoEnable (connector, auth profile, env var, feature flag, hooks rules)
 * - CONNECTOR_PLUGINS / AUTH_PROVIDER_PLUGINS mappings
 */
import { describe, expect, it, vi } from "vitest";

// Mock all static plugin star-imports in eliza.ts to avoid ESM resolution
// failures from heavy transitive dependencies at static-analysis time.
vi.mock("@elizaos/plugin-agent-orchestrator", () => ({ default: {} }));
vi.mock("@elizaos/plugin-agent-skills", () => ({ default: {} }));
vi.mock("@elizaos/plugin-anthropic", () => ({ default: {} }));
vi.mock("@elizaos/plugin-browser", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cli", () => ({ default: {} }));
vi.mock("@elizaos/plugin-coding-agent", () => ({ default: {} }));
vi.mock("@elizaos/plugin-computeruse", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cron", () => ({ default: {} }));
vi.mock("@elizaos/plugin-discord", () => ({ default: {} }));
vi.mock("@elizaos/plugin-edge-tts", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elevenlabs", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elizacloud", () => ({ default: {} }));
vi.mock("@elizaos/plugin-experience", () => ({ default: {} }));
vi.mock("@elizaos/plugin-form", () => ({ default: {} }));
vi.mock("@elizaos/plugin-google-genai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-groq", () => ({ default: {} }));
vi.mock("@elizaos/plugin-knowledge", () => ({ default: {} }));
vi.mock("@elizaos/plugin-local-embedding", () => ({ default: {} }));
vi.mock("@elizaos/plugin-ollama", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openrouter", () => ({ default: {} }));
vi.mock("@elizaos/plugin-pdf", () => ({ default: {} }));
vi.mock("@elizaos/plugin-personality", () => ({ default: {} }));
vi.mock("@elizaos/plugin-plugin-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-rolodex", () => ({ default: {} }));
vi.mock("@elizaos/plugin-secrets-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-shell", () => ({ default: {} }));
vi.mock("@elizaos/plugin-sql", () => ({ default: {} }));
vi.mock("@elizaos/plugin-telegram", () => ({ default: {} }));
vi.mock("@elizaos/plugin-trajectory-logger", () => ({ default: {} }));
vi.mock("@elizaos/plugin-trust", () => ({ default: {} }));
vi.mock("@elizaos/plugin-twitch", () => ({ default: {} }));

import { CHANNEL_PLUGIN_MAP } from "../runtime/eliza";
import {
  type ApplyPluginAutoEnableParams,
  AUTH_PROVIDER_PLUGINS,
  applyPluginAutoEnable,
  CONNECTOR_PLUGINS,
  isStreamingDestinationConfigured,
  STREAMING_PLUGINS,
} from "./plugin-auto-enable";
import { CONNECTOR_IDS } from "./schema";

const INTERNAL_CONNECTOR_PLUGIN_OVERRIDES: Record<string, string> = {
  signal: "@miladyai/plugin-signal",
  whatsapp: "@miladyai/plugin-whatsapp",
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build minimal ApplyPluginAutoEnableParams with defaults. */
function makeParams(
  overrides: Partial<ApplyPluginAutoEnableParams> = {},
): ApplyPluginAutoEnableParams {
  return {
    config: {},
    env: {},
    ...overrides,
  };
}

// ============================================================================
//  1. applyPluginAutoEnable — base behavior
// ============================================================================

describe("applyPluginAutoEnable", () => {
  it("returns unchanged config when plugins.enabled is false", () => {
    const params = makeParams({
      config: { plugins: { enabled: false } },
      env: { OPENAI_API_KEY: "sk-test" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
    expect(config.plugins?.allow).toBeUndefined();
  });

  it("returns empty changes when no triggers are present", () => {
    const { changes } = applyPluginAutoEnable(makeParams());
    expect(changes).toHaveLength(0);
  });

  it("initializes plugins.allow array when absent", () => {
    const params = makeParams({ env: { OPENAI_API_KEY: "sk-test" } });
    const { config } = applyPluginAutoEnable(params);

    expect(Array.isArray(config.plugins?.allow)).toBe(true);
  });
});

// ============================================================================
//  2. Channel auto-enable
// ============================================================================

describe("applyPluginAutoEnable — connectors", () => {
  it("enables plugin for a connector with a botToken", () => {
    const params = makeParams({
      config: {
        connectors: {
          telegram: { botToken: "123:ABC" },
        },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("telegram");
    expect(changes.some((c) => c.includes("telegram"))).toBe(true);
  });

  it("skips connector when explicitly disabled", () => {
    const params = makeParams({
      config: {
        connectors: {
          discord: { enabled: false, botToken: "abc" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("discord");
  });

  it("skips connector without authentication credentials", () => {
    const params = makeParams({
      config: {
        connectors: {
          slack: { someOtherField: "value" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("slack");
  });

  it("enables bluebubbles when serverUrl and password are set", () => {
    const params = makeParams({
      config: {
        connectors: {
          bluebubbles: { serverUrl: "http://localhost:1234", password: "pass" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("bluebubbles");
  });

  it("enables imessage when cliPath is set", () => {
    const params = makeParams({
      config: {
        connectors: {
          imessage: { cliPath: "/usr/local/bin/imessage" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("imessage");
  });

  it("enables signal when account is set", () => {
    const params = makeParams({
      config: {
        connectors: {
          signal: { account: "+15551234567" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("signal");
  });

  it("enables signal when any enabled account entry is configured", () => {
    const params = makeParams({
      config: {
        connectors: {
          signal: {
            accounts: {
              primary: { enabled: true, cliPath: "/usr/local/bin/signal-cli" },
              disabled: { enabled: false, account: "+15550000000" },
            },
          },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("signal");
  });

  it("supports legacy channels key for backward compat", () => {
    const params = makeParams({
      config: {
        channels: {
          telegram: { botToken: "legacy-tok" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("telegram");
  });
});

// ============================================================================
//  3. Auth profile auto-enable
// ============================================================================

describe("applyPluginAutoEnable — auth profiles", () => {
  it("enables plugin for an auth profile with matching provider", () => {
    const params = makeParams({
      config: {
        auth: {
          profiles: {
            main: { provider: "openai", mode: "api_key" as const },
          },
        },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("openai");
    expect(changes.some((c) => c.includes("auth profile"))).toBe(true);
  });

  it("skips auth profile with unrecognized provider", () => {
    const params = makeParams({
      config: {
        auth: {
          profiles: {
            custom: { provider: "my-custom-llm", mode: "api_key" as const },
          },
        },
      },
    });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });
});

// ============================================================================
//  4. Env var auto-enable
// ============================================================================

describe("applyPluginAutoEnable — env vars", () => {
  it("enables plugin when its API key env var is set", () => {
    const params = makeParams({
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("anthropic");
    expect(changes.some((c) => c.includes("ANTHROPIC_API_KEY"))).toBe(true);
  });

  it("enables repoprompt plugin when REPOPROMPT_CLI_PATH is set", () => {
    const params = makeParams({
      env: { REPOPROMPT_CLI_PATH: "/usr/local/bin/rp-cli" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("repoprompt");
    expect(changes.some((c) => c.includes("REPOPROMPT_CLI_PATH"))).toBe(true);
  });

  it("enables claude code workbench plugin when CLAUDE_CODE_WORKBENCH_ENABLED is set", () => {
    const params = makeParams({
      env: { CLAUDE_CODE_WORKBENCH_ENABLED: "1" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("claude-code-workbench");
    expect(
      changes.some((c) => c.includes("CLAUDE_CODE_WORKBENCH_ENABLED")),
    ).toBe(true);
  });

  it("enables pi-ai plugin when USE_PI_AI env is set", () => {
    // The env key name depends on branding: ELIZA_USE_PI_AI or ELIZA_USE_PI_AI.
    // Detect which key the source expects by looking at AUTH_PROVIDER_PLUGINS.
    const piAiEnvKey = AUTH_PROVIDER_PLUGINS.ELIZA_USE_PI_AI
      ? "ELIZA_USE_PI_AI"
      : "ELIZA_USE_PI_AI";
    const params = makeParams({
      env: { [piAiEnvKey]: "1" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("pi-ai");
    expect(changes.some((c) => c.includes("PI_AI"))).toBe(true);
  });

  it("skips env var with empty string value", () => {
    const params = makeParams({ env: { OPENAI_API_KEY: "" } });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });

  it("skips env var with whitespace-only value", () => {
    const params = makeParams({ env: { OPENAI_API_KEY: "   " } });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });

  it("respects plugin entry enabled=false override", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { anthropic: { enabled: false } } },
      },
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("anthropic");
  });

  it("handles multiple env vars enabling different plugins", () => {
    const params = makeParams({
      env: {
        OPENAI_API_KEY: "sk-test",
        GROQ_API_KEY: "gsk-test",
        XAI_API_KEY: "xai-test",
      },
    });
    const { config } = applyPluginAutoEnable(params);
    const allow = config.plugins?.allow ?? [];

    expect(allow).toContain("openai");
    expect(allow).toContain("groq");
    expect(allow).toContain("xai");
  });

  it("auto-enables obsidian plugin when OBSIDIAN_VAULT_PATH is set", () => {
    const params = makeParams({
      env: { OBSIDIAN_VAULT_PATH: "/tmp/vault" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("obsidian");
    expect(changes.some((c) => c.includes("OBSIDIAN_VAULT_PATH"))).toBe(true);
  });

  it("does not duplicate entries in allow list", () => {
    const params = makeParams({
      env: {
        ANTHROPIC_API_KEY: "key1",
        CLAUDE_API_KEY: "key2",
      },
    });
    const { config } = applyPluginAutoEnable(params);
    const allow = config.plugins?.allow ?? [];

    const anthropicEntries = allow.filter((p) => p === "anthropic");
    expect(anthropicEntries).toHaveLength(1);
  });

  it("auto-enables cua plugin when CUA_API_KEY is set", () => {
    const params = makeParams({
      env: { CUA_API_KEY: "cua-key" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("cua");
    expect(changes.some((c) => c.includes("CUA_API_KEY"))).toBe(true);
  });

  it("auto-enables cua plugin when CUA_HOST is set", () => {
    const params = makeParams({
      env: { CUA_HOST: "https://cua.example" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("cua");
    expect(changes.some((c) => c.includes("CUA_HOST"))).toBe(true);
  });

  it("respects cua enabled=false override for env auto-enable", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { cua: { enabled: false } } },
      },
      env: { CUA_API_KEY: "cua-key" },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("cua");
  });

  it("respects x402 enabled=false override for env auto-enable", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { x402: { enabled: false } } },
      },
      env: { X402_API_KEY: "x402-key" },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("x402");
  });

  it("does not duplicate cua when both CUA_API_KEY and CUA_HOST are set", () => {
    const params = makeParams({
      env: { CUA_API_KEY: "cua-key", CUA_HOST: "https://cua.example" },
    });
    const { config } = applyPluginAutoEnable(params);
    const allow = config.plugins?.allow ?? [];

    const cuaEntries = allow.filter((p) => p === "cua");
    expect(cuaEntries).toHaveLength(1);
  });
});

// ============================================================================
//  5. Feature flag auto-enable
// ============================================================================

describe("applyPluginAutoEnable — features", () => {
  it("enables plugin when feature is set to true", () => {
    const params = makeParams({
      config: { features: { browser: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("browser");
    expect(changes.some((c) => c.includes("feature: browser"))).toBe(true);
  });

  it("enables repoprompt plugin when feature flag is enabled", () => {
    const params = makeParams({
      config: { features: { repoprompt: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("repoprompt");
    expect(changes.some((c) => c.includes("feature: repoprompt"))).toBe(true);
  });

  it("enables claude code workbench plugin when feature flag is enabled", () => {
    const params = makeParams({
      config: { features: { claudeCodeWorkbench: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("claude-code-workbench");
    expect(
      changes.some((c) => c.includes("feature: claudeCodeWorkbench")),
    ).toBe(true);
  });

  it("enables plugin when feature is an object with enabled not false", () => {
    const params = makeParams({
      config: { features: { cron: { schedule: "* * * * *" } } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("cron");
  });

  it("skips feature when enabled is explicitly false", () => {
    const params = makeParams({
      config: { features: { shell: { enabled: false } } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("shell");
  });

  it("skips unrecognized feature names", () => {
    const params = makeParams({
      config: { features: { customFeature: true } },
    });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes).toHaveLength(0);
  });

  it("enables obsidian plugin when features.obsidian = true", () => {
    const params = makeParams({
      config: { features: { obsidian: true } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("obsidian");
  });

  it("enables x402 plugin when features.x402 = true", () => {
    const params = makeParams({
      config: { features: { x402: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("x402");
    expect(changes.some((c) => c.includes("feature: x402"))).toBe(true);
  });

  it("enables cua plugin when features.cua = true", () => {
    const params = makeParams({
      config: { features: { cua: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("cua");
    expect(changes.some((c) => c.includes("feature: cua"))).toBe(true);
  });

  it("skips x402 feature when features.x402.enabled is explicitly false", () => {
    const params = makeParams({
      config: { features: { x402: { enabled: false } } },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("x402");
  });

  it("enables computeruse plugin when features.computeruse = true", () => {
    const params = makeParams({
      config: { features: { computeruse: true } },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("computeruse");
    expect(changes.some((c) => c.includes("feature: computeruse"))).toBe(true);
  });
});

// ============================================================================
//  6. Hooks auto-enable
// ============================================================================

describe("applyPluginAutoEnable — hooks", () => {
  it("enables webhooks plugin when hooks.token is set", () => {
    const params = makeParams({
      config: { hooks: { token: "whk-secret" } as Record<string, unknown> },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("webhooks");
  });

  it("skips webhooks when hooks.enabled is false", () => {
    const params = makeParams({
      config: {
        hooks: { enabled: false, token: "whk-secret" } as Record<
          string,
          unknown
        >,
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow ?? []).not.toContain("webhooks");
  });

  it("enables gmail-watch plugin when hooks.gmail.account is set", () => {
    const params = makeParams({
      config: {
        hooks: { gmail: { account: "user@gmail.com" } } as Record<
          string,
          unknown
        >,
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("gmail-watch");
  });
});

// ============================================================================
//  7. Subscription provider auto-enable
// ============================================================================

describe("applyPluginAutoEnable — subscription provider", () => {
  it("force-enables anthropic plugin when subscriptionProvider is anthropic-subscription", () => {
    const params = makeParams({
      config: {
        agents: {
          defaults: { subscriptionProvider: "anthropic-subscription" },
        },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("anthropic");
    expect(changes.some((c) => c.includes("subscription"))).toBe(true);
  });

  it("force-enables openai plugin when subscriptionProvider is openai-codex", () => {
    const params = makeParams({
      config: {
        agents: { defaults: { subscriptionProvider: "openai-codex" } },
      },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("openai");
    expect(changes.some((c) => c.includes("subscription"))).toBe(true);
  });

  it("overrides explicit enabled=false for the subscription plugin", () => {
    const params = makeParams({
      config: {
        plugins: { entries: { anthropic: { enabled: false } } },
        agents: {
          defaults: { subscriptionProvider: "anthropic-subscription" },
        },
      },
    });
    const { config } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("anthropic");
    expect(config.plugins?.entries?.anthropic?.enabled).toBe(true);
  });

  it("does nothing when subscriptionProvider is not set", () => {
    const params = makeParams({
      config: { agents: { defaults: {} } },
    });
    const { changes } = applyPluginAutoEnable(params);

    expect(changes.every((c) => !c.includes("subscription"))).toBe(true);
  });
});

// ============================================================================
//  8. Mapping constants
// ============================================================================

describe("CONNECTOR_PLUGINS", () => {
  it("maps telegram to @elizaos/plugin-telegram", () => {
    expect(CONNECTOR_PLUGINS.telegram).toBe("@elizaos/plugin-telegram");
  });

  it("maps discord to @elizaos/plugin-discord", () => {
    expect(CONNECTOR_PLUGINS.discord).toBe("@elizaos/plugin-discord");
  });

  it("contains 19 connector mappings", () => {
    expect(Object.keys(CONNECTOR_PLUGINS)).toHaveLength(19);
  });

  it("maps retake to @elizaos/plugin-retake", () => {
    expect(CONNECTOR_PLUGINS.retake).toBe("@elizaos/plugin-retake");
  });

  it("has keys matching CONNECTOR_IDS from schema", () => {
    expect([...Object.keys(CONNECTOR_PLUGINS)].sort()).toEqual(
      [...CONNECTOR_IDS].sort(),
    );
  });

  it("CONNECTOR_PLUGINS values match CHANNEL_PLUGIN_MAP for every connector", () => {
    for (const id of Object.keys(CONNECTOR_PLUGINS)) {
      expect(CHANNEL_PLUGIN_MAP[id]).toBe(
        INTERNAL_CONNECTOR_PLUGIN_OVERRIDES[id] ?? CONNECTOR_PLUGINS[id],
      );
    }
  });

  it("maps blooio to @elizaos/plugin-blooio", () => {
    expect(CONNECTOR_PLUGINS.blooio).toBe("@elizaos/plugin-blooio");
  });
});

describe("AUTH_PROVIDER_PLUGINS", () => {
  it("maps OPENAI_API_KEY to openai plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.OPENAI_API_KEY).toBe("@elizaos/plugin-openai");
  });

  it("maps both ANTHROPIC_API_KEY and CLAUDE_API_KEY to anthropic plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.ANTHROPIC_API_KEY).toBe(
      "@elizaos/plugin-anthropic",
    );
    expect(AUTH_PROVIDER_PLUGINS.CLAUDE_API_KEY).toBe(
      "@elizaos/plugin-anthropic",
    );
  });

  it("maps OBSIDIAN_VAULT_PATH and OBSIDAN_VAULT_PATH to obsidian plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.OBSIDIAN_VAULT_PATH).toBe(
      "@elizaos/plugin-obsidian",
    );
    expect(AUTH_PROVIDER_PLUGINS.OBSIDAN_VAULT_PATH).toBe(
      "@elizaos/plugin-obsidian",
    );
  });

  it("maps USE_PI_AI env key to pi-ai plugin", () => {
    // The key name depends on the branding of the resolved source.
    const piAiMapping =
      AUTH_PROVIDER_PLUGINS.ELIZA_USE_PI_AI ??
      AUTH_PROVIDER_PLUGINS.ELIZA_USE_PI_AI;
    expect(piAiMapping).toBe("@elizaos/plugin-pi-ai");
  });

  it("maps CUA env keys to cua plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.CUA_API_KEY).toBe("@elizaos/plugin-cua");
    expect(AUTH_PROVIDER_PLUGINS.CUA_HOST).toBe("@elizaos/plugin-cua");
  });
});

// ============================================================================
//  WhatsApp connector auto-enable — Baileys auth fields
// ============================================================================

describe("WhatsApp connector auto-enable", () => {
  it("auto-enables via legacy authState field", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: { connectors: { whatsapp: { authState: "./auth" } } },
      }),
    );
    expect(config.plugins?.allow).toContain("whatsapp");
  });

  it("auto-enables via legacy sessionPath field", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: { connectors: { whatsapp: { sessionPath: "./auth" } } },
      }),
    );
    expect(config.plugins?.allow).toContain("whatsapp");
  });

  it("auto-enables via authDir (Baileys WhatsAppAccountSchema field)", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: { connectors: { whatsapp: { authDir: "./auth/whatsapp" } } },
      }),
    );
    expect(config.plugins?.allow).toContain("whatsapp");
  });

  it("auto-enables when accounts object is configured", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: {
            whatsapp: {
              accounts: { default: { enabled: true, authDir: "./auth" } },
            },
          },
        },
      }),
    );
    expect(config.plugins?.allow).toContain("whatsapp");
  });

  it("does not auto-enable when whatsapp config is empty", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({ config: { connectors: { whatsapp: {} } } }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("whatsapp");
  });

  it("does not auto-enable when accounts object has no valid authDir", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: {
            whatsapp: { accounts: { default: {} } },
          },
        },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("whatsapp");
  });

  it("does not auto-enable when all accounts are explicitly disabled", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: {
            whatsapp: {
              accounts: { main: { enabled: false, authDir: "./auth" } },
            },
          },
        },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("whatsapp");
  });

  it("does not auto-enable when enabled is explicitly false", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: {
            whatsapp: { enabled: false, authDir: "./auth/whatsapp" },
          },
        },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("whatsapp");
  });
});

// ============================================================================
//  Retake connector auto-enable
// ============================================================================

describe("Retake connector auto-enable", () => {
  it("auto-enables when accessToken is set", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: { retake: { accessToken: "rtk-test-token" } },
        },
      }),
    );
    expect(config.plugins?.allow).toContain("retake");
  });

  it("auto-enables when enabled is true", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: { retake: { enabled: true } },
        },
      }),
    );
    expect(config.plugins?.allow).toContain("retake");
  });

  it("does not auto-enable when config is empty", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: { connectors: { retake: {} } },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("retake");
  });

  it("does not auto-enable when enabled is explicitly false", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: {
            retake: { enabled: false, accessToken: "rtk-test" },
          },
        },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("retake");
  });
});

describe("Blooio connector auto-enable", () => {
  it("auto-enables when apiKey is set", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: { connectors: { blooio: { apiKey: "blk-test-key" } } },
      }),
    );
    expect(config.plugins?.allow).toContain("blooio");
  });

  it("does not auto-enable when config is empty", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: { connectors: { blooio: {} } },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("blooio");
  });

  it("does not auto-enable when enabled is explicitly false", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          connectors: {
            blooio: { enabled: false, apiKey: "blk-test-key" },
          },
        },
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("blooio");
  });
});

// ============================================================================
//  Streaming destination auto-enable
// ============================================================================

describe("STREAMING_PLUGINS mapping", () => {
  it("maps known streaming destinations to plugin packages", () => {
    expect(STREAMING_PLUGINS.retake).toBe("@elizaos/plugin-retake");
    expect(STREAMING_PLUGINS.twitch).toBe("@elizaos/plugin-twitch-streaming");
    expect(STREAMING_PLUGINS.youtube).toBe("@elizaos/plugin-youtube-streaming");
    expect(STREAMING_PLUGINS.customRtmp).toBe("@elizaos/plugin-custom-rtmp");
  });
});

describe("isStreamingDestinationConfigured", () => {
  it("returns false for null/undefined config", () => {
    expect(isStreamingDestinationConfigured("retake", null)).toBe(false);
    expect(isStreamingDestinationConfigured("twitch", undefined)).toBe(false);
  });

  it("returns false for non-object config", () => {
    expect(isStreamingDestinationConfigured("retake", "string")).toBe(false);
    expect(isStreamingDestinationConfigured("twitch", 42)).toBe(false);
  });

  it("returns false when enabled is explicitly false", () => {
    expect(
      isStreamingDestinationConfigured("retake", {
        enabled: false,
        accessToken: "tok",
      }),
    ).toBe(false);
    expect(
      isStreamingDestinationConfigured("twitch", {
        enabled: false,
        streamKey: "sk",
      }),
    ).toBe(false);
  });

  it("detects retake via accessToken", () => {
    expect(
      isStreamingDestinationConfigured("retake", { accessToken: "rtk-abc" }),
    ).toBe(true);
  });

  it("detects retake via enabled: true (no accessToken)", () => {
    expect(isStreamingDestinationConfigured("retake", { enabled: true })).toBe(
      true,
    );
  });

  it("rejects retake with empty config", () => {
    expect(isStreamingDestinationConfigured("retake", {})).toBe(false);
  });

  it("detects twitch via streamKey", () => {
    expect(
      isStreamingDestinationConfigured("twitch", { streamKey: "live_abc" }),
    ).toBe(true);
  });

  it("detects youtube via streamKey", () => {
    expect(
      isStreamingDestinationConfigured("youtube", { streamKey: "xxxx-xxxx" }),
    ).toBe(true);
  });

  it("detects customRtmp when both rtmpUrl and rtmpKey are present", () => {
    expect(
      isStreamingDestinationConfigured("customRtmp", {
        rtmpUrl: "rtmp://example.com/live",
        rtmpKey: "key123",
      }),
    ).toBe(true);
  });

  it("rejects customRtmp when only rtmpUrl is present (missing rtmpKey)", () => {
    expect(
      isStreamingDestinationConfigured("customRtmp", {
        rtmpUrl: "rtmp://example.com/live",
      }),
    ).toBe(false);
  });

  it("rejects customRtmp when only rtmpKey is present (missing rtmpUrl)", () => {
    expect(
      isStreamingDestinationConfigured("customRtmp", { rtmpKey: "key123" }),
    ).toBe(false);
  });

  it("returns false for unknown destination names", () => {
    expect(
      isStreamingDestinationConfigured("unknown", { streamKey: "sk" }),
    ).toBe(false);
  });
});

describe("applyPluginAutoEnable — streaming destinations", () => {
  it("auto-enables retake-streaming plugin when retake accessToken is set", () => {
    const { config, changes } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { retake: { accessToken: "rtk-test" } },
          // biome-ignore lint/suspicious/noExplicitAny: partial test config
        } as any,
      }),
    );
    expect(config.plugins?.allow).toContain("retake");
    expect(changes.some((c) => c.includes("streaming: retake"))).toBe(true);
  });

  it("auto-enables twitch-streaming plugin when twitch streamKey is set", () => {
    const { config, changes } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { twitch: { streamKey: "live_abc" } },
          // biome-ignore lint/suspicious/noExplicitAny: partial test config
        } as any,
      }),
    );
    expect(config.plugins?.allow).toContain("twitch-streaming");
    expect(changes.some((c) => c.includes("streaming: twitch"))).toBe(true);
  });

  it("auto-enables youtube-streaming plugin when youtube streamKey is set", () => {
    const { config, changes } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { youtube: { streamKey: "xxxx-xxxx" } },
          // biome-ignore lint/suspicious/noExplicitAny: partial test config
        } as any,
      }),
    );
    expect(config.plugins?.allow).toContain("youtube-streaming");
    expect(changes.some((c) => c.includes("streaming: youtube"))).toBe(true);
  });

  it("auto-enables custom-rtmp plugin when customRtmp has rtmpUrl and rtmpKey", () => {
    const { config, changes } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: {
            customRtmp: {
              rtmpUrl: "rtmp://example.com/live",
              rtmpKey: "key123",
            },
          },
          // biome-ignore lint/suspicious/noExplicitAny: partial test config
        } as any,
      }),
    );
    expect(config.plugins?.allow).toContain("custom-rtmp");
    expect(changes.some((c) => c.includes("streaming: customRtmp"))).toBe(true);
  });

  it("skips activeDestination meta field", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: {
            activeDestination: "twitch",
            twitch: { streamKey: "live_abc" },
          },
          // biome-ignore lint/suspicious/noExplicitAny: partial test config
        } as any,
      }),
    );
    // activeDestination should not result in any plugin — only twitch should be added
    const allow = config.plugins?.allow ?? [];
    expect(allow).toContain("twitch-streaming");
    expect(allow).not.toContain("activeDestination");
  });

  it("does not auto-enable streaming plugin when enabled is explicitly false", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { twitch: { enabled: false, streamKey: "live_abc" } },
          // biome-ignore lint/suspicious/noExplicitAny: partial test config
        } as any,
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("twitch-streaming");
  });

  it("does not auto-enable streaming plugin when shortId is disabled in plugins.entries", () => {
    const { config } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: { twitch: { streamKey: "live_abc" } },
          plugins: { entries: { "twitch-streaming": { enabled: false } } },
          // biome-ignore lint/suspicious/noExplicitAny: partial test config
        } as any,
      }),
    );
    expect(config.plugins?.allow ?? []).not.toContain("twitch-streaming");
  });

  it("does not auto-enable when streaming config is empty", () => {
    const { changes } = applyPluginAutoEnable(
      makeParams({
        // biome-ignore lint/suspicious/noExplicitAny: partial test config
        config: { streaming: {} } as any,
      }),
    );
    expect(changes.filter((c) => c.includes("streaming:"))).toHaveLength(0);
  });

  it("enables multiple streaming plugins simultaneously", () => {
    const { config, changes } = applyPluginAutoEnable(
      makeParams({
        config: {
          streaming: {
            retake: { accessToken: "rtk-test" },
            twitch: { streamKey: "live_abc" },
            youtube: { streamKey: "xxxx-xxxx" },
          },
          // biome-ignore lint/suspicious/noExplicitAny: partial test config
        } as any,
      }),
    );
    const allow = config.plugins?.allow ?? [];
    expect(allow).toContain("retake");
    expect(allow).toContain("twitch-streaming");
    expect(allow).toContain("youtube-streaming");
    expect(changes.length).toBeGreaterThanOrEqual(3);
  });
});
