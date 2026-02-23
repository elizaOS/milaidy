/**
 * Stall classifier unit tests
 *
 * Tests prompt building, LLM-based classification, and snapshot writing.
 */
import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

// Mock modules BEFORE importing the classifier
mock.module("@elizaos/core", () => ({
  ModelType: { TEXT_SMALL: "text-small" },
}));

mock.module("pty-manager", () => ({
  extractTaskCompletionTraceRecords: () => [],
  buildTaskCompletionTimeline: () => ({}),
}));

// Dynamic import after mocks are registered
const {
  buildStallClassificationPrompt,
  classifyStallOutput,
  writeStallSnapshot,
} = await import("../services/stall-classifier.js");

const createMockMetrics = () => ({
  incrementStalls: jest.fn(),
  recordCompletion: jest.fn(),
  get: jest.fn().mockReturnValue({ spawned: 0, completed: 0, stalls: 0 }),
});

const createMockRuntime = () => ({
  useModel: jest.fn(),
  getSetting: jest.fn(),
});

describe("stall-classifier", () => {
  let mockRuntime: ReturnType<typeof createMockRuntime>;
  let mockMetrics: ReturnType<typeof createMockMetrics>;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
    mockMetrics = createMockMetrics();
  });

  describe("buildStallClassificationPrompt", () => {
    it("includes the output text in the prompt", () => {
      const prompt = buildStallClassificationPrompt(
        "claude",
        "s-1",
        "hello world",
      );
      expect(prompt).toContain("hello world");
    });

    it("includes agent type and session ID", () => {
      const prompt = buildStallClassificationPrompt("gemini", "s-42", "output");
      expect(prompt).toContain("gemini");
      expect(prompt).toContain("s-42");
    });

    it("returns a string containing classification instructions", () => {
      const prompt = buildStallClassificationPrompt("claude", "s-1", "output");
      expect(typeof prompt).toBe("string");
      expect(prompt).toContain("task_complete");
      expect(prompt).toContain("waiting_for_input");
      expect(prompt).toContain("still_working");
      expect(prompt).toContain("error");
    });
  });

  describe("classifyStallOutput", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock doesn't implement full interface
    const makeCtx = (overrides: Record<string, unknown> = {}): any => ({
      sessionId: "s-1",
      recentOutput: "A".repeat(300),
      agentType: "claude",
      buffers: new Map<string, string[]>(),
      traceEntries: [] as Array<string | Record<string, unknown>>,
      runtime: mockRuntime,
      manager: null,
      metricsTracker: mockMetrics,
      log: jest.fn(),
      ...overrides,
    });

    it("returns task_complete when LLM responds with that state", async () => {
      mockRuntime.useModel.mockResolvedValue('{"state":"task_complete"}');
      const result = await classifyStallOutput(makeCtx());
      expect(result).not.toBeNull();
      expect(result?.state).toBe("task_complete");
    });

    it("returns waiting_for_input with prompt and suggestedResponse", async () => {
      mockRuntime.useModel.mockResolvedValue(
        '{"state":"waiting_for_input","prompt":"Do you want to proceed?","suggestedResponse":"y"}',
      );
      const result = await classifyStallOutput(makeCtx());
      expect(result).not.toBeNull();
      expect(result?.state).toBe("waiting_for_input");
      expect(result?.prompt).toBe("Do you want to proceed?");
      expect(result?.suggestedResponse).toBe("y");
    });

    it("returns null when LLM responds with garbage (no JSON)", async () => {
      mockRuntime.useModel.mockResolvedValue("I have no idea what happened");
      const result = await classifyStallOutput(makeCtx());
      expect(result).toBeNull();
    });

    it("returns null when LLM responds with an invalid state", async () => {
      mockRuntime.useModel.mockResolvedValue('{"state":"bogus"}');
      const result = await classifyStallOutput(makeCtx());
      expect(result).toBeNull();
    });

    it("uses own buffer when recentOutput is short", async () => {
      mockRuntime.useModel.mockResolvedValue('{"state":"still_working"}');
      const buffers = new Map<string, string[]>();
      buffers.set("s-1", Array(50).fill("buffer line with content"));
      const ctx = makeCtx({ recentOutput: "short", buffers });
      await classifyStallOutput(ctx);
      const logFn = ctx.log as ReturnType<typeof jest.fn>;
      const bufferMsg = logFn.mock.calls.find(
        (c: unknown[]) =>
          typeof c[0] === "string" && c[0].includes("Using own buffer"),
      );
      expect(bufferMsg).toBeDefined();
    });

    it("calls metricsTracker.incrementStalls", async () => {
      mockRuntime.useModel.mockResolvedValue('{"state":"still_working"}');
      await classifyStallOutput(makeCtx());
      expect(mockMetrics.incrementStalls).toHaveBeenCalledWith("claude");
    });
  });

  describe("writeStallSnapshot", () => {
    it("does not throw (best-effort function)", async () => {
      await expect(
        writeStallSnapshot(
          "s-1",
          "claude",
          "recent output",
          "effective output",
          new Map<string, string[]>(),
          [],
          jest.fn(),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
