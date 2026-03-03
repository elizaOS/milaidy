import type { Component } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { PinnedChatLayout } from "./pinned-chat-layout.js";

class StaticComponent implements Component {
  constructor(private lines: string[]) {}

  setLines(lines: string[]): void {
    this.lines = lines;
  }

  render(_width: number): string[] {
    return [...this.lines];
  }

  invalidate(): void {
    // Stateless for tests.
  }
}

describe("PinnedChatLayout", () => {
  it("pins status/editor/footer to the bottom with padding", () => {
    const chat = new StaticComponent(["c1", "c2"]);
    const ephemeral = new StaticComponent([]);
    const status = new StaticComponent(["s1", "s2"]);
    const editor = new StaticComponent(["e1", "e2", "e3"]);
    const footer = new StaticComponent(["f1"]);

    const layout = new PinnedChatLayout({
      chat,
      ephemeralStatus: ephemeral,
      statusBar: status,
      editor,
      footer,
      getTerminalRows: () => 10,
      spacerLines: 1,
    });

    expect(layout.render(80)).toEqual([
      "c1",
      "c2",
      "",
      "s1",
      "s2",
      "",
      "e1",
      "e2",
      "e3",
      "f1",
    ]);
  });

  it("keeps the newest chat lines when chat overflows", () => {
    const chat = new StaticComponent(["c1", "c2", "c3"]);
    const ephemeral = new StaticComponent([]);
    const status = new StaticComponent(["s1", "s2"]);
    const editor = new StaticComponent(["e1", "e2", "e3"]);
    const footer = new StaticComponent(["f1"]);

    const layout = new PinnedChatLayout({
      chat,
      ephemeralStatus: ephemeral,
      statusBar: status,
      editor,
      footer,
      getTerminalRows: () => 8,
      spacerLines: 1,
    });

    expect(layout.render(80)).toEqual([
      "c3",
      "s1",
      "s2",
      "",
      "e1",
      "e2",
      "e3",
      "f1",
    ]);
  });

  it("keeps the newest bottom UI lines on very small terminals", () => {
    const chat = new StaticComponent(["c1", "c2", "c3"]);
    const ephemeral = new StaticComponent([]);
    const status = new StaticComponent(["s1", "s2"]);
    const editor = new StaticComponent(["e1", "e2", "e3"]);
    const footer = new StaticComponent(["f1"]);

    const layout = new PinnedChatLayout({
      chat,
      ephemeralStatus: ephemeral,
      statusBar: status,
      editor,
      footer,
      getTerminalRows: () => 3,
      spacerLines: 1,
    });

    expect(layout.render(80)).toEqual(["e2", "e3", "f1"]);
  });
});
