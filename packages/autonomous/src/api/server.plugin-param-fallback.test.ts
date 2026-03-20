/**
 * Unit tests for buildParamDefs savedValues fallback — GitHub Issue #142
 *
 * Verifies that buildParamDefs checks saved milady.json config values
 * when process.env does not contain the parameter, fixing the false
 * "NEEDS SETUP" badge on connector plugins.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildParamDefs } from "./server";

const SAMPLE_PARAMS: Record<string, Record<string, unknown>> = {
  TELEGRAM_BOT_TOKEN: {
    type: "string",
    required: true,
    sensitive: true,
    description: "Telegram bot token from @BotFather",
  },
  TELEGRAM_CHAT_ID: {
    type: "string",
    required: false,
    sensitive: false,
    description: "Default chat ID",
  },
};

describe("buildParamDefs savedValues fallback", () => {
  const ENV_KEYS = Object.keys(SAMPLE_PARAMS);
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (envBackup[key] === undefined) delete process.env[key];
      else process.env[key] = envBackup[key];
    }
  });

  it("marks params as unset when no env and no savedValues", () => {
    const result = buildParamDefs(SAMPLE_PARAMS);
    for (const param of result) {
      expect(param.isSet).toBe(false);
      expect(param.currentValue).toBeNull();
    }
  });

  it("falls back to savedValues when process.env is empty", () => {
    const saved = { TELEGRAM_BOT_TOKEN: "1234567890:ABCdefGhIjKlMnOpQrStUvWxYz" };
    const result = buildParamDefs(SAMPLE_PARAMS, saved);
    const tokenParam = result.find((p) => p.key === "TELEGRAM_BOT_TOKEN")!;
    expect(tokenParam.isSet).toBe(true);
    // Sensitive values should be masked
    expect(tokenParam.currentValue).toContain("...");
    expect(tokenParam.currentValue).not.toBe(saved.TELEGRAM_BOT_TOKEN);
  });

  it("falls back to savedValues for non-sensitive params", () => {
    const saved = { TELEGRAM_CHAT_ID: "123456789" };
    const result = buildParamDefs(SAMPLE_PARAMS, saved);
    const chatParam = result.find((p) => p.key === "TELEGRAM_CHAT_ID")!;
    expect(chatParam.isSet).toBe(true);
    // Non-sensitive values should be shown in full
    expect(chatParam.currentValue).toBe("123456789");
  });

  it("prefers process.env over savedValues", () => {
    process.env.TELEGRAM_BOT_TOKEN = "env-token-value";
    const saved = { TELEGRAM_BOT_TOKEN: "saved-token-value" };
    const result = buildParamDefs(SAMPLE_PARAMS, saved);
    const tokenParam = result.find((p) => p.key === "TELEGRAM_BOT_TOKEN")!;
    expect(tokenParam.isSet).toBe(true);
    // Should mask the env value, not the saved one
    expect(tokenParam.currentValue).toContain("...");
  });

  it("handles undefined savedValues gracefully", () => {
    const result = buildParamDefs(SAMPLE_PARAMS, undefined);
    expect(result).toHaveLength(2);
    expect(result.every((p) => !p.isSet)).toBe(true);
  });

  it("ignores empty/whitespace savedValues", () => {
    const saved = { TELEGRAM_BOT_TOKEN: "   " };
    const result = buildParamDefs(SAMPLE_PARAMS, saved);
    const tokenParam = result.find((p) => p.key === "TELEGRAM_BOT_TOKEN")!;
    expect(tokenParam.isSet).toBe(false);
    expect(tokenParam.currentValue).toBeNull();
  });
});
