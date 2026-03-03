import {
  type Component,
  Image,
  type ImageTheme,
  Markdown,
  type MarkdownTheme,
} from "@mariozechner/pi-tui";
import { miladyMarkdownTheme, tuiTheme } from "../theme.js";

const imageTheme: ImageTheme = {
  fallbackColor: (s) => tuiTheme.dim(s),
};

interface ImageAttachment {
  base64: string;
  mimeType: string;
  filename?: string;
}

/**
 * Assistant message — clean markdown, no prefix.
 * Renders exactly: 1 blank line + markdown content.
 * Thinking traces shown as italic/muted when enabled.
 * Supports inline image attachments.
 */
export class AssistantMessageComponent implements Component {
  private markdown: Markdown;
  private thinkingMarkdown: Markdown | null = null;
  private images: Image[] = [];

  private thinkingText = "";
  private responseText = "";
  private isStreaming = true;

  constructor(
    private showThinking = false,
    private markdownTheme: MarkdownTheme = miladyMarkdownTheme,
    _agentName?: string,
  ) {
    this.markdown = new Markdown("", 1, 0, markdownTheme);
  }

  updateContent(text: string): void {
    this.responseText = text;
    this.rebuildMarkdown();
  }

  updateThinking(text: string): void {
    this.thinkingText = text;
    if (this.showThinking) {
      this.rebuildMarkdown();
    }
  }

  /** Attach an inline image to render below the message text. */
  addImage(attachment: ImageAttachment): void {
    this.images.push(
      new Image(attachment.base64, attachment.mimeType, imageTheme, {
        maxWidthCells: 60,
        maxHeightCells: 20,
        filename: attachment.filename,
      }),
    );
  }

  finalize(): void {
    this.isStreaming = false;
    this.rebuildMarkdown();
  }

  render(width: number): string[] {
    const thinkingLines =
      this.showThinking && this.thinkingMarkdown
        ? this.thinkingMarkdown.render(width)
        : [];

    const contentLines = this.markdown.render(width);

    // Nothing to show yet
    if (
      thinkingLines.length === 0 &&
      contentLines.length === 0 &&
      this.images.length === 0
    ) {
      return [];
    }

    const lines: string[] = [""];

    if (thinkingLines.length > 0) {
      lines.push(...thinkingLines);
      if (contentLines.length > 0) {
        lines.push(""); // gap between thinking and response
      }
    }

    lines.push(...contentLines);

    // Render inline images after text
    for (const img of this.images) {
      lines.push(""); // spacer before image
      lines.push(...img.render(width));
    }

    return lines;
  }

  invalidate(): void {
    this.markdown.invalidate();
    this.thinkingMarkdown?.invalidate();
    for (const img of this.images) {
      img.invalidate();
    }
  }

  private rebuildMarkdown(): void {
    // Thinking
    if (this.showThinking && this.thinkingText.trim()) {
      this.thinkingMarkdown = new Markdown(
        this.thinkingText.trim(),
        1,
        0,
        this.markdownTheme,
        { color: (t) => tuiTheme.muted(t), italic: true },
      );
    } else {
      this.thinkingMarkdown = null;
    }

    // Response
    const display =
      this.responseText + (this.isStreaming && this.responseText ? " ▊" : "");
    this.markdown.setText(display.trimEnd());
  }
}
