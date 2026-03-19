import { type Component, visibleWidth } from "@mariozechner/pi-tui";
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

    // If nothing fits (ultra-narrow terminal), hard-truncate the first hint.
    if (!result && parts.length > 0) {
      const first = parts[0];
      // Walk characters until we hit the width limit.
      let truncated = "";
      for (const ch of first) {
        const next = truncated + ch;
        if (visibleWidth(next) > width) break;
        truncated = next;
      }
      return [truncated];
    }

    return [result];
  }

  invalidate(): void {
    // Stateless
  }
}
