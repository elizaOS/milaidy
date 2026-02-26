/**
 * PTYService unit tests
 *
 * Tests PTY session management, event handling, and adapter registration.
 */

import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

import type { IAgentRuntime } from "@elizaos/core";

// Track session count for unique IDs
let sessionCounter = 0;

// Shared mock manager instance
const mockManager = {
  spawn: jest.fn(),
  send: jest.fn(),
  get: jest.fn(),
  getSession: jest.fn(),
  stop: jest.fn(),
  logs: jest.fn(),
  list: jest.fn(),
  registerAdapter: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  shutdown: jest.fn(),
};

// Custom pty-manager mock required because PTYService instantiates the manager
// and calls methods on it — the preload's bare class stub is insufficient.
mock.module("pty-manager", () => ({
  PTYManager: class {
    constructor() {
      Object.assign(this, mockManager);
    }
  },
  ShellAdapter: class {},
  BunCompatiblePTYManager: class {
    constructor() {
      Object.assign(this, mockManager);
    }
  },
  isBun: () => false,
  extractTaskCompletionTraceRecords: () => [],
  buildTaskCompletionTimeline: () => ({}),
}));

// Dynamic import after mocks are registered
const { PTYService } = await import("../services/pty-service.js");
type PTYServiceConfig = import("../services/pty-service.js").PTYServiceConfig;

// Mock runtime
const createMockRuntime = (settings: Record<string, unknown> = {}) => ({
  getSetting: jest.fn((key: string) => settings[key]),
  getService: jest.fn(),
});

describe("PTYService", () => {
  let service: InstanceType<typeof PTYService>;

  beforeEach(async () => {
    sessionCounter = 0;
    jest.clearAllMocks();

    // Reset mock implementations
    mockManager.spawn.mockImplementation(() =>
      Promise.resolve({
        id: `session-${++sessionCounter}`,
        name: "test-session",
        type: "shell",
        status: "running",
        startedAt: new Date(),
        lastActivityAt: new Date(),
      }),
    );
    mockManager.send.mockResolvedValue(undefined);
    mockManager.stop.mockResolvedValue(undefined);
    mockManager.get.mockImplementation((id: string) => {
      if (id.startsWith("session-")) {
        return {
          id,
          name: "test-session",
          type: "shell",
          status: "running",
          startedAt: new Date(),
          lastActivityAt: new Date(),
        };
      }
      return undefined;
    });
    mockManager.getSession.mockImplementation((id: string) => {
      if (id.startsWith("session-")) {
        return { sendKeys: jest.fn() };
      }
      return undefined;
    });
    mockManager.list.mockReturnValue([]);
    mockManager.logs.mockImplementation(async function* () {
      yield "mock output line";
    });

    const runtime = createMockRuntime();
    service = await PTYService.start(runtime as unknown as IAgentRuntime);
  });

  describe("initialization", () => {
    it("should initialize with default config", async () => {
      expect(service).toBeInstanceOf(PTYService);
    });

    it("should accept custom config from runtime settings", async () => {
      const customConfig: PTYServiceConfig = {
        maxLogLines: 2000,
        debug: true,
      };
      const runtime = createMockRuntime({ PTY_SERVICE_CONFIG: customConfig });
      const customService = await PTYService.start(
        runtime as unknown as IAgentRuntime,
      );
      expect(customService).toBeInstanceOf(PTYService);
    });
  });

  describe("session management", () => {
    it("should spawn a session", async () => {
      const session = await service.spawnSession({
        name: "test-session",
        agentType: "shell",
        workdir: "/test/path",
      });

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^session-\d+$/);
      expect(session.agentType).toBe("shell");
      expect(session.workdir).toBe("/test/path");
      expect(session.status).toBe("running");
    });

    it("should spawn session with initial task", async () => {
      // Spawn returns "ready" so the deferred task path fires immediately
      mockManager.spawn.mockImplementation(() =>
        Promise.resolve({
          id: `session-${++sessionCounter}`,
          name: "test-session",
          type: "shell",
          status: "ready",
          startedAt: new Date(),
          lastActivityAt: new Date(),
        }),
      );

      const session = await service.spawnSession({
        name: "test-session",
        agentType: "shell",
        workdir: "/test/path",
        initialTask: "Fix the bug",
      });

      expect(session).toBeDefined();
      expect(session.status).toBe("ready");

      // The initial task is deferred via setTimeout(300ms) settle delay
      await new Promise((r) => setTimeout(r, 400));
      expect(mockManager.send).toHaveBeenCalledWith(session.id, "Fix the bug");
    });

    it("should track session metadata", async () => {
      const session = await service.spawnSession({
        name: "test-session",
        agentType: "shell",
        workdir: "/test",
        metadata: { userId: "user-123", taskId: "task-456" },
      });

      expect(session.metadata).toEqual({
        userId: "user-123",
        taskId: "task-456",
        requestedType: "shell",
        agentType: "shell",
      });
    });

    it("should get session by ID", async () => {
      const spawned = await service.spawnSession({
        name: "test-session",
        agentType: "shell",
        workdir: "/test",
      });

      const retrieved = service.getSession(spawned.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(spawned.id);
    });

    it("should return undefined for unknown session", () => {
      mockManager.get.mockReturnValueOnce(undefined);
      const session = service.getSession("unknown-id");
      expect(session).toBeUndefined();
    });

    it("should list all sessions", async () => {
      // Mock list to return sessions after spawning
      mockManager.list.mockReturnValue([
        { id: "session-1", name: "a", type: "shell", status: "running" },
        { id: "session-2", name: "b", type: "shell", status: "running" },
      ]);

      await service.spawnSession({
        name: "a",
        agentType: "shell",
        workdir: "/a",
      });
      await service.spawnSession({
        name: "b",
        agentType: "shell",
        workdir: "/b",
      });

      const sessions = await service.listSessions();
      expect(sessions.length).toBe(2);
    });

    it("should stop a session", async () => {
      const session = await service.spawnSession({
        name: "test-session",
        agentType: "shell",
        workdir: "/test",
      });

      await service.stopSession(session.id);

      expect(mockManager.stop).toHaveBeenCalledWith(session.id);
    });

    it("should throw when stopping unknown session", async () => {
      mockManager.get.mockReturnValueOnce(undefined);
      await expect(service.stopSession("unknown-id")).rejects.toThrow();
    });
  });

  describe("session interaction", () => {
    it("should send input to session", async () => {
      const session = await service.spawnSession({
        name: "test-session",
        agentType: "shell",
        workdir: "/test",
      });

      await service.sendToSession(session.id, "hello");
      expect(mockManager.send).toHaveBeenCalledWith(session.id, "hello");
    });

    it("should throw when sending to unknown session", async () => {
      mockManager.get.mockReturnValueOnce(undefined);
      await expect(
        service.sendToSession("unknown-id", "hello"),
      ).rejects.toThrow();
    });

    it("should send keys to session", async () => {
      const session = await service.spawnSession({
        name: "test-session",
        agentType: "shell",
        workdir: "/test",
      });

      const mockSendKeys = jest.fn();
      mockManager.getSession.mockReturnValueOnce({ sendKeys: mockSendKeys });

      await service.sendKeysToSession(session.id, "Enter");
      expect(mockSendKeys).toHaveBeenCalledWith("Enter");
    });

    it("should get session output", async () => {
      const session = await service.spawnSession({
        name: "test-session",
        agentType: "shell",
        workdir: "/test",
      });

      const output = await service.getSessionOutput(session.id);
      expect(output).toContain("mock output");
    });
  });

  describe("session status", () => {
    it("should track blocked status", async () => {
      const session = await service.spawnSession({
        name: "test-session",
        agentType: "shell",
        workdir: "/test",
      });

      expect(service.isSessionBlocked(session.id)).toBe(false);
    });

    it("should return false for unknown session blocked check", () => {
      expect(service.isSessionBlocked("unknown-id")).toBe(false);
    });

    it("should include pi in supported agent types", () => {
      expect(service.getSupportedAgentTypes()).toContain("pi");
    });
  });

  describe("event handling", () => {
    it("should register event callbacks", async () => {
      const callback = jest.fn();
      service.onSessionEvent(callback);

      // Callback should be registered (not called yet)
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("adapter registration", () => {
    it("should register custom adapters", async () => {
      const customAdapter = { type: "custom" };

      expect(() => service.registerAdapter(customAdapter)).not.toThrow();
      expect(mockManager.registerAdapter).toHaveBeenCalledWith(customAdapter);
    });
  });
});
