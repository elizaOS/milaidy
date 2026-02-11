import { type IAgentRuntime, ModelType } from "@elizaos/core";
import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";

const streamMock = vi.hoisted(() => vi.fn());

vi.mock("@mariozechner/pi-ai", () => {
  return {
    // Keep alias registration deterministic for tests.
    getProviders: () => [],
    stream: (...args: unknown[]) => streamMock(...args),
  };
});

import { registerPiAiModelHandler } from "./pi-ai-model-handler.js";

function createDummyModel(): Model<Api> {
  return {
    id: "dummy-model",
    name: "Dummy",
    api: "openai-responses",
    provider: "openai",
    baseUrl: "http://localhost",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1,
    maxTokens: 1,
  };
}

function createEventStream(events: Array<Record<string, unknown>>) {
  return (async function* () {
    for (const event of events) yield event;
  })();
}

describe("registerPiAiModelHandler", () => {
  it("registers handlers for TEXT_LARGE and TEXT_SMALL", () => {
    const calls: Array<{
      modelType: string;
      provider: string;
      priority: number;
    }> = [];

    const runtime = {
      registerModel: (
        modelType: string,
        _handler: unknown,
        provider: string,
        priority?: number,
      ) => {
        calls.push({ modelType, provider, priority: priority ?? 0 });
      },
    } as unknown as IAgentRuntime;

    registerPiAiModelHandler(runtime, {
      largeModel: createDummyModel(),
      smallModel: createDummyModel(),
    });

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelType: ModelType.TEXT_LARGE,
          provider: "pi-ai",
        }),
        expect.objectContaining({
          modelType: ModelType.TEXT_SMALL,
          provider: "pi-ai",
        }),
      ]),
    );
  });

  it("aggregates text deltas even when streaming is not requested", async () => {
    streamMock.mockReset();

    type LargeHandler = (
      rt: IAgentRuntime,
      p: Record<string, unknown>,
    ) => Promise<unknown>;

    let largeHandler: LargeHandler | null = null;

    const runtime = {
      registerModel: (
        modelType: string,
        handler: unknown,
        provider: string,
      ) => {
        if (modelType === ModelType.TEXT_LARGE && provider === "pi-ai") {
          largeHandler = handler as LargeHandler;
        }
      },
    } as unknown as IAgentRuntime;

    registerPiAiModelHandler(runtime, {
      largeModel: createDummyModel(),
      smallModel: createDummyModel(),
    });

    streamMock.mockReturnValueOnce(
      createEventStream([
        { type: "text_delta", delta: "<response>" },
        { type: "text_delta", delta: "ok" },
        { type: "text_delta", delta: "</response>" },
      ]),
    );

    expect(largeHandler).toBeTypeOf("function");
    if (!largeHandler) throw new Error("Expected TEXT_LARGE handler");

    const out = await largeHandler(runtime, { prompt: "hello" });
    expect(out).toBe("<response>ok</response>");
  });

  it("forwards text deltas to onStreamChunk when provided", async () => {
    streamMock.mockReset();

    type LargeHandler = (
      rt: IAgentRuntime,
      p: Record<string, unknown>,
    ) => Promise<unknown>;

    let largeHandler: LargeHandler | null = null;

    const runtime = {
      registerModel: (
        modelType: string,
        handler: unknown,
        provider: string,
      ) => {
        if (modelType === ModelType.TEXT_LARGE && provider === "pi-ai") {
          largeHandler = handler as LargeHandler;
        }
      },
    } as unknown as IAgentRuntime;

    registerPiAiModelHandler(runtime, {
      largeModel: createDummyModel(),
      smallModel: createDummyModel(),
    });

    streamMock.mockReturnValueOnce(
      createEventStream([
        { type: "text_delta", delta: "a" },
        { type: "text_delta", delta: "b" },
      ]),
    );

    const onStreamChunk = vi.fn(async (_chunk: string) => {});

    expect(largeHandler).toBeTypeOf("function");
    if (!largeHandler) throw new Error("Expected TEXT_LARGE handler");

    const out = await largeHandler(runtime, {
      prompt: "hello",
      onStreamChunk,
    });

    expect(out).toBe("ab");
    expect(onStreamChunk).toHaveBeenCalledTimes(2);
    expect(onStreamChunk).toHaveBeenNthCalledWith(1, "a");
    expect(onStreamChunk).toHaveBeenNthCalledWith(2, "b");
  });
});
