import fs from "node:fs";
import os from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => {
  const existsSync = vi.fn();
  const readFileSync = vi.fn();
  return {
    default: { existsSync, readFileSync },
    existsSync,
    readFileSync,
  };
});

vi.mock("node:os", () => {
  const homedir = vi.fn(() => "/Users/test");
  return {
    default: { homedir },
    homedir,
  };
});

vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return {
    default: actual,
    ...actual,
  };
});

import { scanProviderCredentials } from "../credentials";

type SpawnResult = {
  exited: Promise<number>;
  exitCode: number;
  stdout: string;
  stderr: string;
};

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockHomedir = vi.mocked(os.homedir);

const ORIGINAL_PLATFORM = process.platform;

function makeSpawnResult(exitCode: number, stdout = ""): SpawnResult {
  return {
    exited: Promise.resolve(exitCode),
    exitCode,
    stdout,
    stderr: "",
  };
}

describe("scanProviderCredentials", () => {
  let files: Record<string, string>;
  let installedClis: Set<string>;
  let keychainResult: { exitCode: number; stdout: string } | null;
  let mockSpawn: ReturnType<typeof vi.fn>;

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
  }

  beforeEach(() => {
    files = {};
    installedClis = new Set();
    keychainResult = null;

    mockExistsSync.mockImplementation((filePath) => String(filePath) in files);
    mockReadFileSync.mockImplementation(
      (filePath) => files[String(filePath)] ?? "",
    );
    mockHomedir.mockReturnValue("/Users/test");

    mockSpawn = vi.fn((cmd: string[]) => {
      if (cmd[0] === "which") {
        return makeSpawnResult(installedClis.has(cmd[1] ?? "") ? 0 : 1);
      }

      if (cmd[0] === "security") {
        if (!keychainResult) {
          throw new Error("unexpected security invocation");
        }
        return makeSpawnResult(keychainResult.exitCode, keychainResult.stdout);
      }

      throw new Error(`unexpected spawn command: ${cmd.join(" ")}`);
    });

    vi.stubGlobal("Bun", { spawn: mockSpawn });
    setPlatform(ORIGINAL_PLATFORM);
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns openai from codex auth and preserves auth mode", async () => {
    setPlatform("linux");
    files["/Users/test/.codex/auth.json"] = JSON.stringify({
      OPENAI_API_KEY: "sk-openai",
      auth_mode: "chatgpt",
    });
    installedClis.add("codex");

    const providers = await scanProviderCredentials();

    expect(providers).toEqual([
      {
        id: "openai",
        source: "codex-auth",
        apiKey: "sk-openai",
        authMode: "chatgpt",
        cliInstalled: true,
      },
    ]);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn).toHaveBeenCalledWith(
      ["which", "codex"],
      expect.objectContaining({ stdout: "pipe", stderr: "ignore" }),
    );
  });

  it("returns anthropic from claude credentials file with oauth mode", async () => {
    setPlatform("linux");
    files["/Users/test/.claude/.credentials.json"] = JSON.stringify({
      claudeAiOauth: { accessToken: "claude-oauth-token" },
    });
    installedClis.add("claude");

    const providers = await scanProviderCredentials();

    expect(providers).toEqual([
      {
        id: "anthropic-subscription",
        source: "claude-credentials",
        apiKey: "claude-oauth-token",
        authMode: "oauth",
        cliInstalled: true,
      },
    ]);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn).toHaveBeenCalledWith(
      ["which", "claude"],
      expect.objectContaining({ stdout: "pipe", stderr: "ignore" }),
    );
  });

  it("prefers file credentials over keychain and env values", async () => {
    setPlatform("darwin");
    files["/Users/test/.codex/auth.json"] = JSON.stringify({
      OPENAI_API_KEY: "file-openai",
    });
    files["/Users/test/.claude/.credentials.json"] = JSON.stringify({
      claudeAiOauth: { accessToken: "file-anthropic" },
    });
    installedClis.add("codex");
    installedClis.add("claude");
    keychainResult = {
      exitCode: 0,
      stdout: JSON.stringify({ accessToken: "keychain-token" }),
    };
    vi.stubEnv("OPENAI_API_KEY", "env-openai");
    vi.stubEnv("ANTHROPIC_API_KEY", "env-anthropic");

    const providers = await scanProviderCredentials();

    expect(providers).toEqual([
      {
        id: "openai",
        source: "codex-auth",
        apiKey: "file-openai",
        authMode: "api-key",
        cliInstalled: true,
      },
      {
        id: "anthropic-subscription",
        source: "claude-credentials",
        apiKey: "file-anthropic",
        authMode: "oauth",
        cliInstalled: true,
      },
      {
        id: "anthropic",
        source: "env",
        apiKey: "env-anthropic",
        authMode: "api-key",
        cliInstalled: false,
      },
    ]);
    expect(
      mockSpawn.mock.calls.some(
        ([cmd]) => Array.isArray(cmd) && cmd[0] === "security",
      ),
    ).toBe(false);
  });

  it("falls back to anthropic keychain json and fills openai from env gaps", async () => {
    setPlatform("darwin");
    keychainResult = {
      exitCode: 0,
      stdout: JSON.stringify({ accessToken: "keychain-oauth-token" }),
    };
    installedClis.add("claude");
    vi.stubEnv("OPENAI_API_KEY", "  env-openai  ");

    const providers = await scanProviderCredentials();

    expect(providers).toEqual([
      {
        id: "anthropic-subscription",
        source: "keychain",
        apiKey: "keychain-oauth-token",
        authMode: "oauth",
        cliInstalled: true,
      },
      {
        id: "openai",
        source: "env",
        apiKey: "env-openai",
        authMode: "api-key",
        cliInstalled: false,
      },
    ]);
    expect(mockSpawn).toHaveBeenCalledWith(
      [
        "security",
        "find-generic-password",
        "-s",
        "Claude Code-credentials",
        "-w",
      ],
      expect.objectContaining({ stdout: "pipe", stderr: "pipe" }),
    );
  });

  it("uses the raw keychain string when the stored value is not json", async () => {
    setPlatform("darwin");
    keychainResult = {
      exitCode: 0,
      stdout: "raw-keychain-token\n",
    };

    const providers = await scanProviderCredentials();

    expect(providers).toEqual([
      {
        id: "anthropic-subscription",
        source: "keychain",
        apiKey: "raw-keychain-token",
        authMode: "oauth",
        cliInstalled: false,
      },
    ]);
  });

  it("extracts nested oauth tokens from keychain json", async () => {
    setPlatform("darwin");
    keychainResult = {
      exitCode: 0,
      stdout: JSON.stringify({
        oauth: {
          credentials: {
            access_token: "nested-keychain-token",
          },
        },
      }),
    };
    installedClis.add("claude");

    const providers = await scanProviderCredentials();

    expect(providers).toEqual([
      {
        id: "anthropic-subscription",
        source: "keychain",
        apiKey: "nested-keychain-token",
        authMode: "oauth",
        cliInstalled: true,
      },
    ]);
  });

  it("ignores parsed keychain json that does not contain an oauth token", async () => {
    setPlatform("darwin");
    keychainResult = {
      exitCode: 0,
      stdout: JSON.stringify({
        oauth: {
          refreshToken: "refresh-only",
        },
      }),
    };

    await expect(scanProviderCredentials()).resolves.toEqual([]);
  });

  it("skips keychain on non-darwin and trims env credentials", async () => {
    setPlatform("linux");
    keychainResult = {
      exitCode: 0,
      stdout: JSON.stringify({ accessToken: "ignored" }),
    };
    vi.stubEnv("OPENAI_API_KEY", "  env-openai  ");
    vi.stubEnv("ANTHROPIC_API_KEY", "  env-anthropic  ");

    const providers = await scanProviderCredentials();

    expect(providers).toEqual([
      {
        id: "openai",
        source: "env",
        apiKey: "env-openai",
        authMode: "api-key",
        cliInstalled: false,
      },
      {
        id: "anthropic",
        source: "env",
        apiKey: "env-anthropic",
        authMode: "api-key",
        cliInstalled: false,
      },
    ]);
    expect(
      mockSpawn.mock.calls.some(
        ([cmd]) => Array.isArray(cmd) && cmd[0] === "security",
      ),
    ).toBe(false);
  });

  it("swallows malformed json and returns an empty result when no fallbacks exist", async () => {
    setPlatform("linux");
    files["/Users/test/.codex/auth.json"] = "{bad-json";
    files["/Users/test/.claude/.credentials.json"] = "{bad-json";

    await expect(scanProviderCredentials()).resolves.toEqual([]);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
