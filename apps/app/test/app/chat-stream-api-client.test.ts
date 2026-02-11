import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MilaidyClient } from "../../src/api-client";

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

describe("MilaidyClient streaming chat endpoints", () => {
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
        'data: {"type":"done","fullText":"Hello world","agentName":"Milaidy"}\n\n',
      ]),
    );

    const client = new MilaidyClient("http://localhost:2138", "token");
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
    expect(result).toEqual({ text: "Hello world", agentName: "Milaidy" });

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
    expect(requestInit.body).toBe(JSON.stringify({ text: "hi", mode: "power" }));
  });

  test("supports legacy SSE payloads containing only text", async () => {
    fetchMock.mockResolvedValue(
      buildSseResponse([
        'data: {"text":"A"}\n\n',
        'data: {"text":"B"}\n\n',
      ]),
    );

    const client = new MilaidyClient("http://localhost:2138");
    const tokens: string[] = [];
    const result = await client.sendChatStream(
      "legacy",
      (token) => {
        tokens.push(token);
      },
      "simple",
    );

    expect(tokens).toEqual(["A", "B"]);
    expect(result).toEqual({ text: "AB", agentName: "Milaidy" });
  });

  test("throws when SSE emits an error payload", async () => {
    fetchMock.mockResolvedValue(
      buildSseResponse(['data: {"type":"error","message":"stream failed"}\n\n']),
    );

    const client = new MilaidyClient("http://localhost:2138");
    await expect(
      client.sendChatStream(
        "boom",
        () => {},
        "simple",
      ),
    ).rejects.toThrow("stream failed");
  });
});
