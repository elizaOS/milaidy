import { describe, expect, it } from "vitest";
import { sanitizeSpeechText } from "./spoken-text";

describe("sanitizeSpeechText", () => {
  it("drops starred actions, bracketed asides, and URLs", () => {
    expect(
      sanitizeSpeechText(
        "Hello there (quietly). *waves* [off mic] Visit https://example.com now.",
      ),
    ).toBe("Hello there. Visit now.");
  });

  it("returns an empty string when nothing speakable remains", () => {
    expect(sanitizeSpeechText("*kisses you* (softly) {stage left}")).toBe("");
  });
});
