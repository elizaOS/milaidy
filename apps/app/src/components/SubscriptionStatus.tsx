/**
 * SubscriptionStatus — Anthropic and OpenAI subscription connection panels.
 *
 * Extracted from SettingsView.tsx for decomposition (P2 §10).
 */

import { useCallback, useRef, useState } from "react";
import { client } from "../api-client";

function formatRequestError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function normalizeOpenAICallbackInput(input: string):
  | {
      ok: true;
      code: string;
    }
  | {
      ok: false;
      error: string;
    } {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Paste the callback URL from the localhost:1455 page.",
    };
  }

  const normalized =
    trimmed.startsWith("localhost:") || trimmed.startsWith("127.0.0.1:")
      ? `http://${trimmed}`
      : trimmed;

  // Allow raw codes in addition to full callback URLs.
  if (!normalized.includes("://")) {
    if (normalized.length > 4096) {
      return { ok: false, error: "Callback code is too long." };
    }
    return { ok: true, code: normalized };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { ok: false, error: "Invalid callback URL." };
  }

  const hostOk =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (
    !hostOk ||
    parsed.port !== "1455" ||
    parsed.pathname !== "/auth/callback"
  ) {
    return { ok: false, error: "Expected a localhost:1455/auth/callback URL." };
  }
  if (!parsed.searchParams.get("code")) {
    return {
      ok: false,
      error: "Callback URL is missing the ?code= parameter.",
    };
  }
  return { ok: true, code: normalized };
}

export interface SubscriptionStatusProps {
  resolvedSelectedId: string | null;
  subscriptionStatus: Array<{
    provider: string;
    configured: boolean;
    valid: boolean;
    expiresAt: number | null;
  }>;
  anthropicConnected: boolean;
  setAnthropicConnected: (v: boolean) => void;
  openaiConnected: boolean;
  setOpenaiConnected: (v: boolean) => void;
  handleSelectSubscription: (providerId: string) => Promise<void>;
  loadSubscriptionStatus: () => Promise<void>;
}

export function SubscriptionStatus({
  resolvedSelectedId,
  subscriptionStatus,
  anthropicConnected,
  setAnthropicConnected,
  openaiConnected,
  setOpenaiConnected,
  handleSelectSubscription,
  loadSubscriptionStatus,
}: SubscriptionStatusProps) {
  const [subscriptionTab, setSubscriptionTab] = useState<"token" | "oauth">(
    "token",
  );
  const [setupTokenValue, setSetupTokenValue] = useState("");
  const [setupTokenSaving, setSetupTokenSaving] = useState(false);
  const setupTokenRef = useRef(setupTokenValue);
  setupTokenRef.current = setupTokenValue;
  const savingRef = useRef(setupTokenSaving);
  savingRef.current = setupTokenSaving;
  const [setupTokenSuccess, setSetupTokenSuccess] = useState(false);
  const [anthropicOAuthStarted, setAnthropicOAuthStarted] = useState(false);
  const [anthropicCode, setAnthropicCode] = useState("");
  const anthropicCodeRef = useRef(anthropicCode);
  anthropicCodeRef.current = anthropicCode;
  const [anthropicError, setAnthropicError] = useState("");
  const [anthropicExchangeBusy, setAnthropicExchangeBusy] = useState(false);
  const anthropicExchangeBusyRef = useRef(false);
  const [openaiOAuthStarted, setOpenaiOAuthStarted] = useState(false);
  const [openaiCallbackUrl, setOpenaiCallbackUrl] = useState("");
  const openaiCallbackRef = useRef(openaiCallbackUrl);
  openaiCallbackRef.current = openaiCallbackUrl;
  const [openaiError, setOpenaiError] = useState("");
  const [openaiExchangeBusy, setOpenaiExchangeBusy] = useState(false);
  const openaiExchangeBusyRef = useRef(false);
  const [subscriptionDisconnecting, setSubscriptionDisconnecting] = useState<
    string | null
  >(null);
  const disconnectingRef = useRef(subscriptionDisconnecting);
  disconnectingRef.current = subscriptionDisconnecting;

  const anthropicStatus = subscriptionStatus.find(
    (s) => s.provider === "anthropic-subscription",
  );
  const openaiStatus = subscriptionStatus.find(
    (s) =>
      s.provider === "openai-subscription" || s.provider === "openai-codex",
  );

  const handleSaveSetupToken = useCallback(async () => {
    if (!setupTokenRef.current.trim() || savingRef.current) return;
    setSetupTokenSaving(true);
    setSetupTokenSuccess(false);
    setAnthropicError("");
    try {
      const result = await client.submitAnthropicSetupToken(
        setupTokenRef.current.trim(),
      );
      if (!result.success) {
        setAnthropicError("Failed to save setup token.");
        return;
      }
      setSetupTokenSuccess(true);
      setSetupTokenValue("");
      await handleSelectSubscription("anthropic-subscription");
      await loadSubscriptionStatus();
      await client.restartAgent();
      setTimeout(() => setSetupTokenSuccess(false), 2000);
    } catch (err) {
      setAnthropicError(`Failed to save token: ${formatRequestError(err)}`);
    } finally {
      setSetupTokenSaving(false);
    }
  }, [handleSelectSubscription, loadSubscriptionStatus]);

  const handleDisconnectSubscription = useCallback(
    async (providerId: string) => {
      if (disconnectingRef.current) return;
      setSubscriptionDisconnecting(providerId);
      setAnthropicError("");
      setOpenaiError("");
      try {
        const apiProvider =
          providerId === "openai-subscription" ? "openai-codex" : providerId;
        await client.deleteSubscription(apiProvider);
        await loadSubscriptionStatus();
        if (providerId === "anthropic-subscription") {
          setAnthropicConnected(false);
          setAnthropicOAuthStarted(false);
          setAnthropicCode("");
        }
        if (providerId === "openai-subscription") {
          setOpenaiConnected(false);
          setOpenaiOAuthStarted(false);
          setOpenaiCallbackUrl("");
        }
        await client.restartAgent();
      } catch (err) {
        const msg = `Disconnect failed: ${formatRequestError(err)}`;
        if (providerId === "anthropic-subscription") setAnthropicError(msg);
        if (providerId === "openai-subscription") setOpenaiError(msg);
      } finally {
        setSubscriptionDisconnecting(null);
      }
    },
    [loadSubscriptionStatus, setAnthropicConnected, setOpenaiConnected],
  );

  const handleAnthropicStart = useCallback(async () => {
    setAnthropicError("");
    try {
      const { authUrl } = await client.startAnthropicLogin();
      if (authUrl) {
        window.open(
          authUrl,
          "anthropic-oauth",
          "width=600,height=700,top=50,left=200",
        );
        setAnthropicOAuthStarted(true);
        return;
      }
      setAnthropicError("Failed to get auth URL");
    } catch (err) {
      setAnthropicError(`Failed to start login: ${formatRequestError(err)}`);
    }
  }, []);

  const handleAnthropicExchange = useCallback(async () => {
    const code = anthropicCodeRef.current.trim();
    if (!code || anthropicExchangeBusyRef.current) return;
    anthropicExchangeBusyRef.current = true;
    setAnthropicExchangeBusy(true);
    setAnthropicError("");
    try {
      const result = await client.exchangeAnthropicCode(code);
      if (result.success) {
        setAnthropicConnected(true);
        setAnthropicOAuthStarted(false);
        setAnthropicCode("");
        await handleSelectSubscription("anthropic-subscription");
        await loadSubscriptionStatus();
        await client.restartAgent();
        return;
      }
      setAnthropicError(result.error ?? "Exchange failed");
    } catch (err) {
      setAnthropicError(`Exchange failed: ${formatRequestError(err)}`);
    } finally {
      anthropicExchangeBusyRef.current = false;
      setAnthropicExchangeBusy(false);
    }
  }, [handleSelectSubscription, loadSubscriptionStatus, setAnthropicConnected]);

  const handleOpenAIStart = useCallback(async () => {
    setOpenaiError("");
    try {
      const { authUrl } = await client.startOpenAILogin();
      if (authUrl) {
        window.open(
          authUrl,
          "openai-oauth",
          "width=500,height=700,top=50,left=200",
        );
        setOpenaiOAuthStarted(true);
        return;
      }
      setOpenaiError("No auth URL returned from login");
    } catch (err) {
      setOpenaiError(`Failed to start login: ${formatRequestError(err)}`);
    }
  }, []);

  const handleOpenAIExchange = useCallback(async () => {
    if (openaiExchangeBusyRef.current) return;
    const normalized = normalizeOpenAICallbackInput(openaiCallbackRef.current);
    if (!normalized.ok) {
      setOpenaiError(normalized.error);
      return;
    }

    openaiExchangeBusyRef.current = true;
    setOpenaiExchangeBusy(true);
    setOpenaiError("");
    try {
      const data = await client.exchangeOpenAICode(normalized.code);
      if (data.success) {
        setOpenaiConnected(true);
        setOpenaiOAuthStarted(false);
        setOpenaiCallbackUrl("");
        await handleSelectSubscription("openai-subscription");
        await loadSubscriptionStatus();
        await client.restartAgent();
        return;
      }
      const msg = data.error ?? "Exchange failed";
      setOpenaiError(
        msg.includes("No active flow")
          ? "Login session expired. Click 'Start Over' and try again."
          : msg,
      );
    } catch (err) {
      console.warn("[milady] OpenAI exchange failed", err);
      setOpenaiError("Network error — check your connection and try again.");
    } finally {
      openaiExchangeBusyRef.current = false;
      setOpenaiExchangeBusy(false);
    }
  }, [handleSelectSubscription, loadSubscriptionStatus, setOpenaiConnected]);

  return (
    <div className="mt-4 pt-4 border-t border-[var(--border)]">
      {resolvedSelectedId === "anthropic-subscription" && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: anthropicConnected
                    ? "var(--ok,#16a34a)"
                    : "var(--warning,#f39c12)",
                }}
              />
              <span className="text-xs font-semibold">
                {anthropicConnected
                  ? "Connected to Claude Subscription"
                  : "Claude Subscription"}
              </span>
            </div>
            {anthropicConnected && (
              <button
                type="button"
                className="btn text-xs py-[3px] px-3 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)]"
                onClick={() =>
                  void handleDisconnectSubscription("anthropic-subscription")
                }
                disabled={
                  subscriptionDisconnecting === "anthropic-subscription"
                }
              >
                {subscriptionDisconnecting === "anthropic-subscription"
                  ? "Disconnecting..."
                  : "Disconnect"}
              </button>
            )}
          </div>

          {anthropicStatus?.configured && !anthropicStatus.valid && (
            <div className="text-xs text-[var(--warning,#f39c12)] mb-3">
              Claude subscription credentials are expired or invalid. Reconnect
              to continue.
            </div>
          )}

          <div className="flex items-center gap-4 border-b border-[var(--border)] mb-3">
            <button
              type="button"
              className={`text-xs pb-2 border-b-2 ${
                subscriptionTab === "token"
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
              }`}
              onClick={() => setSubscriptionTab("token")}
            >
              Setup Token
            </button>
            <button
              type="button"
              className={`text-xs pb-2 border-b-2 ${
                subscriptionTab === "oauth"
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
              }`}
              onClick={() => setSubscriptionTab("oauth")}
            >
              OAuth Login
            </button>
          </div>

          {subscriptionTab === "token" ? (
            <div>
              <label
                htmlFor="subscription-setup-token-input"
                className="text-xs font-semibold mb-1.5 block"
              >
                Setup Token
              </label>
              <input
                id="subscription-setup-token-input"
                type="password"
                placeholder="sk-ant-oat01-..."
                value={setupTokenValue}
                onChange={(e) => {
                  setSetupTokenValue(e.target.value);
                  setSetupTokenSuccess(false);
                  setAnthropicError("");
                }}
                className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] focus:border-[var(--accent)] focus:outline-none"
              />
              <div className="text-[11px] text-[var(--muted)] mt-2 whitespace-pre-line">
                {
                  'How to get your setup token:\n\n• Option A: Run  claude setup-token  in your terminal (if you have Claude Code CLI installed)\n\n• Option B: Go to claude.ai/settings/api → "Claude Code" → "Use setup token"'
                }
              </div>
              {anthropicError && (
                <div className="text-[11px] text-[var(--danger,#e74c3c)] mt-2">
                  {anthropicError}
                </div>
              )}
              <div className="flex items-center justify-between mt-3">
                <button
                  type="button"
                  className="btn text-xs py-[5px] px-3.5 !mt-0"
                  disabled={setupTokenSaving || !setupTokenValue.trim()}
                  onClick={() => void handleSaveSetupToken()}
                >
                  {setupTokenSaving ? "Saving..." : "Save Token"}
                </button>
                <div className="flex items-center gap-2">
                  {setupTokenSaving && (
                    <span className="text-[11px] text-[var(--muted)]">
                      Saving &amp; restarting...
                    </span>
                  )}
                  {setupTokenSuccess && (
                    <span className="text-[11px] text-[var(--ok,#16a34a)]">
                      Saved
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : anthropicConnected ? (
            <div className="text-xs text-[var(--muted)]">
              Your Claude subscription is linked. Disconnect to switch accounts.
            </div>
          ) : !anthropicOAuthStarted ? (
            <div>
              <button
                type="button"
                className="btn text-xs py-[5px] px-3.5 !mt-0"
                onClick={() => void handleAnthropicStart()}
              >
                Login with Anthropic
              </button>
              <div className="text-[11px] text-[var(--muted)] mt-1.5">
                Requires Claude Pro ($20/mo) or Max ($100/mo).
              </div>
              {anthropicError && (
                <div className="text-[11px] text-[var(--danger,#e74c3c)] mt-2">
                  {anthropicError}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="text-xs text-[var(--muted)] mb-2">
                After logging in, copy the authorization code from Anthropic and
                paste it below.
              </div>
              <input
                type="text"
                placeholder="Paste the authorization code here..."
                value={anthropicCode}
                onChange={(e) => {
                  setAnthropicCode(e.target.value);
                  setAnthropicError("");
                }}
                className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
              />
              {anthropicError && (
                <div className="text-[11px] text-[var(--danger,#e74c3c)] mt-2">
                  {anthropicError}
                </div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  className="btn text-xs py-[5px] px-3.5 !mt-0"
                  disabled={anthropicExchangeBusy || !anthropicCode.trim()}
                  onClick={() => void handleAnthropicExchange()}
                >
                  {anthropicExchangeBusy ? "Connecting..." : "Connect"}
                </button>
                <button
                  type="button"
                  className="btn text-xs py-[5px] px-3.5 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)]"
                  onClick={() => {
                    setAnthropicOAuthStarted(false);
                    setAnthropicCode("");
                  }}
                >
                  Start Over
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {resolvedSelectedId === "openai-subscription" && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: openaiConnected
                    ? "var(--ok,#16a34a)"
                    : "var(--warning,#f39c12)",
                }}
              />
              <span className="text-xs font-semibold">
                {openaiConnected
                  ? "Connected to ChatGPT Subscription"
                  : "ChatGPT Subscription"}
              </span>
            </div>
            {openaiConnected && (
              <button
                type="button"
                className="btn text-xs py-[3px] px-3 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)]"
                onClick={() =>
                  void handleDisconnectSubscription("openai-subscription")
                }
                disabled={subscriptionDisconnecting === "openai-subscription"}
              >
                {subscriptionDisconnecting === "openai-subscription"
                  ? "Disconnecting..."
                  : "Disconnect"}
              </button>
            )}
          </div>

          {openaiStatus?.configured && !openaiStatus.valid && (
            <div className="text-xs text-[var(--warning,#f39c12)] mb-3">
              ChatGPT subscription credentials are expired or invalid. Reconnect
              to continue.
            </div>
          )}

          {openaiConnected ? (
            <div className="text-xs text-[var(--muted)]">
              Your ChatGPT subscription is linked. Disconnect to switch
              accounts.
            </div>
          ) : !openaiOAuthStarted ? (
            <div>
              <button
                type="button"
                className="btn text-xs py-[5px] px-3.5 !mt-0"
                onClick={() => void handleOpenAIStart()}
              >
                Login with OpenAI
              </button>
              <div className="text-[11px] text-[var(--muted)] mt-1.5">
                Requires ChatGPT Plus ($20/mo) or Pro ($200/mo).
              </div>
            </div>
          ) : (
            <div>
              <div className="p-2.5 border border-[var(--border)] bg-[var(--bg-muted)] text-[11px] text-[var(--muted)] leading-relaxed">
                After logging in, you'll be redirected to a page that won't load
                (starts with{" "}
                <code className="text-[10px] px-1 border border-[var(--border)] bg-[var(--card)]">
                  localhost:1455
                </code>
                ). Copy the entire URL and paste it below.
              </div>
              <input
                type="text"
                className="w-full mt-2 px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                placeholder="http://localhost:1455/auth/callback?code=..."
                value={openaiCallbackUrl}
                onChange={(e) => {
                  setOpenaiCallbackUrl(e.target.value);
                  setOpenaiError("");
                }}
              />
              {openaiError && (
                <div className="text-[11px] text-[var(--danger,#e74c3c)] mt-2">
                  {openaiError}
                </div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  className="btn text-xs py-[5px] px-3.5 !mt-0"
                  disabled={openaiExchangeBusy || !openaiCallbackUrl.trim()}
                  onClick={() => void handleOpenAIExchange()}
                >
                  {openaiExchangeBusy ? "Completing..." : "Complete Login"}
                </button>
                <button
                  type="button"
                  className="btn text-xs py-[5px] px-3.5 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)]"
                  onClick={() => {
                    setOpenaiOAuthStarted(false);
                    setOpenaiCallbackUrl("");
                  }}
                >
                  Start Over
                </button>
              </div>
            </div>
          )}

          {openaiError && !openaiOAuthStarted && (
            <div className="text-[11px] text-[var(--danger,#e74c3c)] mt-2">
              {openaiError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
