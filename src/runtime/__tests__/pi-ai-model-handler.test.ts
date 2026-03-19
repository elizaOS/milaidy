import type { Api, Model } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStream = vi.fn();

vi.mock("@mariozechner/pi-ai", () => ({
  stream: (...args: unknown[]) => mockStream(...args),
  getProviders: () => ["anthropic", "openai"],
  getModel: (provider: string, id: string) => ({ provider, id }),
}));

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    ModelType: {
      TEXT_LARGE: "TEXT_LARGE",
      TEXT_SMALL: "TEXT_SMALL",
      TEXT_REASONING_LARGE: "TEXT_REASONING_LARGE",
      TEXT_REASONING_SMALL: "TEXT_REASONING_SMALL",
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeModel(
  provider = "anthropic",
  id = "claude-sonnet-4-20250514",
): Model<Api> {
  return { provider, id } as Partial<Model<Api>> as Model<Api>;
}

function fakeRuntime() {
  return {
    registerModel: vi.fn(),
    emitEvent: vi.fn(),
  };
}

/** Create an async iterable from an array of pi-ai stream events. */
async function* iterableFromEvents(events: unknown[]) {
  for (const e of events) {
    yield e;
  }
}

// ---------------------------------------------------------------------------
// Tests — createPiAiHandler (stream module)
// ---------------------------------------------------------------------------

import { createPiAiHandler } from "../pi-ai-model-handler-stream.js";

describe("createPiAiHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Non-streaming aggregation path ----

  describe("non-streaming aggregation path", () => {
    it("aggregates text_delta events into a plain string", async () => {
      const events = [
        { type: "text_delta", delta: "Hello" },
        { type: "text_delta", delta: " world" },
        {
          type: "done",
          reason: "stop",
          message: { usage: { input: 10, output: 5, totalTokens: 15 } },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {});
      const runtime = fakeRuntime();

      const result = await handler(
        runtime as unknown,
        {
          prompt: "Say hello",
        } as unknown,
      );

      expect(result).toBe("Hello world");
    });

    it("emits MODEL_USED on done event", async () => {
      const events = [
        { type: "text_delta", delta: "ok" },
        {
          type: "done",
          reason: "stop",
          message: { usage: { input: 10, output: 2, totalTokens: 12 } },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {});
      const runtime = fakeRuntime();

      await handler(runtime as unknown, { prompt: "test" } as unknown);

      expect(runtime.emitEvent).toHaveBeenCalledWith(
        "MODEL_USED",
        expect.objectContaining({
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          tokens: expect.objectContaining({
            prompt: 10,
            completion: 2,
            total: 12,
          }),
        }),
      );
    });

    it("returns partial text on abort error event", async () => {
      const events = [
        { type: "text_delta", delta: "partial" },
        {
          type: "error",
          reason: "aborted",
          error: { errorMessage: "User cancelled" },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {});
      const runtime = fakeRuntime();

      const result = await handler(
        runtime as unknown,
        {
          prompt: "test",
        } as unknown,
      );

      expect(result).toBe("partial");
    });

    it("throws on non-abort error event", async () => {
      const events = [
        {
          type: "error",
          reason: "model_error",
          error: { errorMessage: "Rate limited" },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {});
      const runtime = fakeRuntime();

      await expect(
        handler(runtime as unknown, { prompt: "test" } as unknown),
      ).rejects.toThrow("pi-ai stream() failed");
    });

    it("wraps stream() failures in a descriptive error", async () => {
      mockStream.mockReturnValueOnce(
        // biome-ignore lint/correctness/useYield: generator throws before yielding to test error wrapping
        (async function* () {
          throw new Error("Connection timeout");
        })(),
      );

      const handler = createPiAiHandler(() => fakeModel(), {});
      const runtime = fakeRuntime();

      await expect(
        handler(runtime as unknown, { prompt: "test" } as unknown),
      ).rejects.toThrow(/pi-ai stream\(\) failed.*Connection timeout/);
    });
  });

  // ---- TextStreamResult path (streaming) ----

  describe("TextStreamResult path", () => {
    it("returns a TextStreamResult when stream=true and returnTextStreamResult=true", async () => {
      const events = [
        { type: "text_delta", delta: "Hello" },
        { type: "text_delta", delta: " stream" },
        {
          type: "done",
          reason: "stop",
          message: { usage: { input: 8, output: 4, totalTokens: 12 } },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {
        returnTextStreamResult: true,
      });
      const runtime = fakeRuntime();

      const result = (await handler(
        runtime as unknown,
        {
          prompt: "test",
          stream: true,
        } as unknown,
      )) as {
        textStream: AsyncGenerator<string>;
        text: Promise<string>;
        usage: Promise<unknown>;
        finishReason: Promise<string | undefined>;
      };

      // Must have the TextStreamResult shape
      expect(result.textStream).toBeDefined();
      expect(result.text).toBeInstanceOf(Promise);
      expect(result.usage).toBeInstanceOf(Promise);
      expect(result.finishReason).toBeInstanceOf(Promise);

      // Consume the stream
      const chunks: string[] = [];
      for await (const chunk of result.textStream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["Hello", " stream"]);
      expect(await result.text).toBe("Hello stream");
      expect(await result.usage).toEqual({
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
      });
      expect(await result.finishReason).toBe("stop");
    });

    it("emits stream events for token and thinking deltas", async () => {
      const onStreamEvent = vi.fn();
      const events = [
        { type: "thinking_delta", delta: "Let me think..." },
        { type: "text_delta", delta: "answer" },
        {
          type: "done",
          reason: "stop",
          message: { usage: { input: 5, output: 3, totalTokens: 8 } },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {
        returnTextStreamResult: true,
        onStreamEvent,
      });
      const runtime = fakeRuntime();

      const result = (await handler(
        runtime as unknown,
        {
          prompt: "test",
          stream: true,
        } as unknown,
      )) as { textStream: AsyncGenerator<string> };

      // Drain the stream
      for await (const _chunk of result.textStream) {
        // consume
      }

      // Verify events were emitted
      expect(onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "thinking", text: "Let me think..." }),
      );
      expect(onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "token", text: "answer" }),
      );
      expect(onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "done" }),
      );
    });

    it("handles abort in TextStreamResult path gracefully", async () => {
      const onStreamEvent = vi.fn();
      const events = [
        { type: "text_delta", delta: "partial" },
        {
          type: "error",
          reason: "aborted",
          error: { errorMessage: "User cancelled" },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {
        returnTextStreamResult: true,
        onStreamEvent,
      });
      const runtime = fakeRuntime();

      const result = (await handler(
        runtime as unknown,
        {
          prompt: "test",
          stream: true,
        } as unknown,
      )) as {
        textStream: AsyncGenerator<string>;
        text: Promise<string>;
        finishReason: Promise<string | undefined>;
      };

      const chunks: string[] = [];
      for await (const chunk of result.textStream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["partial"]);
      expect(await result.text).toBe("partial");
      expect(await result.finishReason).toBe("aborted");

      // Should emit done with reason, not error
      expect(onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "done", reason: "aborted" }),
      );
    });
  });

  // ---- Streaming with onStreamChunk (TUI path) ----

  describe("streaming with onStreamChunk / forceStreaming", () => {
    it("calls onStreamChunk and returns aggregated string", async () => {
      const onStreamChunk = vi.fn();
      const events = [
        { type: "text_delta", delta: "Hello" },
        { type: "text_delta", delta: " TUI" },
        {
          type: "done",
          reason: "stop",
          message: { usage: { input: 5, output: 3, totalTokens: 8 } },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {
        forceStreaming: true,
      });
      const runtime = fakeRuntime();

      const result = await handler(
        runtime as unknown,
        {
          prompt: "test",
          onStreamChunk,
        } as unknown,
      );

      expect(result).toBe("Hello TUI");
      expect(onStreamChunk).toHaveBeenCalledWith("Hello");
      expect(onStreamChunk).toHaveBeenCalledWith(" TUI");
    });

    it("throws formatted error on non-abort stream error", async () => {
      const events = [
        { type: "text_delta", delta: "partial" },
        {
          type: "error",
          reason: "model_error",
          error: { errorMessage: "Server error" },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {
        forceStreaming: true,
      });
      const runtime = fakeRuntime();

      await expect(
        handler(
          runtime as unknown,
          {
            prompt: "test",
            onStreamChunk: vi.fn(),
          } as unknown,
        ),
      ).rejects.toThrow("pi-ai stream() failed");
    });
  });

  // ---- Abort signal extraction ----

  describe("abort signal handling", () => {
    it("passes getAbortSignal to stream options", async () => {
      const controller = new AbortController();
      const events = [
        { type: "text_delta", delta: "ok" },
        {
          type: "done",
          reason: "stop",
          message: { usage: { input: 1, output: 1, totalTokens: 2 } },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {
        getAbortSignal: () => controller.signal,
      });
      const runtime = fakeRuntime();

      await handler(runtime as unknown, { prompt: "test" } as unknown);

      // Verify stream was called with signal in options (last arg)
      const signalCallArgs =
        mockStream.mock.calls[mockStream.mock.calls.length - 1];
      const signalOptionsArg = signalCallArgs[signalCallArgs.length - 1];
      expect(signalOptionsArg).toHaveProperty("signal", controller.signal);
    });

    it("extracts abortSignal from params as fallback", async () => {
      const controller = new AbortController();
      const events = [
        { type: "text_delta", delta: "ok" },
        {
          type: "done",
          reason: "stop",
          message: { usage: { input: 1, output: 1, totalTokens: 2 } },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {});
      const runtime = fakeRuntime();

      await handler(
        runtime as unknown,
        {
          prompt: "test",
          abortSignal: controller.signal,
        } as unknown,
      );

      const fbCallArgs =
        mockStream.mock.calls[mockStream.mock.calls.length - 1];
      const fbOptionsArg = fbCallArgs[fbCallArgs.length - 1];
      expect(fbOptionsArg).toHaveProperty("signal", controller.signal);
    });
  });

  // ---- emitModelUsed no-throw guarantee ----

  describe("emitModelUsed no-throw guarantee", () => {
    it("does not throw when emitEvent throws", async () => {
      const events = [
        { type: "text_delta", delta: "ok" },
        {
          type: "done",
          reason: "stop",
          message: { usage: { input: 1, output: 1, totalTokens: 2 } },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {});
      const runtime = fakeRuntime();
      runtime.emitEvent.mockImplementation(() => {
        throw new Error("emitEvent exploded");
      });

      // Should not throw despite emitEvent failure
      const result = await handler(
        runtime as unknown,
        {
          prompt: "test",
        } as unknown,
      );

      expect(result).toBe("ok");
    });

    it("does not throw when emitEvent is missing", async () => {
      const events = [
        { type: "text_delta", delta: "ok" },
        {
          type: "done",
          reason: "stop",
          message: { usage: { input: 1, output: 1, totalTokens: 2 } },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {});
      // Runtime without emitEvent
      const runtime = { registerModel: vi.fn() };

      const result = await handler(
        runtime as unknown,
        {
          prompt: "test",
        } as unknown,
      );

      expect(result).toBe("ok");
    });
  });

  // ---- API key resolution ----

  describe("API key resolution", () => {
    it("passes apiKey from getApiKey to stream options", async () => {
      const events = [
        { type: "text_delta", delta: "ok" },
        {
          type: "done",
          reason: "stop",
          message: { usage: { input: 1, output: 1, totalTokens: 2 } },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {
        getApiKey: async () => "test-api-key",
      });
      const runtime = fakeRuntime();

      await handler(runtime as unknown, { prompt: "test" } as unknown);

      const apiKeyCallArgs =
        mockStream.mock.calls[mockStream.mock.calls.length - 1];
      const apiKeyOptionsArg = apiKeyCallArgs[apiKeyCallArgs.length - 1];
      expect(apiKeyOptionsArg).toHaveProperty("apiKey", "test-api-key");
    });

    it("omits apiKey from stream options when getApiKey returns undefined", async () => {
      const events = [
        { type: "text_delta", delta: "ok" },
        {
          type: "done",
          reason: "stop",
          message: { usage: { input: 1, output: 1, totalTokens: 2 } },
        },
      ];
      mockStream.mockReturnValueOnce(iterableFromEvents(events));

      const handler = createPiAiHandler(() => fakeModel(), {
        getApiKey: async () => undefined,
      });
      const runtime = fakeRuntime();

      await handler(runtime as unknown, { prompt: "test" } as unknown);

      const noKeyCallArgs =
        mockStream.mock.calls[mockStream.mock.calls.length - 1];
      const noKeyOptionsArg = noKeyCallArgs[noKeyCallArgs.length - 1];
      expect(noKeyOptionsArg).not.toHaveProperty("apiKey");
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — registerPiAiModelHandler
// ---------------------------------------------------------------------------

import { registerPiAiModelHandler } from "../pi-ai-model-handler.js";

describe("registerPiAiModelHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers handlers for TEXT_LARGE, TEXT_SMALL, TEXT_REASONING_LARGE, TEXT_REASONING_SMALL for each alias", () => {
    const runtime = fakeRuntime();
    const large = fakeModel("anthropic", "large-model");
    const small = fakeModel("anthropic", "small-model");

    registerPiAiModelHandler(runtime as unknown, {
      largeModel: large,
      smallModel: small,
      providerName: "pi-ai",
    });

    // Should register 4 model types * (pi-ai + anthropic + openai from getProviders)
    const calls = runtime.registerModel.mock.calls;
    const aliases = new Set(calls.map((c: unknown[]) => c[2]));
    expect(aliases).toContain("pi-ai");
    expect(aliases).toContain("anthropic");
    expect(aliases).toContain("openai");

    const types = new Set(calls.map((c: unknown[]) => c[0]));
    expect(types).toContain("TEXT_LARGE");
    expect(types).toContain("TEXT_SMALL");
    expect(types).toContain("TEXT_REASONING_LARGE");
    expect(types).toContain("TEXT_REASONING_SMALL");
  });

  it("returns a controller that can get/set models", () => {
    const runtime = fakeRuntime();
    const large = fakeModel("anthropic", "large");
    const small = fakeModel("anthropic", "small");

    const ctrl = registerPiAiModelHandler(runtime as unknown, {
      largeModel: large,
      smallModel: small,
    });

    expect(ctrl.getLargeModel()).toBe(large);
    expect(ctrl.getSmallModel()).toBe(small);

    const newLarge = fakeModel("openai", "gpt-5");
    ctrl.setLargeModel(newLarge);
    expect(ctrl.getLargeModel()).toBe(newLarge);

    const newSmall = fakeModel("openai", "gpt-5-mini");
    ctrl.setSmallModel(newSmall);
    expect(ctrl.getSmallModel()).toBe(newSmall);
  });

  it("includes providerAliases in registration", () => {
    const runtime = fakeRuntime();

    registerPiAiModelHandler(runtime as unknown, {
      largeModel: fakeModel(),
      smallModel: fakeModel(),
      providerName: "pi-ai",
      providerAliases: ["custom-alias"],
    });

    const aliases = new Set(
      runtime.registerModel.mock.calls.map((c: unknown[]) => c[2]),
    );
    expect(aliases).toContain("custom-alias");
  });

  it("uses custom priority", () => {
    const runtime = fakeRuntime();

    registerPiAiModelHandler(runtime as unknown, {
      largeModel: fakeModel(),
      smallModel: fakeModel(),
      priority: 999,
    });

    const priorities = runtime.registerModel.mock.calls.map(
      (c: unknown[]) => c[3],
    );
    expect(priorities.every((p: number) => p === 999)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — getPiModel / parseModelSpec (utils)
// ---------------------------------------------------------------------------

import {
  DEFAULT_PI_MODEL_SPEC,
  formatModelSpec,
  getPiModel,
  parseModelSpec,
} from "../../utils/pi-ai.js";

describe("getPiModel / parseModelSpec", () => {
  it("parseModelSpec splits provider/modelId correctly", () => {
    expect(parseModelSpec("anthropic/claude-sonnet-4-20250514")).toEqual({
      provider: "anthropic",
      id: "claude-sonnet-4-20250514",
    });
  });

  it("parseModelSpec handles model ids with slashes", () => {
    expect(parseModelSpec("openai/gpt-5/turbo")).toEqual({
      provider: "openai",
      id: "gpt-5/turbo",
    });
  });

  it("parseModelSpec throws on invalid spec (no slash)", () => {
    expect(() => parseModelSpec("noSlash")).toThrow("Invalid model spec");
  });

  it("parseModelSpec throws on empty provider", () => {
    expect(() => parseModelSpec("/model")).toThrow("Invalid model spec");
  });

  it("formatModelSpec rounds-trips with parseModelSpec", () => {
    const spec = "anthropic/claude-sonnet-4-20250514";
    const parts = parseModelSpec(spec);
    expect(formatModelSpec(parts)).toBe(spec);
  });

  it("getPiModel returns a model object with provider and id", () => {
    const model = getPiModel("anthropic", "claude-sonnet-4-20250514");
    expect(model).toBeDefined();
    expect(model.provider).toBe("anthropic");
    expect(model.id).toBe("claude-sonnet-4-20250514");
  });

  it("DEFAULT_PI_MODEL_SPEC is a valid spec", () => {
    const parts = parseModelSpec(DEFAULT_PI_MODEL_SPEC);
    expect(parts.provider).toBeTruthy();
    expect(parts.id).toBeTruthy();
  });
});
