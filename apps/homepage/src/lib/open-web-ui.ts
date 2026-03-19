import type { CloudClient } from "./cloud-api";

/**
 * Opens the Milady Web UI for a cloud agent via the pairing token flow.
 *
 * 1. Opens a popup immediately (must be in click handler to avoid popup blockers)
 * 2. Fetches a one-time pairing token from Eliza Cloud
 * 3. Redirects the popup to the agent's /pair page with the token
 * 4. pair.html exchanges the token for an API key and stores it
 *
 * For non-cloud agents (local/remote), call openWebUIDirect() instead.
 */
export async function openWebUIWithPairing(
  agentId: string,
  cloudClient: CloudClient,
): Promise<void> {
  // Open popup synchronously inside the click handler to avoid browser popup blockers
  const popup = window.open("", "_blank");
  if (!popup) {
    showToast("Popup blocked. Please allow popups and try again.");
    return;
  }

  // Show a loading state in the popup while we fetch the pairing token
  try {
    popup.document.title = "Connecting…";
    popup.document.body.style.margin = "0";
    popup.document.body.innerHTML =
      '<div style="font-family:system-ui,-apple-system,sans-serif;background:#09090b;color:#a1a1aa;min-height:100vh;display:flex;align-items:center;justify-content:center">' +
      '<div style="text-align:center">' +
      '<div style="width:24px;height:24px;border:2px solid #27272a;border-top-color:#a1a1aa;border-radius:50%;margin:0 auto 16px;animation:s 0.8s linear infinite"></div>' +
      '<div style="font-size:14px;letter-spacing:0.02em">Connecting to agent\u2026</div>' +
      "</div></div>" +
      "<style>@keyframes s{to{transform:rotate(360deg)}}</style>";
  } catch {
    // cross-origin write may fail — that's fine
  }

  try {
    const { redirectUrl } = await cloudClient.getPairingToken(agentId);

    if (popup.closed) {
      // User closed the popup before the fetch completed
      return;
    }

    if (redirectUrl) {
      popup.location.href = redirectUrl;
    } else {
      popup.close();
      showToast("No redirect URL returned from pairing token endpoint");
    }
  } catch (err) {
    popup.close();
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("404") || message.includes("not found")) {
      showToast(
        "Agent not found or not running. Please start the agent first.",
      );
    } else if (message.includes("401") || message.includes("403")) {
      showToast("Authentication expired. Please sign in again.");
    } else {
      showToast(`Failed to connect: ${message}`);
    }
  }
}

/**
 * Opens the Web UI directly (no pairing token needed).
 * Used for local and remote agents that don't require cloud auth handoff.
 */
export function openWebUIDirect(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Simple toast — uses sonner if available, falls back to console */
function showToast(message: string): void {
  // Try to use sonner toast if it's loaded
  try {
    // Dynamic import would be async; just log + alert for now
    console.error("[open-web-ui]", message);
    // The AgentGrid caller can wrap this in its own error handling if needed
  } catch {
    // noop
  }
  // Show a visible alert as fallback since we don't have sonner in the homepage app
  if (typeof window !== "undefined") {
    // Use a non-blocking notification approach
    const div = document.createElement("div");
    div.textContent = message;
    Object.assign(div.style, {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#1a1a1a",
      color: "#ef4444",
      padding: "12px 24px",
      borderRadius: "12px",
      border: "1px solid #333",
      fontSize: "14px",
      fontFamily: "system-ui, sans-serif",
      zIndex: "99999",
      boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      transition: "opacity 0.3s",
    });
    document.body.appendChild(div);
    setTimeout(() => {
      div.style.opacity = "0";
      setTimeout(() => div.remove(), 300);
    }, 4000);
  }
}
