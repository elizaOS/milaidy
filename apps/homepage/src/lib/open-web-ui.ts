import { getToken } from "./auth";
import { CLOUD_BASE, rewriteAgentUiUrl } from "./runtime-config";

/**
 * Fetches a pairing token from the cloud backend for the given agent UUID,
 * then returns the rewritten redirect URL (waifu.fun → milady.ai).
 *
 * Works against both the local Express backend (localhost:3000) and the
 * Vercel proxy (dev.elizacloud.ai).  The local backend exposes the route
 * at `/api/agents/:id/pairing-token` with `Authorization: Bearer`, while
 * the Vercel deployment rewrites to the same backend via milady-api.shad0w.xyz.
 */
async function fetchPairingRedirectUrl(
  agentUuid: string,
  apiKey: string,
): Promise<string> {
  // The Eliza Cloud backend mounts the route at /api/v1/milady/agents/:id/pairing-token
  const res = await fetch(
    `${CLOUD_BASE}/api/v1/milady/agents/${agentUuid}/pairing-token`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Api-Key": apiKey,
      },
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pairing token ${res.status}: ${body}`);
  }

  const json = await res.json();
  // Backend wraps in { success, data: { token, redirectUrl, expiresIn } }
  const redirectUrl: string | undefined =
    json?.data?.redirectUrl ?? json?.redirectUrl;

  if (!redirectUrl) {
    throw new Error("No redirectUrl in pairing-token response");
  }

  // Don't rewrite the redirect URL — the cloud pairing token is scoped to the
  // domain in the redirect URL (waifu.fun). Rewriting to milady.ai causes the
  // cloud backend to reject the token because the Origin header doesn't match.
  return redirectUrl;
}

/**
 * Extract the sandbox UUID from an agent URL like https://<uuid>.milady.ai
 */
function extractUuidFromUrl(url: string): string | null {
  const match = url.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return match ? match[1] : null;
}

/**
 * Opens the Web UI for a remote/cloud agent with automatic authentication.
 *
 * Flow:
 *   1. Opens a popup immediately (must be in click handler for popup blockers)
 *   2. Calls the cloud backend pairing-token endpoint
 *   3. Redirects the popup to the returned URL (with token in path)
 *
 * The pairing token is exchanged by the agent's nginx Lua router or
 * /pair page for a real API key stored in sessionStorage.
 */
export async function openWebUIWithPairingToken(
  agentUrl: string,
  cloudApiKey: string,
): Promise<void> {
  // Open popup synchronously to avoid popup blockers
  const popup = window.open("", "_blank");
  if (!popup) {
    showToast("Popup blocked. Please allow popups and try again.");
    return;
  }

  try {
    popup.document.title = "Connecting\u2026";
    popup.document.body.style.margin = "0";
    popup.document.body.innerHTML =
      '<div style="font-family:system-ui,-apple-system,sans-serif;background:#09090b;color:#a1a1aa;min-height:100vh;display:flex;align-items:center;justify-content:center">' +
      '<div style="text-align:center">' +
      '<div style="width:24px;height:24px;border:2px solid #27272a;border-top-color:#a1a1aa;border-radius:50%;margin:0 auto 16px;animation:s 0.8s linear infinite"></div>' +
      '<div style="font-size:14px;letter-spacing:0.02em">Connecting to agent\u2026</div>' +
      "</div></div>" +
      "<style>@keyframes s{to{transform:rotate(360deg)}}</style>";
  } catch {
    // cross-origin write may fail
  }

  // Extract the sandbox UUID from the agent URL
  const agentUuid = extractUuidFromUrl(agentUrl);
  if (!agentUuid) {
    popup.location.href = rewriteAgentUiUrl(agentUrl);
    return;
  }

  try {
    const redirectUrl = await fetchPairingRedirectUrl(agentUuid, cloudApiKey);
    if (popup.closed) return;
    popup.location.href = redirectUrl;
  } catch (err) {
    // Fallback: open the bare URL (user will see pairing screen)
    console.error("[open-web-ui] pairing token failed, falling back:", err);
    if (!popup.closed) {
      popup.location.href = rewriteAgentUiUrl(agentUrl);
    }
  }
}

/**
 * Opens the Web UI directly without authentication.
 * Used for local agents or when the user is not logged in.
 */
export function openWebUIDirect(url: string): void {
  window.open(rewriteAgentUiUrl(url), "_blank", "noopener,noreferrer");
}

/**
 * Main entry point: opens the Web UI for any agent.
 * If the user is authenticated and the agent is non-local, requests a
 * pairing token for seamless auth handoff.  Otherwise opens directly.
 */
export function openWebUI(
  agentUrl: string,
  source: "local" | "remote" | "cloud",
): void {
  const cloudToken = getToken();
  if (source !== "local" && cloudToken) {
    openWebUIWithPairingToken(agentUrl, cloudToken);
  } else {
    openWebUIDirect(agentUrl);
  }
}

/** Simple toast — uses a temporary DOM element as fallback */
function showToast(message: string): void {
  console.error("[open-web-ui]", message);
  if (typeof window === "undefined") return;
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
