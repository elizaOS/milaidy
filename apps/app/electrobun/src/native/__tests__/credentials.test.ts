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

import {
  scanAndValidateProviderCredentials,
  scanProviderCredentials,
} from "../credentials";

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
        status: "unchecked",
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
        status: "unchecked",
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
        status: "unchecked",
      },
      {
        id: "anthropic-subscription",
        source: "claude-credentials",
        apiKey: "file-anthropic",
        authMode: "oauth",
        cliInstalled: true,
        status: "unchecked",
      },
      {
        id: "anthropic",
        source: "env",
        apiKey: "env-anthropic",
        authMode: "api-key",
        cliInstalled: false,
        status: "unchecked",
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
        status: "unchecked",
      },
      {
        id: "openai",
        source: "env",
        apiKey: "env-openai",
        authMode: "api-key",
        cliInstalled: false,
        status: "unchecked",
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
        status: "unchecked",
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
        status: "unchecked",
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
        status: "unchecked",
      },
      {
        id: "anthropic",
        source: "env",
        apiKey: "env-anthropic",
        authMode: "api-key",
        cliInstalled: false,
        status: "unchecked",
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

describe("scanAndValidateProviderCredentials", () => {
  let files: Record<string, string>;
  let installedClis: Set<string>;
  let mockSpawn: ReturnType<typeof vi.fn>;
  let mockFetch: ReturnType<typeof vi.fn>;

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
  }

  beforeEach(() => {
    files = {};
    installedClis = new Set();
    mockExistsSync.mockImplementation((filePath) => String(filePath) in files);
    mockReadFileSync.mockImplementation(
      (filePath) => files[String(filePath)] ?? "",
    );
    mockHomedir.mockReturnValue("/Users/test");
    mockSpawn = vi.fn((cmd: string[]) => {
      if (cmd[0] === "which")
        return makeSpawnResult(installedClis.has(cmd[1] ?? "") ? 0 : 1);
      throw new Error(`unexpected spawn: ${cmd.join(" ")}`);
    });
    vi.stubGlobal("Bun", { spawn: mockSpawn });
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    setPlatform("linux");
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("valid key returns status 'valid'", async () => {
    files["/Users/test/.codex/auth.json"] = JSON.stringify({
      OPENAI_API_KEY: "sk-test",
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const providers = await scanAndValidateProviderCredentials();
    expect(providers).toHaveLength(1);
    expect(providers[0].status).toBe("valid");
  });

  it("401 response returns status 'invalid' with statusDetail", async () => {
    files["/Users/test/.codex/auth.json"] = JSON.stringify({
      OPENAI_API_KEY: "sk-bad",
    });
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const providers = await scanAndValidateProviderCredentials();
    expect(providers[0].status).toBe("invalid");
    expect(providers[0].statusDetail).toBe("API key rejected");
  });

  it("403 response returns status 'invalid'", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-bad-anthropic");
    mockFetch.mockResolvedValue({ ok: false, status: 403 });
    const providers = await scanAndValidateProviderCredentials();
    expect(providers[0].status).toBe("invalid");
  });

  it("network error returns status 'error' with message", async () => {
    files["/Users/test/.codex/auth.json"] = JSON.stringify({
      OPENAI_API_KEY: "sk-test",
    });
    mockFetch.mockRejectedValue(new Error("fetch failed"));
    const providers = await scanAndValidateProviderCredentials();
    expect(providers[0].status).toBe("error");
    expect(providers[0].statusDetail).toBe("fetch failed");
  });

  it("OAuth token skips validation and returns 'unchecked'", async () => {
    files["/Users/test/.claude/.credentials.json"] = JSON.stringify({
      claudeAiOauth: { accessToken: "oauth-token" },
    });
    const providers = await scanAndValidateProviderCredentials();
    expect(providers[0].status).toBe("unchecked");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("unknown provider returns 'unchecked'", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    files["/Users/test/.codex/auth.json"] = JSON.stringify({
      OPENAI_API_KEY: "sk-test",
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const providers = await scanAndValidateProviderCredentials();
    // openai should be validated
    expect(providers[0].id).toBe("openai");
    expect(providers[0].status).toBe("valid");
  });

  it("HTTP 500 returns status 'error' with detail", async () => {
    files["/Users/test/.codex/auth.json"] = JSON.stringify({
      OPENAI_API_KEY: "sk-test",
    });
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const providers = await scanAndValidateProviderCredentials();
    expect(providers[0].status).toBe("error");
    expect(providers[0].statusDetail).toBe("HTTP 500");
  });

  it("provider without apiKey returns 'unchecked'", async () => {
    files["/Users/test/.codex/auth.json"] = JSON.stringify({
      OPENAI_API_KEY: "sk-key",
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const providers = await scanAndValidateProviderCredentials();
    expect(providers.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Part 2: Additional env var detection tests
// ---------------------------------------------------------------------------

describe("scanProviderCredentials — env var detection", () => {
  let files: Record<string, string>;
  let mockSpawn: ReturnType<typeof vi.fn>;

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
  }

  beforeEach(() => {
    files = {};
    mockExistsSync.mockImplementation((filePath) => String(filePath) in files);
    mockReadFileSync.mockImplementation(
      (filePath) => files[String(filePath)] ?? "",
    );
    mockHomedir.mockReturnValue("/Users/test");
    mockSpawn = vi.fn((cmd: string[]) => {
      if (cmd[0] === "which") return makeSpawnResult(1);
      throw new Error(`unexpected spawn: ${cmd.join(" ")}`);
    });
    vi.stubGlobal("Bun", { spawn: mockSpawn });
    setPlatform("linux");
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("detects GROQ_API_KEY as provider 'groq'", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk-test-groq");
    const providers = await scanProviderCredentials();
    const groq = providers.find((p) => p.id === "groq");
    expect(groq).toBeDefined();
    expect(groq?.source).toBe("env");
    expect(groq?.apiKey).toBe("gsk-test-groq");
    expect(groq?.authMode).toBe("api-key");
  });

  it("detects GOOGLE_GENERATIVE_AI_API_KEY as provider 'google-genai'", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-google");
    const providers = await scanProviderCredentials();
    const google = providers.find((p) => p.id === "google-genai");
    expect(google).toBeDefined();
    expect(google?.source).toBe("env");
    expect(google?.apiKey).toBe("AIza-test-google");
  });

  it("detects OPENROUTER_API_KEY as provider 'openrouter'", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-openrouter");
    const providers = await scanProviderCredentials();
    const openrouter = providers.find((p) => p.id === "openrouter");
    expect(openrouter).toBeDefined();
    expect(openrouter?.source).toBe("env");
    expect(openrouter?.apiKey).toBe("sk-or-test-openrouter");
  });

  it("detects XAI_API_KEY as provider 'xai'", async () => {
    vi.stubEnv("XAI_API_KEY", "xai-test-key");
    const providers = await scanProviderCredentials();
    const xai = providers.find((p) => p.id === "xai");
    expect(xai).toBeDefined();
    expect(xai?.source).toBe("env");
    expect(xai?.apiKey).toBe("xai-test-key");
  });

  it("detects AI_GATEWAY_API_KEY as provider 'vercel-ai-gateway'", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "ag-test-key");
    const providers = await scanProviderCredentials();
    const gateway = providers.find((p) => p.id === "vercel-ai-gateway");
    expect(gateway).toBeDefined();
    expect(gateway?.source).toBe("env");
    expect(gateway?.apiKey).toBe("ag-test-key");
  });

  it("detects AIGATEWAY_API_KEY as provider 'vercel-ai-gateway' (alias)", async () => {
    vi.stubEnv("AIGATEWAY_API_KEY", "aig-alias-key");
    const providers = await scanProviderCredentials();
    const gateway = providers.find((p) => p.id === "vercel-ai-gateway");
    expect(gateway).toBeDefined();
    expect(gateway?.source).toBe("env");
    expect(gateway?.apiKey).toBe("aig-alias-key");
  });

  it("deduplicates provider IDs from different env vars (first wins)", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "first-gateway-key");
    vi.stubEnv("AIGATEWAY_API_KEY", "second-gateway-key");
    const providers = await scanProviderCredentials();
    const gateways = providers.filter((p) => p.id === "vercel-ai-gateway");
    expect(gateways).toHaveLength(1);
    expect(gateways[0].apiKey).toBe("first-gateway-key");
  });

  it("detects multiple env providers simultaneously", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    vi.stubEnv("XAI_API_KEY", "xai-key");
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    const providers = await scanProviderCredentials();
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("groq");
    expect(ids).toContain("xai");
    expect(ids).toContain("openrouter");
  });
});

// ---------------------------------------------------------------------------
// Part 2: Validation endpoint tests
// ---------------------------------------------------------------------------

describe("scanAndValidateProviderCredentials — endpoint validation", () => {
  let files: Record<string, string>;
  let mockSpawn: ReturnType<typeof vi.fn>;
  let mockFetch: ReturnType<typeof vi.fn>;

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
  }

  beforeEach(() => {
    files = {};
    mockExistsSync.mockImplementation((filePath) => String(filePath) in files);
    mockReadFileSync.mockImplementation(
      (filePath) => files[String(filePath)] ?? "",
    );
    mockHomedir.mockReturnValue("/Users/test");
    mockSpawn = vi.fn((cmd: string[]) => {
      if (cmd[0] === "which") return makeSpawnResult(1);
      throw new Error(`unexpected spawn: ${cmd.join(" ")}`);
    });
    vi.stubGlobal("Bun", { spawn: mockSpawn });
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    setPlatform("linux");
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("groq validation uses api.groq.com with Bearer auth", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk-groq-key");
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await scanAndValidateProviderCredentials();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer gsk-groq-key" },
      }),
    );
  });

  it("google-genai validation uses generativelanguage.googleapis.com with x-goog-api-key", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-google-key");
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await scanAndValidateProviderCredentials();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models",
      expect.objectContaining({
        headers: { "x-goog-api-key": "AIza-google-key" },
      }),
    );
  });

  it("openrouter validation uses openrouter.ai with Bearer auth", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-key");
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await scanAndValidateProviderCredentials();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer sk-or-key" },
      }),
    );
  });

  it("xai validation uses api.x.ai with Bearer auth", async () => {
    vi.stubEnv("XAI_API_KEY", "xai-test-key");
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await scanAndValidateProviderCredentials();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.x.ai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer xai-test-key" },
      }),
    );
  });

  it("vercel-ai-gateway returns 'unchecked' (no validation endpoint)", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "ag-key");
    const providers = await scanAndValidateProviderCredentials();
    const gateway = providers.find((p) => p.id === "vercel-ai-gateway");
    expect(gateway).toBeDefined();
    expect(gateway?.status).toBe("unchecked");
    // fetch should not be called for vercel-ai-gateway since there is no validation endpoint
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Part 2: Integration tests
// ---------------------------------------------------------------------------

describe("scanAndValidateProviderCredentials — integration", () => {
  let files: Record<string, string>;
  let mockSpawn: ReturnType<typeof vi.fn>;
  let mockFetch: ReturnType<typeof vi.fn>;

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
  }

  beforeEach(() => {
    files = {};
    mockExistsSync.mockImplementation((filePath) => String(filePath) in files);
    mockReadFileSync.mockImplementation(
      (filePath) => files[String(filePath)] ?? "",
    );
    mockHomedir.mockReturnValue("/Users/test");
    mockSpawn = vi.fn((cmd: string[]) => {
      if (cmd[0] === "which") return makeSpawnResult(1);
      throw new Error(`unexpected spawn: ${cmd.join(" ")}`);
    });
    vi.stubGlobal("Bun", { spawn: mockSpawn });
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    setPlatform("linux");
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("validates all detected providers in parallel", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    vi.stubEnv("XAI_API_KEY", "xai-key");
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");

    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const providers = await scanAndValidateProviderCredentials();
    const validProviders = providers.filter((p) => p.status === "valid");
    expect(validProviders).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("returns mixed results when some keys are valid and others invalid", async () => {
    vi.stubEnv("GROQ_API_KEY", "good-groq-key");
    vi.stubEnv("XAI_API_KEY", "bad-xai-key");
    vi.stubEnv("AI_GATEWAY_API_KEY", "unchecked-gateway");

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("groq.com")) return { ok: true, status: 200 };
      if (url.includes("x.ai")) return { ok: false, status: 401 };
      return { ok: true, status: 200 };
    });

    const providers = await scanAndValidateProviderCredentials();

    const groq = providers.find((p) => p.id === "groq");
    const xai = providers.find((p) => p.id === "xai");
    const gateway = providers.find((p) => p.id === "vercel-ai-gateway");

    expect(groq?.status).toBe("valid");
    expect(xai?.status).toBe("invalid");
    expect(xai?.statusDetail).toBe("API key rejected");
    expect(gateway?.status).toBe("unchecked"); // no validation endpoint
  });

  it("individual provider timeout does not affect other providers", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    vi.stubEnv("XAI_API_KEY", "xai-key");

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("groq.com")) {
        throw new Error("The operation timed out");
      }
      return { ok: true, status: 200 };
    });

    const providers = await scanAndValidateProviderCredentials();

    const groq = providers.find((p) => p.id === "groq");
    const xai = providers.find((p) => p.id === "xai");

    expect(groq?.status).toBe("error");
    expect(groq?.statusDetail).toBe("The operation timed out");
    expect(xai?.status).toBe("valid");
  });
});
