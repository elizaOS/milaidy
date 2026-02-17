import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MiladyClient } from "../../src/api-client";

function buildSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function buildControlledSseResponse(initialChunk: string): {
  response: Response;
  push: (chunk: string) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | null =
    null;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      controller.enqueue(encoder.encode(initialChunk));
    },
  });

  return {
    response: new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    push: (chunk: string) => {
      if (!streamController) throw new Error("SSE stream controller missing");
      streamController.enqueue(encoder.encode(chunk));
    },
    close: () => {
      streamController?.close();
    },
  };
}

describe("MiladyClient streaming chat endpoints", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("streams conversation tokens and returns done payload", async () => {
    fetchMock.mockResolvedValue(
      buildSseResponse([
        'data: {"type":"token","text":"Hello "}\n\n',
        'data: {"type":"token","text":"world"}\n\n',
        'data: {"type":"done","fullText":"Hello world","agentName":"Milady"}\n\n',
      ]),
    );

    const client = new MiladyClient("http://localhost:2138", "token");
    const tokens: string[] = [];
    const result = await client.sendConversationMessageStream(
      "conv-1",
      "hi",
      (token) => {
        tokens.push(token);
      },
      "power",
    );

    expect(tokens).toEqual(["Hello ", "world"]);
    expect(result).toEqual({ text: "Hello world", agentName: "Milady" });

    const firstCall = fetchMock.mock.calls[0];
    const requestUrl = String(firstCall[0]);
    const requestInit = firstCall[1] as RequestInit;
    const requestHeaders = requestInit.headers as Record<string, string>;

    expect(requestUrl).toBe(
      "http://localhost:2138/api/conversations/conv-1/messages/stream",
    );
    expect(requestInit.method).toBe("POST");
    expect(requestHeaders.Accept).toBe("text/event-stream");
    expect(requestHeaders.Authorization).toBe("Bearer token");
    expect(requestInit.body).toBe(
      JSON.stringify({ text: "hi", channelType: "power" }),
    );
  });

  test("supports legacy SSE payloads containing only text", async () => {
    fetchMock.mockResolvedValue(
      buildSseResponse(['data: {"text":"A"}\n\n', 'data: {"text":"B"}\n\n']),
    );

    const client = new MiladyClient("http://localhost:2138");
    const tokens: string[] = [];
    const result = await client.sendChatStream(
      "legacy",
      (token) => {
        tokens.push(token);
      },
      "simple",
    );

    expect(tokens).toEqual(["A", "B"]);
    expect(result).toEqual({ text: "AB", agentName: "Milady" });
  });

  test("streams CRLF-delimited SSE events before stream completion", async () => {
    const controlled = buildControlledSseResponse(
      'data: {"type":"token","text":"Hello"}\r\n\r\n',
    );
    fetchMock.mockResolvedValue(controlled.response);

    const client = new MiladyClient("http://localhost:2138");
    const tokens: string[] = [];

    const pending = client.sendConversationMessageStream(
      "conv-crlf",
      "hi",
      (token) => {
        tokens.push(token);
      },
    );

    await vi.waitFor(() => {
      expect(tokens).toEqual(["Hello"]);
    });

    controlled.push(
      'data: {"type":"done","fullText":"Hello","agentName":"Milady"}\r\n\r\n',
    );
    controlled.close();

    await expect(pending).resolves.toEqual({
      text: "Hello",
      agentName: "Milady",
    });
  });

  test("throws when SSE emits an error payload", async () => {
    fetchMock.mockResolvedValue(
      buildSseResponse([
        'data: {"type":"error","message":"stream failed"}\n\n',
      ]),
    );

    const client = new MiladyClient("http://localhost:2138");
    await expect(
      client.sendChatStream("boom", () => {}, "simple"),
    ).rejects.toThrow("stream failed");
  });
});
