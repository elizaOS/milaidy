import { type Component, visibleWidth } from "@elizaos/tui";
import chalk from "chalk";

export interface StatusBarData {
  modelId: string;
  modelProvider: string;
  inputTokens: number;
  outputTokens: number;
  isStreaming: boolean;
  agentName: string;
}

export class StatusBar implements Component {
  private data: StatusBarData = {
    modelId: "",
    modelProvider: "",
    inputTokens: 0,
    outputTokens: 0,
    isStreaming: false,
    agentName: "milady",
  };

  update(partial: Partial<StatusBarData>): void {
    Object.assign(this.data, partial);
  }

  render(width: number): string[] {
    const d = this.data;

    const model = d.modelId
      ? chalk.cyan(`${d.modelProvider}/${d.modelId}`)
      : chalk.dim("no model");

    const streaming = d.isStreaming ? chalk.yellow("● streaming") : "";

    const tokens =
      d.inputTokens || d.outputTokens
        ? chalk.dim(`↑${d.inputTokens} ↓${d.outputTokens}`)
        : "";

    const left = ` ${model}${streaming ? ` ${streaming}` : ""}`;
    const right = tokens ? `${tokens} ` : "";

    const leftW = visibleWidth(left);
    const rightW = visibleWidth(right);
    const gap = Math.max(1, width - leftW - rightW);

    const line = `${left}${" ".repeat(gap)}${right}`;

    return [chalk.dim("─".repeat(width)), line];
  }

  invalidate(): void {
    // Stateless
  }
}
