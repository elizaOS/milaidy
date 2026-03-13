/**
 * Signal pairing service — manages device linking via QR code.
 *
 * Mirrors whatsapp-pairing.ts but uses @milady/signal-native instead of
 * Baileys. Signal linking produces a single provisioning URL (not a refresh
 * loop) — if it times out, restart the session.
 */

import fs from "node:fs";
import path from "node:path";

const LOG_PREFIX = "[signal-pairing]";

/** Validate accountId to prevent path traversal. */
export function sanitizeAccountId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleaned || cleaned !== raw) {
    throw new Error(
      `Invalid accountId: must only contain alphanumeric characters, dashes, and underscores`,
    );
  }
  return cleaned;
}

export type SignalPairingStatus =
  | "idle"
  | "initializing"
  | "waiting_for_qr"
  | "connected"
  | "disconnected"
  | "timeout"
  | "error";

export interface SignalPairingEvent {
  type: "signal-qr" | "signal-status";
  accountId: string;
  qrDataUrl?: string;
  status?: SignalPairingStatus;
  uuid?: string;
  phoneNumber?: string;
  error?: string;
}

export interface SignalPairingOptions {
  authDir: string;
  accountId: string;
  onEvent: (event: SignalPairingEvent) => void;
}

export class SignalPairingSession {
  private status: SignalPairingStatus = "idle";
  private options: SignalPairingOptions;
  private aborted = false;

  constructor(options: SignalPairingOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    this.aborted = false;
    this.setStatus("initializing");

    // Lazy-import native bindings and QR code generator
    let native: typeof import("@milady/signal-native");
    let QRCode: typeof import("qrcode");
    try {
      native = await import("@milady/signal-native");
      QRCode = (await import("qrcode")).default ?? (await import("qrcode"));
    } catch (err) {
      this.setStatus("error");
      this.options.onEvent({
        type: "signal-status",
        accountId: this.options.accountId,
        status: "error",
        error: `Failed to load dependencies: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    // Ensure auth directory exists
    fs.mkdirSync(this.options.authDir, { recursive: true });

    try {
      // linkDevice returns the provisioning URL and starts linking in background
      console.info(`${LOG_PREFIX} Starting device linking...`);
      const provisioningUrl = await native.linkDevice(
        this.options.authDir,
        "Milady AI",
      );

      if (this.aborted) return;

      // Generate QR code from provisioning URL
      const qrDataUrl = await QRCode.toDataURL(provisioningUrl, {
        width: 256,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      this.setStatus("waiting_for_qr");
      this.options.onEvent({
        type: "signal-qr",
        accountId: this.options.accountId,
        qrDataUrl,
      });

      console.info(
        `${LOG_PREFIX} QR code generated, waiting for user to scan...`,
      );

      // Wait for linking to complete (user scans QR on their phone)
      await native.finishLink(this.options.authDir);

      if (this.aborted) return;

      // Linking succeeded — get profile info
      let uuid = "";
      let phoneNumber = "";
      try {
        const profile = await native.getProfile(this.options.authDir);
        uuid = profile.uuid;
        phoneNumber = profile.phoneNumber ?? "";
      } catch {
        // Profile fetch is non-critical
      }

      this.setStatus("connected");
      this.options.onEvent({
        type: "signal-status",
        accountId: this.options.accountId,
        status: "connected",
        uuid,
        phoneNumber,
      });

      console.info(
        `${LOG_PREFIX} Device linked successfully${phoneNumber ? ` (${phoneNumber})` : ""}`,
      );
    } catch (err) {
      if (this.aborted) return;

      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_PREFIX} Linking failed:`, errMsg);

      this.setStatus("error");
      this.options.onEvent({
        type: "signal-status",
        accountId: this.options.accountId,
        status: "error",
        error: errMsg,
      });
    }
  }

  stop(): void {
    this.aborted = true;
  }

  getStatus(): SignalPairingStatus {
    return this.status;
  }

  private setStatus(status: SignalPairingStatus): void {
    this.status = status;
    this.options.onEvent({
      type: "signal-status",
      accountId: this.options.accountId,
      status,
    });
  }
}

/**
 * Check if Signal auth data exists on disk for an account.
 */
export function signalAuthExists(
  workspaceDir: string,
  accountId = "default",
): boolean {
  const authDir = path.join(workspaceDir, "signal-auth", accountId);
  return fs.existsSync(authDir);
}

/**
 * Delete Signal auth files from disk (no server-side logout for Signal).
 */
export function signalLogout(
  workspaceDir: string,
  accountId = "default",
): void {
  const authDir = path.join(workspaceDir, "signal-auth", accountId);
  fs.rmSync(authDir, { recursive: true, force: true });
}
