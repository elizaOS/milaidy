import { type IAgentRuntime, ModelType } from "@elizaos/core";
import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";

import { createModelRegistrationContext } from "../test-support/test-helpers.js";
import { registerPiAiModelHandler } from "./pi-ai-model-handler.js";

const streamMock = vi.hoisted(() => vi.fn());

vi.mock("@mariozechner/pi-ai", () => ({
  // Keep alias registration deterministic for tests.
  getProviders: () => [],
  stream: (...args: unknown[]) => streamMock(...args),
}));

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

type LargeHandler = (
  rt: IAgentRuntime,
  p: Record<string, unknown>,
) => Promise<unknown>;

describe("registerPiAiModelHandler", () => {
  it("registers handlers for TEXT_LARGE and TEXT_SMALL", () => {
    const modelContext = createModelRegistrationContext();

    registerPiAiModelHandler(modelContext.runtime as IAgentRuntime, {
      largeModel: createDummyModel(),
      smallModel: createDummyModel(),
    });

    expect(modelContext.calls).toEqual(
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

    const modelContext = createModelRegistrationContext();
    registerPiAiModelHandler(modelContext.runtime as IAgentRuntime, {
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

    const handler = modelContext.getLargeHandler();
    expect(handler).toBeTypeOf("function");
    if (!handler) throw new Error("Expected TEXT_LARGE handler");

    const out = await (handler as LargeHandler)(
      modelContext.runtime as IAgentRuntime,
      { prompt: "hello" },
    );
    expect(out).toBe("<response>ok</response>");
  });

  it("forwards text deltas to onStreamChunk when provided", async () => {
    streamMock.mockReset();

    const modelContext = createModelRegistrationContext();
    registerPiAiModelHandler(modelContext.runtime as IAgentRuntime, {
      largeModel: createDummyModel(),
      smallModel: createDummyModel(),
    });

    streamMock.mockReturnValueOnce(
      createEventStream([
        { type: "text_delta", delta: "a" },
        { type: "text_delta", delta: "b" },
      ]),
    );

    const handler = modelContext.getLargeHandler();
    const onStreamChunk = vi.fn(async (_chunk: string) => {});
    expect(handler).toBeTypeOf("function");
    if (!handler) throw new Error("Expected TEXT_LARGE handler");

    const out = await (handler as LargeHandler)(
      modelContext.runtime as IAgentRuntime,
      {
        prompt: "hello",
        onStreamChunk,
      },
    );

    expect(out).toBe("ab");
    expect(onStreamChunk).toHaveBeenCalledTimes(2);
    expect(onStreamChunk).toHaveBeenNthCalledWith(1, "a");
    expect(onStreamChunk).toHaveBeenNthCalledWith(2, "b");
  });
});
