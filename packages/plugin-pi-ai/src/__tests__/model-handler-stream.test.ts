import { describe, expect, it } from "bun:test";
import type { GenerateTextParams, IAgentRuntime } from "@elizaos/core";
import type { Api, Model } from "@mariozechner/pi-ai";
import { createPiAiHandler } from "../model-handler-stream.ts";

const runtime = {} as IAgentRuntime;

function makeModel(): Model<Api> {
  return {
    provider: "anthropic",
    id: "claude-sonnet-4-20250514",
  } as Model<Api>;
}

describe("createPiAiHandler", () => {
  it("streams deltas, emits usage, and returns full text", async () => {
    const chunks: string[] = [];
    const streamEvents: string[] = [];

    const handler = createPiAiHandler(
      () => makeModel(),
      {
        onStreamEvent: (event) => {
          streamEvents.push(event.type);
        },
      },
      async function* () {
        yield { type: "text_delta", delta: "hello " };
        yield { type: "text_delta", delta: "world" };
        yield {
          type: "done",
          reason: "stop",
          message: { usage: { input: 10, output: 2, totalTokens: 12 } },
        };
      },
    );

    const result = await handler(runtime, {
      prompt: "hi",
      stream: true,
      onStreamChunk: async (chunk: string) => {
        chunks.push(chunk);
      },
    } as unknown as Record<string, object | string | number | boolean>);

    expect(result).toBe("hello world");
    expect(chunks).toEqual(["hello ", "world"]);
    expect(streamEvents).toContain("token");
    expect(streamEvents).toContain("usage");
    expect(streamEvents).toContain("done");
  });

  it("propagates abort signal into stream options", async () => {
    const ac = new AbortController();
    let seenSignal: AbortSignal | undefined;

    const handler = createPiAiHandler(
      () => makeModel(),
      {
        getAbortSignal: () => ac.signal,
      },
      async function* (_model, _context, opts) {
        seenSignal = opts.signal;
        yield { type: "text_delta", delta: "ok" };
      },
    );

    const result = await handler(runtime, {
      prompt: "test",
    } as GenerateTextParams as unknown as Record<
      string,
      object | string | number | boolean
    >);

    expect(result).toBe("ok");
    expect(seenSignal).toBe(ac.signal);
  });

  it("wraps thrown stream errors with provider/model context", async () => {
    const handler = createPiAiHandler(
      () => makeModel(),
      {},
      async function* () {
        throw new Error("network down");
      },
    );

    await expect(
      handler(runtime, {
        prompt: "test",
      } as GenerateTextParams as unknown as Record<
        string,
        object | string | number | boolean
      >),
    ).rejects.toThrow("pi-ai stream() failed");
  });
});
