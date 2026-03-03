import {
  Box,
  type Component,
  Loader,
  Text,
  type TUI,
} from "@mariozechner/pi-tui";
import { tuiTheme } from "../theme.js";

export type ToolStatus = "running" | "success" | "error";

/**
 * Tool execution component styled with background tints (like Pi TUI).
 * Uses Box with bg color that changes based on status.
 */
export class ToolExecutionComponent implements Component {
  private status: ToolStatus = "running";
  private resultText = "";
  private expanded = false;
  private loader: Loader | null;

  private box: Box;

  constructor(
    private actionName: string,
    private args: Record<string, unknown>,
    tui: TUI,
  ) {
    this.loader = new Loader(
      tui,
      (spinner) => tuiTheme.warning(spinner),
      (text) => tuiTheme.muted(text),
      `Running ${actionName}...`,
    );

    this.box = new Box(1, 0, (text) => tuiTheme.toolPendingBg(text));
    this.rebuildBox();
  }

  updateResult(result: { text?: string; isError?: boolean }): void {
    this.status = result.isError ? "error" : "success";
    this.resultText = result.text ?? "";

    this.loader?.stop();
    this.loader = null;

    // Update background based on status
    const bgFn =
      this.status === "error"
        ? (text: string) => tuiTheme.toolErrorBg(text)
        : (text: string) => tuiTheme.toolSuccessBg(text);
    this.box.setBgFn(bgFn);

    this.rebuildBox();
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.rebuildBox();
  }

  render(width: number): string[] {
    return this.box.render(width);
  }

  invalidate(): void {
    this.box.invalidate();
    this.loader?.invalidate();
  }

  private rebuildBox(): void {
    this.box.clear();

    // Header line: tool name (bold)
    const argSummary = this.summarizeArgs(80);
    const headerText = argSummary
      ? `${tuiTheme.bold(this.actionName)} ${tuiTheme.muted(argSummary)}`
      : tuiTheme.bold(this.actionName);
    this.box.addChild(new Text(headerText, 0, 0));

    // Loader while running
    if (this.status === "running" && this.loader) {
      this.box.addChild(this.loader);
    }

    // Result output
    if (this.status !== "running" && this.resultText) {
      const resultLines = this.resultText.split("\n");
      const isShort = resultLines.length <= 5;
      const showAll = this.expanded || isShort;
      const display = showAll ? resultLines : resultLines.slice(0, 5);

      const colorFn =
        this.status === "error"
          ? (t: string) => tuiTheme.error(t)
          : (t: string) => tuiTheme.muted(t);

      const body = display.map((line) => colorFn(line)).join("\n");
      this.box.addChild(new Text(`\n${body}`, 0, 0));

      if (!showAll) {
        this.box.addChild(
          new Text(
            tuiTheme.dim(
              `... (${resultLines.length - 5} more lines, Ctrl+E to expand)`,
            ),
            0,
            0,
          ),
        );
      }
    }
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
