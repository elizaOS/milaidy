import {
  type Component,
  Loader,
  type TUI,
  truncateToWidth,
} from "@elizaos/tui";
import chalk from "chalk";

export type ToolStatus = "running" | "success" | "error";

export class ToolExecutionComponent implements Component {
  private status: ToolStatus = "running";
  private resultText = "";
  private expanded = false;
  private loader: Loader | null;

  constructor(
    private actionName: string,
    private args: Record<string, unknown>,
    tui: TUI,
  ) {
    this.loader = new Loader(
      tui,
      (spinner) => chalk.yellow(spinner),
      (text) => chalk.dim(text),
      `Running ${actionName}...`,
    );
  }

  updateResult(result: { text?: string; isError?: boolean }): void {
    this.status = result.isError ? "error" : "success";
    this.resultText = result.text ?? "";

    this.loader?.stop();
    this.loader = null;
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  render(width: number): string[] {
    const lines: string[] = [];

    const icon =
      this.status === "running"
        ? chalk.yellow("⟳")
        : this.status === "success"
          ? chalk.green("✓")
          : chalk.red("✗");

    const argSummary = this.summarizeArgs(Math.max(0, width - 8));
    const header = `  ${icon} ${chalk.bold(this.actionName)}${argSummary ? ` ${chalk.dim(argSummary)}` : ""}`;
    lines.push(truncateToWidth(header, width, ""));

    if (this.status === "running" && this.loader) {
      const loaderLines = this.loader.render(Math.max(1, width - 4));
      lines.push(
        ...loaderLines.map((l) => `    ${truncateToWidth(l, width - 4, "")}`),
      );
    }

    if (this.status !== "running" && this.resultText) {
      const resultLines = this.resultText.split("\n");
      const isShort = resultLines.length <= 3;
      const showAll = this.expanded || isShort;
      const display = showAll ? resultLines : resultLines.slice(0, 3);

      for (const line of display) {
        const color = this.status === "error" ? chalk.red : chalk.dim;
        lines.push(`    ${color(truncateToWidth(line, width - 6, ""))}`);
      }

      if (!showAll) {
        lines.push(
          chalk.dim(
            `    ... ${resultLines.length - 3} more lines (Ctrl+E to expand)`,
          ),
        );
      }
    }

    return lines;
  }

  invalidate(): void {
    this.loader?.invalidate();
  }

  private summarizeArgs(maxWidth: number): string {
    const entries = Object.entries(this.args);
    if (entries.length === 0) return "";

    const summary = entries
      .map(([k, v]) => {
        const val =
          typeof v === "string"
            ? v.length > 30
              ? `${v.slice(0, 27)}...`
              : v
            : JSON.stringify(v);
        return `${k}=${val}`;
      })
      .join(" ");

    return summary.length > maxWidth
      ? `${summary.slice(0, Math.max(0, maxWidth - 3))}...`
      : summary;
  }
}
