import type { Component } from "@mariozechner/pi-tui";

export interface PinnedChatLayoutOptions {
  chat: Component;
  ephemeralStatus: Component;
  statusBar: Component;
  editor: Component;
  footer: Component;
  getTerminalRows: () => number;
  spacerLines?: number;
}

/**
 * Keeps the bottom UI chrome (status + editor + footer) pinned to the terminal
 * bottom while showing the most recent chat lines above it.
 */
export class PinnedChatLayout implements Component {
  constructor(private options: PinnedChatLayoutOptions) {}

  render(width: number): string[] {
    const rows = Math.max(1, this.options.getTerminalRows());

    const chatLines = this.options.chat.render(width);
    const ephemeralLines = this.options.ephemeralStatus.render(width);
    const statusLines = this.options.statusBar.render(width);
    const editorLines = this.options.editor.render(width);
    const footerLines = this.options.footer.render(width);

    const spacerCount = Math.max(0, this.options.spacerLines ?? 1);
    const spacerLines = Array.from({ length: spacerCount }, () => "");

    const bottomLines = [
      ...ephemeralLines,
      ...statusLines,
      ...spacerLines,
      ...editorLines,
      ...footerLines,
    ];

    // Extremely small terminals: keep the newest bottom UI lines visible.
    if (bottomLines.length >= rows) {
      return bottomLines.slice(bottomLines.length - rows);
    }

    const chatBudget = rows - bottomLines.length;
    const visibleChat =
      chatLines.length > chatBudget
        ? chatLines.slice(chatLines.length - chatBudget)
        : chatLines;

    // Pad between chat + bottom chrome so editor/footer stay visually pinned.
    const padding = Array.from(
      { length: Math.max(0, chatBudget - visibleChat.length) },
      () => "",
    );

    return [...visibleChat, ...padding, ...bottomLines];
  }

  invalidate(): void {
    this.options.chat.invalidate?.();
    this.options.ephemeralStatus.invalidate?.();
    this.options.statusBar.invalidate?.();
    this.options.editor.invalidate?.();
    this.options.footer.invalidate?.();
  }
}
