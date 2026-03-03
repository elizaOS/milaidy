import {
  type Component,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";
import { tuiTheme } from "../theme.js";

export interface StatusBarData {
  modelId: string;
  modelProvider: string;
  inputTokens: number;
  outputTokens: number;
  isStreaming: boolean;
  agentName: string;
}

/**
 * Format token counts compactly (similar to Pi TUI).
 */
function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

/**
 * Status bar showing pwd, token stats, and model info (Pi-style footer).
 *
 * Line 1: cwd (with ~ substitution)
 * Line 2: token stats (left) + model (right)
 */
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
    const safeWidth = Math.max(1, width);
    const d = this.data;

    // ── Line 1: cwd ──────────────────────────────────────────────────
    let pwd = process.cwd();
    const home = process.env.HOME || process.env.USERPROFILE;
    if (home && pwd.startsWith(home)) {
      pwd = `~${pwd.slice(home.length)}`;
    }
    const pwdLine = tuiTheme.dim(truncateToWidth(pwd, safeWidth, "..."));

    // ── Line 2: stats left │ model right ─────────────────────────────
    const statsParts: string[] = [];

    if (d.inputTokens) statsParts.push(`↑${formatTokens(d.inputTokens)}`);
    if (d.outputTokens) statsParts.push(`↓${formatTokens(d.outputTokens)}`);
    if (d.isStreaming) statsParts.push(tuiTheme.warning("● streaming"));

    const statsLeft = statsParts.length > 0 ? statsParts.join(" ") : "";

    const modelName = d.modelId
      ? `${d.modelProvider}/${d.modelId}`
      : "no model";

    // Dim everything
    const dimLeft = tuiTheme.dim(statsLeft);
    const dimRight = tuiTheme.dim(modelName);

    const leftWidth = visibleWidth(dimLeft);
    const rightWidth = visibleWidth(dimRight);
    const minPad = 2;

    let statsLine: string;
    if (leftWidth + minPad + rightWidth <= safeWidth) {
      const gap = " ".repeat(safeWidth - leftWidth - rightWidth);
      statsLine = dimLeft + gap + dimRight;
    } else if (leftWidth + minPad < safeWidth) {
      const availRight = safeWidth - leftWidth - minPad;
      statsLine =
        dimLeft +
        " ".repeat(minPad) +
        truncateToWidth(dimRight, availRight, "");
    } else {
      statsLine = truncateToWidth(dimLeft, safeWidth, "");
    }

    return [pwdLine, statsLine];
  }

  invalidate(): void {
    // Stateless
  }
}
