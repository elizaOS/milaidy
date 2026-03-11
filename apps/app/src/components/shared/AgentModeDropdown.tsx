import {
  type AgentAutomationMode,
  client,
  type TradePermissionMode,
} from "@milady/app-core/api";
import {
  dispatchWindowEvent,
  SELF_STATUS_SYNC_EVENT,
} from "@milady/app-core/events";
import { Bot, Check, Cpu, Settings2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../AppContext";

export interface AgentModeDropdownProps {
  variant?: "native" | "companion";
}

export function AgentModeDropdown({
  variant = "native",
}: AgentModeDropdownProps) {
  const { chatMode, setActionNotice, setState, t } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const [automationMode, setAutomationMode] =
    useState<AgentAutomationMode | null>(null);
  const [tradeMode, setTradeMode] = useState<TradePermissionMode | null>(null);
  const [modeLoading, setModeLoading] = useState(false);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [tradeSaving, setTradeSaving] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const notifySelfStatusRefresh = useCallback(() => {
    dispatchWindowEvent(SELF_STATUS_SYNC_EVENT);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    if (
      typeof document === "undefined" ||
      typeof document.addEventListener !== "function"
    ) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!moreMenuRef.current) return;
      const target = event.target as Node | null;
      if (target && !moreMenuRef.current.contains(target)) {
        setMoreOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    let cancelled = false;
    setModeLoading(true);
    void Promise.all([
      client.getAgentAutomationMode(),
      client.getTradePermissionMode(),
    ])
      .then(([automationResult, tradeResult]) => {
        if (cancelled) return;
        setAutomationMode(automationResult.mode);
        setTradeMode(tradeResult.mode);
      })
      .catch(() => {
        if (cancelled) return;
        setAutomationMode(null);
        setTradeMode(null);
      })
      .finally(() => {
        if (!cancelled) setModeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moreOpen]);

  const automationModeLabel =
    automationMode === "full"
      ? t("permissions.mode.full")
      : automationMode === "connectors-only"
        ? t("permissions.mode.semi")
        : t("chat.modal.modeUnknown");

  const tradeModeLabel =
    tradeMode === "agent-auto"
      ? t("permissions.trade.agent")
      : tradeMode === "manual-local-key"
        ? t("permissions.trade.manual")
        : tradeMode === "user-sign-only"
          ? t("permissions.trade.userSign")
          : t("chat.modal.modeUnknown");

  const chatModeLabel =
    chatMode === "power"
      ? t("chat.modal.responseModePower")
      : t("chat.modal.responseModeSimple");

  const handleAutomationModeChange = useCallback(
    async (mode: AgentAutomationMode) => {
      if (modeLoading || automationSaving || mode === automationMode) return;
      setAutomationSaving(true);
      try {
        const result = await client.setAgentAutomationMode(mode);
        setAutomationMode(result.mode);
        if (result.mode === "full" && chatMode !== "power") {
          setState("chatMode", "power");
          setActionNotice?.(
            t("chat.modal.responseModeAutoPower"),
            "info",
            2400,
          );
        }
        setActionNotice?.(
          result.mode === "full"
            ? t("permissions.automationModeSetFull")
            : t("permissions.automationModeSetConnectors"),
          "success",
          2200,
        );
        notifySelfStatusRefresh();
      } catch (err) {
        setActionNotice?.(
          err instanceof Error
            ? err.message
            : t("permissions.updateAutomationFailed"),
          "error",
          3600,
        );
      } finally {
        setAutomationSaving(false);
      }
    },
    [
      automationMode,
      automationSaving,
      chatMode,
      modeLoading,
      notifySelfStatusRefresh,
      setActionNotice,
      setState,
      t,
    ],
  );

  const handleTradeModeChange = useCallback(
    async (mode: TradePermissionMode) => {
      if (modeLoading || tradeSaving || mode === tradeMode) return;
      setTradeSaving(true);
      try {
        const result = await client.setTradePermissionMode(mode);
        setTradeMode(result.mode);
        if (result.mode === "agent-auto" && chatMode !== "power") {
          setState("chatMode", "power");
          setActionNotice?.(
            t("chat.modal.responseModeAutoPower"),
            "info",
            2400,
          );
        }
        const notice =
          result.mode === "agent-auto"
            ? t("permissions.tradeModeSetAgent")
            : result.mode === "manual-local-key"
              ? t("permissions.tradeModeSetManual")
              : t("permissions.tradeModeSetUser");
        setActionNotice?.(notice, "success", 2200);
        notifySelfStatusRefresh();
      } catch (err) {
        setActionNotice?.(
          err instanceof Error
            ? err.message
            : t("permissions.updateTradeFailed"),
          "error",
          3600,
        );
      } finally {
        setTradeSaving(false);
      }
    },
    [
      chatMode,
      modeLoading,
      notifySelfStatusRefresh,
      setActionNotice,
      setState,
      t,
      tradeMode,
      tradeSaving,
    ],
  );

  const isCompanion = variant === "companion";
  const theme = {
    panelBg: isCompanion
      ? "bg-black/80 backdrop-blur-xl border-white/10"
      : "bg-bg-elevated border-border",
    textStrong: isCompanion ? "text-white/90" : "text-txt-strong",
    textMuted: isCompanion ? "text-white/60" : "text-muted",
    textAccent: isCompanion ? "text-white/90" : "text-accent",
    cardBg: isCompanion
      ? "bg-black/40 border-white/10"
      : "bg-bg-accent border-border",
    btnBase:
      "flex-1 py-1.5 px-2 text-[11px] font-medium rounded-md transition-all",
    btnActive: isCompanion
      ? "bg-white/20 text-white shadow-sm"
      : "bg-bg shadow-sm text-txt-strong",
    btnInactive: isCompanion
      ? "text-white/60 hover:text-white hover:bg-white/5"
      : "text-muted hover:text-txt",
    btnCardBase:
      "flex-1 flex flex-col items-center justify-center py-2 px-1 text-[11px] font-medium rounded-md transition-all",
    btnCardActive: isCompanion
      ? "bg-white/20 shadow-sm border border-white/30 text-white font-semibold"
      : "bg-bg shadow-sm border border-accent/20 text-accent font-semibold",
    btnCardInactive: isCompanion
      ? "text-white/60 hover:bg-white/10 hover:text-white"
      : "text-muted hover:bg-bg/50 hover:text-txt",
    listBtnBase:
      "flex items-center justify-between w-full py-1.5 px-3 text-[11px] font-medium rounded-md transition-all",
    divider: isCompanion ? "border-white/10" : "border-border",
  };

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (moreOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [moreOpen]);

  const triggerClass =
    variant === "native"
      ? `inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border border-border bg-bg cursor-pointer text-sm leading-none hover:border-accent hover:text-accent transition-all duration-200 hover:shadow-sm hover:scale-105 active:scale-95 rounded-md ${moreOpen ? "bg-accent/10 border-accent text-accent shadow-sm" : ""}`
      : `flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-white/80 hover:text-white hover:bg-white/20 border border-transparent hover:border-white/30 transition-all cursor-pointer ${moreOpen ? "bg-white/20 text-white border-white/30 shadow-sm" : ""}`;

  return (
    <div className="relative inline-flex shrink-0 text-left" ref={moreMenuRef}>
      <button
        type="button"
        ref={triggerRef}
        className={triggerClass}
        onClick={() => setMoreOpen(!moreOpen)}
        title={t("chat.modal.agentMode")}
      >
        {variant === "native" ? (
          <Settings2 className="w-5 h-5" />
        ) : (
          <Cpu className="w-4 h-4" />
        )}
      </button>

      {moreOpen && dropdownPos && createPortal(
        <div
          className={`fixed w-[340px] border rounded-xl shadow-2xl overflow-hidden flex flex-col ${theme.panelBg}`}
          style={{ top: dropdownPos.top, right: dropdownPos.right, zIndex: 99999 }}
          role="menu"
        >
          <div className="p-4 space-y-4" data-testid="chat-game-agent-mode-controls">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Bot className={`w-4 h-4 ${theme.textAccent}`} />
                <span className={`font-semibold text-sm ${theme.textStrong}`}>
                  {t("chat.modal.agentMode")}
                </span>
              </div>
              <p className={`text-[11px] leading-tight ${theme.textMuted}`}>
                {modeLoading
                  ? t("chat.modal.providerDetecting")
                  : `${automationModeLabel} • ${tradeModeLabel} • ${chatModeLabel}`}
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <span className={`text-xs font-medium ${isCompanion ? "text-white/80" : "text-txt"}`}>
                  {t("chat.modal.responseMode")}
                </span>
                <div className={`flex p-1 rounded-lg border ${theme.cardBg}`}>
                  <button
                    type="button"
                    className={`${theme.btnBase} ${chatMode === "simple" ? theme.btnActive : theme.btnInactive}`}
                    onClick={() => setState("chatMode", "simple")}
                    data-testid="chat-game-response-simple"
                  >
                    {t("chat.modal.responseModeSimple")}
                  </button>
                  <button
                    type="button"
                    className={`${theme.btnBase} ${chatMode === "power" ? theme.btnActive : theme.btnInactive}`}
                    onClick={() => setState("chatMode", "power")}
                    data-testid="chat-game-response-power"
                  >
                    {t("chat.modal.responseModePower")}
                  </button>
                </div>
                <p className={`text-[10px] leading-tight ${theme.textMuted}`}>
                  {chatMode === "power"
                    ? t("chat.modal.responseModeHintPower")
                    : t("chat.modal.responseModeHintSimple")}
                </p>
              </div>

              <div className="space-y-2">
                <span className={`text-xs font-medium ${isCompanion ? "text-white/80" : "text-txt"}`}>
                  {t("permissions.automationMode")}
                </span>
                <div className={`flex p-1 rounded-lg border gap-1 ${theme.cardBg}`}>
                  <button
                    type="button"
                    className={`${theme.btnCardBase} ${automationMode === "connectors-only" ? theme.btnCardActive : theme.btnCardInactive}`}
                    disabled={modeLoading || automationSaving}
                    onClick={() => void handleAutomationModeChange("connectors-only")}
                    data-testid="chat-game-automation-connectors"
                  >
                    <span className="mb-0.5">{t("permissions.mode.semi")}</span>
                  </button>
                  <button
                    type="button"
                    className={`${theme.btnCardBase} ${automationMode === "full" ? theme.btnCardActive : theme.btnCardInactive}`}
                    disabled={modeLoading || automationSaving}
                    onClick={() => void handleAutomationModeChange("full")}
                    data-testid="chat-game-automation-full"
                  >
                    <span className="mb-0.5">{t("permissions.mode.full")}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <span className={`text-xs font-medium ${isCompanion ? "text-white/80" : "text-txt"}`}>
                  {t("permissions.tradeMode")}
                </span>
                <div className={`flex flex-col p-1 rounded-lg border gap-1 ${theme.cardBg}`}>
                  <button
                    type="button"
                    className={`${theme.listBtnBase} ${tradeMode === "user-sign-only" ? theme.btnActive : theme.btnInactive}`}
                    disabled={modeLoading || tradeSaving}
                    onClick={() => void handleTradeModeChange("user-sign-only")}
                    data-testid="chat-game-trade-user-sign"
                  >
                    {t("permissions.trade.userSign")}
                    {tradeMode === "user-sign-only" && <Check className={`w-3.5 h-3.5 ${theme.textAccent}`} />}
                  </button>
                  <button
                    type="button"
                    className={`${theme.listBtnBase} ${tradeMode === "manual-local-key" ? theme.btnActive : theme.btnInactive}`}
                    disabled={modeLoading || tradeSaving}
                    onClick={() => void handleTradeModeChange("manual-local-key")}
                    data-testid="chat-game-trade-manual"
                  >
                    {t("permissions.trade.manual")}
                    {tradeMode === "manual-local-key" && <Check className={`w-3.5 h-3.5 ${theme.textAccent}`} />}
                  </button>
                  <button
                    type="button"
                    className={`${theme.listBtnBase} ${tradeMode === "agent-auto" ? theme.btnCardActive : theme.btnInactive}`}
                    disabled={modeLoading || tradeSaving}
                    onClick={() => void handleTradeModeChange("agent-auto")}
                    data-testid="chat-game-trade-agent"
                  >
                    {t("permissions.trade.agent")}
                    {tradeMode === "agent-auto" && <Check className={`w-3.5 h-3.5 ${theme.textAccent}`} />}
                  </button>
                </div>
              </div>
            </div>

            <p className={`text-[10px] text-center pt-2 border-t ${theme.textMuted} ${theme.divider}`}>
              {t("chat.modal.tradeModeHint")}
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
