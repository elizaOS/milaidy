import { type Component, visibleWidth } from "@elizaos/tui";
import chalk from "chalk";

export interface KeyHint {
  key: string;
  label: string;
}

export class FooterComponent implements Component {
  private hints: KeyHint[] = [
    { key: "Enter", label: "send" },
    { key: "Shift+Enter", label: "newline" },
    { key: "Ctrl+P", label: "model" },
    { key: "Ctrl+E", label: "expand" },
    { key: "Ctrl+C", label: "cancel/quit" },
  ];

  setHints(hints: KeyHint[]): void {
    this.hints = hints;
  }

  render(width: number): string[] {
    const parts = this.hints.map(
      (h) => `${chalk.bold(h.key)} ${chalk.dim(h.label)}`,
    );

    const separator = chalk.dim(" │ ");
    const joined = parts.join(separator);

    if (visibleWidth(joined) <= width) {
      return [joined];
    }

    // Truncate to what fits.
    let result = "";
    for (const part of parts) {
      const candidate = result ? result + separator + part : part;
      if (visibleWidth(candidate) > width) {
        break;
      }
      result = candidate;
    }

    return [result];
  }

  invalidate(): void {
    // Stateless
  }
}
