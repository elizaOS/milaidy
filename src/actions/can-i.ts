import type { Action, HandlerOptions } from "@elizaos/core";

const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";
const SELF_STATUS_TIMEOUT_MS = 2_000;

type CapabilityKey =
  | "wallet"
  | "canTrade"
  | "canLocalTrade"
  | "canAutoTrade"
  | "canUseBrowser"
  | "canUseComputer"
  | "canRunTerminal"
  | "canInstallPlugins"
  | "canConfigurePlugins"
  | "canConfigureConnectors";

type StatusCapabilityKey = Exclude<CapabilityKey, "wallet">;

const CAPABILITY_ALIASES: Record<string, CapabilityKey> = {
  wallet: "wallet",
  address: "wallet",
  trade: "canTrade",
  "can-trade": "canTrade",
  "local-trade": "canLocalTrade",
  "manual-local-key": "canLocalTrade",
  "auto-trade": "canAutoTrade",
  "agent-auto": "canAutoTrade",
  "agent-auto-trade": "canAutoTrade",
  browser: "canUseBrowser",
  "use-browser": "canUseBrowser",
  computer: "canUseComputer",
  "computer-use": "canUseComputer",
  terminal: "canRunTerminal",
  shell: "canRunTerminal",
  "install-plugin": "canInstallPlugins",
  "install-plugins": "canInstallPlugins",
  "configure-plugin": "canConfigurePlugins",
  "configure-plugins": "canConfigurePlugins",
  "configure-connector": "canConfigureConnectors",
  "configure-connectors": "canConfigureConnectors",
};

const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  wallet: "access wallet context",
  canTrade: "initiate a trade flow",
  canLocalTrade: "execute local-key trade",
  canAutoTrade: "auto-execute trade without user signature",
  canUseBrowser: "use browser tools",
  canUseComputer: "use computer control tools",
  canRunTerminal: "run terminal commands",
  canInstallPlugins: "install plugins",
  canConfigurePlugins: "configure non-connector plugins",
  canConfigureConnectors: "configure connectors",
};

interface AgentSelfStatusPayload {
  generatedAt: string;
  model: string | null;
  provider: string | null;
  automationMode: "connectors-only" | "full";
  tradePermissionMode: "user-sign-only" | "manual-local-key" | "agent-auto";
  shellEnabled: boolean;
  wallet: {
    hasWallet: boolean;
    hasEvm: boolean;
    evmAddressShort: string | null;
  };
  capabilities: Record<StatusCapabilityKey, boolean>;
}

interface CapabilityDecision {
  allowed: boolean;
  reason: string;
  nextStep?: string;
}

function normalizeCapability(input: string): CapabilityKey | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  return CAPABILITY_ALIASES[normalized] ?? null;
}

function evaluateCapability(
  status: AgentSelfStatusPayload,
  capability: CapabilityKey,
): CapabilityDecision {
  if (capability === "wallet") {
    if (status.wallet.hasWallet) {
      return {
        allowed: true,
        reason: `Wallet is available (${status.wallet.evmAddressShort ?? "configured"}).`,
      };
    }
    return {
      allowed: false,
      reason: "No wallet address is currently configured.",
      nextStep: "Open Wallet and complete wallet provisioning/login first.",
    };
  }

  if (capability === "canTrade") {
    if (status.capabilities.canTrade) {
      return {
        allowed: true,
        reason: "Trade initiation is available for this runtime.",
      };
    }
    return {
      allowed: false,
      reason: "Trade flow requires an EVM wallet address.",
      nextStep: "Provision or connect an EVM wallet in Wallet settings.",
    };
  }

  if (capability === "canLocalTrade") {
    if (!status.wallet.hasEvm) {
      return {
        allowed: false,
        reason: "No EVM wallet address is available.",
        nextStep: "Provision/connect EVM wallet first.",
      };
    }
    if (status.capabilities.canLocalTrade) {
      return {
        allowed: true,
        reason: "Local-key trade execution is enabled.",
      };
    }
    return {
      allowed: false,
      reason: `Trade mode is "${status.tradePermissionMode}", so local-key execution is restricted.`,
      nextStep:
        'Switch trade permission mode to "manual-local-key" or "agent-auto".',
    };
  }

  if (capability === "canAutoTrade") {
    if (!status.wallet.hasEvm) {
      return {
        allowed: false,
        reason: "No EVM wallet address is available.",
        nextStep: "Provision/connect EVM wallet first.",
      };
    }
    if (status.capabilities.canAutoTrade) {
      return {
        allowed: true,
        reason: "Auto trade is enabled.",
      };
    }
    return {
      allowed: false,
      reason: `Trade mode is "${status.tradePermissionMode}", so auto trade is blocked.`,
      nextStep: 'Set trade permission mode to "agent-auto".',
    };
  }

  if (capability === "canRunTerminal") {
    if (status.capabilities.canRunTerminal) {
      return {
        allowed: true,
        reason: "Terminal execution is enabled.",
      };
    }
    if (!status.shellEnabled) {
      return {
        allowed: false,
        reason: "Shell permission is currently disabled.",
        nextStep: "Enable shell access in Permissions.",
      };
    }
    if (status.automationMode !== "full") {
      return {
        allowed: false,
        reason: `Automation mode "${status.automationMode}" blocks terminal automation.`,
        nextStep: 'Set automation mode to "full".',
      };
    }
  }

  if (
    capability === "canInstallPlugins" ||
    capability === "canConfigurePlugins"
  ) {
    if (status.capabilities[capability]) {
      return {
        allowed: true,
        reason: "Plugin mutation is enabled.",
      };
    }
    return {
      allowed: false,
      reason: `Automation mode "${status.automationMode}" restricts non-connector plugin changes.`,
      nextStep: 'Set automation mode to "full".',
    };
  }

  if (capability === "canUseBrowser" && !status.capabilities.canUseBrowser) {
    return {
      allowed: false,
      reason: "Browser capability plugin is not active.",
      nextStep:
        "Install/enable a browser plugin (for example, browser/browserbase).",
    };
  }

  if (capability === "canUseComputer" && !status.capabilities.canUseComputer) {
    return {
      allowed: false,
      reason: "Computer-use plugin is not active.",
      nextStep: "Install/enable the computer-use capability plugin.",
    };
  }

  const statusCapability = capability as StatusCapabilityKey;
  if (status.capabilities[statusCapability]) {
    return {
      allowed: true,
      reason: "Capability is enabled.",
    };
  }

  return {
    allowed: false,
    reason: "Capability is currently disabled.",
    nextStep: "Review current plugin and permission settings.",
  };
}

const SUPPORTED_CAPABILITIES = Array.from(
  new Set(Object.keys(CAPABILITY_ALIASES)),
).sort((a, b) => a.localeCompare(b));

export const canIAction: Action = {
  name: "CAN_I",
  similes: [
    "CAN_I_DO",
    "CAPABILITY_CHECK",
    "PERMISSION_CHECK",
    "AM_I_ALLOWED",
    "CAN_I_USE",
  ],
  description:
    "Check whether the agent can perform a specific capability right now (wallet/trade/browser/computer/terminal/plugin config).",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    const params = (options as HandlerOptions | undefined)?.parameters;
    const rawCapability =
      typeof params?.capability === "string" ? params.capability.trim() : "";
    if (!rawCapability) {
      return {
        text: `Missing capability. Try one of: ${SUPPORTED_CAPABILITIES.join(", ")}`,
        success: false,
      };
    }

    const capability = normalizeCapability(rawCapability);
    if (!capability) {
      return {
        text: `Unknown capability "${rawCapability}". Try one of: ${SUPPORTED_CAPABILITIES.join(", ")}`,
        success: false,
      };
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${API_PORT}/api/agent/self-status`,
        {
          signal: AbortSignal.timeout(SELF_STATUS_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        return {
          text: `Capability check failed (HTTP ${response.status}).`,
          success: false,
        };
      }

      const status = (await response.json()) as AgentSelfStatusPayload;
      const decision = evaluateCapability(status, capability);
      const label = CAPABILITY_LABELS[capability];
      const text = decision.allowed
        ? `Yes. I can ${label} right now. ${decision.reason}`
        : `Not yet. I cannot ${label} right now. ${decision.reason}${decision.nextStep ? ` Next step: ${decision.nextStep}` : ""}`;

      return {
        text,
        success: true,
        data: {
          capabilityInput: rawCapability,
          capability,
          allowed: decision.allowed,
          reason: decision.reason,
          nextStep: decision.nextStep ?? null,
          model: status.model,
          provider: status.provider,
          automationMode: status.automationMode,
          tradePermissionMode: status.tradePermissionMode,
          generatedAt: status.generatedAt,
        },
      };
    } catch (err) {
      return {
        text: `Capability check failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },
  parameters: [
    {
      name: "capability",
      description:
        "Capability to check, e.g. trade, auto-trade, browser, computer, terminal, install-plugin.",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};
