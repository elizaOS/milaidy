import type { AgentRuntime } from "@elizaos/core";

export { ElizaTUIBridge } from "./eliza-tui-bridge";
export { MiladyTUI } from "./tui-app";

export interface LaunchTUIOptions {
  /** Override model, format: provider/modelId (e.g. anthropic/claude-sonnet-4-20250514) */
  modelOverride?: string;
}

export async function launchTUI(
  _runtime: AgentRuntime,
  _options: LaunchTUIOptions = {},
): Promise<void> {
  throw new Error("TUI is disabled.");
}
