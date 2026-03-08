import type { AgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getKnowledgeService,
  getKnowledgeTimeoutMs,
} from "./knowledge-service-loader";

function makeRuntime(
  overrides: Partial<{
    getService: (name: string) => unknown;
    getServiceLoadPromise: (name: string) => Promise<void>;
  }> = {},
): AgentRuntime {
  return {
    getService: overrides.getService ?? (() => null),
    getServiceLoadPromise:
      overrides.getServiceLoadPromise ?? (() => new Promise(() => {})),
    ...overrides,
  } as unknown as AgentRuntime;
}

describe("getKnowledgeTimeoutMs", () => {
  afterEach(() => {
    delete process.env.KNOWLEDGE_SERVICE_TIMEOUT_MS;
  });

  it("returns 10000 by default", () => {
    expect(getKnowledgeTimeoutMs()).toBe(10_000);
  });

  it("respects env var override", () => {
    process.env.KNOWLEDGE_SERVICE_TIMEOUT_MS = "20000";
    expect(getKnowledgeTimeoutMs()).toBe(20_000);
  });

  it("clamps to max 60s", () => {
    process.env.KNOWLEDGE_SERVICE_TIMEOUT_MS = "120000";
    expect(getKnowledgeTimeoutMs()).toBe(60_000);
  });

  it("ignores invalid values", () => {
    process.env.KNOWLEDGE_SERVICE_TIMEOUT_MS = "abc";
    expect(getKnowledgeTimeoutMs()).toBe(10_000);
  });

  it("ignores zero/negative values", () => {
    process.env.KNOWLEDGE_SERVICE_TIMEOUT_MS = "0";
    expect(getKnowledgeTimeoutMs()).toBe(10_000);
    process.env.KNOWLEDGE_SERVICE_TIMEOUT_MS = "-5000";
    expect(getKnowledgeTimeoutMs()).toBe(10_000);
  });
});

describe("getKnowledgeService", () => {
  it("returns runtime_unavailable when runtime is null", async () => {
    const result = await getKnowledgeService(null);
    expect(result.service).toBeNull();
    expect(result.reason).toBe("runtime_unavailable");
  });

  it("returns service immediately when already loaded", async () => {
    const fakeService = { getKnowledge: vi.fn() };
    const runtime = makeRuntime({
      getService: (name: string) => (name === "knowledge" ? fakeService : null),
    });

    const result = await getKnowledgeService(runtime);
    expect(result.service).toBe(fakeService);
    expect(result.reason).toBeUndefined();
  });

  it("waits for service to load", async () => {
    const fakeService = { getKnowledge: vi.fn() };
    let callCount = 0;
    const runtime = makeRuntime({
      getService: (name: string) => {
        callCount++;
        if (name === "knowledge" && callCount > 1) return fakeService;
        return null;
      },
      getServiceLoadPromise: () => Promise.resolve(),
    });

    const result = await getKnowledgeService(runtime);
    expect(result.service).toBe(fakeService);
    expect(result.reason).toBeUndefined();
  });

  it("returns reason timeout when service load times out", async () => {
    vi.useFakeTimers();
    const runtime = makeRuntime({
      getService: () => null,
      getServiceLoadPromise: () => new Promise(() => {}),
    });

    const resultPromise = getKnowledgeService(runtime);
    await vi.advanceTimersByTimeAsync(11_000);
    const result = await resultPromise;

    expect(result.service).toBeNull();
    expect(result.reason).toBe("timeout");
    vi.useRealTimers();
  });

  it("returns not_registered when promise resolves but service still null", async () => {
    const runtime = makeRuntime({
      getService: () => null,
      getServiceLoadPromise: () => Promise.resolve(),
    });

    const result = await getKnowledgeService(runtime);
    expect(result.service).toBeNull();
    expect(result.reason).toBe("not_registered");
  });
});
