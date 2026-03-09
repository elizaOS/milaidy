/**
 * Unit tests for milady doctor health checks.
 * All checks are pure / injectable — no real filesystem or network I/O.
 */

import { accessSync, existsSync, readFileSync, statfsSync } from "node:fs";
import { createConnection } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    accessSync: vi.fn(),
    readFileSync: vi.fn(),
    statfsSync: vi.fn(),
  };
});

vi.mock("node:net", () => ({ createConnection: vi.fn() }));

import {
  checkBuildArtifacts,
  checkConfigFile,
  checkDatabase,
  checkDiskSpace,
  checkModelKey,
  checkNodeModules,
  checkPort,
  checkRuntime,
  checkStateDir,
  runAllChecks,
} from "./checks";

const mockExistsSync = vi.mocked(existsSync);
const mockAccessSync = vi.mocked(accessSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockStatfsSync = vi.mocked(statfsSync);
const mockCreateConnection = vi.mocked(createConnection);

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// checkRuntime
// ---------------------------------------------------------------------------

describe("checkRuntime", () => {
  it("returns a valid result shape for the current environment", () => {
    const result = checkRuntime();
    expect(result.label).toBe("Runtime");
    expect(result.category).toBe("system");
    expect(["pass", "fail", "warn"]).toContain(result.status);
    expect(result.detail).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// checkNodeModules
// ---------------------------------------------------------------------------

describe("checkNodeModules", () => {
  it("fails when node_modules does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = checkNodeModules("/fake/project");
    expect(result.status).toBe("fail");
    expect(result.fix).toBe("bun install");
    expect(result.category).toBe("system");
  });

  it("passes when node_modules exists", () => {
    mockExistsSync.mockReturnValue(true);
    const result = checkNodeModules("/fake/project");
    expect(result.status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// checkBuildArtifacts
// ---------------------------------------------------------------------------

describe("checkBuildArtifacts", () => {
  it("warns when dist/entry.js is missing", () => {
    mockExistsSync.mockReturnValue(false);
    const result = checkBuildArtifacts("/fake/project");
    expect(result.status).toBe("warn");
    expect(result.fix).toBe("bun run build");
    expect(result.category).toBe("system");
  });

  it("passes when dist/entry.js exists", () => {
    mockExistsSync.mockReturnValue(true);
    const result = checkBuildArtifacts("/fake/project");
    expect(result.status).toBe("pass");
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
    expect(result.autoFixable).toBe(true);
    expect(result.category).toBe("config");
  });

  it("passes when config file exists and is valid JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{"logging":{"level":"info"}}' as never);
    const result = checkConfigFile("/fake/milady.json");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("/fake/milady.json");
  });

  it("fails when config file exists but contains invalid JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("{ not valid json }}}" as never);
    const result = checkConfigFile("/fake/milady.json");
    expect(result.status).toBe("fail");
    expect(result.fix).toContain("/fake/milady.json");
  });

  it("resolves config path from MILADY_STATE_DIR when configPath is omitted", () => {
    mockExistsSync.mockReturnValue(false);
    const result = checkConfigFile(undefined, {
      MILADY_STATE_DIR: "/tmp/milady-profile",
    });
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("/tmp/milady-profile/milady.json");
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
    expect(result.category).toBe("config");
  });

  it("passes when alias CLAUDE_API_KEY is set", () => {
    const result = checkModelKey({ CLAUDE_API_KEY: "sk-ant-alias" });
    expect(result.status).toBe("pass");
  });

  it("passes when OLLAMA_BASE_URL is set", () => {
    const result = checkModelKey({ OLLAMA_BASE_URL: "http://localhost:11434" });
    expect(result.status).toBe("pass");
  });

  it("fails when no model key is set", () => {
    const result = checkModelKey({});
    expect(result.status).toBe("fail");
    expect(result.fix).toBe("milady setup");
    expect(result.autoFixable).toBe(true);
  });

  it("fails when keys are whitespace-only", () => {
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
    expect(result.category).toBe("storage");
  });

  it("passes when state dir exists and is writable", () => {
    mockExistsSync.mockReturnValue(true);
    mockAccessSync.mockImplementation(() => undefined);
    const result = checkStateDir({ MILADY_STATE_DIR: "/tmp/milady" });
    expect(result.status).toBe("pass");
  });

  it("fails when state dir is not writable", () => {
    mockExistsSync.mockReturnValue(true);
    mockAccessSync.mockImplementation(() => {
      throw new Error("EACCES");
    });
    const result = checkStateDir({ MILADY_STATE_DIR: "/readonly/milady" });
    expect(result.status).toBe("fail");
    expect(result.fix).toContain("chmod");
  });
});

// ---------------------------------------------------------------------------
// checkDatabase
// ---------------------------------------------------------------------------

describe("checkDatabase", () => {
  it("warns when database dir does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = checkDatabase({ MILADY_STATE_DIR: "/tmp/milady" });
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("first start");
    expect(result.category).toBe("storage");
  });

  it("passes when database dir exists", () => {
    mockExistsSync.mockReturnValue(true);
    const result = checkDatabase({ MILADY_STATE_DIR: "/tmp/milady" });
    expect(result.status).toBe("pass");
    expect(result.detail).toContain(".elizadb");
  });
});

// ---------------------------------------------------------------------------
// checkDiskSpace
// ---------------------------------------------------------------------------

describe("checkDiskSpace", () => {
  it("passes when >=1 GiB free", () => {
    mockStatfsSync.mockReturnValue({
      bsize: 4096,
      blocks: 1000000,
      bfree: 500000,
      bavail: 500000, // ~2 GiB
      files: 0,
      ffree: 0,
      type: 0,
      flags: 0,
    } as never);
    const result = checkDiskSpace({});
    expect(result.status).toBe("pass");
    expect(result.category).toBe("storage");
  });

  it("warns when <1 GiB free", () => {
    mockStatfsSync.mockReturnValue({
      bsize: 4096,
      blocks: 1000000,
      bfree: 100,
      bavail: 100, // ~400 KB
      files: 0,
      ffree: 0,
      type: 0,
      flags: 0,
    } as never);
    const result = checkDiskSpace({});
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("GB free");
  });

  it("skips when statfsSync throws", () => {
    mockStatfsSync.mockImplementation(() => {
      throw new Error("ENOTSUP");
    });
    const result = checkDiskSpace({});
    expect(result.status).toBe("skip");
  });
});

// ---------------------------------------------------------------------------
// checkPort
// ---------------------------------------------------------------------------

function mockPortAvailable() {
  mockCreateConnection.mockImplementation((_opts: unknown) => {
    const em = {
      once: (event: string, cb: (err?: Error) => void) => {
        if (event === "error")
          setTimeout(() => cb(new Error("ECONNREFUSED")), 0);
        return em;
      },
      destroy: vi.fn(),
    };
    return em as never;
  });
}

function mockPortInUse() {
  mockCreateConnection.mockImplementation((_opts: unknown) => {
    const em = {
      once: (event: string, cb: () => void) => {
        if (event === "connect") setTimeout(() => cb(), 0);
        return em;
      },
      destroy: vi.fn(),
    };
    return em as never;
  });
}

describe("checkPort", () => {
  it("passes when port is available", async () => {
    mockPortAvailable();
    const result = await checkPort(31337);
    expect(result.status).toBe("pass");
    expect(result.label).toBe("Port 31337");
    expect(result.category).toBe("network");
  });

  it("warns when port is in use", async () => {
    mockPortInUse();
    // getPortOwner calls lsof — mock child_process to return null owner
    vi.doMock("node:child_process", () => ({
      execFile: (
        _bin: string,
        _args: string[],
        cb: (err: Error | null) => void,
      ) => cb(new Error("not found")),
    }));
    const result = await checkPort(31337);
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("In use");
  });
});

// ---------------------------------------------------------------------------
// runAllChecks
// ---------------------------------------------------------------------------

describe("runAllChecks", () => {
  it("returns results for all checks including ports", async () => {
    mockExistsSync.mockReturnValue(true);
    mockAccessSync.mockImplementation(() => undefined);
    mockReadFileSync.mockReturnValue("{}" as never);
    mockStatfsSync.mockReturnValue({
      bsize: 4096,
      blocks: 1000000,
      bfree: 500000,
      bavail: 500000,
      files: 0,
      ffree: 0,
      type: 0,
      flags: 0,
    } as never);
    mockPortAvailable();

    const results = await runAllChecks({
      env: { ANTHROPIC_API_KEY: "sk-test" },
      configPath: "/fake/milady.json",
      projectRoot: "/fake/project",
    });

    expect(results.length).toBeGreaterThanOrEqual(10); // 8 sync + 2 ports
    expect(results.every((r) => r.label && r.status && r.category)).toBe(true);
  });

  it("skips port checks when checkPorts=false", async () => {
    mockExistsSync.mockReturnValue(false);
    mockStatfsSync.mockImplementation(() => {
      throw new Error();
    });

    const results = await runAllChecks({
      env: {},
      configPath: "/nonexistent.json",
      projectRoot: "/fake",
      checkPorts: false,
    });

    expect(results.filter((r) => r.label.startsWith("Port"))).toHaveLength(0);
  });

  it("all results have a category field", async () => {
    mockExistsSync.mockReturnValue(false);
    mockStatfsSync.mockImplementation(() => {
      throw new Error();
    });
    mockPortAvailable();

    const results = await runAllChecks({ env: {}, projectRoot: "/fake" });
    for (const r of results) {
      expect(["system", "config", "storage", "network"]).toContain(r.category);
    }
  });
});
