import { useEffect, useRef } from "react";
import { useWhatsAppPairing } from "../hooks/useWhatsAppPairing";

interface WhatsAppQrOverlayProps {
  accountId?: string;
  /** Called when QR pairing succeeds — parent should install plugin + close modal. */
  onConnected?: () => void;
}

export function WhatsAppQrOverlay({
  accountId = "default",
  onConnected,
}: WhatsAppQrOverlayProps) {
  const {
    status,
    qrDataUrl,
    phoneNumber,
    error,
    startPairing,
    stopPairing,
    disconnect,
  } = useWhatsAppPairing(accountId);

  // Fire onConnected once when status transitions to "connected"
  const firedRef = useRef(false);
  useEffect(() => {
    if (status === "connected" && onConnected && !firedRef.current) {
      firedRef.current = true;
      // Small delay so the user sees the success state briefly
      const timer = setTimeout(onConnected, 1200);
      return () => clearTimeout(timer);
    }
  }, [status, onConnected]);

  // ── Connected ────────────────────────────────────────────────────────
  if (status === "connected") {
    return (
      <div className="border border-[var(--ok)] bg-[color-mix(in_srgb,var(--ok)_5%,transparent)] p-4 mt-3">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok)]" />
          <span className="text-xs font-medium text-[var(--ok)]">
            Connected{phoneNumber ? ` (+${phoneNumber})` : ""}
          </span>
        </div>
        <div className="text-[10px] text-[var(--muted)] mt-1">
          {onConnected
            ? "Installing WhatsApp plugin and restarting agent..."
            : "WhatsApp is paired. Auth state is saved for automatic reconnection."}
        </div>
        {!onConnected && (
          <button
            type="button"
            className="mt-2 px-2.5 py-1 text-[10px] border border-[var(--destructive)] text-[var(--destructive)] bg-transparent hover:bg-[var(--destructive)] hover:text-white cursor-pointer transition-colors"
            onClick={() => void disconnect()}
          >
            Disconnect
          </button>
        )}
      </div>
    );
  }

  // ── Error / Timeout ──────────────────────────────────────────────────
  if (status === "error" || status === "timeout") {
    return (
      <div className="border border-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_5%,transparent)] p-4 mt-3">
        <div className="text-xs text-[var(--destructive)] mb-2">
          {status === "timeout"
            ? "QR code expired. Please try again."
            : error ?? "An error occurred."}
        </div>
        <button
          type="button"
          className="px-3 py-1.5 text-[11px] border border-[var(--accent)] text-[var(--accent)] bg-transparent hover:bg-[var(--accent)] hover:text-[var(--accent-fg)] cursor-pointer transition-colors"
          onClick={() => {
            firedRef.current = false;
            void startPairing();
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────────
  if (status === "idle" || status === "disconnected") {
    return (
      <div className="border border-[var(--border)] bg-[var(--surface)] p-4 mt-3">
        <div className="text-xs text-[var(--muted)] mb-2">
          Scan a QR code with your phone to link WhatsApp.
        </div>
        <button
          type="button"
          className="px-3 py-1.5 text-[11px] border border-[var(--accent)] text-[var(--accent)] bg-transparent hover:bg-[var(--accent)] hover:text-[var(--accent-fg)] cursor-pointer transition-colors"
          onClick={() => {
            firedRef.current = false;
            void startPairing();
          }}
        >
          Connect WhatsApp
        </button>
      </div>
    );
  }

  // ── Initializing / Waiting for QR ────────────────────────────────────
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4 mt-3">
      <div className="flex items-start gap-4">
        {/* QR Code area */}
        <div className="shrink-0">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="WhatsApp QR Code"
              className="w-48 h-48 border border-[var(--border)] bg-white"
              style={{ imageRendering: "pixelated" }}
            />
          ) : (
            <div className="w-48 h-48 border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center">
              <span className="text-xs text-[var(--muted)] animate-pulse">
                Generating QR...
              </span>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium mb-2">Scan with WhatsApp</div>
          <ol className="text-[11px] text-[var(--muted)] space-y-1 list-decimal pl-4 m-0">
            <li>Open WhatsApp on your phone</li>
            <li>
              Tap <strong>Menu</strong> or <strong>Settings</strong> and select{" "}
              <strong>Linked Devices</strong>
            </li>
            <li>
              Tap <strong>Link a Device</strong>
            </li>
            <li>Point your phone at this QR code</li>
          </ol>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-[10px] text-[var(--muted)]">
              QR refreshes automatically (~15s)
            </span>
          </div>
          <button
            type="button"
            className="mt-3 px-2.5 py-1 text-[10px] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--txt)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
            onClick={() => void stopPairing()}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
