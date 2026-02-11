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

import { useState, useEffect, useCallback } from "react";
import { useApp } from "../AppContext";
import {
  client,
  type AllPermissionsState,
  type SystemPermissionId,
  type PermissionStatus,
  type PluginInfo,
} from "../api-client";

/** Permission definition for UI rendering. */
interface PermissionDef {
  id: SystemPermissionId;
  name: string;
  description: string;
  icon: string;
  platforms: string[];
  requiredForFeatures: string[];
}

const SYSTEM_PERMISSIONS: PermissionDef[] = [
  {
    id: "accessibility",
    name: "Accessibility",
    description: "Control mouse, keyboard, and interact with other applications",
    icon: "cursor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "browser"],
  },
  {
    id: "screen-recording",
    name: "Screen Recording",
    description: "Capture screen content for screenshots and vision",
    icon: "monitor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "vision"],
  },
  {
    id: "microphone",
    name: "Microphone",
    description: "Voice input for talk mode and speech recognition",
    icon: "mic",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["talkmode", "voice"],
  },
  {
    id: "camera",
    name: "Camera",
    description: "Video input for vision and video capture",
    icon: "camera",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["camera", "vision"],
  },
  {
    id: "shell",
    name: "Shell Access",
    description: "Execute terminal commands and scripts",
    icon: "terminal",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["shell"],
  },
];

/** Capability toggle definition. */
interface CapabilityDef {
  id: string;
  label: string;
  description: string;
  requiredPermissions: SystemPermissionId[];
}

const CAPABILITIES: CapabilityDef[] = [
  {
    id: "browser",
    label: "Browser Control",
    description: "Automated web browsing and interaction",
    requiredPermissions: ["accessibility"],
  },
  {
    id: "computeruse",
    label: "Computer Use",
    description: "Full desktop control with mouse and keyboard",
    requiredPermissions: ["accessibility", "screen-recording"],
  },
  {
    id: "vision",
    label: "Vision",
    description: "Screen capture and visual analysis",
    requiredPermissions: ["screen-recording"],
  },
];

/** Status badge colors and labels. */
const STATUS_CONFIG: Record<PermissionStatus, { color: string; label: string }> = {
  granted: { color: "var(--ok, #16a34a)", label: "Granted" },
  denied: { color: "var(--danger, #e74c3c)", label: "Denied" },
  "not-determined": { color: "var(--warning, #f59e0b)", label: "Not Set" },
  restricted: { color: "var(--muted)", label: "Restricted" },
  "not-applicable": { color: "var(--muted)", label: "N/A" },
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

/** Status badge component. */
function StatusBadge({ status }: { status: PermissionStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: `${config.color}20`, color: config.color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: config.color }}
      />
      {config.label}
    </span>
  );
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
}: {
  def: PermissionDef;
  status: PermissionStatus;
  canRequest: boolean;
  onRequest: () => void;
  onOpenSettings: () => void;
  isShell: boolean;
  shellEnabled: boolean;
  onToggleShell?: (enabled: boolean) => void;
}) {
  const showAction = status !== "granted" && status !== "not-applicable";

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 border-b border-[var(--border)] last:border-b-0">
      <PermissionIcon icon={def.icon} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[13px]">{def.name}</span>
          <StatusBadge status={status} />
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-0.5 truncate">
          {def.description}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isShell && onToggleShell && status !== "not-applicable" && (
          <button
            type="button"
            className={`relative w-10 h-5 rounded-full transition-colors ${
              shellEnabled ? "bg-[var(--accent)]" : "bg-[var(--border)]"
            }`}
            onClick={() => onToggleShell(!shellEnabled)}
            title={shellEnabled ? "Disable shell access" : "Enable shell access"}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                shellEnabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        )}
        {showAction && !isShell && (
          <>
            {canRequest && (
              <button
                type="button"
                className="btn text-[11px] py-1 px-2.5"
                onClick={onRequest}
              >
                Request
              </button>
            )}
            <button
              type="button"
              className="btn text-[11px] py-1 px-2.5"
              onClick={onOpenSettings}
            >
              Settings
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Capability toggle button. */
function CapabilityToggle({
  cap,
  plugin,
  permissionsGranted,
  onToggle,
}: {
  cap: CapabilityDef;
  plugin: PluginInfo | null;
  permissionsGranted: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const enabled = plugin?.enabled ?? false;
  const available = plugin !== null;
  const canEnable = permissionsGranted && available;

  return (
    <div
      className={`flex items-center gap-3 p-3 border border-[var(--border)] ${
        enabled ? "bg-[var(--accent)]/10" : "bg-[var(--card)]"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[13px]">{cap.label}</span>
          {!permissionsGranted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--warning)]/20 text-[var(--warning)]">
              Missing Permissions
            </span>
          )}
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-0.5">
          {cap.description}
        </div>
      </div>
      <button
        type="button"
        className={`relative w-10 h-5 rounded-full transition-colors ${
          enabled ? "bg-[var(--accent)]" : "bg-[var(--border)]"
        } ${!canEnable ? "opacity-50 cursor-not-allowed" : ""}`}
        onClick={() => canEnable && onToggle(!enabled)}
        disabled={!canEnable}
        title={
          !available
            ? "Plugin not available"
            : !permissionsGranted
              ? "Grant required permissions first"
              : enabled
                ? "Disable"
                : "Enable"
        }
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            enabled ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function PermissionsSection() {
  const { plugins, handlePluginToggle } = useApp();
  const [permissions, setPermissions] = useState<AllPermissionsState | null>(null);
  const [platform, setPlatform] = useState<string>("unknown");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shellEnabled, setShellEnabled] = useState(true);

  /** Load permissions on mount. */
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [perms, isShell] = await Promise.all([
          client.getPermissions(),
          client.isShellEnabled(),
        ]);
        setPermissions(perms);
        setShellEnabled(isShell);
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

  /** Request a permission. */
  const handleRequest = useCallback(async (id: SystemPermissionId) => {
    try {
      const state = await client.requestPermission(id);
      setPermissions((prev) => (prev ? { ...prev, [id]: state } : prev));
    } catch (err) {
      console.error("Failed to request permission:", err);
    }
  }, []);

  /** Open system settings for a permission. */
  const handleOpenSettings = useCallback(async (id: SystemPermissionId) => {
    try {
      await client.openPermissionSettings(id);
    } catch (err) {
      console.error("Failed to open settings:", err);
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
        Loading permissions...
      </div>
    );
  }

  if (!permissions) {
    return (
      <div className="text-center py-6 text-[var(--muted)] text-xs">
        Unable to load permissions. This feature requires Electron.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Permissions */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm">System Permissions</div>
          <button
            type="button"
            className="btn text-[11px] py-1 px-2.5"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
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
              />
            );
          })}
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-2">
          {platform === "darwin" ? (
            <>
              macOS requires Accessibility permission for computer control.
              Open System Preferences → Security & Privacy → Privacy to grant access.
            </>
          ) : (
            <>
              Grant permissions to enable features like voice input and computer control.
            </>
          )}
        </div>
      </div>

      {/* Capability Toggles */}
      <div>
        <div className="font-bold text-sm mb-3">Capabilities</div>
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
                onToggle={(enabled) => {
                  if (plugin) void handlePluginToggle(cap.id, enabled);
                }}
              />
            );
          })}
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-2">
          Capabilities require their underlying system permissions to be granted.
          Enable capabilities to unlock agent features.
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
  onContinue: () => void;
}) {
  const [permissions, setPermissions] = useState<AllPermissionsState | null>(null);
  const [loading, setLoading] = useState(true);

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

  const handleRequest = useCallback(async (id: SystemPermissionId) => {
    try {
      const state = await client.requestPermission(id);
      setPermissions((prev) => (prev ? { ...prev, [id]: state } : prev));
    } catch (err) {
      console.error("Failed to request permission:", err);
    }
  }, []);

  const handleOpenSettings = useCallback(async (id: SystemPermissionId) => {
    try {
      await client.openPermissionSettings(id);
    } catch (err) {
      console.error("Failed to open settings:", err);
    }
  }, []);

  /** Check if all critical permissions are granted (or not applicable). */
  const allGranted = permissions
    ? ["accessibility", "screen-recording", "microphone"].every((id) => {
        const state = permissions[id as SystemPermissionId];
        return state?.status === "granted" || state?.status === "not-applicable";
      })
    : false;

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="text-[var(--muted)] text-sm">Checking permissions...</div>
      </div>
    );
  }

  if (!permissions) {
    return (
      <div className="text-center py-8">
        <div className="text-[var(--muted)] text-sm mb-4">
          Unable to check permissions. You can configure them later in Settings.
        </div>
        <button type="button" className="btn" onClick={onContinue}>
          Continue
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
        <div className="text-xl font-bold mb-2">System Permissions</div>
        <div className="text-[var(--muted)] text-sm">
          Grant permissions to unlock full capabilities
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
                <div className="font-semibold text-sm">{def.name}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {def.description}
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
                      Grant
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn text-xs py-1.5 px-3"
                    onClick={() => handleOpenSettings(def.id)}
                  >
                    Open Settings
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
          onClick={onContinue}
        >
          Skip for Now
        </button>
        {allGranted && (
          <button
            type="button"
            className="btn text-xs py-2 px-6"
            style={{
              background: "var(--accent)",
              borderColor: "var(--accent)",
            }}
            onClick={onContinue}
          >
            Continue
          </button>
        )}
      </div>

      <div className="text-center mt-4 text-[11px] text-[var(--muted)]">
        You can change these settings later in Settings → Permissions
      </div>
    </div>
  );
}
