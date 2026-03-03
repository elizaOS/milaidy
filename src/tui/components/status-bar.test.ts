import { visibleWidth } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./status-bar.js";

describe("StatusBar", () => {
  it("never renders lines wider than the terminal width", () => {
    const bar = new StatusBar();
    bar.update({
      modelProvider: "anthropic",
      modelId: "claude-very-long-model-name-that-needs-truncation",
      isStreaming: true,
      inputTokens: 123456,
      outputTokens: 789012,
    });

    const lines = bar.render(24);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(24);
    }
  });

  it("handles very narrow widths", () => {
    const bar = new StatusBar();
    bar.update({
      modelProvider: "openai",
      modelId: "gpt-5",
      inputTokens: 1,
      outputTokens: 2,
    });

    const lines = bar.render(8);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(8);
    }
  });
});
