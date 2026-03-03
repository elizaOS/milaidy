import {
  type Component,
  Markdown,
  type MarkdownTheme,
} from "@mariozechner/pi-tui";
import { miladyMarkdownTheme, tuiTheme } from "../theme.js";

/**
 * User message with a tinted background (Pi-style).
 * Renders exactly: 1 blank line + markdown-with-bg.
 */
export class UserMessageComponent implements Component {
  private markdown: Markdown;

  constructor(
    text: string,
    markdownTheme: MarkdownTheme = miladyMarkdownTheme,
  ) {
    this.markdown = new Markdown(text, 1, 0, markdownTheme, {
      bgColor: (t) => tuiTheme.userMsgBg(t),
    });
  }

  render(width: number): string[] {
    return ["", ...this.markdown.render(width)];
  }

  invalidate(): void {
    this.markdown.invalidate();
  }
}
