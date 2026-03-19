import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { tuiTheme } from "../theme.js";
import { renderModalHeader } from "./modal-style.js";

export interface ModalFrameOptions {
  title: string;
  hint?: string;
  footerHint?: string;
  bodyIndent?: number;
}

/**
 * Lightweight frame helper for popup overlays.
 *
 * Keeps header/hints/footer styling consistent while allowing each overlay
 * component to keep its own input/state logic.
 */
export class ModalFrame {
  constructor(private options: ModalFrameOptions) {}

  render(width: number, bodyLines: string[]): string[] {
    const lines = renderModalHeader({
      title: this.options.title,
      hint: this.options.hint,
    });

    const indent = this.options.bodyIndent ?? 0;
    const prefix = indent > 0 ? " ".repeat(indent) : "";
    const body = indent > 0 ? bodyLines.map((l) => `${prefix}${l}`) : bodyLines;
    lines.push(...body);

    if (this.options.footerHint) {
      lines.push("");
      lines.push(tuiTheme.dim(` ${this.options.footerHint}`));
    }

    const contentWidth = Math.max(10, width - 2);
    const top = tuiTheme.dim(`╭${"─".repeat(contentWidth)}╮`);
    const bottom = tuiTheme.dim(`╰${"─".repeat(contentWidth)}╯`);

    const boxed = lines.map((line) => {
      const clipped = truncateToWidth(line, contentWidth, "");
      const pad = Math.max(0, contentWidth - visibleWidth(clipped));
      return `${tuiTheme.dim("│")}${clipped}${" ".repeat(pad)}${tuiTheme.dim("│")}`;
    });

    return [top, ...boxed, bottom];
  }
}
