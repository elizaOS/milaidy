/**
 * PermissionsSection — System permissions and capability toggles for Settings.
 *
 * Displays:
 *   - System permission statuses (accessibility, screen-recording, microphone, camera)
 *   - Shell access toggle (soft disable/enable)
 *   - Capability toggles (browser, computeruse, vision) that depend on permissions
 *
 * Works cross-platform with platform-specific permission requirements.
 */

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
import { useApp } from "../AppContext";
import {
  client,
  type AgentAutomationMode,
  type TradePermissionMode,
  type AllPermissionsState,
  type PermissionState,
  type SystemPermissionId,
  type PermissionStatus,
  type PluginInfo,
} from "../api-client";
import { hasRequiredOnboardingPermissions } from "../onboarding-permissions";
import { StatusBadge } from "./shared/ui-badges";
import { Switch } from "./shared/ui-switch";
import { createTranslator } from "../i18n";

/** Permission definition for UI rendering. */
interface PermissionDef {
  id: SystemPermissionId;
  nameKey: string;
  descriptionKey: string;
  icon: string;
  platforms: string[];
  requiredForFeatures: string[];
}

const SYSTEM_PERMISSIONS: PermissionDef[] = [
  {
    id: "accessibility",
    nameKey: "permissions.accessibility",
    descriptionKey: "permissions.accessibilityDesc",
    icon: "cursor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "browser"],
  },
  {
    id: "screen-recording",
    nameKey: "permissions.screenRecording",
    descriptionKey: "permissions.screenRecordingDesc",
    icon: "monitor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "vision"],
  },
  {
    id: "microphone",
    nameKey: "permissions.microphone",
    descriptionKey: "permissions.microphoneDesc",
    icon: "mic",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["talkmode", "voice"],
  },
  {
    id: "camera",
    nameKey: "permissions.camera",
    descriptionKey: "permissions.cameraDesc",
    icon: "camera",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["camera", "vision"],
  },
  {
    id: "shell",
    nameKey: "permissions.shellAccess",
    descriptionKey: "permissions.shellAccessDesc",
    icon: "terminal",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["shell"],
  },
];

/** Capability toggle definition. */
interface CapabilityDef {
  id: string;
  labelKey: string;
  descriptionKey: string;
  requiredPermissions: SystemPermissionId[];
}

const CAPABILITIES: CapabilityDef[] = [
  {
    id: "browser",
    labelKey: "permissions.browserControl",
    descriptionKey: "permissions.browserControlDesc",
    requiredPermissions: ["accessibility"],
  },
  {
    id: "computeruse",
    labelKey: "permissions.computerUse",
    descriptionKey: "permissions.computerUseDesc",
    requiredPermissions: ["accessibility", "screen-recording"],
  },
  {
    id: "vision",
    labelKey: "permissions.vision",
    descriptionKey: "permissions.visionDesc",
    requiredPermissions: ["screen-recording"],
  },
];

const PERMISSION_BADGE_LABELS: Record<
  PermissionStatus,
  { tone: "success" | "danger" | "warning" | "muted"; labelKey: string }
> = {
  granted: { tone: "success", labelKey: "permissions.granted" },
  denied: { tone: "danger", labelKey: "permissions.denied" },
  "not-determined": { tone: "warning", labelKey: "permissions.notSet" },
  restricted: { tone: "muted", labelKey: "permissions.restricted" },
  "not-applicable": { tone: "muted", labelKey: "permissions.na" },
};

/** Icon mapping for permissions. */
function PermissionIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    cursor: "🖱️",
    monitor: "🖥️",
    mic: "🎤",
    camera: "📷",
    terminal: "⌨️",
  };
  return <span className="text-base">{icons[icon] || "⚙️"}</span>;
}

/** Individual permission row. */
function PermissionRow({
  def,
  status,
  canRequest,
  onRequest,
  onOpenSettings,
  isShell,
  shellEnabled,
  onToggleShell,
  t,
}: {
  def: PermissionDef;
  status: PermissionStatus;
  canRequest: boolean;
  onRequest: () => void;
  onOpenSettings: () => void;
  isShell: boolean;
  shellEnabled: boolean;
  onToggleShell?: (enabled: boolean) => void;
  t: (key: string, vars?: Record<string, string | number | boolean | null | undefined>) => string;
}) {
  const showAction = status !== "granted" && status !== "not-applicable";
  const badge = PERMISSION_BADGE_LABELS[status];

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 border-b border-[var(--border)] last:border-b-0">
      <PermissionIcon icon={def.icon} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[13px]">{t(def.nameKey)}</span>
          <StatusBadge
            label={t(badge.labelKey)}
            tone={badge.tone}
            withDot
            className="rounded-full font-semibold"
          />
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-0.5 truncate">
          {t(def.descriptionKey)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isShell && onToggleShell && status !== "not-applicable" && (
          <Switch
            checked={shellEnabled}
            onChange={onToggleShell}
            title={
              shellEnabled
                ? t("permissions.disableShell")
                : t("permissions.enableShell")
            }
            trackOnClass="bg-[var(--accent)]"
            trackOffClass="bg-[var(--border)]"
          />
        )}
        {showAction && !isShell && (
          <>
            {canRequest && (
              <button
                type="button"
                className="btn text-[11px] py-1 px-2.5"
                onClick={onRequest}
              >
                {t("permissions.request")}
              </button>
            )}
            <button
              type="button"
              className="btn text-[11px] py-1 px-2.5"
              onClick={onOpenSettings}
            >
              {t("permissions.settings")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Human-readable display names for system permission IDs used in capability requirement lists. */
const PERMISSION_DISPLAY_NAMES: Record<SystemPermissionId, string> = {
  accessibility: "permissions.accessibility",
  "screen-recording": "permissions.screenRecording",
  microphone: "permissions.microphone",
  camera: "permissions.camera",
  shell: "permissions.shellAccess",
};

/** Capability toggle button. */
function CapabilityToggle({
  cap,
  plugin,
  permissionsGranted,
  togglingId,
  successId,
  errorId,
  onToggle,
  t,
}: {
  cap: CapabilityDef;
  plugin: PluginInfo | null;
  permissionsGranted: boolean;
  togglingId: string | null;
  successId: string | null;
  errorId: string | null;
  onToggle: (enabled: boolean) => void;
  t: (key: string, vars?: Record<string, string | number | boolean | null | undefined>) => string;
}) {
  const enabled = plugin?.enabled ?? false;
  const available = plugin !== null;
  const canEnable = permissionsGranted && available;
  const isToggling = togglingId === cap.id;
  const isSuccess = successId === cap.id;
  const isError = errorId === cap.id;

  // Build the "Requires: ..." line from the capability's requiredPermissions array.
  const requiresText =
    cap.requiredPermissions.length > 0
      ? cap.requiredPermissions
          .map((id) => t(PERMISSION_DISPLAY_NAMES[id] ?? id))
          .join(", ")
      : null;

  return (
    <div
      className={`flex items-center gap-3 p-3 border border-[var(--border)] ${
        enabled ? "bg-[var(--accent)]/10" : "bg-[var(--card)]"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[13px]">{t(cap.labelKey)}</span>
          {/* Spinner while the toggle API call is in-flight */}
          {isToggling && (
            <span className="text-[11px] text-[var(--muted)] animate-pulse">...</span>
          )}
          {/* Green checkmark flashed on success */}
          {isSuccess && !isToggling && (
            <span className="text-[11px] text-[var(--ok)]">&#10003;</span>
          )}
          {!permissionsGranted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--warning)]/20 text-[var(--warning)]">
              {t("permissions.missingPermissions")}
            </span>
          )}
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-0.5">
          {t(cap.descriptionKey)}
        </div>
        {/* Required permissions hint shown beneath the capability description */}
        {requiresText && (
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            {t("permissions.requires")}: {requiresText}
          </div>
        )}
        {/* Inline error shown when the toggle API call fails */}
        {isError && !isToggling && (
          <div className="text-[11px] text-[var(--danger)] mt-0.5">
            {t("permissions.failedToUpdate")}
          </div>
        )}
      </div>
      <Switch
        checked={enabled}
        onChange={onToggle}
        disabled={!canEnable || isToggling}
        disabledClassName="opacity-50 cursor-not-allowed"
        trackOnClass="bg-[var(--accent)]"
        trackOffClass="bg-[var(--border)]"
        title={
          isToggling
            ? t("permissions.updating")
            : !available
              ? t("permissions.pluginNotAvailable")
              : !permissionsGranted
                ? t("permissions.grantRequiredFirst")
                : enabled
                  ? t("permissions.disable")
                  : t("permissions.enable")
        }
      />
    </div>
  );
}

function usePermissionActions(
  setPermissions: Dispatch<SetStateAction<AllPermissionsState | null>>,
  setActionNotice?: (text: string, tone?: "info" | "success" | "error", ttlMs?: number) => void,
  t?: (key: string, vars?: Record<string, string | number | boolean | null | undefined>) => string,
) {
  const hasNativePermissionBridge = useCallback(() => {
    if (typeof window === "undefined") return false;
    const maybeElectron = (
      window as Window & {
        electron?: { ipcRenderer?: { invoke?: (...args: unknown[]) => Promise<unknown> } };
      }
    ).electron;
    return typeof maybeElectron?.ipcRenderer?.invoke === "function";
  }, []);

  const handleRequest = useCallback(async (id: SystemPermissionId) => {
    try {
      if (hasNativePermissionBridge()) {
        const maybeElectron = (
          window as Window & {
            electron?: { ipcRenderer?: { invoke?: (...args: unknown[]) => Promise<unknown> } };
          }
        ).electron;
        const state = (await maybeElectron?.ipcRenderer?.invoke?.(
          "permissions:request",
          id,
        )) as Partial<PermissionState> | undefined;
        if (
          state &&
          state.id === id &&
          typeof state.status === "string" &&
          typeof state.lastChecked === "number" &&
          typeof state.canRequest === "boolean"
        ) {
          setPermissions((prev) => (prev ? { ...prev, [id]: state as PermissionState } : prev));
          return;
        }
      }

      const state = await client.requestPermission(id);
      setPermissions((prev) => (prev ? { ...prev, [id]: state } : prev));
    } catch (err) {
      console.error("Failed to request permission:", err);
      setActionNotice?.(
        err instanceof Error
          ? err.message
          : (t?.("permissions.requestFailed") ?? "Failed to request permission."),
        "error",
        4200,
      );
    }
  }, [hasNativePermissionBridge, setPermissions, setActionNotice, t]);

  const handleOpenSettings = useCallback(async (id: SystemPermissionId) => {
    try {
      if (hasNativePermissionBridge()) {
        const maybeElectron = (
          window as Window & {
            electron?: { ipcRenderer?: { invoke?: (...args: unknown[]) => Promise<unknown> } };
          }
        ).electron;
        await maybeElectron?.ipcRenderer?.invoke?.("permissions:openSettings", id);
        setActionNotice?.(
          t?.("permissions.openedSystemSettings") ?? "Opened system settings.",
          "success",
          2200,
        );
        return;
      }

      await client.openPermissionSettings(id);
      setActionNotice?.(
        t
          ? t("permissions.openSettingsDesktopOnly")
          : "Open Settings only works in Milady Desktop. In browser/cloud mode, open OS settings manually.",
        "info",
        5200,
      );
    } catch (err) {
      console.error("Failed to open settings:", err);
      setActionNotice?.(
        err instanceof Error
          ? err.message
          : (t?.("permissions.openSettingsFailed") ??
            "Failed to open system settings."),
        "error",
        4200,
      );
    }
  }, [hasNativePermissionBridge, setActionNotice, t]);

  return { handleRequest, handleOpenSettings };
}

export function PermissionsSection() {
  const { plugins, handlePluginToggle, setActionNotice, uiLanguage } = useApp();
  const t = createTranslator(uiLanguage);
  const [permissions, setPermissions] = useState<AllPermissionsState | null>(null);
  const [platform, setPlatform] = useState<string>("unknown");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shellEnabled, setShellEnabled] = useState(true);
  const [automationMode, setAutomationMode] = useState<AgentAutomationMode>("full");
  const [automationSaving, setAutomationSaving] = useState(false);
  const [tradeMode, setTradeMode] = useState<TradePermissionMode>("user-sign-only");
  const [tradeModeSaving, setTradeModeSaving] = useState(false);
  const [productionDefaultsSaving, setProductionDefaultsSaving] = useState(false);
  // Tracks which capability toggle is currently being processed by an API call.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // Tracks which capability toggle recently succeeded (for the 1-second green checkmark).
  const [successId, setSuccessId] = useState<string | null>(null);
  // Tracks which capability toggle recently failed (for the inline error message).
  const [errorId, setErrorId] = useState<string | null>(null);
  const { handleRequest, handleOpenSettings } = usePermissionActions(
    setPermissions,
    setActionNotice,
    t,
  );

  /** Load permissions on mount. */
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [perms, isShell, automation] = await Promise.all([
          client.getPermissions(),
          client.isShellEnabled(),
          client.getAgentAutomationMode(),
        ]);
        setPermissions(perms);
        setShellEnabled(isShell);
        setAutomationMode(automation.mode);
        const trade = await client.getTradePermissionMode();
        setTradeMode(trade.mode);
        // Detect platform from permissions (accessibility only on darwin)
        if (perms.accessibility?.status !== "not-applicable") {
          setPlatform("darwin");
        } else if (perms.microphone?.status !== "not-applicable") {
          setPlatform("win32"); // or linux, but we can't easily distinguish
        }
      } catch (err) {
        console.error("Failed to load permissions:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Refresh permissions from OS. */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const perms = await client.refreshPermissions();
      setPermissions(perms);
    } catch (err) {
      console.error("Failed to refresh permissions:", err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  /** Toggle shell access. */
  const handleToggleShell = useCallback(async (enabled: boolean) => {
    try {
      const state = await client.setShellEnabled(enabled);
      setShellEnabled(enabled);
      setPermissions((prev) => (prev ? { ...prev, shell: state } : prev));
    } catch (err) {
      console.error("Failed to toggle shell:", err);
    }
  }, []);

  const handleAutomationModeChange = useCallback(async (mode: AgentAutomationMode) => {
    if (automationSaving || mode === automationMode) return;
    setAutomationSaving(true);
    try {
      const result = await client.setAgentAutomationMode(mode);
      setAutomationMode(result.mode);
      setActionNotice?.(
        result.mode === "full"
          ? t("permissions.automationModeSetFull")
          : t("permissions.automationModeSetConnectors"),
        "success",
        2200,
      );
    } catch (err) {
      console.error("Failed to update automation mode:", err);
      setActionNotice?.(
        err instanceof Error
          ? err.message
          : t("permissions.updateAutomationFailed"),
        "error",
        4200,
      );
    } finally {
      setAutomationSaving(false);
    }
  }, [automationMode, automationSaving, setActionNotice, t]);

  const handleTradeModeChange = useCallback(
    async (mode: TradePermissionMode) => {
      if (tradeModeSaving || mode === tradeMode) return;
      setTradeModeSaving(true);
      try {
        const result = await client.setTradePermissionMode(mode);
        setTradeMode(result.mode);
        const notice =
          result.mode === "agent-auto"
            ? t("permissions.tradeModeSetAgent")
            : result.mode === "manual-local-key"
              ? t("permissions.tradeModeSetManual")
              : t("permissions.tradeModeSetUser");
        setActionNotice?.(notice, "success", 2200);
      } catch (err) {
        console.error("Failed to update trade mode:", err);
        setActionNotice?.(
          err instanceof Error ? err.message : t("permissions.updateTradeFailed"),
          "error",
          4200,
        );
      } finally {
        setTradeModeSaving(false);
      }
    },
    [tradeMode, tradeModeSaving, setActionNotice, t],
  );

  const handleApplyProductionDefaults = useCallback(async () => {
    if (productionDefaultsSaving) return;
    const confirmFn =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm.bind(window)
        : () => true;
    const confirmed = confirmFn(t("permissions.confirmProductionDefaults"));
    if (!confirmed) return;

    setProductionDefaultsSaving(true);
    try {
      const result = await client.applyProductionWalletDefaults();
      setTradeMode(result.tradePermissionMode);
      setActionNotice?.(
        t("permissions.productionDefaultsApplied"),
        "success",
        3200,
      );
    } catch (err) {
      console.error("Failed to apply production defaults:", err);
      setActionNotice?.(
        err instanceof Error
          ? err.message
          : t("permissions.productionDefaultsFailed"),
        "error",
        4200,
      );
    } finally {
      setProductionDefaultsSaving(false);
    }
  }, [productionDefaultsSaving, setActionNotice, t]);

  /** Check if all required permissions for a capability are granted. */
  const arePermissionsGranted = useCallback(
    (requiredPerms: SystemPermissionId[]): boolean => {
      if (!permissions) return false;
      return requiredPerms.every((id) => {
        const state = permissions[id];
        return state?.status === "granted" || state?.status === "not-applicable";
      });
    },
    [permissions],
  );

  /** Filter permissions applicable to current platform. */
  const applicablePermissions = SYSTEM_PERMISSIONS.filter((def) => {
    if (!permissions) return true;
    const state = permissions[def.id];
    return state?.status !== "not-applicable";
  });

  if (loading) {
    return (
      <div className="text-center py-6 text-[var(--muted)] text-xs">
        {t("permissions.loadingPermissions")}
      </div>
    );
  }

  if (!permissions) {
    return (
      <div className="text-center py-6 text-[var(--muted)] text-xs">
        {t("permissions.unableLoadPermissions")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Permissions */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <div className="font-bold text-sm">{t("permissions.systemPermissions")}</div>
          <button
            type="button"
            className="btn text-[11px] py-1 px-2.5"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? t("permissions.refreshing") : t("permissions.refresh")}
          </button>
        </div>
        <div className="text-[11px] text-[var(--muted)] mb-3">
          {t("permissions.desktopOnlyHint")}
        </div>
        <div className="border border-[var(--border)] bg-[var(--card)]">
          {applicablePermissions.map((def) => {
            const state = permissions[def.id];
            return (
              <PermissionRow
                key={def.id}
                def={def}
                status={state?.status ?? "not-determined"}
                canRequest={state?.canRequest ?? false}
                onRequest={() => handleRequest(def.id)}
                onOpenSettings={() => handleOpenSettings(def.id)}
                isShell={def.id === "shell"}
                shellEnabled={shellEnabled}
                onToggleShell={def.id === "shell" ? handleToggleShell : undefined}
                t={t}
              />
            );
          })}
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-2">
          {platform === "darwin" ? (
            t("permissions.macosHint")
          ) : (
            t("permissions.genericHint")
          )}
        </div>
      </div>

      {/* Agent automation permissions */}
      <div>
        <div className="font-bold text-sm mb-3">{t("permissions.automationMode")}</div>
        <div className="border border-[var(--border)] bg-[var(--card)] p-3 space-y-2">
          <div className="text-[11px] text-[var(--muted)]">
            {t("permissions.automationHint")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              className={`text-left p-2.5 border rounded ${
                automationMode === "connectors-only"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] bg-[var(--bg)]"
              }`}
              disabled={automationSaving}
              onClick={() => {
                void handleAutomationModeChange("connectors-only");
              }}
            >
              <div className="text-[12px] font-semibold">{t("permissions.mode.semi")}</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">
                {t("permissions.mode.semiDesc")}
              </div>
            </button>
            <button
              type="button"
              className={`text-left p-2.5 border rounded ${
                automationMode === "full"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] bg-[var(--bg)]"
              }`}
              disabled={automationSaving}
              onClick={() => {
                void handleAutomationModeChange("full");
              }}
            >
              <div className="text-[12px] font-semibold">{t("permissions.mode.full")}</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">
                {t("permissions.mode.fullDesc")}
              </div>
            </button>
          </div>
          <div className="text-[11px] text-[var(--muted)]">
            {t("permissions.current")}:{" "}
            <strong>
              {automationMode === "full"
                ? t("permissions.mode.full")
                : t("permissions.mode.semi")}
            </strong>
            {automationSaving ? ` (${t("permissions.saving")})` : ""}
          </div>
        </div>
      </div>

      {/* Wallet trade permissions */}
      <div>
        <div className="font-bold text-sm mb-3">{t("permissions.tradeMode")}</div>
        <div className="border border-[var(--border)] bg-[var(--card)] p-3 space-y-2">
          <div className="text-[11px] text-[var(--muted)]">
            {t("permissions.tradeHint")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              className={`text-left p-2.5 border rounded ${
                tradeMode === "user-sign-only"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] bg-[var(--bg)]"
              }`}
              disabled={tradeModeSaving}
              onClick={() => {
                void handleTradeModeChange("user-sign-only");
              }}
            >
              <div className="text-[12px] font-semibold">{t("permissions.trade.userSign")}</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">
                {t("permissions.trade.userSignDesc")}
              </div>
            </button>
            <button
              type="button"
              className={`text-left p-2.5 border rounded ${
                tradeMode === "manual-local-key"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] bg-[var(--bg)]"
              }`}
              disabled={tradeModeSaving}
              onClick={() => {
                void handleTradeModeChange("manual-local-key");
              }}
            >
              <div className="text-[12px] font-semibold">{t("permissions.trade.manual")}</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">
                {t("permissions.trade.manualDesc")}
              </div>
            </button>
            <button
              type="button"
              className={`text-left p-2.5 border rounded ${
                tradeMode === "agent-auto"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] bg-[var(--bg)]"
              }`}
              disabled={tradeModeSaving}
              onClick={() => {
                void handleTradeModeChange("agent-auto");
              }}
            >
              <div className="text-[12px] font-semibold">{t("permissions.trade.agent")}</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">
                {t("permissions.trade.agentDesc")}
              </div>
            </button>
          </div>
          <div className="text-[11px] text-[var(--muted)]">
            {t("permissions.current")}:{" "}
            <strong>
              {tradeMode === "agent-auto"
                ? t("permissions.trade.agent")
                : tradeMode === "manual-local-key"
                  ? t("permissions.trade.manual")
                  : t("permissions.trade.userSign")}
            </strong>
            {tradeModeSaving ? ` (${t("permissions.saving")})` : ""}
          </div>
          <div className="pt-2 mt-1 border-t border-[var(--border)] flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] text-[var(--muted)]">
              {t("permissions.productionDefaults")}
            </div>
            <button
              type="button"
              className="btn text-xs py-1.5 px-3.5 !mt-0"
              onClick={() => {
                void handleApplyProductionDefaults();
              }}
              disabled={productionDefaultsSaving}
            >
              {productionDefaultsSaving
                ? t("permissions.applying")
                : t("permissions.applyProductionDefaults")}
            </button>
          </div>
        </div>
      </div>

      {/* Capability Toggles */}
      <div>
        <div className="font-bold text-sm mb-3">{t("permissions.capabilities")}</div>
        <div className="space-y-2">
          {CAPABILITIES.map((cap) => {
            const plugin = plugins.find((p) => p.id === cap.id) ?? null;
            const permissionsGranted = arePermissionsGranted(cap.requiredPermissions);
            return (
              <CapabilityToggle
                key={cap.id}
                cap={cap}
                plugin={plugin}
                permissionsGranted={permissionsGranted}
                togglingId={togglingId}
                successId={successId}
                errorId={errorId}
                onToggle={async (enabled) => {
                  if (!plugin) return;
                  // Clear any previous error for this item and mark it as in-flight.
                  setErrorId(null);
                  setSuccessId(null);
                  setTogglingId(cap.id);
                  try {
                    await handlePluginToggle(cap.id, enabled);
                    // Flash the green checkmark for 1 second on success.
                    setSuccessId(cap.id);
                    setTimeout(() => setSuccessId(null), 1000);
                  } catch {
                    setErrorId(cap.id);
                  } finally {
                    setTogglingId(null);
                  }
                }}
                t={t}
              />
            );
          })}
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-2">
          {t("permissions.capabilitiesHint")}
        </div>
      </div>
    </div>
  );
}

/**
 * PermissionsOnboardingSection — Simplified view for onboarding wizard.
 *
 * Shows only essential permissions with clear CTAs.
 */
export function PermissionsOnboardingSection({
  onContinue,
}: {
  onContinue: (options?: { allowPermissionBypass?: boolean }) => void;
}) {
  const { setActionNotice, uiLanguage } = useApp();
  const t = createTranslator(uiLanguage);
  const [permissions, setPermissions] = useState<AllPermissionsState | null>(null);
  const [loading, setLoading] = useState(true);
  const { handleRequest, handleOpenSettings } = usePermissionActions(
    setPermissions,
    setActionNotice,
    t,
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const perms = await client.getPermissions();
        setPermissions(perms);
      } catch (err) {
        console.error("Failed to load permissions:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Check if all critical permissions are granted (or not applicable). */
  const allGranted = hasRequiredOnboardingPermissions(permissions);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="text-[var(--muted)] text-sm">{t("permissions.checking")}</div>
      </div>
    );
  }

  if (!permissions) {
    return (
      <div className="text-center py-8">
        <div className="text-[var(--muted)] text-sm mb-4">
          {t("permissions.unableCheck")}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => onContinue({ allowPermissionBypass: true })}
        >
          {t("permissions.continue")}
        </button>
      </div>
    );
  }

  const essentialPermissions = SYSTEM_PERMISSIONS.filter((def) => {
    const state = permissions[def.id];
    // Show non-applicable permissions and shell toggle
    return state?.status !== "not-applicable" && def.id !== "shell";
  });

  return (
    <div>
      <div className="text-center mb-6">
        <div className="text-xl font-bold mb-2">{t("permissions.systemPermissions")}</div>
        <div className="text-[var(--muted)] text-sm">
          {t("permissions.grantToUnlock")}
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {essentialPermissions.map((def) => {
          const state = permissions[def.id];
          const status = state?.status ?? "not-determined";
          const canRequest = state?.canRequest ?? false;
          const isGranted = status === "granted";

          return (
            <div
              key={def.id}
              className={`flex items-center gap-4 p-4 border ${
                isGranted
                  ? "border-[var(--ok)] bg-[var(--ok)]/10"
                  : "border-[var(--border)] bg-[var(--card)]"
              }`}
            >
              <PermissionIcon icon={def.icon} />
              <div className="flex-1">
                <div className="font-semibold text-sm">{t(def.nameKey)}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {t(def.descriptionKey)}
                </div>
              </div>
              {isGranted ? (
                <span className="text-[var(--ok)] text-sm">✓</span>
              ) : (
                <div className="flex gap-2">
                  {canRequest && (
                    <button
                      type="button"
                      className="btn text-xs py-1.5 px-3"
                      onClick={() => handleRequest(def.id)}
                    >
                      {t("permissions.grant")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn text-xs py-1.5 px-3"
                    onClick={() => handleOpenSettings(def.id)}
                  >
                    {t("permissions.settings")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-center gap-3">
        <button
          type="button"
          className="btn text-xs py-2 px-6 opacity-70"
          onClick={() => onContinue({ allowPermissionBypass: true })}
        >
          {t("permissions.skipForNow")}
        </button>
        {allGranted && (
          <button
            type="button"
            className="btn text-xs py-2 px-6"
            style={{
              background: "var(--accent)",
              borderColor: "var(--accent)",
            }}
            onClick={() => onContinue()}
          >
            {t("permissions.continue")}
          </button>
        )}
      </div>

      <div className="text-center mt-4 text-[11px] text-[var(--muted)]">
        {t("permissions.changeLater")}
      </div>
    </div>
  );
}
