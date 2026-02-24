/**
 * Plugin Auto-Enable — Unit Tests
 *
 * Tests for:
 * - applyPluginAutoEnable (connector, auth profile, env var, feature flag, hooks rules)
 * - CONNECTOR_PLUGINS / AUTH_PROVIDER_PLUGINS mappings
 */
import { describe, expect, it } from "vitest";

import {
  type ApplyPluginAutoEnableParams,
  AUTH_PROVIDER_PLUGINS,
  applyPluginAutoEnable,
  CONNECTOR_PLUGINS,
} from "./plugin-auto-enable";
import { CONNECTOR_IDS } from "./schema";

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

  it("enables pi-ai plugin when MILAIDY_USE_PI_AI is set", () => {
    const params = makeParams({
      env: { MILAIDY_USE_PI_AI: "1" },
    });
    const { config, changes } = applyPluginAutoEnable(params);

    expect(config.plugins?.allow).toContain("pi-ai");
    expect(changes.some((c) => c.includes("MILAIDY_USE_PI_AI"))).toBe(true);
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

  it("contains 18 connector mappings", () => {
    expect(Object.keys(CONNECTOR_PLUGINS)).toHaveLength(18);
  });

  it("maps retake to @milady/plugin-retake", () => {
    expect(CONNECTOR_PLUGINS.retake).toBe("@milady/plugin-retake");
  });

  it("has keys matching CONNECTOR_IDS from schema", () => {
    expect([...Object.keys(CONNECTOR_PLUGINS)].sort()).toEqual(
      [...CONNECTOR_IDS].sort(),
    );
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

  it("maps MILAIDY_USE_PI_AI to pi-ai plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.MILAIDY_USE_PI_AI).toBe(
      "@elizaos/plugin-pi-ai",
    );
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
