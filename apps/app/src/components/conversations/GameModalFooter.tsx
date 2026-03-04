/**
 * Game-modal variant footer: AI provider info, capabilities grid, token usage.
 */

import { useMemo } from "react";
import type { AgentSelfStatusSnapshot } from "../../api-client";
import {
  BROWSER_CAPABILITY_PLUGIN_IDS,
  COMPUTER_CAPABILITY_PLUGIN_IDS,
  estimateTokenCost,
  isNonChatModelLabel,
  resolveProviderLabel,
} from "./conversation-utils";

interface GameModalFooterProps {
  selfStatus: AgentSelfStatusSnapshot | null;
  selfStatusLoading: boolean;
  agentStatusModel: string | undefined;
  chatLastUsage: {
    model?: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
  } | null;
  t: (
    key: string,
    vars?: Record<string, string | number | boolean | null | undefined>,
  ) => string;
}

export function GameModalFooter({
  selfStatus,
  selfStatusLoading,
  agentStatusModel,
  chatLastUsage,
  t,
}: GameModalFooterProps) {
  const selfModelLabel = (selfStatus?.model ?? "").trim();
  const observedModelLabelRaw = (chatLastUsage?.model ?? "").trim();
  const observedModelLabel = isNonChatModelLabel(observedModelLabelRaw)
    ? ""
    : observedModelLabelRaw;
  const statusModelLabel = (agentStatusModel ?? "").trim();
  const configuredModelRaw = (selfModelLabel || statusModelLabel).trim();
  const configuredModelLabel = isNonChatModelLabel(configuredModelRaw)
    ? ""
    : configuredModelRaw;
  const modelLabel = (observedModelLabel || configuredModelLabel).trim();
  const modelProviderLabel = resolveProviderLabel(modelLabel);
  const providerLabel = modelProviderLabel
    ? modelProviderLabel
    : selfStatusLoading
      ? t("chat.modal.providerDetecting")
      : "N/A";

  const capabilityRows = useMemo(() => {
    const activePlugins = new Set(selfStatus?.plugins?.active ?? []);
    const hasBrowserPlugin = Array.from(BROWSER_CAPABILITY_PLUGIN_IDS).some(
      (id) => activePlugins.has(id),
    );
    const hasComputerPlugin = Array.from(COMPUTER_CAPABILITY_PLUGIN_IDS).some(
      (id) => activePlugins.has(id),
    );

    const tradeEnabled = Boolean(selfStatus?.capabilities?.canTrade);
    const autoTradeEnabled = Boolean(selfStatus?.capabilities?.canAutoTrade);
    const browserEnabled = Boolean(selfStatus?.capabilities?.canUseBrowser);
    const computerEnabled = Boolean(selfStatus?.capabilities?.canUseComputer);
    const terminalEnabled = Boolean(selfStatus?.capabilities?.canRunTerminal);

    const tradeHint = tradeEnabled
      ? null
      : t("chat.modal.capHintNeedsEvmWallet");
    const autoTradeHint = autoTradeEnabled
      ? null
      : !selfStatus?.wallet?.hasEvm
        ? t("chat.modal.capHintNeedsEvmWallet")
        : selfStatus.tradePermissionMode !== "agent-auto"
          ? t("chat.modal.capHintNeedsAgentTradeMode")
          : !selfStatus.wallet.localSignerAvailable
            ? t("chat.modal.capHintNeedsLocalSigner")
            : null;
    const browserHint = browserEnabled
      ? null
      : !hasBrowserPlugin
        ? t("chat.modal.capHintNeedsBrowserPlugin")
        : null;
    const computerHint = computerEnabled
      ? null
      : !hasComputerPlugin
        ? t("chat.modal.capHintNeedsComputerPlugin")
        : null;
    const terminalHint = terminalEnabled
      ? null
      : selfStatus?.automationMode !== "full"
        ? t("chat.modal.capHintNeedsFullAutomation")
        : selfStatus?.shellEnabled === false
          ? t("chat.modal.capHintEnableShell")
          : null;

    return [
      {
        key: "trade",
        label: t("chat.modal.capTrade"),
        enabled: tradeEnabled,
        hint: tradeHint,
      },
      {
        key: "autoTrade",
        label: t("chat.modal.capAutoTrade"),
        enabled: autoTradeEnabled,
        hint: autoTradeHint,
      },
      {
        key: "browser",
        label: t("chat.modal.capBrowser"),
        enabled: browserEnabled,
        hint: browserHint,
      },
      {
        key: "computer",
        label: t("chat.modal.capComputer"),
        enabled: computerEnabled,
        hint: computerHint,
      },
      {
        key: "terminal",
        label: t("chat.modal.capTerminal"),
        enabled: terminalEnabled,
        hint: terminalHint,
      },
    ] as const;
  }, [selfStatus, t]);

  const walletLabel =
    selfStatus?.wallet?.evmAddressShort ||
    selfStatus?.wallet?.solanaAddressShort ||
    t("chat.modal.walletUnknown");
  const usageTotalLabel = chatLastUsage
    ? chatLastUsage.totalTokens.toLocaleString()
    : t("chat.modal.usageAwaiting");
  const usageBreakdownLabel = chatLastUsage
    ? `${chatLastUsage.promptTokens.toLocaleString()}\u2191 / ${chatLastUsage.completionTokens.toLocaleString()}\u2193`
    : "\u2014";
  const usageCostLabel = chatLastUsage
    ? estimateTokenCost(
        chatLastUsage.promptTokens,
        chatLastUsage.completionTokens,
        observedModelLabel || modelLabel,
      )
    : "\u2014";

  return (
    <div className="chat-game-sidebar-footer" data-testid="chat-game-provider">
      <div className="chat-game-sidebar-footer-label">
        {t("chat.modal.aiProvider")}
      </div>
      <div className="chat-game-sidebar-footer-value">{providerLabel}</div>
      <div
        className="chat-game-sidebar-footer-model"
        title={modelLabel || undefined}
      >
        {modelLabel || t("chat.modal.providerUnknown")}
      </div>
      <div className="chat-game-sidebar-capabilities">
        <div className="chat-game-sidebar-footer-label">
          {t("chat.modal.capabilities")}
        </div>
        <div className="chat-game-sidebar-cap-grid">
          {capabilityRows.map((row) => (
            <div className="chat-game-sidebar-cap-row" key={row.key}>
              <div className="chat-game-sidebar-cap-main">
                <span className="chat-game-sidebar-cap-name">{row.label}</span>
                {row.hint && (
                  <span className="chat-game-sidebar-cap-hint">{row.hint}</span>
                )}
              </div>
              <span
                className={`chat-game-sidebar-cap-pill ${row.enabled ? "is-on" : "is-off"}`}
              >
                {row.enabled
                  ? t("chat.modal.capEnabled")
                  : t("chat.modal.capDisabled")}
              </span>
            </div>
          ))}
        </div>
        {selfStatus && (
          <div className="chat-game-sidebar-cap-meta">
            <span>
              {t("chat.modal.tradeMode")}: {selfStatus.tradePermissionMode}
            </span>
            <span>
              {t("chat.modal.wallet")}: {walletLabel}
            </span>
          </div>
        )}
      </div>
      <div className="chat-game-sidebar-usage">
        <div className="chat-game-sidebar-footer-label">
          {t("chat.modal.tokenUsage")}
        </div>
        <div className="chat-game-sidebar-usage-total">{usageTotalLabel}</div>
        <div className="chat-game-sidebar-usage-breakdown">
          {usageBreakdownLabel}
        </div>
        <div className="chat-game-sidebar-usage-cost">
          {t("chat.modal.estimatedCost")}: {usageCostLabel}
        </div>
      </div>
    </div>
  );
}
