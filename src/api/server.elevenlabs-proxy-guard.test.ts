import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithTimeoutGuard,
  streamResponseBodyWithByteLimit,
} from "./server";

class MockStreamResponseWriter extends EventEmitter {
  readonly chunks: Buffer[] = [];
  writableEnded = false;
  destroyed = false;

  write(chunk: Uint8Array | Buffer): boolean {
    this.chunks.push(Buffer.from(chunk));
    return true;
  }

  bytes(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

function asStreamableResponse(
  writer: MockStreamResponseWriter,
): Parameters<typeof streamResponseBodyWithByteLimit>[1] {
  return writer as unknown as Parameters<
    typeof streamResponseBodyWithByteLimit
  >[1];
}

describe("ElevenLabs proxy guards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("rejects oversized responses from declared content-length", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-length": "11" },
    });
    const writer = new MockStreamResponseWriter();

    await expect(
      streamResponseBodyWithByteLimit(
        response,
        asStreamableResponse(writer),
        10,
      ),
    ).rejects.toThrow("Upstream response exceeds maximum size of 10 bytes");
  });

  it("rejects oversized streamed responses when content-length is absent", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(8));
          controller.enqueue(new Uint8Array(8));
          controller.close();
        },
      }),
    );
    const writer = new MockStreamResponseWriter();

    await expect(
      streamResponseBodyWithByteLimit(
        response,
        asStreamableResponse(writer),
        10,
      ),
    ).rejects.toThrow("Upstream response exceeds maximum size of 10 bytes");
  });

  it("streams bounded upstream responses without buffering the full payload", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.from([1, 2, 3]));
          controller.enqueue(Uint8Array.from([4, 5]));
          controller.close();
        },
      }),
    );
    const writer = new MockStreamResponseWriter();

    await expect(
      streamResponseBodyWithByteLimit(
        response,
        asStreamableResponse(writer),
        10,
      ),
    ).resolves.toBe(5);
    expect(writer.bytes()).toEqual(Buffer.from([1, 2, 3, 4, 5]));
  });

  it("times out upstream fetches", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal;
        return await new Promise<Response>((_resolve, reject) => {
          if (!signal) {
            reject(new Error("Missing abort signal"));
            return;
          }
          if (signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal.addEventListener(
            "abort",
            () => {
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      },
    );

    const pending = fetchWithTimeoutGuard("https://example.com/tts", {}, 250);
    vi.advanceTimersByTime(250);

    await expect(pending).rejects.toMatchObject({
      message: "Upstream request timed out after 250ms",
      name: "TimeoutError",
    });
  });

  it("times out stalled upstream body streams", async () => {
    vi.useFakeTimers();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start() {
          // Intentionally stall without enqueueing or closing.
        },
      }),
    );
    const writer = new MockStreamResponseWriter();

    const pending = streamResponseBodyWithByteLimit(
      response,
      asStreamableResponse(writer),
      1024,
      250,
    );
    vi.advanceTimersByTime(250);

    await expect(pending).rejects.toMatchObject({
      message: "Upstream response body timed out after 250ms",
      name: "TimeoutError",
    });
  });
});
