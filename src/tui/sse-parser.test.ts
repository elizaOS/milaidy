import { describe, expect, it } from "vitest";
import {
  drainSseEvents,
  extractSseDataPayloads,
  parseConversationStreamPayload,
} from "./sse-parser";

describe("sse-parser", () => {
  it("handles LF-framed SSE events", () => {
    const input =
      'data: {"type":"token","text":"hello"}\n\n' +
      'data: {"type":"done","fullText":"hello"}\n\n' +
      'data: {"type":"token"';

    const drained = drainSseEvents(input);

    expect(drained.events).toHaveLength(2);
    expect(drained.remaining).toBe('data: {"type":"token"');

    const payloads = drained.events.flatMap(extractSseDataPayloads);
    expect(payloads).toEqual([
      '{"type":"token","text":"hello"}',
      '{"type":"done","fullText":"hello"}',
    ]);
  });

  it("handles CRLF-framed SSE events", () => {
    const input =
      'data: {"type":"token","text":"a"}\r\n\r\n' +
      'data: {"type":"done","fullText":"a"}\r\n\r\n';

    const drained = drainSseEvents(input);
    const payloads = drained.events.flatMap(extractSseDataPayloads);

    expect(drained.remaining).toBe("");
    expect(payloads).toEqual([
      '{"type":"token","text":"a"}',
      '{"type":"done","fullText":"a"}',
    ]);
  });

  it("keeps legacy payload compatibility for { text } chunks", () => {
    const parsed = parseConversationStreamPayload('{"text":"legacy chunk"}');

    expect(parsed?.type).toBeUndefined();
    expect(parsed?.text).toBe("legacy chunk");
  });
});
