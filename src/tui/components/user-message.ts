import { type Component, visibleWidth, wrapTextWithAnsi } from "@elizaos/tui";
import chalk from "chalk";

export class UserMessageComponent implements Component {
  constructor(private text: string) {}

  render(width: number): string[] {
    const prefix = chalk.bold.cyan("You → ");
    const prefixWidth = visibleWidth(prefix);
    const contentWidth = Math.max(1, width - prefixWidth);

    const lines = wrapTextWithAnsi(this.text, contentWidth);

    return lines.map((line, i) =>
      i === 0 ? `${prefix}${line}` : `${" ".repeat(prefixWidth)}${line}`,
    );
  }

  invalidate(): void {
    // Stateless
  }
}
