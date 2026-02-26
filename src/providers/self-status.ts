import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";

const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";
const SELF_STATUS_TIMEOUT_MS = 1_500;
const MAX_PLUGIN_PREVIEW = 8;

interface AgentSelfStatusPayload {
  generatedAt: string;
  state: string;
  agentName: string;
  model: string | null;
  provider: string | null;
  automationMode: "connectors-only" | "full";
  tradePermissionMode: "user-sign-only" | "manual-local-key" | "agent-auto";
  shellEnabled: boolean;
  wallet: {
    mode: "privy" | "hybrid";
    evmAddress: string | null;
    evmAddressShort: string | null;
    solanaAddress: string | null;
    solanaAddressShort: string | null;
    hasWallet: boolean;
    hasEvm: boolean;
    hasSolana: boolean;
    localSignerAvailable: boolean;
    managedBscRpcReady: boolean;
  };
  plugins: {
    totalActive: number;
    active: string[];
    aiProviders: string[];
    connectors: string[];
  };
  capabilities: {
    canTrade: boolean;
    canLocalTrade: boolean;
    canAutoTrade: boolean;
    canUseBrowser: boolean;
    canUseComputer: boolean;
    canRunTerminal: boolean;
    canInstallPlugins: boolean;
    canConfigurePlugins: boolean;
    canConfigureConnectors: boolean;
  };
}

function summarizeActivePlugins(active: string[]): string {
  if (active.length === 0) return "none";
  const preview = active.slice(0, MAX_PLUGIN_PREVIEW).join(", ");
  if (active.length <= MAX_PLUGIN_PREVIEW) return preview;
  return `${preview}, +${active.length - MAX_PLUGIN_PREVIEW} more`;
}

function buildGuardrailHints(status: AgentSelfStatusPayload): string[] {
  const hints: string[] = [];
  if (!status.wallet.hasEvm) {
    hints.push(
      "No EVM wallet detected. Trading or transfer actions should be blocked.",
    );
  } else if (!status.capabilities.canAutoTrade) {
    hints.push(
      `Auto trade is blocked by trade mode "${status.tradePermissionMode}". Ask user before switching to "agent-auto".`,
    );
  }

  if (!status.capabilities.canRunTerminal) {
    if (!status.shellEnabled) {
      hints.push("Terminal is disabled by shell permission.");
    } else if (status.automationMode !== "full") {
      hints.push(
        `Terminal automation is blocked in automation mode "${status.automationMode}".`,
      );
    }
  }

  if (!status.capabilities.canConfigurePlugins) {
    hints.push(
      `Plugin install/config is restricted in automation mode "${status.automationMode}".`,
    );
  }

  return hints;
}

export function createSelfStatusProvider(): Provider {
  return {
    name: "miladySelfStatus",
    description:
      "Authoritative self snapshot (model/provider, wallet, permissions, active plugins, capability gates).",
    dynamic: true,
    position: 12,
    async get(
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      try {
        const response = await fetch(
          `http://127.0.0.1:${API_PORT}/api/agent/self-status`,
          {
            signal: AbortSignal.timeout(SELF_STATUS_TIMEOUT_MS),
          },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const status = (await response.json()) as AgentSelfStatusPayload;
        const modelLabel = status.model ?? "unknown";
        const providerLabel = status.provider ?? "unknown";
        const walletLabel =
          status.wallet.evmAddressShort ??
          status.wallet.solanaAddressShort ??
          "not configured";
        const guardrails = buildGuardrailHints(status);
        const lines = [
          "Self status snapshot (authoritative runtime state):",
          `- Agent: ${status.agentName} (${status.state})`,
          `- Model: ${modelLabel}`,
          `- Provider: ${providerLabel}`,
          `- Wallet: ${walletLabel} [mode=${status.wallet.mode}]`,
          `- Permissions: automation=${status.automationMode}, trade=${status.tradePermissionMode}, shell=${status.shellEnabled ? "enabled" : "disabled"}`,
          `- Capabilities: trade=${status.capabilities.canTrade ? "yes" : "no"}, autoTrade=${status.capabilities.canAutoTrade ? "yes" : "no"}, browser=${status.capabilities.canUseBrowser ? "yes" : "no"}, computer=${status.capabilities.canUseComputer ? "yes" : "no"}, terminal=${status.capabilities.canRunTerminal ? "yes" : "no"}`,
          `- Active plugins (${status.plugins.totalActive}): ${summarizeActivePlugins(status.plugins.active)}`,
        ];

        if (guardrails.length > 0) {
          lines.push("- Guardrails:");
          for (const hint of guardrails) {
            lines.push(`  - ${hint}`);
          }
        }
        lines.push(
          "Policy: if an action is blocked, explain the exact blocker and tell the user which setting or mode to change.",
        );

        return {
          text: lines.join("\n"),
          values: {
            selfStatusAvailable: true,
            selfStatusGeneratedAt: status.generatedAt,
            selfStatusProvider: providerLabel,
            selfStatusModel: modelLabel,
            selfStatusWallet: walletLabel,
            canTrade: status.capabilities.canTrade,
            canAutoTrade: status.capabilities.canAutoTrade,
            canUseBrowser: status.capabilities.canUseBrowser,
            canUseComputer: status.capabilities.canUseComputer,
            canRunTerminal: status.capabilities.canRunTerminal,
          },
        };
      } catch (err) {
        return {
          text: [
            "Self status snapshot unavailable.",
            "If asked about wallet/plugins/permissions, state that live status is unavailable and ask the user to open Settings.",
          ].join("\n"),
          values: {
            selfStatusAvailable: false,
            selfStatusError: err instanceof Error ? err.message : String(err),
          },
        };
      }
    },
  };
}
