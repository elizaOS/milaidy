import {
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
} from "@elizaos/core";
import { RepoPromptService } from "../services/repoprompt-service.ts";

export const repoPromptStatusProvider: Provider = {
  name: "REPOPROMPT_STATUS",
  description:
    "Provides RepoPrompt CLI status, recent run metadata, and command policy context.",

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
  ): Promise<ProviderResult> => {
    const service = runtime.getService(
      "repoprompt",
    ) as RepoPromptService | null;
    if (!service) {
      return {
        text: "RepoPrompt plugin is not active (service not found).",
        values: { repopromptAvailable: false },
        data: { available: false },
      };
    }

    const status = service.getStatus();
    const allowlistText =
      status.allowedCommands.includes("*") ||
      status.allowedCommands.includes("all")
        ? "all commands (wildcard allowlist)"
        : status.allowedCommands.join(", ");

    const lines: string[] = [
      `RepoPrompt CLI path: ${status.cliPath}`,
      `RepoPrompt service availability: ${status.available ? "available" : "unavailable"}`,
      `Allowed commands: ${allowlistText}`,
      `Timeout: ${status.timeoutMs}ms`,
      `Output cap: ${status.maxOutputChars} chars`,
    ];

    if (status.defaultWindow) {
      lines.push(`Default window: ${status.defaultWindow}`);
    }
    if (status.defaultTab) {
      lines.push(`Default tab: ${status.defaultTab}`);
    }
    if (status.lastRunAt) {
      const iso = new Date(status.lastRunAt).toISOString();
      lines.push(`Last run: ${iso}`);
      if (status.lastCommand) {
        lines.push(`Last command: ${status.lastCommand}`);
      }
      if (typeof status.lastExitCode !== "undefined") {
        lines.push(`Last exit code: ${String(status.lastExitCode)}`);
      }
    }

    return {
      text: lines.join("\n"),
      values: {
        repopromptAvailable: status.available,
        repopromptRunning: status.running,
      },
      data: { ...status },
    };
  },
};
