import { describe, expect, it } from "bun:test";
import {
  DEFAULT_ALLOWED_COMMANDS,
  isCommandAllowed,
  loadRepoPromptConfig,
  normalizeCommandName,
} from "../config.ts";

describe("plugin-repoprompt config", () => {
  it("uses defaults when config is empty", () => {
    const config = loadRepoPromptConfig({});

    expect(config.cliPath).toBe("rp-cli");
    expect(config.timeoutMs).toBe(45_000);
    expect(config.maxOutputChars).toBe(20_000);
    expect(config.allowedCommands).toEqual([...DEFAULT_ALLOWED_COMMANDS]);
  });

  it("parses and normalizes allowlist values", () => {
    const config = loadRepoPromptConfig({
      REPOPROMPT_ALLOWED_COMMANDS: "  Context_Builder, READ_FILE ,read_file ",
    });

    expect(config.allowedCommands).toEqual(["context_builder", "read_file"]);
  });

  it("falls back to safe defaults when allowlist is empty", () => {
    const config = loadRepoPromptConfig({
      REPOPROMPT_ALLOWED_COMMANDS: "   ",
    });

    expect(config.allowedCommands).toEqual([...DEFAULT_ALLOWED_COMMANDS]);
  });

  it("rejects out-of-range timeout values", () => {
    expect(() =>
      loadRepoPromptConfig({
        REPOPROMPT_TIMEOUT_MS: "100",
      }),
    ).toThrow();
  });

  it("rejects non-repoprompt cli paths", () => {
    expect(() =>
      loadRepoPromptConfig({
        REPOPROMPT_CLI_PATH: "/bin/sh",
      }),
    ).toThrow("REPOPROMPT_CLI_PATH");
  });
});

describe("allowlist helpers", () => {
  it("normalizes command names", () => {
    expect(normalizeCommandName(" --READ_FILE ")).toBe("read_file");
  });

  it("supports wildcard allowlist", () => {
    expect(isCommandAllowed("context_builder", ["*"])).toBe(true);
  });

  it("checks normalized command names against allowlist", () => {
    expect(isCommandAllowed("READ_FILE", ["read_file"])).toBe(true);
    expect(isCommandAllowed("apply_edits", ["read_file"])).toBe(false);
  });
});
