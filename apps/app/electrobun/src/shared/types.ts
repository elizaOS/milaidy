/**
 * Shared types for the Milady Electrobun desktop package.
 *
 * This module has no imports from electrobun/bun or electrobun/view so it
 * can be safely imported by both bun-side code and renderer-side code
 * (including the preload bridge).
 */

// ── Agent ────────────────────────────────────────────────────────────────────

export interface AgentStatus {
  state: "not_started" | "starting" | "running" | "stopped" | "error";
  agentName: string | null;
  port: number | null;
  startedAt: number | null;
  error: string | null;
}

// ── Desktop ──────────────────────────────────────────────────────────────────

export interface TrayMenuItem {
  id: string;
  label?: string;
  type?: "normal" | "separator" | "checkbox" | "radio";
  checked?: boolean;
  enabled?: boolean;
  visible?: boolean;
  icon?: string;
  accelerator?: string;
  submenu?: TrayMenuItem[];
}

export interface TrayOptions {
  icon: string;
  tooltip?: string;
  title?: string;
  menu?: TrayMenuItem[];
}

export interface TrayClickEvent {
  x: number;
  y: number;
  button: string;
  modifiers: { alt: boolean; shift: boolean; ctrl: boolean; meta: boolean };
}

export interface ShortcutOptions {
  id: string;
  accelerator: string;
  enabled?: boolean;
}

export interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  silent?: boolean;
  urgency?: "normal" | "critical" | "low";
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowOptions {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resizable?: boolean;
  alwaysOnTop?: boolean;
  fullscreen?: boolean;
  opacity?: number;
  title?: string;
}

export interface ClipboardWriteOptions {
  text?: string;
  html?: string;
  image?: string;
  rtf?: string;
}

export interface ClipboardReadResult {
  text?: string;
  html?: string;
  rtf?: string;
  hasImage: boolean;
}

export interface VersionInfo {
  version: string;
  name: string;
  runtime: string;
}

export interface PowerState {
  onBattery: boolean;
  idleState: "active" | "idle" | "locked" | "unknown";
  idleTime: number;
}

// ── Gateway ──────────────────────────────────────────────────────────────────

export interface GatewayEndpoint {
  stableId: string;
  name: string;
  host: string;
  port: number;
  lanHost?: string;
  tailnetDns?: string;
  gatewayPort?: number;
  canvasPort?: number;
  tlsEnabled: boolean;
  tlsFingerprintSha256?: string;
  isLocal: boolean;
}

export interface DiscoveryOptions {
  serviceType?: string;
  timeout?: number;
}

export interface DiscoveryResult {
  gateways: GatewayEndpoint[];
  status: string;
}

// ── Permissions ──────────────────────────────────────────────────────────────

export type SystemPermissionId =
  | "accessibility"
  | "screen-recording"
  | "microphone"
  | "camera"
  | "shell";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "not-applicable";

export interface PermissionState {
  id: SystemPermissionId;
  status: PermissionStatus;
  lastChecked: number;
  canRequest: boolean;
}

export interface AllPermissionsState {
  [key: string]: PermissionState;
}

// ── Canvas ───────────────────────────────────────────────────────────────────

export interface CanvasWindowOptions {
  url?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  title?: string;
  transparent?: boolean;
}

export interface CanvasWindowInfo {
  id: string;
  url: string;
  bounds: WindowBounds;
  title: string;
}

// ── Camera ───────────────────────────────────────────────────────────────────

export interface CameraDevice {
  deviceId: string;
  label: string;
  kind: string;
}

// ── Screen capture ───────────────────────────────────────────────────────────

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon?: string;
}

// ── TalkMode ─────────────────────────────────────────────────────────────────

export type TalkModeState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export interface TalkModeConfig {
  engine?: "whisper" | "web";
  modelSize?: string;
  language?: string;
  voiceId?: string;
}

// ── LIFO (PiP) ───────────────────────────────────────────────────────────────

export interface PipState {
  enabled: boolean;
  windowId?: string;
}
