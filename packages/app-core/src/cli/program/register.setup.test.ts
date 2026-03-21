import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasModelKey,
  loadConfig,
  resolveConfigPath,
  runProviderWizard,
  saveConfig,
} from "./register.setup";

describe("register.setup helpers", () => {
  const tempDirs: string[] = [];
  const toPosix = (value: string) => value.replaceAll("\\", "/");

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  const createTempDir = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "eliza-setup-"));
    tempDirs.push(dir);
    return dir;
  };

  it("prefers ELIZA_CONFIG_PATH when resolving the config file", () => {
    expect(
      resolveConfigPath({
        ELIZA_CONFIG_PATH: "/tmp/custom/eliza.json",
        ELIZA_STATE_DIR: "/tmp/ignored-state",
      }),
    ).toBe("/tmp/custom/eliza.json");
  });

  it("uses ELIZA_STATE_DIR without adding a second .eliza segment", () => {
    expect(
      toPosix(resolveConfigPath({ ELIZA_STATE_DIR: "/tmp/profile/.eliza" })),
    ).toBe("/tmp/profile/.eliza/eliza.json");
  });

  it("returns an empty object when the config is missing or invalid", () => {
    const dir = createTempDir();
    const missingPath = path.join(dir, "missing.json");
    const invalidPath = path.join(dir, "invalid.json");
    writeFileSync(invalidPath, "{ invalid json", "utf-8");

    expect(loadConfig(missingPath)).toEqual({});
    expect(loadConfig(invalidPath)).toEqual({});
  });

  it("creates parent directories and writes JSON with a trailing newline", () => {
    const dir = createTempDir();
    const configPath = path.join(dir, "nested", "eliza.json");

    saveConfig(configPath, { env: { OPENAI_API_KEY: "sk-test" } });

    expect(loadConfig(configPath)).toEqual({
      env: { OPENAI_API_KEY: "sk-test" },
    });
    expect(readFileSync(configPath, "utf-8").endsWith("\n")).toBe(true);
  });

  it("returns the first configured model key and ignores blank values", () => {
    expect(
      hasModelKey({
        OPENAI_API_KEY: "   ",
        GROQ_API_KEY: "gsk-test",
        OLLAMA_BASE_URL: "http://localhost:11434",
      }),
    ).toBe("GROQ_API_KEY");
  });

  it("writes the selected secret provider key into the config env block", async () => {
    const dir = createTempDir();
    const configPath = path.join(dir, "eliza.json");
    const ask = vi.fn<(_: string) => Promise<string>>().mockResolvedValue("1");
    const askSecret = vi
      .fn<(_: string) => Promise<string>>()
      .mockResolvedValue("sk-ant-test");
    const log = vi.fn();

    await runProviderWizard(configPath, { ask, askSecret, env: {}, log });

    expect(loadConfig(configPath)).toEqual({
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
    });
    expect(askSecret).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Saved"));
  });

  it("keeps the existing config when the user declines reconfiguration", async () => {
    const dir = createTempDir();
    const configPath = path.join(dir, "eliza.json");
    saveConfig(configPath, { env: { OPENAI_API_KEY: "sk-existing" } });
    const ask = vi.fn<(_: string) => Promise<string>>().mockResolvedValue("n");
    const askSecret = vi.fn<(_: string) => Promise<string>>();

    await runProviderWizard(configPath, {
      ask,
      askSecret,
      env: {},
      log: vi.fn(),
    });

    expect(loadConfig(configPath)).toEqual({
      env: { OPENAI_API_KEY: "sk-existing" },
    });
    expect(ask).toHaveBeenCalledOnce();
    expect(askSecret).not.toHaveBeenCalled();
  });

  it("defaults Ollama to localhost when the URL prompt is left blank", async () => {
    const dir = createTempDir();
    const configPath = path.join(dir, "eliza.json");
    const ask = vi
      .fn<(_: string) => Promise<string>>()
      .mockResolvedValueOnce("8")
      .mockResolvedValueOnce("");

    await runProviderWizard(configPath, {
      ask,
      askSecret: vi.fn(),
      env: {},
      log: vi.fn(),
    });

    expect(loadConfig(configPath)).toEqual({
      env: { OLLAMA_BASE_URL: "http://localhost:11434" },
    });
  });
});
