/**
 * Unit tests for plugin configuration validation.
 *
 * Tests the validatePluginConfig() function: required parameter checks,
 * API key format validation, default-value handling, and edge cases.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEnvSandbox } from "../test-support/test-helpers";
import {
  type PluginParamInfo,
  validatePluginConfig,
} from "./plugin-validation";

describe("validatePluginConfig", () => {
  const envKeysToClean = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GROQ_API_KEY",
    "DISCORD_BOT_TOKEN",
    "DISCORD_APPLICATION_ID",
    "TELEGRAM_BOT_TOKEN",
    "SLACK_BOT_TOKEN",
    "SOME_API_KEY",
  ];
  const envSandbox = createEnvSandbox(envKeysToClean);

  beforeEach(() => {
    envSandbox.clear();
  });

  afterEach(() => {
    envSandbox.restore();
  });

  // ---------------------------------------------------------------------------
  // Required parameter validation
  // ---------------------------------------------------------------------------

  describe("required parameters", () => {
    const anthropicParams: PluginParamInfo[] = [
      {
        key: "ANTHROPIC_API_KEY",
        required: true,
        sensitive: true,
        type: "string",
        description: "API key",
      },
      {
        key: "ANTHROPIC_SMALL_MODEL",
        required: false,
        sensitive: false,
        type: "string",
        description: "Small model",
        default: "claude-3-5-haiku-20241022",
      },
    ];

    it("fails when required param is missing", () => {
      const result = validatePluginConfig(
        "anthropic",
        "ai-provider",
        "ANTHROPIC_API_KEY",
        ["ANTHROPIC_API_KEY"],
        undefined,
        anthropicParams,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "ANTHROPIC_API_KEY")).toBe(
        true,
      );
    });

    it("passes when required param is set in env", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-1234567890abcdef";
      const result = validatePluginConfig(
        "anthropic",
        "ai-provider",
        "ANTHROPIC_API_KEY",
        ["ANTHROPIC_API_KEY"],
        undefined,
        anthropicParams,
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("passes when required param is in provided config", () => {
      const result = validatePluginConfig(
        "anthropic",
        "ai-provider",
        "ANTHROPIC_API_KEY",
        ["ANTHROPIC_API_KEY"],
        { ANTHROPIC_API_KEY: "sk-ant-test-1234567890abcdef" },
        anthropicParams,
      );
      expect(result.valid).toBe(true);
    });

    it("optional param without value does not cause error", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-1234567890abcdef";
      const result = validatePluginConfig(
        "anthropic",
        "ai-provider",
        "ANTHROPIC_API_KEY",
        ["ANTHROPIC_API_KEY", "ANTHROPIC_SMALL_MODEL"],
        undefined,
        anthropicParams,
      );
      expect(result.valid).toBe(true);
      // Optional with default should not produce warning either when not set
    });

    it("required param with default produces warning not error", () => {
      const params: PluginParamInfo[] = [
        {
          key: "MY_KEY",
          required: true,
          sensitive: false,
          type: "string",
          description: "A key",
          default: "fallback-value",
        },
      ];
      const result = validatePluginConfig(
        "test-plugin",
        "feature",
        null,
        ["MY_KEY"],
        undefined,
        params,
      );
      expect(result.valid).toBe(true); // valid because default exists
      expect(
        result.warnings.some(
          (w) => w.field === "MY_KEY" && w.message.includes("default"),
        ),
      ).toBe(true);
    });

    it("empty string is treated as not set", () => {
      process.env.ANTHROPIC_API_KEY = "";
      const result = validatePluginConfig(
        "anthropic",
        "ai-provider",
        "ANTHROPIC_API_KEY",
        ["ANTHROPIC_API_KEY"],
        undefined,
        anthropicParams,
      );
      expect(result.valid).toBe(false);
    });

    it("whitespace-only is treated as not set", () => {
      process.env.ANTHROPIC_API_KEY = "   ";
      const result = validatePluginConfig(
        "anthropic",
        "ai-provider",
        "ANTHROPIC_API_KEY",
        ["ANTHROPIC_API_KEY"],
        undefined,
        anthropicParams,
      );
      expect(result.valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-param plugins (e.g. Discord with token + app ID)
  // ---------------------------------------------------------------------------

  describe("multi-param plugins", () => {
    const discordParams: PluginParamInfo[] = [
      {
        key: "DISCORD_API_TOKEN",
        required: true,
        sensitive: true,
        type: "string",
        description: "Discord bot token",
      },
      {
        key: "DISCORD_APPLICATION_ID",
        required: true,
        sensitive: false,
        type: "string",
        description: "Discord app ID",
      },
      {
        key: "CHANNEL_IDS",
        required: false,
        sensitive: false,
        type: "string",
        description: "Channel IDs",
      },
    ];

    it("fails when both required params missing", () => {
      const result = validatePluginConfig(
        "discord",
        "connector",
        "DISCORD_API_TOKEN",
        ["DISCORD_API_TOKEN", "DISCORD_APPLICATION_ID"],
        undefined,
        discordParams,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
      expect(result.errors.some((e) => e.field === "DISCORD_API_TOKEN")).toBe(
        true,
      );
      expect(
        result.errors.some((e) => e.field === "DISCORD_APPLICATION_ID"),
      ).toBe(true);
    });

    it("fails when one required param missing", () => {
      process.env.DISCORD_API_TOKEN = "MTE1MDY2NjQwOTA3MTQzODg5MA.token";
      const result = validatePluginConfig(
        "discord",
        "connector",
        "DISCORD_API_TOKEN",
        ["DISCORD_API_TOKEN", "DISCORD_APPLICATION_ID"],
        undefined,
        discordParams,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].field).toBe("DISCORD_APPLICATION_ID");
    });

    it("passes when all required params set", () => {
      process.env.DISCORD_API_TOKEN = "MTE1MDY2NjQwOTA3MTQzODg5MA.token";
      process.env.DISCORD_APPLICATION_ID = "1150666409071438890";
      const result = validatePluginConfig(
        "discord",
        "connector",
        "DISCORD_API_TOKEN",
        ["DISCORD_API_TOKEN", "DISCORD_APPLICATION_ID"],
        undefined,
        discordParams,
      );
      expect(result.valid).toBe(true);
    });

    it("optional params do not affect validity", () => {
      process.env.DISCORD_API_TOKEN = "MTE1MDY2NjQwOTA3MTQzODg5MA.token";
      process.env.DISCORD_APPLICATION_ID = "1150666409071438890";
      // CHANNEL_IDS not set — should still be valid
      const result = validatePluginConfig(
        "discord",
        "connector",
        "DISCORD_API_TOKEN",
        ["DISCORD_API_TOKEN", "DISCORD_APPLICATION_ID", "CHANNEL_IDS"],
        undefined,
        discordParams,
      );
      expect(result.valid).toBe(true);
    });

    it("rejects undeclared keys even when all declared fields are valid", () => {
      const result = validatePluginConfig(
        "discord",
        "connector",
        "DISCORD_API_TOKEN",
        ["DISCORD_API_TOKEN", "DISCORD_APPLICATION_ID", "CHANNEL_IDS"],
        {
          DISCORD_API_TOKEN: "MTE1MDY2NjQwOTA3MTQzODg5MA.token",
          DISCORD_APPLICATION_ID: "1150666409071438890",
          UNDECLARED_KEY: "x",
        },
        discordParams,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "UNDECLARED_KEY",
        message: "UNDECLARED_KEY is not a declared config key for this plugin",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Config key allowlist
  // ---------------------------------------------------------------------------

  it("rejects undeclared config keys", () => {
    const result = validatePluginConfig(
      "anthropic",
      "ai-provider",
      "ANTHROPIC_API_KEY",
      ["ANTHROPIC_API_KEY", "ANTHROPIC_SMALL_MODEL"],
      {
        ANTHROPIC_API_KEY: "sk-ant-test-1234567890abcdef",
        UNDECLARED_KEY: "oops",
      },
      [
        {
          key: "ANTHROPIC_API_KEY",
          required: true,
          sensitive: true,
          type: "string",
          description: "API key",
        },
        {
          key: "ANTHROPIC_SMALL_MODEL",
          required: false,
          sensitive: false,
          type: "string",
          description: "Small model",
          default: "claude-3-5-haiku-20241022",
        },
      ],
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "UNDECLARED_KEY")).toBe(true);
  });

  it("reports exactly one error per undeclared config key", () => {
    const result = validatePluginConfig(
      "anthropic",
      "ai-provider",
      "ANTHROPIC_API_KEY",
      ["ANTHROPIC_API_KEY", "ANTHROPIC_SMALL_MODEL"],
      {
        ANTHROPIC_API_KEY: "sk-ant-test-1234567890abcdef",
        UNDECLARED_KEY: "oops",
      },
      [
        {
          key: "ANTHROPIC_API_KEY",
          required: true,
          sensitive: true,
          type: "string",
          description: "API key",
        },
        {
          key: "ANTHROPIC_SMALL_MODEL",
          required: false,
          sensitive: false,
          type: "string",
          description: "Small model",
          default: "claude-3-5-haiku-20241022",
        },
      ],
    );

    const undeclaredErrors = result.errors.filter(
      (error) => error.field === "UNDECLARED_KEY",
    );
    expect(undeclaredErrors).toHaveLength(1);
  });

  it("rejects differently-cased config keys to avoid silent no-op updates", () => {
    const result = validatePluginConfig(
      "anthropic",
      "ai-provider",
      "ANTHROPIC_API_KEY",
      ["ANTHROPIC_API_KEY", "ANTHROPIC_SMALL_MODEL"],
      {
        ANTHROPIC_API_KEY: "sk-ant-test-1234567890abcdef",
        anthropic_small_model: "claude-3-5-sonnet-20241022",
      },
      [
        {
          key: "ANTHROPIC_API_KEY",
          required: true,
          sensitive: true,
          type: "string",
          description: "API key",
        },
        {
          key: "ANTHROPIC_SMALL_MODEL",
          required: false,
          sensitive: false,
          type: "string",
          description: "Small model",
          default: "claude-3-5-haiku-20241022",
        },
      ],
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "anthropic_small_model",
      message:
        "anthropic_small_model does not match declared config key casing; use ANTHROPIC_SMALL_MODEL",
    });
  });

  // ---------------------------------------------------------------------------
  // API key format validation
  // ---------------------------------------------------------------------------

  describe("API key format checks", () => {
    const params: PluginParamInfo[] = [
      {
        key: "ANTHROPIC_API_KEY",
        required: true,
        sensitive: true,
        type: "string",
        description: "API key",
      },
    ];

    it("warns on wrong prefix for Anthropic", () => {
      process.env.ANTHROPIC_API_KEY = "wrong-prefix-1234567890abcdef";
      const result = validatePluginConfig(
        "anthropic",
        "ai-provider",
        "ANTHROPIC_API_KEY",
        ["ANTHROPIC_API_KEY"],
        undefined,
        params,
      );
      expect(result.valid).toBe(true); // warning, not error
      expect(result.warnings.some((w) => w.message.includes("sk-ant-"))).toBe(
        true,
      );
    });

    it("no warning when prefix is correct", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-abcdefg1234567890";
      const result = validatePluginConfig(
        "anthropic",
        "ai-provider",
        "ANTHROPIC_API_KEY",
        ["ANTHROPIC_API_KEY"],
        undefined,
        params,
      );
      expect(
        result.warnings.filter((w) => w.field === "ANTHROPIC_API_KEY"),
      ).toEqual([]);
    });

    it("warns on short sensitive key", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-x";
      const result = validatePluginConfig(
        "anthropic",
        "ai-provider",
        "ANTHROPIC_API_KEY",
        ["ANTHROPIC_API_KEY"],
        undefined,
        params,
      );
      expect(result.warnings.some((w) => w.message.includes("short"))).toBe(
        true,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Fallback (no param defs)
  // ---------------------------------------------------------------------------

  describe("fallback without param definitions", () => {
    it("checks envKey when no paramDefs provided", () => {
      const result = validatePluginConfig(
        "some-feature",
        "feature",
        "SOME_API_KEY",
        ["SOME_API_KEY"],
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "SOME_API_KEY")).toBe(true);
    });

    it("passes when envKey is set and no paramDefs", () => {
      process.env.SOME_API_KEY = "test-value-1234567890";
      const result = validatePluginConfig(
        "some-feature",
        "feature",
        "SOME_API_KEY",
        ["SOME_API_KEY"],
      );
      expect(result.valid).toBe(true);
    });

    it("no envKey and no paramDefs = valid", () => {
      const result = validatePluginConfig("sql", "database", null, []);
      expect(result.valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Result shape
  // ---------------------------------------------------------------------------

  describe("result shape", () => {
    it("returns { valid, errors, warnings } structure", () => {
      const result = validatePluginConfig("test", "feature", null, []);
      expect(typeof result.valid).toBe("boolean");
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it("errors have field and message", () => {
      const params: PluginParamInfo[] = [
        {
          key: "MISSING_KEY",
          required: true,
          sensitive: false,
          type: "string",
          description: "Required",
        },
      ];
      const result = validatePluginConfig(
        "test",
        "feature",
        null,
        ["MISSING_KEY"],
        undefined,
        params,
      );
      expect(result.errors[0]).toHaveProperty("field");
      expect(result.errors[0]).toHaveProperty("message");
    });
  });
});
