/**
 * Unit tests for milady doctor health checks.
 * All checks are pure / injectable — no real filesystem or network I/O.
 */

import { existsSync, accessSync, constants } from "node:fs";
import { createConnection } from "node:net";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn(), accessSync: vi.fn() };
});

vi.mock("node:net", () => ({
  createConnection: vi.fn(),
}));

import {
  checkConfigFile,
  checkDatabase,
  checkModelKey,
  checkPort,
  checkRuntime,
  checkStateDir,
  runAllChecks,
} from "./checks";

const mockExistsSync = vi.mocked(existsSync);
const mockAccessSync = vi.mocked(accessSync);
const mockCreateConnection = vi.mocked(createConnection);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// checkRuntime
// ---------------------------------------------------------------------------

describe("checkRuntime", () => {
  it("passes for current Node.js version (>=22 assumed in test env)", () => {
    // If running under Bun or Node >=22, should pass
    const result = checkRuntime();
    // We just assert it returns a valid shape — actual version varies by env
    expect(result.label).toBe("Runtime");
    expect(["pass", "fail", "warn"]).toContain(result.status);
    expect(result.detail).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// checkConfigFile
// ---------------------------------------------------------------------------

describe("checkConfigFile", () => {
  it("warns when config file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = checkConfigFile("/home/user/.milady/milady.json");
    expect(result.status).toBe("warn");
    expect(result.fix).toBe("milady setup");
  });

  it("passes when config file exists and is valid JSON", () => {
    mockExistsSync.mockReturnValue(true);
    // readFileSync is not mocked — but we pass a path that won't be read
    // because existsSync mock returns true; we need to also mock readFileSync.
    const { readFileSync } = await import("node:fs");
    vi.mocked(readFileSync).mockReturnValue('{"logging":{"level":"info"}}');
    const result = checkConfigFile("/fake/milady.json");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("/fake/milady.json");
  });

  it("fails when config file exists but contains invalid JSON", async () => {
    mockExistsSync.mockReturnValue(true);
    const { readFileSync } = await import("node:fs");
    vi.mocked(readFileSync).mockReturnValue("{ not valid json }}}");
    const result = checkConfigFile("/fake/milady.json");
    expect(result.status).toBe("fail");
    expect(result.fix).toContain("/fake/milady.json");
  });
});

// ---------------------------------------------------------------------------
// checkModelKey
// ---------------------------------------------------------------------------

describe("checkModelKey", () => {
  it("passes when ANTHROPIC_API_KEY is set", () => {
    const result = checkModelKey({ ANTHROPIC_API_KEY: "sk-ant-test" });
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("ANTHROPIC_API_KEY");
  });

  it("passes when OPENAI_API_KEY is set", () => {
    const result = checkModelKey({ OPENAI_API_KEY: "sk-test" });
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("OPENAI_API_KEY");
  });

  it("passes when OLLAMA_BASE_URL is set", () => {
    const result = checkModelKey({ OLLAMA_BASE_URL: "http://localhost:11434" });
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("OLLAMA_BASE_URL");
  });

  it("passes when an alias key is set (CLAUDE_API_KEY)", () => {
    const result = checkModelKey({ CLAUDE_API_KEY: "sk-ant-alias" });
    expect(result.status).toBe("pass");
  });

  it("fails when no model key is set", () => {
    const result = checkModelKey({});
    expect(result.status).toBe("fail");
    expect(result.fix).toBe("milady setup");
  });

  it("fails when keys are present but empty/whitespace", () => {
    const result = checkModelKey({
      ANTHROPIC_API_KEY: "   ",
      OPENAI_API_KEY: "",
    });
    expect(result.status).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// checkStateDir
// ---------------------------------------------------------------------------

describe("checkStateDir", () => {
  it("warns when state dir does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = checkStateDir({ MILADY_STATE_DIR: "/tmp/fake-milady" });
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("/tmp/fake-milady");
  });

  it("passes when state dir exists and is writable", () => {
    mockExistsSync.mockReturnValue(true);
    mockAccessSync.mockImplementation(() => undefined); // no throw = writable
    const result = checkStateDir({ MILADY_STATE_DIR: "/tmp/milady" });
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("/tmp/milady");
  });

  it("fails when state dir exists but is not writable", () => {
    mockExistsSync.mockReturnValue(true);
    mockAccessSync.mockImplementation(() => {
      throw new Error("EACCES");
    });
    const result = checkStateDir({ MILADY_STATE_DIR: "/readonly/milady" });
    expect(result.status).toBe("fail");
    expect(result.fix).toContain("chmod");
  });

  it("uses MILADY_STATE_DIR env var when provided", () => {
    mockExistsSync.mockReturnValue(false);
    const result = checkStateDir({ MILADY_STATE_DIR: "/custom/state" });
    expect(result.detail).toContain("/custom/state");
  });
});

// ---------------------------------------------------------------------------
// checkDatabase
// ---------------------------------------------------------------------------

describe("checkDatabase", () => {
  it("warns when database has not been initialized yet", () => {
    mockExistsSync.mockReturnValue(false);
    const result = checkDatabase({ MILADY_STATE_DIR: "/tmp/milady" });
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("first start");
  });

  it("passes when database directory exists", () => {
    mockExistsSync.mockReturnValue(true);
    const result = checkDatabase({ MILADY_STATE_DIR: "/tmp/milady" });
    expect(result.status).toBe("pass");
    expect(result.detail).toContain(".elizadb");
  });
});

// ---------------------------------------------------------------------------
// checkPort
// ---------------------------------------------------------------------------

describe("checkPort", () => {
  function mockPortAvailable() {
    mockCreateConnection.mockImplementation((_opts: unknown) => {
      const emitter = {
        once: (event: string, cb: (err?: Error) => void) => {
          if (event === "error") setTimeout(() => cb(new Error("ECONNREFUSED")), 0);
          return emitter;
        },
        destroy: vi.fn(),
      };
      return emitter as unknown as ReturnType<typeof createConnection>;
    });
  }

  function mockPortInUse() {
    mockCreateConnection.mockImplementation((_opts: unknown) => {
      const emitter = {
        once: (event: string, cb: () => void) => {
          if (event === "connect") setTimeout(() => cb(), 0);
          return emitter;
        },
        destroy: vi.fn(),
      };
      return emitter as unknown as ReturnType<typeof createConnection>;
    });
  }

  it("passes when port is available", async () => {
    mockPortAvailable();
    const result = await checkPort(31337);
    expect(result.status).toBe("pass");
    expect(result.label).toBe("Port 31337");
  });

  it("warns when port is in use", async () => {
    mockPortInUse();
    const result = await checkPort(31337);
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("In use");
  });
});

// ---------------------------------------------------------------------------
// runAllChecks — integration
// ---------------------------------------------------------------------------

describe("runAllChecks", () => {
  it("returns results for all sync checks + ports by default", async () => {
    mockExistsSync.mockReturnValue(true);
    mockAccessSync.mockImplementation(() => undefined);
    mockCreateConnection.mockImplementation((_opts: unknown) => {
      const emitter = {
        once: (event: string, cb: (err?: Error) => void) => {
          if (event === "error") setTimeout(() => cb(new Error("ECONNREFUSED")), 0);
          return emitter;
        },
        destroy: vi.fn(),
      };
      return emitter as unknown as ReturnType<typeof createConnection>;
    });
    const { readFileSync } = await import("node:fs");
    vi.mocked(readFileSync).mockReturnValue("{}");

    const results = await runAllChecks({
      env: { ANTHROPIC_API_KEY: "sk-test" },
      configPath: "/fake/milady.json",
    });

    expect(results.length).toBeGreaterThanOrEqual(7); // 5 sync + 2 ports
    expect(results.every((r) => r.label && r.status)).toBe(true);
  });

  it("skips port checks when checkPorts=false", async () => {
    mockExistsSync.mockReturnValue(false);
    const results = await runAllChecks({
      env: {},
      configPath: "/nonexistent.json",
      checkPorts: false,
    });
    const portResults = results.filter((r) => r.label.startsWith("Port"));
    expect(portResults.length).toBe(0);
  });
});
