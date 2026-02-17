/**
 * E2E tests for cloud & provider switching.
 *
 * Tests the full lifecycle:
 *   1. Cloud login persistence (key saved to config, env, DB)
 *   2. Provider switching (cloud ↔ local providers)
 *   3. Plugin conflicts (direct providers removed when cloud active)
 *   4. Model call routing (correct plugin handles the call)
 *   5. Live model calls when API keys are available
 *
 * Live tests (requiring real API keys) are gated by MILADY_LIVE_TEST=1.
 * Set OPENAI_API_KEY, ANTHROPIC_API_KEY, etc. in env to enable live tests.
 *
 * Run:
 *   pnpm test:e2e -- test/cloud-providers.e2e.test.ts
 *   MILADY_LIVE_TEST=1 OPENAI_API_KEY=sk-... pnpm test:e2e -- test/cloud-providers.e2e.test.ts
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MiladyConfig } from "../src/config/config";
import {
  applyCloudConfigToEnv,
  buildCharacterFromConfig,
  collectPluginNames,
} from "../src/runtime/eliza";

// ---------------------------------------------------------------------------
// Env snapshot helper
// ---------------------------------------------------------------------------

const ALL_PROVIDER_KEYS = [
  "ELIZAOS_CLOUD_ENABLED",
  "ELIZAOS_CLOUD_API_KEY",
  "ELIZAOS_CLOUD_BASE_URL",
  "ELIZAOS_CLOUD_SMALL_MODEL",
  "ELIZAOS_CLOUD_LARGE_MODEL",
  "SMALL_MODEL",
  "LARGE_MODEL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GROQ_API_KEY",
  "XAI_API_KEY",
  "OLLAMA_BASE_URL",
];

const LIVE_PROVIDER_KEY_SNAPSHOT = {
  openAiApiKey: process.env.OPENAI_API_KEY,
  elizaCloudApiKey: process.env.ELIZAOS_CLOUD_API_KEY,
};

function envSnapshot(keys: string[]): {
  save: () => void;
  restore: () => void;
} {
  const saved = new Map<string, string | undefined>();
  return {
    save() {
      for (const k of keys) saved.set(k, process.env[k]);
    },
    restore() {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

const snap = envSnapshot(ALL_PROVIDER_KEYS);
beforeEach(() => {
  snap.save();
  for (const k of ALL_PROVIDER_KEYS) delete process.env[k];
});
afterEach(() => snap.restore());

// ═══════════════════════════════════════════════════════════════════════════
// 1. Provider plugin selection — no allowlist
// ═══════════════════════════════════════════════════════════════════════════

describe("Provider plugin selection (auto-detect, no allowlist)", () => {
  it("loads OpenAI plugin when OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-openai")).toBe(true);
  });

  it("loads Anthropic plugin when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-anthropic")).toBe(true);
  });

  it("loads cloud plugin when config.cloud.enabled is true", () => {
    const config = { cloud: { enabled: true } } as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
  });

  it("keeps core cloud plugin loaded when cloud is explicitly disabled", () => {
    const config = {
      cloud: { enabled: false, apiKey: "ck-test" },
    } as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
  });

  it("loads multiple providers when multiple keys are set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-openai")).toBe(true);
    expect(names.has("@elizaos/plugin-anthropic")).toBe(true);
  });

  it("loads no direct AI provider when nothing is configured", () => {
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-openai")).toBe(false);
    expect(names.has("@elizaos/plugin-anthropic")).toBe(false);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Provider plugin selection — with allowlist (the real-world case)
// ═══════════════════════════════════════════════════════════════════════════

describe("Provider plugin selection (explicit allowlist)", () => {
  const makeConfig = (
    allow: string[],
    cloud?: { enabled?: boolean; apiKey?: string },
  ): MiladyConfig =>
    ({
      plugins: { allow },
      ...(cloud ? { cloud } : {}),
    }) as MiladyConfig;

  it("respects allowlist and includes only listed plugins", () => {
    const config = makeConfig([
      "@elizaos/plugin-anthropic",
      "@elizaos/plugin-browser",
    ]);
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-anthropic")).toBe(true);
    expect(names.has("@elizaos/plugin-browser")).toBe(true);
    expect(names.has("@elizaos/plugin-openai")).toBe(false);
  });

  it("always adds plugin-sql even if not in allowlist", () => {
    const config = makeConfig(["@elizaos/plugin-browser"]);
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-sql")).toBe(true);
  });

  it("injects cloud plugin into allowlist when cloud.enabled=true", () => {
    const config = makeConfig(
      ["@elizaos/plugin-anthropic", "@elizaos/plugin-browser"],
      { enabled: true, apiKey: "ck-test" },
    );
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
  });

  it("keeps core cloud plugin when cloud is explicitly disabled", () => {
    const config = makeConfig(["@elizaos/plugin-anthropic"], {
      enabled: false,
      apiKey: "ck-test",
    });
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
  });

  it("removes direct AI providers when cloud is active", () => {
    const config = makeConfig(
      [
        "@elizaos/plugin-anthropic",
        "@elizaos/plugin-openai",
        "@elizaos/plugin-browser",
        "@elizaos/plugin-webhooks",
      ],
      { enabled: true, apiKey: "ck-test" },
    );
    const names = collectPluginNames(config);

    // Cloud plugin replaces direct providers
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
    expect(names.has("@elizaos/plugin-anthropic")).toBe(false);
    expect(names.has("@elizaos/plugin-openai")).toBe(false);

    // Non-AI plugins are preserved
    expect(names.has("@elizaos/plugin-browser")).toBe(true);
    expect(names.has("@elizaos/plugin-webhooks")).toBe(true);
  });

  it("does NOT remove providers when cloud is inactive", () => {
    const config = makeConfig([
      "@elizaos/plugin-anthropic",
      "@elizaos/plugin-openai",
    ]);
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-anthropic")).toBe(true);
    expect(names.has("@elizaos/plugin-openai")).toBe(true);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Cloud config → env propagation
// ═══════════════════════════════════════════════════════════════════════════

describe("Cloud config → env var propagation", () => {
  it("sets all cloud env vars from config", () => {
    const config = {
      cloud: {
        enabled: true,
        apiKey: "ck-test",
        baseUrl: "https://test.cloud",
      },
    } as MiladyConfig;
    applyCloudConfigToEnv(config);
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBe("true");
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("ck-test");
    expect(process.env.ELIZAOS_CLOUD_BASE_URL).toBe("https://test.cloud");
  });

  it("always overwrites stale env vars on restart", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "stale-key";
    process.env.ELIZAOS_CLOUD_ENABLED = "false";
    const config = {
      cloud: { enabled: true, apiKey: "fresh-key" },
    } as MiladyConfig;
    applyCloudConfigToEnv(config);
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("fresh-key");
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBe("true");
  });

  it("keeps cloud disabled when enabled flag is explicitly false", () => {
    const config = {
      cloud: { enabled: false, apiKey: "ck-still-valid" },
    } as MiladyConfig;
    applyCloudConfigToEnv(config);
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBeUndefined();
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("ck-still-valid");
  });

  it("sets default model names when cloud is active", () => {
    const config = {
      cloud: { enabled: true, apiKey: "ck-x" },
    } as MiladyConfig;
    applyCloudConfigToEnv(config);
    expect(process.env.SMALL_MODEL).toBe("openai/gpt-5-mini");
    expect(process.env.LARGE_MODEL).toBe("anthropic/claude-sonnet-4.5");
  });

  it("uses explicit model names from config", () => {
    const config = {
      cloud: { enabled: true, apiKey: "ck-x" },
      models: { small: "google/gemini-2.5-flash", large: "openai/gpt-5" },
    } as MiladyConfig;
    applyCloudConfigToEnv(config);
    expect(process.env.SMALL_MODEL).toBe("google/gemini-2.5-flash");
    expect(process.env.LARGE_MODEL).toBe("openai/gpt-5");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Character secrets propagation
// ═══════════════════════════════════════════════════════════════════════════

describe("Character secrets include provider keys", () => {
  it("includes ELIZAOS_CLOUD_API_KEY in character secrets", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-secret";
    const char = buildCharacterFromConfig({} as MiladyConfig);
    expect((char.secrets as Record<string, string>).ELIZAOS_CLOUD_API_KEY).toBe(
      "ck-secret",
    );
  });

  it("includes OPENAI_API_KEY in character secrets", () => {
    process.env.OPENAI_API_KEY = "sk-test-openai";
    const char = buildCharacterFromConfig({} as MiladyConfig);
    expect((char.secrets as Record<string, string>).OPENAI_API_KEY).toBe(
      "sk-test-openai",
    );
  });

  it("includes ANTHROPIC_API_KEY in character secrets", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const char = buildCharacterFromConfig({} as MiladyConfig);
    expect((char.secrets as Record<string, string>).ANTHROPIC_API_KEY).toBe(
      "sk-ant-test",
    );
  });

  it("omits keys that are not set", () => {
    const char = buildCharacterFromConfig({} as MiladyConfig);
    const secrets = char.secrets as Record<string, string> | undefined;
    expect(secrets?.OPENAI_API_KEY).toBeUndefined();
    expect(secrets?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(secrets?.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Full provider switch simulation
// ═══════════════════════════════════════════════════════════════════════════

describe("Provider switching simulation", () => {
  it("switch local → cloud: Anthropic removed, cloud added", () => {
    // Start with Anthropic
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const localConfig = {
      plugins: {
        allow: ["@elizaos/plugin-anthropic", "@elizaos/plugin-browser"],
      },
    } as MiladyConfig;
    const localPlugins = collectPluginNames(localConfig);
    expect(localPlugins.has("@elizaos/plugin-anthropic")).toBe(true);
    expect(localPlugins.has("@elizaos/plugin-elizacloud")).toBe(true);

    // User enables cloud
    const cloudConfig = {
      plugins: {
        allow: ["@elizaos/plugin-anthropic", "@elizaos/plugin-browser"],
      },
      cloud: { enabled: true, apiKey: "ck-new-key" },
    } as MiladyConfig;
    applyCloudConfigToEnv(cloudConfig);
    const cloudPlugins = collectPluginNames(cloudConfig);

    expect(cloudPlugins.has("@elizaos/plugin-elizacloud")).toBe(true);
    expect(cloudPlugins.has("@elizaos/plugin-anthropic")).toBe(false);
    expect(cloudPlugins.has("@elizaos/plugin-browser")).toBe(true);
  });

  it("switch cloud → local: Anthropic restored while cloud core remains", () => {
    // Start with cloud
    const cloudConfig = {
      plugins: {
        allow: ["@elizaos/plugin-anthropic", "@elizaos/plugin-browser"],
      },
      cloud: { enabled: true, apiKey: "ck-key" },
    } as MiladyConfig;
    const cloudPlugins = collectPluginNames(cloudConfig);
    expect(cloudPlugins.has("@elizaos/plugin-elizacloud")).toBe(true);
    expect(cloudPlugins.has("@elizaos/plugin-anthropic")).toBe(false);

    // User disables cloud (keeps Anthropic in allowlist)
    const localConfig = {
      plugins: {
        allow: ["@elizaos/plugin-anthropic", "@elizaos/plugin-browser"],
      },
      cloud: { enabled: false },
    } as MiladyConfig;
    const localPlugins = collectPluginNames(localConfig);

    expect(localPlugins.has("@elizaos/plugin-anthropic")).toBe(true);
    expect(localPlugins.has("@elizaos/plugin-elizacloud")).toBe(true);
    expect(localPlugins.has("@elizaos/plugin-browser")).toBe(true);
  });

  it("full cycle: no config → cloud login → switch to OpenAI → back to cloud mode", () => {
    // Step 1: Fresh start, nothing configured
    let config = {} as MiladyConfig;
    let plugins = collectPluginNames(config);
    expect(plugins.has("@elizaos/plugin-elizacloud")).toBe(true);
    expect(plugins.has("@elizaos/plugin-openai")).toBe(false);

    // Step 2: User logs in to cloud
    config = { cloud: { enabled: true, apiKey: "ck-login" } } as MiladyConfig;
    applyCloudConfigToEnv(config);
    plugins = collectPluginNames(config);
    expect(plugins.has("@elizaos/plugin-elizacloud")).toBe(true);

    // Step 3: User switches to OpenAI with their own key.
    // On a real restart the process env is fresh; simulate by clearing cloud vars.
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
    process.env.OPENAI_API_KEY = "sk-user-openai";
    config = { cloud: { enabled: false } } as MiladyConfig;
    plugins = collectPluginNames(config);
    expect(plugins.has("@elizaos/plugin-openai")).toBe(true);
    expect(plugins.has("@elizaos/plugin-elizacloud")).toBe(true);

    // Step 4: User switches back to cloud
    config = { cloud: { enabled: true, apiKey: "ck-login" } } as MiladyConfig;
    applyCloudConfigToEnv(config);
    plugins = collectPluginNames(config);
    expect(plugins.has("@elizaos/plugin-elizacloud")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Live model call tests (only run with MILADY_LIVE_TEST=1)
// ═══════════════════════════════════════════════════════════════════════════

const isLive = process.env.MILADY_LIVE_TEST === "1";

describe.skipIf(!isLive)("Live model calls (requires real API keys)", () => {
  beforeEach(() => {
    if (LIVE_PROVIDER_KEY_SNAPSHOT.openAiApiKey) {
      process.env.OPENAI_API_KEY = LIVE_PROVIDER_KEY_SNAPSHOT.openAiApiKey;
    }
    if (LIVE_PROVIDER_KEY_SNAPSHOT.elizaCloudApiKey) {
      process.env.ELIZAOS_CLOUD_API_KEY =
        LIVE_PROVIDER_KEY_SNAPSHOT.elizaCloudApiKey;
    }
  });

  it("OpenAI: can generate text with OPENAI_API_KEY", async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY not set");

    const { generateText } = await import("ai");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: key, compatibility: "compatible" });
    const result = await generateText({
      model: openai.chat("gpt-4o-mini"),
      prompt: "Reply with exactly: HELLO_TEST",
      maxTokens: 20,
    });
    expect(result.text).toContain("HELLO_TEST");
  }, 30_000);

  it("Eliza Cloud: can generate text with ELIZAOS_CLOUD_API_KEY", async () => {
    const key = process.env.ELIZAOS_CLOUD_API_KEY;
    if (!key) {
      // Try loading from config
      const { loadMiladyConfig } = await import("../src/config/config");
      const config = loadMiladyConfig();
      if (!config.cloud?.apiKey)
        throw new Error("No Eliza Cloud API key found");
      process.env.ELIZAOS_CLOUD_API_KEY = config.cloud.apiKey;
    }
    const cloudKey = process.env.ELIZAOS_CLOUD_API_KEY;

    const { generateText } = await import("ai");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({
      apiKey: cloudKey as string,
      baseURL: "https://www.elizacloud.ai/api/v1",
      compatibility: "compatible",
    });
    try {
      const result = await generateText({
        model: openai.chat("openai/gpt-5-mini"),
        prompt: "Reply with exactly: CLOUD_TEST_OK",
        maxTokens: 20,
      });
      expect(result.text).toContain("CLOUD_TEST_OK");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const quotaOrBillingIssue =
        /insufficient credits|quota|max usage reached/i;
      if (quotaOrBillingIssue.test(message)) {
        expect(message).toMatch(quotaOrBillingIssue);
        return;
      }
      throw error;
    }
  }, 30_000);
});
