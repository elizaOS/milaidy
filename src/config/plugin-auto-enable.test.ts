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
} from "./plugin-auto-enable.js";

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
//  7. Mapping constants
// ============================================================================

describe("CONNECTOR_PLUGINS", () => {
  it("maps telegram to @elizaos/plugin-telegram", () => {
    expect(CONNECTOR_PLUGINS.telegram).toBe("@elizaos/plugin-telegram");
  });

  it("maps discord to @elizaos/plugin-discord", () => {
    expect(CONNECTOR_PLUGINS.discord).toBe("@elizaos/plugin-discord");
  });

  it("contains 16 connector mappings", () => {
    expect(Object.keys(CONNECTOR_PLUGINS)).toHaveLength(16);
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
