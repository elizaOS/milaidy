import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock dependencies
vi.mock("./anthropic", () => ({
  refreshAnthropicToken: vi.fn(),
}));
vi.mock("./openai-codex", () => ({
  refreshCodexToken: vi.fn(),
}));
vi.mock("./apply-stealth", () => ({
  applyClaudeCodeStealth: vi.fn(),
  applyOpenAICodexStealth: vi.fn(async () => undefined),
}));

// Mock fs to simulate credential files
const mockCredentials: Record<string, string | null> = {};
vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    default: {
      ...(actual.default as Record<string, unknown>),
      existsSync: (p: string) => !!mockCredentials[p],
      readFileSync: (p: string) => {
        const data = mockCredentials[p];
        if (!data) {
          const err = new Error("ENOENT") as NodeJS.ErrnoException;
          err.code = "ENOENT";
          throw err;
        }
        return data;
      },
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
  };
});

describe("applySubscriptionCredentials", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    // Clear mock credentials
    for (const key of Object.keys(mockCredentials)) {
      delete mockCredentials[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    }
  });

  test("auto-sets model.primary from subscriptionProvider when model is missing", async () => {
    const { applySubscriptionCredentials } = await import("./credentials");
    const config = {
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription" as string,
          model: undefined as { primary?: string } | undefined,
        },
      },
    };

    await applySubscriptionCredentials(config);

    expect(config.agents.defaults.model).toEqual({ primary: "anthropic" });
  });

  test("auto-sets model.primary when model exists but primary is missing", async () => {
    const { applySubscriptionCredentials } = await import("./credentials");
    const config = {
      agents: {
        defaults: {
          subscriptionProvider: "openai-codex" as string,
          model: {} as { primary?: string },
        },
      },
    };

    await applySubscriptionCredentials(config);

    expect(config.agents.defaults.model.primary).toBe("openai");
  });

  test("does not override existing model.primary", async () => {
    const { applySubscriptionCredentials } = await import("./credentials");
    const config = {
      agents: {
        defaults: {
          subscriptionProvider: "openai-codex" as string,
          model: { primary: "deepseek" },
        },
      },
    };

    await applySubscriptionCredentials(config);

    expect(config.agents.defaults.model.primary).toBe("deepseek");
  });

  test("handles missing config gracefully", async () => {
    const { applySubscriptionCredentials } = await import("./credentials");
    // Should not throw when config is undefined
    await expect(applySubscriptionCredentials()).resolves.not.toThrow();
    await expect(applySubscriptionCredentials({})).resolves.not.toThrow();
    await expect(
      applySubscriptionCredentials({ agents: {} }),
    ).resolves.not.toThrow();
  });

  test("calls applyClaudeCodeStealth when Anthropic token is applied", async () => {
    // Set up a mock credential file for anthropic-subscription
    const authDir = require("node:path").join(
      require("node:os").homedir(),
      ".milady",
      "auth",
    );
    const credPath = require("node:path").join(
      authDir,
      "anthropic-subscription.json",
    );
    mockCredentials[credPath] = JSON.stringify({
      provider: "anthropic-subscription",
      credentials: {
        access: "sk-ant-oat01-test-token",
        refresh: "refresh-token",
        expires: Date.now() + 60 * 60 * 1000, // 1 hour from now
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const { applySubscriptionCredentials } = await import("./credentials");
    const { applyClaudeCodeStealth } = await import("./apply-stealth");

    await applySubscriptionCredentials();

    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-oat01-test-token");
    expect(applyClaudeCodeStealth).toHaveBeenCalledTimes(1);
  });

  test("calls applyOpenAICodexStealth when OpenAI token is applied", async () => {
    const authDir = require("node:path").join(
      require("node:os").homedir(),
      ".milady",
      "auth",
    );
    const credPath = require("node:path").join(authDir, "openai-codex.json");
    mockCredentials[credPath] = JSON.stringify({
      provider: "openai-codex",
      credentials: {
        access: "eyJhbGciOiJSUzI1NiJ9.eyJ0ZXN0IjoxfQ.sig",
        refresh: "refresh-token",
        expires: Date.now() + 60 * 60 * 1000,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const { applySubscriptionCredentials } = await import("./credentials");
    const { applyOpenAICodexStealth } = await import("./apply-stealth");

    await applySubscriptionCredentials();

    expect(process.env.OPENAI_API_KEY).toBe(
      "eyJhbGciOiJSUzI1NiJ9.eyJ0ZXN0IjoxfQ.sig",
    );
    expect(applyOpenAICodexStealth).toHaveBeenCalledTimes(1);
  });
});
