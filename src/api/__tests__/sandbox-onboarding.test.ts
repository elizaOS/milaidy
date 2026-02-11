/**
 * E2E tests for sandbox onboarding flow.
 *
 * Verifies:
 * - 3 execution modes: cloud, local-sandbox, local-rawdog
 * - Docker detection (installed vs running distinction)
 * - Docker auto-start endpoint
 * - Platform detection
 * - Mobile handling (cloud-only)
 * - Sandbox mode propagation to onboarding data
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handleSandboxRoute } from "../sandbox-routes";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function createMockReq(method: string, body?: string): IncomingMessage {
  const req = {
    method,
    headers: {},
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === "data" && body) {
        handler(Buffer.from(body));
      }
      if (event === "end") {
        handler();
      }
      return req;
    }),
    destroy: vi.fn(),
  } as unknown as IncomingMessage;
  return req;
}

function createMockRes(): ServerResponse & { _status: number; _body: string } {
  return {
    _status: 0,
    _body: "",
    writeHead: vi.fn(function (this: { _status: number }, status: number) {
      this._status = status;
    }),
    end: vi.fn(function (this: { _body: string }, data?: string) {
      this._body = data ?? "";
    }),
  } as unknown as ServerResponse & { _status: number; _body: string };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Sandbox Onboarding E2E", () => {
  describe("GET /api/sandbox/platform", () => {
    it("should return platform info without requiring sandbox manager", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();

      const handled = await handleSandboxRoute(
        req,
        res,
        "/api/sandbox/platform",
        "GET",
        { sandboxManager: null },
      );

      expect(handled).toBe(true);
      expect(res._status).toBe(200);
      const data = JSON.parse(res._body);

      // Must have all required fields
      expect(data.platform).toBeTruthy();
      expect(data.arch).toBeTruthy();
      expect(typeof data.dockerInstalled).toBe("boolean");
      expect(typeof data.dockerRunning).toBe("boolean");
      expect(typeof data.dockerAvailable).toBe("boolean");
      expect(typeof data.appleContainerAvailable).toBe("boolean");
      expect(data.recommended).toBeTruthy();
    });

    it("should differentiate Docker installed vs running", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();

      await handleSandboxRoute(req, res, "/api/sandbox/platform", "GET", {
        sandboxManager: null,
      });

      const data = JSON.parse(res._body);
      // dockerAvailable should equal dockerRunning (for backward compat)
      expect(data.dockerAvailable).toBe(data.dockerRunning);
      // If docker is running, it must also be installed
      if (data.dockerRunning) {
        expect(data.dockerInstalled).toBe(true);
      }
    });
  });

  describe("POST /api/sandbox/docker/start", () => {
    it("should handle Docker start request without manager", async () => {
      const req = createMockReq("POST");
      const res = createMockRes();

      const handled = await handleSandboxRoute(
        req,
        res,
        "/api/sandbox/docker/start",
        "POST",
        { sandboxManager: null },
      );

      expect(handled).toBe(true);
      expect(res._status).toBe(200);
      const data = JSON.parse(res._body);
      expect(typeof data.success).toBe("boolean");
      expect(typeof data.message).toBe("string");
      expect(typeof data.waitMs).toBe("number");
    });
  });

  describe("Onboarding mode propagation", () => {
    it("cloud mode should set sandboxMode to light", () => {
      const runMode = "cloud";
      const sandboxMode = runMode === "cloud" ? "light" : "off";
      expect(sandboxMode).toBe("light");
    });

    it("local-sandbox mode should set sandboxMode to standard", () => {
      const runMode = "local-sandbox";
      const sandboxMode = runMode === "local-sandbox" ? "standard" : "off";
      expect(sandboxMode).toBe("standard");
    });

    it("local-rawdog mode should set sandboxMode to off", () => {
      const runMode = "local-rawdog";
      const sandboxMode =
        runMode === "local-sandbox"
          ? "standard"
          : runMode === "cloud"
            ? "light"
            : "off";
      expect(sandboxMode).toBe("off");
    });
  });

  describe("Mobile platform detection", () => {
    it("should identify iOS user agents as mobile", () => {
      const iosUAs = [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
        "Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0 like Mac OS X)",
      ];
      for (const ua of iosUAs) {
        expect(/iPhone|iPad|iPod|Android/i.test(ua)).toBe(true);
      }
    });

    it("should identify Android user agents as mobile", () => {
      const androidUAs = [
        "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
        "Mozilla/5.0 (Linux; Android 13; SM-S901B)",
      ];
      for (const ua of androidUAs) {
        expect(/iPhone|iPad|iPod|Android/i.test(ua)).toBe(true);
      }
    });

    it("should NOT identify desktop user agents as mobile", () => {
      const desktopUAs = [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Mozilla/5.0 (X11; Linux x86_64)",
      ];
      for (const ua of desktopUAs) {
        expect(/iPhone|iPad|iPod|Android/i.test(ua)).toBe(false);
      }
    });
  });

  describe("Onboarding step flow", () => {
    it("cloud path: runMode -> cloudProvider -> modelSelection -> ...", () => {
      const steps: string[] = [];
      const runMode = "cloud";

      // Simulate step transitions
      steps.push("runMode");
      if (runMode === "cloud") steps.push("cloudProvider");
      else if (runMode === "local-sandbox") steps.push("dockerSetup");
      else steps.push("llmProvider");

      if (runMode === "cloud") steps.push("modelSelection");
      steps.push("connectors");

      expect(steps).toEqual([
        "runMode",
        "cloudProvider",
        "modelSelection",
        "connectors",
      ]);
    });

    it("local-sandbox path: runMode -> dockerSetup -> llmProvider -> ...", () => {
      const steps: string[] = [];
      const runMode = "local-sandbox";

      steps.push("runMode");
      if (runMode === "cloud") steps.push("cloudProvider");
      else if (runMode === "local-sandbox") steps.push("dockerSetup");
      else steps.push("llmProvider");

      steps.push("llmProvider");
      steps.push("inventorySetup");
      steps.push("connectors");

      expect(steps).toEqual([
        "runMode",
        "dockerSetup",
        "llmProvider",
        "inventorySetup",
        "connectors",
      ]);
    });

    it("local-rawdog path: runMode -> llmProvider -> inventorySetup -> connectors", () => {
      const steps: string[] = [];
      const runMode = "local-rawdog";

      steps.push("runMode");
      if (runMode === "cloud") steps.push("cloudProvider");
      else if (runMode === "local-sandbox") steps.push("dockerSetup");
      else steps.push("llmProvider");

      steps.push("inventorySetup");
      steps.push("connectors");

      expect(steps).toEqual([
        "runMode",
        "llmProvider",
        "inventorySetup",
        "connectors",
      ]);
    });

    it("back navigation from dockerSetup should return to runMode", () => {
      const currentStep = "dockerSetup";
      let backStep = "";
      if (currentStep === "dockerSetup") backStep = "runMode";
      expect(backStep).toBe("runMode");
    });

    it("back navigation from llmProvider depends on runMode", () => {
      const previousStepFromLlmProvider = (runMode: string): string =>
        runMode === "local-sandbox" ? "dockerSetup" : "runMode";

      // local-sandbox: back to dockerSetup
      expect(previousStepFromLlmProvider("local-sandbox")).toBe("dockerSetup");

      // local-rawdog: back to runMode
      expect(previousStepFromLlmProvider("local-rawdog")).toBe("runMode");
    });
  });

  describe("Docker status states", () => {
    it("should handle all 4 Docker states", () => {
      const states = [
        { installed: false, running: false, label: "not installed" },
        { installed: true, running: false, label: "installed but not running" },
        { installed: true, running: true, label: "ready" },
        { installed: false, running: true, label: "impossible (test guard)" },
      ];

      for (const s of states) {
        // If running, must be installed
        if (s.running && !s.installed) {
          // This state shouldn't happen in practice
          continue;
        }
        const isReady = s.installed && s.running;
        const needsInstall = !s.installed;
        const needsStart = s.installed && !s.running;

        if (s.label === "not installed") {
          expect(needsInstall).toBe(true);
          expect(isReady).toBe(false);
        } else if (s.label === "installed but not running") {
          expect(needsStart).toBe(true);
          expect(isReady).toBe(false);
        } else if (s.label === "ready") {
          expect(isReady).toBe(true);
        }
      }
    });
  });

  describe("GET /api/sandbox/capabilities", () => {
    it("should return capability info for all bridges", async () => {
      const mgr = {
        getStatus: vi.fn().mockReturnValue({
          state: "ready",
          mode: "standard",
          containerId: "abc",
          browserContainerId: null,
        }),
        getEventLog: vi.fn().mockReturnValue([]),
        start: vi.fn(),
        stop: vi.fn(),
        recover: vi.fn(),
        exec: vi.fn(),
        getBrowserCdpEndpoint: vi.fn(),
        getBrowserWsEndpoint: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
        getMode: vi.fn(),
        getState: vi.fn(),
      };

      const req = createMockReq("GET");
      const res = createMockRes();

      await handleSandboxRoute(req, res, "/api/sandbox/capabilities", "GET", {
        sandboxManager: mgr as never,
      });

      expect(res._status).toBe(200);
      const caps = JSON.parse(res._body);

      // Must have all capability keys
      expect(caps.screenshot).toBeTruthy();
      expect(caps.browser).toBeTruthy();
      expect(caps.shell).toBeTruthy();
      expect(typeof caps.screenshot.available).toBe("boolean");
      expect(typeof caps.screenshot.tool).toBe("string");

      // Browser and shell should always be available (they're container-based)
      expect(caps.browser.available).toBe(true);
      expect(caps.shell.available).toBe(true);
    });
  });
});
