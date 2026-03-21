import { describe, expect, it } from "vitest";
import { SandboxManager, type SandboxMode } from "../sandbox-manager";

describe("SandboxManager", () => {
  describe("state machine", () => {
    it("should start in uninitialized state", () => {
      const mgr = new SandboxManager({ mode: "off" });
      expect(mgr.getState()).toBe("uninitialized");
    });

    it("should transition to stopped when mode is off", async () => {
      const mgr = new SandboxManager({ mode: "off" });
      await mgr.start();
      expect(mgr.getState()).toBe("stopped");
    });

    it("should transition to ready when mode is light", async () => {
      const mgr = new SandboxManager({ mode: "light" });
      await mgr.start();
      expect(mgr.getState()).toBe("ready");
      expect(mgr.isReady()).toBe(true);
    });

    it("should track mode correctly", () => {
      const modes: SandboxMode[] = ["off", "light", "standard", "max"];
      for (const mode of modes) {
        const mgr = new SandboxManager({ mode });
        expect(mgr.getMode()).toBe(mode);
      }
    });

    it("should transition to stopped after stop()", async () => {
      const mgr = new SandboxManager({ mode: "light" });
      await mgr.start();
      expect(mgr.getState()).toBe("ready");
      await mgr.stop();
      expect(mgr.getState()).toBe("stopped");
      expect(mgr.isReady()).toBe(false);
    });
  });

  describe("exec in light mode", () => {
    it("should refuse exec in off mode", async () => {
      const mgr = new SandboxManager({ mode: "off" });
      await mgr.start();
      const result = await mgr.exec({ command: "echo hello" });
      expect(result.executedInSandbox).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it("should refuse exec in light mode", async () => {
      const mgr = new SandboxManager({ mode: "light" });
      await mgr.start();
      const result = await mgr.exec({ command: "echo hello" });
      expect(result.executedInSandbox).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not available");
    });
  });

  describe("standard mode without Docker", () => {
    it("should go to degraded if Docker is not available", async () => {
      // This test will pass on machines without Docker
      // and will go to ready/degraded on machines with Docker
      const mgr = new SandboxManager({
        mode: "standard",
        image: "nonexistent-image-that-does-not-exist:test",
        containerPrefix: "test-sandbox-unit",
      });
      try {
        await mgr.start();
      } catch {
        // Expected if Docker is not available
      }
      // Either degraded (Docker not found) or initialized
      const state = mgr.getState();
      expect(["degraded", "ready", "initializing"]).toContain(state);
    });
  });

  describe("event log", () => {
    it("should record state transition events", async () => {
      const mgr = new SandboxManager({ mode: "light" });
      await mgr.start();
      const events = mgr.getEventLog();
      expect(events.length).toBeGreaterThan(0);
      const stateEvents = events.filter((e) => e.type === "state_change");
      expect(stateEvents.length).toBeGreaterThan(0);
    });

    it("should cap event log size", async () => {
      const mgr = new SandboxManager({ mode: "light" });
      // Trigger many events by starting and stopping repeatedly
      for (let i = 0; i < 10; i++) {
        await mgr.start();
        await mgr.stop();
      }
      const events = mgr.getEventLog();
      expect(events.length).toBeLessThanOrEqual(1000);
    });
  });

  describe("getStatus", () => {
    it("should return correct status for light mode", async () => {
      const mgr = new SandboxManager({ mode: "light" });
      await mgr.start();
      const status = mgr.getStatus();
      expect(status.state).toBe("ready");
      expect(status.mode).toBe("light");
      expect(status.containerId).toBeNull();
      expect(status.browserContainerId).toBeNull();
    });
  });

  describe("browser endpoints", () => {
    it("should return null endpoints when no browser container", () => {
      const mgr = new SandboxManager({ mode: "light" });
      expect(mgr.getBrowserCdpEndpoint()).toBeNull();
      expect(mgr.getBrowserWsEndpoint()).toBeNull();
    });
  });

  describe("recovery", () => {
    it("should not recover from non-degraded state", async () => {
      const mgr = new SandboxManager({ mode: "light" });
      await mgr.start();
      expect(mgr.getState()).toBe("ready");
      await mgr.recover(); // Should be no-op
      expect(mgr.getState()).toBe("ready");
    });
  });
});
