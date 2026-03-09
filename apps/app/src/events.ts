/**
 * Typed constants for milady:* custom events dispatched across the app.
 *
 * Using these constants instead of raw strings prevents typo-driven drift
 * between producers (main.tsx, bridge, components) and consumers (AppContext,
 * EmotePicker, ChatView, etc.).
 */

// ── App lifecycle ────────────────────────────────────────────────────────
export const COMMAND_PALETTE_EVENT = "milady:command-palette" as const;
export const EMOTE_PICKER_EVENT = "milady:emote-picker" as const;
export const STOP_EMOTE_EVENT = "milady:stop-emote" as const;

// ── Agent / bridge ───────────────────────────────────────────────────────
export const AGENT_READY_EVENT = "milady:agent-ready" as const;
export const BRIDGE_READY_EVENT = "milady:bridge-ready" as const;
export const SHARE_TARGET_EVENT = "milady:share-target" as const;
export const TRAY_ACTION_EVENT = "milady:tray-action" as const;

// ── App state ────────────────────────────────────────────────────────────
export const APP_RESUME_EVENT = "milady:app-resume" as const;
export const APP_PAUSE_EVENT = "milady:app-pause" as const;
export const CONNECT_EVENT = "milady:connect" as const;

// ── Voice / config ───────────────────────────────────────────────────────
export const VOICE_CONFIG_UPDATED_EVENT =
  "milady:voice-config-updated" as const;

// ── Sidebar sync ─────────────────────────────────────────────────────────
export const SELF_STATUS_SYNC_EVENT = "milady:self-status-refresh" as const;

// ── Helpers ──────────────────────────────────────────────────────────────

/** All known milady:* event names. */
export type MiladyEventName =
  | typeof COMMAND_PALETTE_EVENT
  | typeof EMOTE_PICKER_EVENT
  | typeof STOP_EMOTE_EVENT
  | typeof AGENT_READY_EVENT
  | typeof BRIDGE_READY_EVENT
  | typeof SHARE_TARGET_EVENT
  | typeof TRAY_ACTION_EVENT
  | typeof APP_RESUME_EVENT
  | typeof APP_PAUSE_EVENT
  | typeof CONNECT_EVENT
  | typeof VOICE_CONFIG_UPDATED_EVENT
  | typeof SELF_STATUS_SYNC_EVENT;

/** Dispatch a typed custom event on `document`. */
export function dispatchMiladyEvent(
  name: MiladyEventName,
  detail?: unknown,
): void {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Dispatch a typed custom event on `window`. */
export function dispatchWindowEvent(
  name: MiladyEventName,
  detail?: unknown,
): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
