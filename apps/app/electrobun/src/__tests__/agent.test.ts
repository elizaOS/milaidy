import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Mocks -- vi.mock factories are hoisted, so no external references allowed
// ---------------------------------------------------------------------------

// Set MILADY_DIST_PATH so resolveMiladyDistPath() never touches import.meta.dir
// (which is Bun-only and undefined in Node/vitest).
const MOCK_DIST_PATH = "/mock/milady-dist";
process.env.MILADY_DIST_PATH = MOCK_DIST_PATH;
const ORIGINAL_EXEC_PATH = process.execPath;

vi.mock("node:fs", () => {
  const existsSyncFn = vi.fn(() => true);
  const rmSyncFn = vi.fn();
  return {
    default: {
      existsSync: existsSyncFn,
      mkdirSync: vi.fn(),
      appendFileSync: vi.fn(),
      readdirSync: vi.fn(() => ["server.js"]),
      rmSync: rmSyncFn,
    },
    existsSync: existsSyncFn,
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    readdirSync: vi.fn(() => ["server.js"]),
    rmSync: rmSyncFn,
  };
});

vi.mock("node:os", () => ({
  default: {
    homedir: vi.fn(() => "/mock/home"),
    tmpdir: vi.fn(() => "/tmp"),
  },
  homedir: vi.fn(() => "/mock/home"),
  tmpdir: vi.fn(() => "/tmp"),
}));

// Mock Bun globals
const mockSpawn = vi.fn();
const mockSleep = vi.fn(() => Promise.resolve());

vi.stubGlobal("Bun", {
  spawn: mockSpawn,
  sleep: mockSleep,
});

// Mock fetch for health checks
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMockProcess(
  overrides: Partial<{
    pid: number;
    exitCode: number | null;
    exited: Promise<number>;
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
    kill: Mock;
  }> = {},
) {
  const exitDeferred = createDeferred<number>();
  return {
    pid: overrides.pid ?? 12345,
    exitCode: overrides.exitCode ?? null,
    exited: overrides.exited ?? exitDeferred.promise,
    stdout:
      overrides.stdout ??
      new ReadableStream({
        start(c) {
          c.close();
        },
      }),
    stderr:
      overrides.stderr ??
      new ReadableStream({
        start(c) {
          c.close();
        },
      }),
    kill: overrides.kill ?? vi.fn(),
    _exitDeferred: exitDeferred,
  };
}

function makeReadableStream(text: string) {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(encoded);
      c.close();
    },
  });
}

/** Get the mocked fs.existsSync function to configure behavior per-test */
async function getExistsSyncMock(): Promise<Mock> {
  const fs = await import("node:fs");
  return fs.default.existsSync as Mock;
}

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import {
  AgentManager,
  getMiladyDistFallbackCandidates,
} from "../native/agent";

describe("AgentManager", () => {
  let manager: AgentManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(process, "execPath", {
      configurable: true,
      value: ORIGINAL_EXEC_PATH,
    });
    // Default: all filesystem checks return true (dist exists, server.js exists, etc.)
    const existsSync = await getExistsSyncMock();
    existsSync.mockReturnValue(true);
    manager = new AgentManager();
  });

  describe("milady-dist fallback candidates", () => {
    it("prefers the Resources/app runtime path for installed apps", () => {
      const candidates = getMiladyDistFallbackCandidates(
        "/Applications/Milady-canary.app/Contents/Resources",
        "/Applications/Milady-canary.app/Contents/MacOS/launcher",
      );

      expect(candidates[0]).toBe(
        "/Applications/Milady-canary.app/Contents/Resources/app/milady-dist",
      );
      expect(candidates).toContain(
        "/Applications/Milady-canary.app/Contents/milady-dist",
      );
    });

    it("includes the sibling milady-dist path for extracted app runtimes", () => {
      const candidates = getMiladyDistFallbackCandidates(
        "/private/tmp/Milady-canary.app/Contents/Resources/app/bun",
        "/private/tmp/Milady-canary.app/Contents/MacOS/launcher",
      );

      expect(candidates).toContain(
        "/private/tmp/Milady-canary.app/Contents/Resources/app/milady-dist",
      );
      expect(new Set(candidates).size).toBe(candidates.length);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(process, "execPath", {
      configurable: true,
      value: ORIGINAL_EXEC_PATH,
    });
    manager.dispose();
  });

  describe("initial state", () => {
    it("starts in not_started state", () => {
      const status = manager.getStatus();
      expect(status.state).toBe("not_started");
      expect(status.agentName).toBeNull();
      expect(status.port).toBeNull();
      expect(status.startedAt).toBeNull();
      expect(status.error).toBeNull();
    });

    it("getPort returns null initially", () => {
      expect(manager.getPort()).toBeNull();
    });
  });

  describe("start()", () => {
    it("transitions to starting state", async () => {
      const states: string[] = [];
      manager.setSendToWebview((_msg, payload) => {
        if (payload && typeof payload === "object" && "state" in payload) {
          states.push((payload as { state: string }).state);
        }
      });

      // Make server.js not found to trigger early error
      const existsSync = await getExistsSyncMock();
      existsSync.mockImplementation((p: string) => {
        if (typeof p === "string" && p.endsWith("server.js")) return false;
        if (p === MOCK_DIST_PATH) return true;
        return false;
      });

      await manager.start();

      // Should have transitioned through "starting" first
      expect(states[0]).toBe("starting");
    });

    it("transitions to error when server.js not found", async () => {
      const existsSync = await getExistsSyncMock();
      existsSync.mockImplementation((p: string) => {
        if (typeof p === "string" && p.endsWith("server.js")) return false;
        if (p === MOCK_DIST_PATH) return true;
        return false;
      });

      const status = await manager.start();
      expect(status.state).toBe("error");
      expect(status.error).toContain("eliza.js not found");
    });

    it("is idempotent when already running", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      // Health check to succeed
      mockFetch.mockResolvedValueOnce({ ok: true });
      // Agent name fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "TestAgent" }] }),
      });

      const firstStatus = await manager.start();
      expect(firstStatus.state).toBe("running");

      // Second call should return immediately without spawning again
      const secondStatus = await manager.start();
      expect(secondStatus.state).toBe("running");
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it("spawns bun process with correct args when server.js exists", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Milady" }] }),
      });

      const status = await manager.start();
      expect(status.state).toBe("running");
      expect(status.agentName).toBe("Milady");
      expect(status.port).toBe(2138); // DEFAULT_PORT
      expect(status.startedAt).toBeGreaterThan(0);
      expect(status.error).toBeNull();

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const spawnArgs = mockSpawn.mock.calls[0];
      expect(spawnArgs[0][1]).toBe("run");
      expect(spawnArgs[0][2]).toBe("/mock/milady-dist/eliza.js");
      // cwd should be the dist path
      expect(spawnArgs[1].cwd).toBe(MOCK_DIST_PATH);
    });

    it("uses the bundled Bun executable for installed app launches", async () => {
      Object.defineProperty(process, "execPath", {
        configurable: true,
        value: "/Applications/Milady-canary.app/Contents/MacOS/launcher",
      });

      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Milady" }] }),
      });

      await manager.start();

      expect(mockSpawn).toHaveBeenCalledWith(
        [
          "/Applications/Milady-canary.app/Contents/MacOS/bun",
          "run",
          "/mock/milady-dist/eliza.js",
        ],
        expect.objectContaining({
          cwd: MOCK_DIST_PATH,
        }),
      );
    });

    it("uses MILADY_PORT env var when set", async () => {
      const originalPort = process.env.MILADY_PORT;
      process.env.MILADY_PORT = "9999";

      try {
        const mockProc = createMockProcess();
        mockSpawn.mockReturnValue(mockProc);

        mockFetch.mockResolvedValueOnce({ ok: true });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ agents: [] }),
        });

        const status = await manager.start();
        expect(status.port).toBe(9999);
      } finally {
        if (originalPort === undefined) {
          delete process.env.MILADY_PORT;
        } else {
          process.env.MILADY_PORT = originalPort;
        }
      }
    });

    it("defaults agent name to Milady when agents endpoint fails", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      mockFetch.mockResolvedValueOnce({ ok: true });
      // Agent name fetch fails
      mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

      const status = await manager.start();
      expect(status.state).toBe("running");
      expect(status.agentName).toBe("Milady");
    });

    it("restarts once after a PGLite migration failure is detected", async () => {
      vi.useFakeTimers();
      const mockProc1 = createMockProcess({
        pid: 111,
        stderr: makeReadableStream("Failed query: create schema if not exists"),
      });
      const mockProc2 = createMockProcess({ pid: 222 });
      mockSpawn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2);

      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Milady" }] }),
      });
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Milady" }] }),
      });

      const status = await manager.start();
      expect(status.state).toBe("running");

      mockProc1._exitDeferred.resolve(1);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);

      const fs = await import("node:fs");
      expect(fs.default.rmSync).toHaveBeenCalledWith(
        "/mock/home/.milady/workspace/.eliza/.elizadb",
        { recursive: true, force: true },
      );
      expect(mockSpawn).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe("stop()", () => {
    it("does nothing when state is not_started", async () => {
      await manager.stop();
      expect(manager.getStatus().state).toBe("not_started");
    });

    it("transitions from running to stopped", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "TestAgent" }] }),
      });

      await manager.start();
      expect(manager.getStatus().state).toBe("running");

      // Resolve process exit so killChildProcess completes
      mockProc._exitDeferred.resolve(0);
      await manager.stop();

      const status = manager.getStatus();
      expect(status.state).toBe("stopped");
      expect(status.agentName).toBe("TestAgent");
      expect(status.port).toBeNull();
    });

    it("sends SIGTERM to the child process", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [] }),
      });

      await manager.start();
      expect(manager.getStatus().state).toBe("running");

      mockProc._exitDeferred.resolve(0);
      await manager.stop();

      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("is a no-op when already stopped", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [] }),
      });

      await manager.start();
      mockProc._exitDeferred.resolve(0);
      await manager.stop();
      expect(manager.getStatus().state).toBe("stopped");

      // Second stop should be a no-op
      await manager.stop();
      expect(manager.getStatus().state).toBe("stopped");
    });
  });

  describe("restart()", () => {
    it("stops then starts a new process", async () => {
      const mockProc1 = createMockProcess({ pid: 111 });
      const mockProc2 = createMockProcess({ pid: 222 });
      mockSpawn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2);

      // First start
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Agent1" }] }),
      });

      await manager.start();
      expect(manager.getStatus().state).toBe("running");

      // For stop to work, resolve process 1 exit
      mockProc1._exitDeferred.resolve(0);

      // Restart: health check and agent name for new process
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [{ name: "Agent2" }] }),
      });

      const status = await manager.restart();
      expect(status.state).toBe("running");
      expect(status.agentName).toBe("Agent2");
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
  });

  describe("getStatus()", () => {
    it("returns a copy (not a reference)", () => {
      const status1 = manager.getStatus();
      const status2 = manager.getStatus();
      expect(status1).toEqual(status2);
      expect(status1).not.toBe(status2);
    });
  });

  describe("setSendToWebview()", () => {
    it("emits status updates via the callback", async () => {
      const messages: Array<{ message: string; payload: unknown }> = [];
      manager.setSendToWebview((message, payload) => {
        messages.push({ message, payload });
      });

      // Make server.js not found for quick error path
      const existsSync = await getExistsSyncMock();
      existsSync.mockImplementation((p: string) => {
        if (typeof p === "string" && p.endsWith("server.js")) return false;
        if (p === MOCK_DIST_PATH) return true;
        return false;
      });

      await manager.start();

      // Should have emitted at least "starting" and "error" statuses
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].message).toBe("agentStatusUpdate");
      expect((messages[0].payload as { state: string }).state).toBe("starting");
    });
  });
});
