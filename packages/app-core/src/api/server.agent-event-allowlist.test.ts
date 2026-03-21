import { describe, expect, it } from "vitest";
import { AGENT_EVENT_ALLOWED_STREAMS } from "./server";

describe("AGENT_EVENT_ALLOWED_STREAMS", () => {
  it("includes core stream names", () => {
    for (const name of [
      "chat",
      "terminal",
      "game",
      "autonomy",
      "stream",
      "system",
    ]) {
      expect(AGENT_EVENT_ALLOWED_STREAMS.has(name)).toBe(true);
    }
  });

  it("includes retake plugin event streams so StreamView activity feed works", () => {
    // These are emitted by chat-poll.ts via emitRetakeEvent().
    // If any of these are removed, the retake StreamView will silently break.
    const retakeStreams = [
      "message",
      "new_viewer",
      "assistant",
      "thought",
      "action",
      "viewer_stats",
      "retake",
    ];
    for (const name of retakeStreams) {
      expect(
        AGENT_EVENT_ALLOWED_STREAMS.has(name),
        `"${name}" must be in AGENT_EVENT_ALLOWED_STREAMS — retake plugin emits to this stream`,
      ).toBe(true);
    }
  });

  it("rejects unknown stream names", () => {
    expect(AGENT_EVENT_ALLOWED_STREAMS.has("__proto__")).toBe(false);
    expect(AGENT_EVENT_ALLOWED_STREAMS.has("notARealStream")).toBe(false);
  });
});
