/**
 * Unit tests for sandbox-manager.ts — container lifecycle management.
 *
 * Covers:
 * - Construction and defaults
 * - Mode handling (off, light, standard, max)
 * - Start lifecycle (engine checks, orphan cleanup, health check)
 * - Stop lifecycle
 * - Recovery from degraded state
 * - Command execution (exec)
 * - Browser container management
 * - Event logging
 * - Status reporting
 *
 * @see sandbox-manager.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────

// Mock sandbox-engine module
const mockEngine = {
  engineType: "docker" as const,
  isAvailable: vi.fn().mockReturnValue(true),
  getInfo: vi.fn().mockReturnValue({
    type: "docker",
    available: true,
    version: "24.0.0",
    platform: "darwin",
    arch: "arm64",
    details: "default",
  }),
  runContainer: vi.fn().mockResolvedValue("container-abc123"),
  execInContainer: vi.fn().mockResolvedValue({
    exitCode: 0,
    stdout: "ok",
    stderr: "",
    durationMs: 50,
  }),
  stopContainer: vi.fn().mockResolvedValue(undefined),
  removeContainer: vi.fn().mockResolvedValue(undefined),
  isContainerRunning: vi.fn().mockReturnValue(true),
  imageExists: vi.fn().mockReturnValue(true),
  pullImage: vi.fn().mockResolvedValue(undefined),
  listContainers: vi.fn().mockReturnValue([]),
  healthCheck: vi.fn().mockResolvedValue(true),
};

vi.mock("./sandbox-engine", () => ({
  createEngine: () => mockEngine,
  detectBestEngine: () => mockEngine,
}));

// Mock node:fs to prevent actual directory creation
vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
}));

import { SandboxManager } from "./sandbox-manager";

// ── Tests ────────────────────────────────────────────────────────────────

describe("SandboxManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEngine.isAvailable.mockReturnValue(true);
    mockEngine.imageExists.mockReturnValue(true);
    mockEngine.healthCheck.mockResolvedValue(true);
    mockEngine.runContainer.mockResolvedValue("container-abc123");
    mockEngine.listContainers.mockReturnValue([]);
    mockEngine.stopContainer.mockResolvedValue(undefined);
    mockEngine.removeContainer.mockResolvedValue(undefined);
    mockEngine.execInContainer.mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      durationMs: 50,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  //  1. Construction
  // ===================================================================

  describe("constructor", () => {
    it("creates with minimal config", () => {
      const mgr = new SandboxManager({ mode: "standard" });
      expect(mgr).toBeInstanceOf(SandboxManager);
    });

    it("starts in uninitialized state", () => {
      const mgr = new SandboxManager({ mode: "standard" });
      expect(mgr.getState()).toBe("uninitialized");
    });

    it("reports configured mode", () => {
      const mgr = new SandboxManager({ mode: "light" });
      expect(mgr.getMode()).toBe("light");
    });

    it("is not ready before start", () => {
      const mgr = new SandboxManager({ mode: "standard" });
      expect(mgr.isReady()).toBe(false);
    });
  });

  // ===================================================================
  //  2. Mode: off
  // ===================================================================

  describe("mode: off", () => {
    it("transitions to stopped immediately", async () => {
      const mgr = new SandboxManager({ mode: "off" });
      await mgr.start();
      expect(mgr.getState()).toBe("stopped");
      expect(mgr.isReady()).toBe(false);
    });

    it("does not create containers", async () => {
      const mgr = new SandboxManager({ mode: "off" });
      await mgr.start();
      expect(mockEngine.runContainer).not.toHaveBeenCalled();
    });

    it("refuses exec", async () => {
      const mgr = new SandboxManager({ mode: "off" });
      await mgr.start();
      const result = await mgr.exec({ command: "echo hello" });
      expect(result.exitCode).toBe(1);
      expect(result.executedInSandbox).toBe(false);
      expect(result.stderr).toContain("not available");
    });
  });

  // ===================================================================
  //  3. Mode: light
  // ===================================================================

  describe("mode: light", () => {
    it("transitions to ready without container", async () => {
      const mgr = new SandboxManager({ mode: "light" });
      await mgr.start();
      expect(mgr.getState()).toBe("ready");
      expect(mgr.isReady()).toBe(true);
    });

    it("does not create containers", async () => {
      const mgr = new SandboxManager({ mode: "light" });
      await mgr.start();
      expect(mockEngine.runContainer).not.toHaveBeenCalled();
    });

    it("refuses exec", async () => {
      const mgr = new SandboxManager({ mode: "light" });
      await mgr.start();
      const result = await mgr.exec({ command: "echo hello" });
      expect(result.exitCode).toBe(1);
      expect(result.executedInSandbox).toBe(false);
    });
  });

  // ===================================================================
  //  4. Mode: standard — start lifecycle
  // ===================================================================

  describe("mode: standard — start", () => {
    it("transitions to ready on successful start", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      expect(mgr.getState()).toBe("ready");
      expect(mgr.isReady()).toBe(true);
    });

    it("checks engine availability", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      expect(mockEngine.isAvailable).toHaveBeenCalled();
    });

    it("checks image existence", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      expect(mockEngine.imageExists).toHaveBeenCalled();
    });

    it("pulls image if not found", async () => {
      mockEngine.imageExists.mockReturnValue(false);
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      expect(mockEngine.pullImage).toHaveBeenCalled();
    });

    it("cleans up orphan containers", async () => {
      mockEngine.listContainers.mockReturnValue(["orphan-1", "orphan-2"]);
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      expect(mockEngine.stopContainer).toHaveBeenCalledWith("orphan-1");
      expect(mockEngine.removeContainer).toHaveBeenCalledWith("orphan-1");
      expect(mockEngine.stopContainer).toHaveBeenCalledWith("orphan-2");
      expect(mockEngine.removeContainer).toHaveBeenCalledWith("orphan-2");
    });

    it("creates main container", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      expect(mockEngine.runContainer).toHaveBeenCalled();
    });

    it("runs health check", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      expect(mockEngine.healthCheck).toHaveBeenCalledWith("container-abc123");
    });

    it("transitions to degraded if health check fails", async () => {
      mockEngine.healthCheck.mockResolvedValue(false);
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      expect(mgr.getState()).toBe("degraded");
    });

    it("throws and degrades if engine unavailable", async () => {
      mockEngine.isAvailable.mockReturnValue(false);
      const mgr = new SandboxManager({ mode: "standard" });
      await expect(mgr.start()).rejects.toThrow("not available");
      expect(mgr.getState()).toBe("degraded");
    });

    it("throws if image pull fails", async () => {
      mockEngine.imageExists.mockReturnValue(false);
      mockEngine.pullImage.mockRejectedValue(new Error("network error"));
      const mgr = new SandboxManager({ mode: "standard" });
      await expect(mgr.start()).rejects.toThrow("not found");
      expect(mgr.getState()).toBe("degraded");
    });
  });

  // ===================================================================
  //  5. Stop
  // ===================================================================

  describe("stop", () => {
    it("transitions to stopped", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      await mgr.stop();
      expect(mgr.getState()).toBe("stopped");
    });

    it("cleans up container", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      await mgr.stop();
      expect(mockEngine.stopContainer).toHaveBeenCalledWith("container-abc123");
      expect(mockEngine.removeContainer).toHaveBeenCalledWith(
        "container-abc123",
      );
    });

    it("handles cleanup errors gracefully", async () => {
      mockEngine.stopContainer.mockRejectedValue(new Error("already stopped"));
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      // Should not throw — errors are caught
      await mgr.stop();
      expect(mgr.getState()).toBe("stopped");
    });
  });

  // ===================================================================
  //  6. Exec
  // ===================================================================

  describe("exec", () => {
    it("executes command in container", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      const result = await mgr.exec({ command: "echo hello" });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("ok");
      expect(result.executedInSandbox).toBe(true);
    });

    it("passes command options to engine", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      await mgr.exec({
        command: "ls -la",
        workdir: "/tmp",
        env: { FOO: "bar" },
        timeoutMs: 5000,
      });
      expect(mockEngine.execInContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          containerId: "container-abc123",
          command: "ls -la",
          workdir: "/tmp",
          env: { FOO: "bar" },
          timeoutMs: 5000,
        }),
      );
    });

    it("refuses exec when not ready", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      // Don't start
      const result = await mgr.exec({ command: "echo hello" });
      expect(result.exitCode).toBe(1);
      expect(result.executedInSandbox).toBe(false);
      expect(result.stderr).toContain("not ready");
    });

    it("handles engine exec errors", async () => {
      mockEngine.execInContainer.mockRejectedValue(new Error("exec timeout"));
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      const result = await mgr.exec({ command: "hang" });
      expect(result.exitCode).toBe(1);
      expect(result.executedInSandbox).toBe(false);
      expect(result.stderr).toContain("exec timeout");
    });
  });

  // ===================================================================
  //  7. Recovery
  // ===================================================================

  describe("recover", () => {
    it("recovers from degraded to ready", async () => {
      // Start phase: healthCheck returns false → degraded
      mockEngine.healthCheck.mockResolvedValue(false);
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      expect(mgr.getState()).toBe("degraded");

      // Recovery phase: healthCheck now returns true → ready
      mockEngine.healthCheck.mockResolvedValue(true);
      await mgr.recover();
      expect(mgr.getState()).toBe("ready");
    });

    it("does nothing if not degraded", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      expect(mgr.getState()).toBe("ready");

      const callsBefore = mockEngine.runContainer.mock.calls.length;
      await mgr.recover();
      // Should not have created a new container
      expect(mockEngine.runContainer.mock.calls.length).toBe(callsBefore);
    });

    it("stays degraded if recovery health check fails", async () => {
      mockEngine.healthCheck.mockResolvedValue(false);
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      expect(mgr.getState()).toBe("degraded");

      await mgr.recover();
      expect(mgr.getState()).toBe("degraded");
    });

    it("cleans up old container before creating new one", async () => {
      mockEngine.healthCheck
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();

      mockEngine.stopContainer.mockClear();
      mockEngine.removeContainer.mockClear();

      await mgr.recover();
      // Should have cleaned up the old container
      expect(mockEngine.stopContainer).toHaveBeenCalledWith("container-abc123");
    });
  });

  // ===================================================================
  //  8. Browser container
  // ===================================================================

  describe("browser container", () => {
    it("returns null CDP endpoint when no browser", () => {
      const mgr = new SandboxManager({ mode: "standard" });
      expect(mgr.getBrowserCdpEndpoint()).toBeNull();
    });

    it("returns null WS endpoint when no browser", () => {
      const mgr = new SandboxManager({ mode: "standard" });
      expect(mgr.getBrowserWsEndpoint()).toBeNull();
    });

    it("returns null noVNC endpoint when no browser", () => {
      const mgr = new SandboxManager({ mode: "standard" });
      expect(mgr.getBrowserNoVncEndpoint()).toBeNull();
    });

    it("starts browser container when configured", async () => {
      mockEngine.runContainer
        .mockResolvedValueOnce("main-container")
        .mockResolvedValueOnce("browser-container");

      const mgr = new SandboxManager({
        mode: "standard",
        browser: {
          enabled: true,
          autoStart: true,
          cdpPort: 9222,
          enableNoVnc: true,
        },
      });
      await mgr.start();

      // Should have called runContainer twice (main + browser)
      expect(mockEngine.runContainer).toHaveBeenCalledTimes(2);
      expect(mgr.getBrowserNoVncEndpoint()).toBe(
        "http://localhost:6080/vnc.html?autoconnect=true&resize=scale&view_only=true",
      );
    });

    it("wires noVNC/browser env and ports into browser container", async () => {
      mockEngine.runContainer
        .mockResolvedValueOnce("main-container")
        .mockResolvedValueOnce("browser-container");

      const mgr = new SandboxManager({
        mode: "standard",
        browser: {
          enabled: true,
          autoStart: true,
          cdpPort: 9333,
          vncPort: 5901,
          noVncPort: 6090,
          enableNoVnc: true,
        },
      });
      await mgr.start();

      const browserCall = mockEngine.runContainer.mock.calls[1]?.[0] as
        | {
            env?: Record<string, string>;
            ports?: Array<{ host: number; container: number }>;
          }
        | undefined;
      expect(browserCall).toBeDefined();
      expect(browserCall?.env).toMatchObject({
        MILADY_BROWSER_CDP_PORT: "9333",
        MILADY_BROWSER_VNC_PORT: "5901",
        MILADY_BROWSER_NOVNC_PORT: "6090",
        MILADY_BROWSER_ENABLE_NOVNC: "1",
        MILADY_BROWSER_HEADLESS: "0",
      });
      expect(browserCall?.ports).toEqual(
        expect.arrayContaining([
          { host: 9333, container: 9333 },
          { host: 5901, container: 5901 },
          { host: 6090, container: 6090 },
        ]),
      );
    });

    it("returns null noVNC endpoint when disabled", async () => {
      mockEngine.runContainer
        .mockResolvedValueOnce("main-container")
        .mockResolvedValueOnce("browser-container");

      const mgr = new SandboxManager({
        mode: "standard",
        browser: {
          enabled: true,
          autoStart: true,
          enableNoVnc: false,
        },
      });
      await mgr.start();
      expect(mgr.getBrowserNoVncEndpoint()).toBeNull();
    });

    it("continues if browser container fails to start", async () => {
      mockEngine.runContainer
        .mockResolvedValueOnce("main-container")
        .mockRejectedValueOnce(new Error("browser image missing"));

      const mgr = new SandboxManager({
        mode: "standard",
        browser: { enabled: true, autoStart: true },
      });
      await mgr.start();
      // Should still be ready despite browser failure
      expect(mgr.getState()).toBe("ready");
    });
  });

  // ===================================================================
  //  9. Event log
  // ===================================================================

  describe("event log", () => {
    it("starts with empty log", () => {
      const mgr = new SandboxManager({ mode: "standard" });
      expect(mgr.getEventLog()).toEqual([]);
    });

    it("records state transitions", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      const events = mgr.getEventLog();
      const stateChanges = events.filter((e) => e.type === "state_change");
      expect(stateChanges.length).toBeGreaterThan(0);
    });

    it("records container start", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      const events = mgr.getEventLog();
      const starts = events.filter((e) => e.type === "container_start");
      expect(starts).toHaveLength(1);
    });

    it("records exec events", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      await mgr.exec({ command: "echo test" });
      const events = mgr.getEventLog();
      const execs = events.filter((e) => e.type === "exec");
      expect(execs).toHaveLength(1);
    });

    it("records exec denied when not ready", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.exec({ command: "echo test" });
      const events = mgr.getEventLog();
      const denied = events.filter((e) => e.type === "exec_denied");
      expect(denied).toHaveLength(1);
    });

    it("returns a copy of the log", () => {
      const mgr = new SandboxManager({ mode: "standard" });
      const log1 = mgr.getEventLog();
      const log2 = mgr.getEventLog();
      expect(log1).not.toBe(log2); // different array instances
    });
  });

  // ===================================================================
  //  10. Status
  // ===================================================================

  describe("getStatus", () => {
    it("reports correct status before start", () => {
      const mgr = new SandboxManager({ mode: "standard" });
      const status = mgr.getStatus();
      expect(status.state).toBe("uninitialized");
      expect(status.mode).toBe("standard");
      expect(status.containerId).toBeNull();
      expect(status.browserContainerId).toBeNull();
    });

    it("reports correct status after start", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      const status = mgr.getStatus();
      expect(status.state).toBe("ready");
      expect(status.containerId).toBe("container-abc123");
    });

    it("reports stopped state after stop", async () => {
      const mgr = new SandboxManager({ mode: "standard" });
      await mgr.start();
      await mgr.stop();
      const status = mgr.getStatus();
      expect(status.state).toBe("stopped");
    });
  });
});
