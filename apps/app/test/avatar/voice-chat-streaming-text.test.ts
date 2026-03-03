import { describe, expect, it } from "vitest";
import { __voiceChatInternals } from "../../src/hooks/useVoiceChat";

const { remainderAfter, queueableSpeechPrefix } = __voiceChatInternals;

describe("useVoiceChat streaming text helpers", () => {
  it("returns only unseen suffix text when remainder grows", () => {
    expect(remainderAfter("alpha beta gamma", "alpha beta")).toBe("gamma");
  });

  it("does not replay full text when prefix matching fails", () => {
    expect(
      remainderAfter("canonical final response", "first streamed sentence."),
    ).toBe("");
  });

  it("queues only complete sentences before the final chunk", () => {
    expect(
      queueableSpeechPrefix(
        "second sentence done. third sentence still streaming",
        false,
      ),
    ).toBe("second sentence done.");
  });

  it("flushes all remaining text on the final chunk", () => {
    expect(
      queueableSpeechPrefix(
        "second sentence done. third sentence still streaming",
        true,
      ),
    ).toBe("second sentence done. third sentence still streaming");
  });

  it("falls back to a chunk for long text without punctuation", () => {
    const longText = [
      "this stream has no punctuation and keeps going with useful words",
      "so the speaker should not remain silent forever while waiting",
      "for a sentence boundary that never arrives during generation",
    ].join(" ");

    const queued = queueableSpeechPrefix(longText, false);
    expect(queued.length).toBeGreaterThan(80);
    expect(queued.length).toBeLessThan(longText.length);
  });
});
