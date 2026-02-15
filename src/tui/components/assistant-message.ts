import {
  type Component,
  Markdown,
  type MarkdownTheme,
  visibleWidth,
} from "@elizaos/tui";
import chalk from "chalk";

export class AssistantMessageComponent implements Component {
  private markdown: Markdown;
  private thinkingText = "";
  private responseText = "";
  private isStreaming = true;

  constructor(
    private showThinking = false,
    markdownTheme: MarkdownTheme,
  ) {
    // paddingX=0, paddingY=0
    this.markdown = new Markdown("", 0, 0, markdownTheme);
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

  finalize(): void {
    this.isStreaming = false;
    this.rebuildMarkdown();
  }

  private rebuildMarkdown(): void {
    const parts: string[] = [];

    if (this.showThinking && this.thinkingText.trim().length > 0) {
      const quoted = this.thinkingText
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
      parts.push(quoted, "");
    }

    parts.push(this.responseText);

    // Streaming cursor indicator
    if (this.isStreaming && this.responseText.length > 0) {
      parts.push(" ▊");
    }

    this.markdown.setText(parts.join("\n").trimEnd());
  }

  render(width: number): string[] {
    const prefix = chalk.bold.magenta("✨ ");
    const prefixWidth = visibleWidth(prefix);
    const mdLines = this.markdown.render(Math.max(1, width - prefixWidth));

    return mdLines.map((line, i) =>
      i === 0 ? `${prefix}${line}` : `${" ".repeat(prefixWidth)}${line}`,
    );
  }

  invalidate(): void {
    this.markdown.invalidate();
  }
}
