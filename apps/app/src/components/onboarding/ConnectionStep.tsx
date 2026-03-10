import { client } from "@milady/app-core/api";
import type {
  OpenRouterModelOption,
  PiAiModelOption,
  ProviderOption,
} from "@milady/app-core/api";
import { useState } from "react";
import { getProviderLogo } from "../../provider-logos";
import { useApp } from "../../AppContext";

function formatRequestError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function ConnectionStep() {
  const {
    t,
    onboardingOptions,
    onboardingProvider,
    onboardingSubscriptionTab,
    onboardingApiKey,
    onboardingPrimaryModel,
    onboardingMiladyCloudTab,
    onboardingOpenRouterModel,
    miladyCloudConnected,
    miladyCloudLoginBusy,
    miladyCloudLoginError,
    handleCloudLogin,
    handleOnboardingNext,
    handleOnboardingBack,
    setState,
  } = useApp();

  const [openaiOAuthStarted, setOpenaiOAuthStarted] = useState(false);
  const [openaiCallbackUrl, setOpenaiCallbackUrl] = useState("");
  const [openaiConnected, setOpenaiConnected] = useState(false);
  const [openaiError, setOpenaiError] = useState("");

  const [anthropicOAuthStarted, setAnthropicOAuthStarted] = useState(false);
  const [anthropicCode, setAnthropicCode] = useState("");
  const [anthropicConnected, setAnthropicConnected] = useState(false);
  const [anthropicError, setAnthropicError] = useState("");

  const [apiKeyFormatWarning, setApiKeyFormatWarning] = useState("");

  const openInSystemBrowser = async (url: string) => {
    const electron = (
      window as {
        electron?: {
          ipcRenderer: {
            invoke: (channel: string, params?: unknown) => Promise<unknown>;
          };
        };
      }
    ).electron;
    if (electron?.ipcRenderer) {
      await electron.ipcRenderer.invoke("desktop:openExternal", { url });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleAnthropicStart = async () => {
    setAnthropicError("");
    try {
      const { authUrl } = await client.startAnthropicLogin();
      if (authUrl) {
        await openInSystemBrowser(authUrl);
        setAnthropicOAuthStarted(true);
        return;
      }
      setAnthropicError("Failed to get auth URL");
    } catch (err) {
      setAnthropicError(`Failed to start login: ${formatRequestError(err)}`);
    }
  };

  const handleAnthropicExchange = async () => {
    setAnthropicError("");
    try {
      const result = await client.exchangeAnthropicCode(anthropicCode);
      if (result.success) {
        setAnthropicConnected(true);
        return;
      }
      setAnthropicError(result.error ?? "Exchange failed");
    } catch (err) {
      setAnthropicError(`Exchange failed: ${formatRequestError(err)}`);
    }
  };

  const handleOpenAIStart = async () => {
    try {
      const { authUrl } = await client.startOpenAILogin();
      if (authUrl) {
        await openInSystemBrowser(authUrl);
        setOpenaiOAuthStarted(true);
        return;
      }
      setOpenaiError("No auth URL returned from login");
    } catch (err) {
      setOpenaiError(`Failed to start login: ${formatRequestError(err)}`);
    }
  };

  const handleOpenAIExchange = async () => {
    setOpenaiError("");
    try {
      const data = await client.exchangeOpenAICode(openaiCallbackUrl);
      if (data.success) {
        setOpenaiOAuthStarted(false);
        setOpenaiCallbackUrl("");
        setOpenaiConnected(true);
        setState("onboardingProvider", "openai-subscription");
        return;
      }
      const msg = data.error ?? "Exchange failed";
      setOpenaiError(
        msg.includes("No active flow")
          ? "Login session expired. Click 'Start Over' and try again."
          : msg,
      );
    } catch (_err) {
      setOpenaiError("Network error — check your connection and try again.");
    }
  };

  const validateApiKeyFormat = (key: string, providerId: string): string => {
    if (!key || key.trim().length === 0) return "";
    const trimmed = key.trim();
    if (providerId === "openai" && !trimmed.startsWith("sk-")) {
      return "Key format looks incorrect. Double-check and try again.";
    }
    if (providerId === "anthropic" && !trimmed.startsWith("sk-ant-")) {
      return "Key format looks incorrect. Double-check and try again.";
    }
    if (trimmed.length < 20) {
      return "Key format looks incorrect. Double-check and try again.";
    }
    return "";
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setState("onboardingApiKey", newKey);
    setApiKeyFormatWarning(validateApiKeyFormat(newKey, onboardingProvider));
  };

  const handleOpenRouterModelSelect = (modelId: string) => {
    setState("onboardingOpenRouterModel", modelId);
  };

  const providers = onboardingOptions?.providers ?? [];
  const cloudProviders = providers.filter(
    (p: ProviderOption) => p.id === "miladycloud",
  );
  const subscriptionProviders = providers.filter(
    (p: ProviderOption) =>
      p.id === "anthropic-subscription" || p.id === "openai-subscription",
  );
  const apiProviders = providers.filter(
    (p: ProviderOption) =>
      !subscriptionProviders.some((s) => s.id === p.id) &&
      p.id !== "miladycloud",
  );

  const providerOverrides: Record<
    string,
    { name: string; description?: string }
  > = {
    miladycloud: { name: "Milady Cloud" },
    "anthropic-subscription": {
      name: "Claude Subscription",
      description: "$20-200/mo Claude Pro/Max subscription",
    },
    "openai-subscription": {
      name: "ChatGPT Subscription",
      description: "$20-200/mo ChatGPT Plus/Pro subscription",
    },
    anthropic: { name: "Anthropic API Key" },
    openai: { name: "OpenAI API Key" },
    openrouter: { name: "OpenRouter" },
    gemini: { name: "Google Gemini" },
    grok: { name: "xAI (Grok)" },
    groq: { name: "Groq" },
    deepseek: { name: "DeepSeek" },
    "pi-ai": {
      name: "Pi Credentials (pi-ai)",
      description: "Use pi auth (~/.pi/agent/auth.json) for API keys / OAuth",
    },
  };

  const getProviderDisplay = (provider: ProviderOption) => {
    const override = providerOverrides[provider.id];
    return {
      name: override?.name ?? provider.name,
      description: override?.description ?? provider.description,
    };
  };

  const piAiModels = onboardingOptions?.piAiModels ?? [];
  const piAiDefaultModel = onboardingOptions?.piAiDefaultModel ?? "";
  const normalizedPrimaryModel = onboardingPrimaryModel.trim();
  const hasKnownPiAiModel = piAiModels.some(
    (model: PiAiModelOption) => model.id === normalizedPrimaryModel,
  );
  const piAiSelectValue =
    normalizedPrimaryModel.length === 0
      ? ""
      : hasKnownPiAiModel
        ? normalizedPrimaryModel
        : "__custom__";

  const handleProviderSelect = (providerId: string) => {
    setState("onboardingProvider", providerId);
    setState("onboardingApiKey", "");
    setState("onboardingPrimaryModel", "");
    if (providerId === "anthropic-subscription") {
      setState("onboardingSubscriptionTab", "token");
    }
  };

  // Screen A: no provider selected — show provider grid
  if (!onboardingProvider) {
    return (
      <>
        <div className="onboarding-section-title">
          {t("onboarding.connectionTitle") || "Neural Link"}
        </div>
        <div className="onboarding-divider">
          <div className="onboarding-divider-diamond" />
        </div>
        <div className="onboarding-question">
          {t("onboarding.connectionQuestion") || "Select a provider"}
        </div>
        <div className="onboarding-provider-grid">
          {cloudProviders.map((p: ProviderOption) => {
            const display = getProviderDisplay(p);
            return (
              <button
                type="button"
                key={p.id}
                className="onboarding-provider-card"
                onClick={() => handleProviderSelect(p.id)}
              >
                <img
                  src={getProviderLogo(p.id, false)}
                  alt={display.name}
                  className="onboarding-provider-icon"
                />
                <div>
                  <div className="onboarding-provider-name">{display.name}</div>
                  {display.description && (
                    <div className="onboarding-provider-desc">
                      {display.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {subscriptionProviders.map((p: ProviderOption) => {
            const display = getProviderDisplay(p);
            return (
              <button
                type="button"
                key={p.id}
                className="onboarding-provider-card"
                onClick={() => handleProviderSelect(p.id)}
              >
                <img
                  src={getProviderLogo(p.id, false)}
                  alt={display.name}
                  className="onboarding-provider-icon"
                />
                <div>
                  <div className="onboarding-provider-name">{display.name}</div>
                  {display.description && (
                    <div className="onboarding-provider-desc">
                      {display.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {apiProviders.map((p: ProviderOption) => {
            const display = getProviderDisplay(p);
            return (
              <button
                type="button"
                key={p.id}
                className="onboarding-provider-card"
                onClick={() => handleProviderSelect(p.id)}
              >
                <img
                  src={getProviderLogo(p.id, false)}
                  alt={display.name}
                  className="onboarding-provider-icon"
                />
                <div>
                  <div className="onboarding-provider-name">{display.name}</div>
                  {display.description && (
                    <div className="onboarding-provider-desc">
                      {display.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="onboarding-panel-footer">
          <button
            className="onboarding-back-link"
            onClick={handleOnboardingBack}
            type="button"
          >
            ← Back
          </button>
          <span />
        </div>
      </>
    );
  }

  // Screen B: provider selected — show config UI
  const selectedProvider = providers.find(
    (p: ProviderOption) => p.id === onboardingProvider,
  );
  const selectedDisplay = selectedProvider
    ? getProviderDisplay(selectedProvider)
    : { name: onboardingProvider, description: "" };

  return (
    <>
      <div className="onboarding-section-title">
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center" }}>
          {selectedProvider && (
            <img
              src={getProviderLogo(selectedProvider.id, false)}
              alt={selectedDisplay.name}
              className="onboarding-provider-icon"
              style={{ width: "1.5rem", height: "1.5rem" }}
            />
          )}
          {selectedDisplay.name}
          <button
            type="button"
            className="onboarding-back-link"
            style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}
            onClick={() => {
              setState("onboardingProvider", "");
              setState("onboardingApiKey", "");
              setState("onboardingPrimaryModel", "");
            }}
          >
            {t("onboardingwizard.change") || "Change"}
          </button>
        </span>
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>

      {/* miladycloud */}
      {onboardingProvider === "miladycloud" && (
        <div style={{ width: "100%", textAlign: "left" }}>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              borderBottom: "1px solid var(--border)",
              marginBottom: "1rem",
            }}
          >
            <button
              type="button"
              style={{
                fontSize: "0.875rem",
                paddingBottom: "0.5rem",
                borderBottom:
                  onboardingMiladyCloudTab === "login"
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                color:
                  onboardingMiladyCloudTab === "login"
                    ? "var(--accent)"
                    : "var(--muted)",
                background: "none",
                border: "none",
                borderBottom:
                  onboardingMiladyCloudTab === "login"
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                cursor: "pointer",
              }}
              onClick={() => setState("onboardingMiladyCloudTab", "login")}
            >
              {t("onboardingwizard.Login")}
            </button>
            <button
              type="button"
              style={{
                fontSize: "0.875rem",
                paddingBottom: "0.5rem",
                borderBottom:
                  onboardingMiladyCloudTab === "apikey"
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                color:
                  onboardingMiladyCloudTab === "apikey"
                    ? "var(--accent)"
                    : "var(--muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              onClick={() => setState("onboardingMiladyCloudTab", "apikey")}
            >
              {t("onboardingwizard.APIKey")}
            </button>
          </div>

          {onboardingMiladyCloudTab === "login" ? (
            <div style={{ textAlign: "center" }}>
              {miladyCloudConnected ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.625rem 1rem",
                    border: "1px solid rgba(34,197,94,0.3)",
                    background: "rgba(34,197,94,0.1)",
                    color: "rgb(74,222,128)",
                    fontSize: "0.875rem",
                    borderRadius: "0.5rem",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <title>{t("onboardingwizard.Connected")}</title>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {t("onboardingwizard.connected")}
                </div>
              ) : (
                <button
                  type="button"
                  className="onboarding-confirm-btn"
                  onClick={handleCloudLogin}
                  disabled={miladyCloudLoginBusy}
                >
                  {miladyCloudLoginBusy
                    ? t("onboardingwizard.connecting")
                    : "connect account"}
                </button>
              )}
              {miladyCloudLoginError && (
                <p style={{ color: "var(--danger)", fontSize: "0.8125rem", marginTop: "0.5rem" }}>
                  {miladyCloudLoginError}
                </p>
              )}
              <p className="onboarding-desc">
                {t("onboardingwizard.FreeCreditsToStar")}
              </p>
            </div>
          ) : (
            <div>
              <label
                htmlFor="miladycloud-apikey"
                style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.375rem" }}
              >
                {t("onboardingwizard.MiladyCloudAPIKey")}
              </label>
              <input
                id="miladycloud-apikey"
                type="password"
                className="onboarding-input"
                placeholder={t("onboardingwizard.ec")}
                value={onboardingApiKey}
                onChange={handleApiKeyChange}
              />
              <p className="onboarding-desc">
                {t("onboardingwizard.UseThisIfBrowser")}{" "}
                <a
                  href="https://miladycloud.ai/dashboard/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)" }}
                >
                  {t("onboardingwizard.miladycloudAiDashbo")}
                </a>
              </p>
            </div>
          )}
        </div>
      )}

      {/* anthropic-subscription */}
      {onboardingProvider === "anthropic-subscription" && (
        <div style={{ textAlign: "left", width: "100%" }}>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              borderBottom: "1px solid var(--border)",
              marginBottom: "0.75rem",
            }}
          >
            <button
              type="button"
              style={{
                fontSize: "0.875rem",
                paddingBottom: "0.5rem",
                background: "none",
                border: "none",
                borderBottom:
                  onboardingSubscriptionTab === "token"
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                color:
                  onboardingSubscriptionTab === "token"
                    ? "var(--accent)"
                    : "var(--muted)",
                cursor: "pointer",
              }}
              onClick={() => setState("onboardingSubscriptionTab", "token")}
            >
              {t("onboardingwizard.SetupToken")}
            </button>
            <button
              type="button"
              style={{
                fontSize: "0.875rem",
                paddingBottom: "0.5rem",
                background: "none",
                border: "none",
                borderBottom:
                  onboardingSubscriptionTab === "oauth"
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                color:
                  onboardingSubscriptionTab === "oauth"
                    ? "var(--accent)"
                    : "var(--muted)",
                cursor: "pointer",
              }}
              onClick={() => setState("onboardingSubscriptionTab", "oauth")}
            >
              {t("onboardingwizard.OAuthLogin")}
            </button>
          </div>

          {onboardingSubscriptionTab === "token" ? (
            <>
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: "bold",
                  display: "block",
                  marginBottom: "0.5rem",
                }}
              >
                {t("onboardingwizard.SetupToken1")}
              </span>
              <input
                type="password"
                className="onboarding-input"
                value={onboardingApiKey}
                onChange={handleApiKeyChange}
                placeholder={t("onboardingwizard.skAntOat01")}
              />
              <p className="onboarding-desc" style={{ whiteSpace: "pre-line" }}>
                {
                  'How to get your setup token:\n\n• Option A: Run  claude setup-token  in your terminal (if you have Claude Code CLI installed)\n\n• Option B: Go to claude.ai/settings/api → "Claude Code" → "Use setup token"'
                }
              </p>
            </>
          ) : anthropicConnected ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.5rem",
                  border: "1px solid rgba(34,197,94,0.3)",
                  background: "rgba(34,197,94,0.1)",
                  color: "rgb(74,222,128)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  width: "100%",
                  maxWidth: "20rem",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>{t("onboardingwizard.Connected")}</title>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t("onboardingwizard.ConnectedToClaude")}
              </div>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                {t("onboardingwizard.YourClaudeSubscrip")}
              </p>
            </div>
          ) : !anthropicOAuthStarted ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
              <button
                type="button"
                className="onboarding-confirm-btn"
                onClick={() => void handleAnthropicStart()}
              >
                {t("onboardingwizard.LoginWithAnthropic")}
              </button>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                {t("onboardingwizard.RequiresClaudePro")}
              </p>
              {anthropicError && (
                <p style={{ fontSize: "0.75rem", color: "rgb(248,113,113)" }}>
                  {anthropicError}
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
              <p style={{ fontSize: "0.875rem", textAlign: "center" }}>
                {t("onboardingwizard.AfterLoggingInYo")}
                <br />
                {t("onboardingwizard.CopyAndPasteItBe")}
              </p>
              <input
                type="text"
                className="onboarding-input"
                placeholder={t("onboardingwizard.PasteTheAuthorizat")}
                value={anthropicCode}
                onChange={(e) => setAnthropicCode(e.target.value)}
                style={{ textAlign: "center" }}
              />
              {anthropicError && (
                <p style={{ fontSize: "0.75rem", color: "rgb(248,113,113)" }}>
                  {anthropicError}
                </p>
              )}
              <button
                type="button"
                className="onboarding-confirm-btn"
                disabled={!anthropicCode}
                onClick={() => void handleAnthropicExchange()}
              >
                {t("onboardingwizard.Connect")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* openai-subscription */}
      {onboardingProvider === "openai-subscription" && (
        <div style={{ width: "100%" }}>
          {openaiConnected ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.5rem",
                  border: "1px solid rgba(34,197,94,0.3)",
                  background: "rgba(34,197,94,0.1)",
                  color: "rgb(74,222,128)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  width: "100%",
                  maxWidth: "20rem",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>{t("onboardingwizard.Connected")}</title>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t("onboardingwizard.ConnectedToChatGPT")}
              </div>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                {t("onboardingwizard.YourChatGPTSubscri")}
              </p>
            </div>
          ) : !openaiOAuthStarted ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
              <button
                type="button"
                className="onboarding-confirm-btn"
                onClick={() => void handleOpenAIStart()}
              >
                {t("onboardingwizard.LoginWithOpenAI")}
              </button>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                {t("onboardingwizard.RequiresChatGPTPlu")}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div
                style={{
                  padding: "0.75rem",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  fontSize: "0.875rem",
                  borderRadius: "0.25rem",
                }}
              >
                <p style={{ fontWeight: "500", marginBottom: "0.25rem" }}>
                  {t("onboardingwizard.AlmostThere")}
                </p>
                <p className="onboarding-desc" style={{ lineHeight: "1.5" }}>
                  {t("onboardingwizard.AfterLoggingInYo1")}{" "}
                  <code
                    style={{
                      background: "var(--input)",
                      padding: "0 0.25rem",
                      fontSize: "0.75rem",
                    }}
                  >
                    {t("onboardingwizard.localhost1455")}
                  </code>
                  {t("onboardingwizard.CopyThe")}{" "}
                  <strong>{t("onboardingwizard.entireURL")}</strong>{" "}
                  {t("onboardingwizard.fromYour")}
                </p>
              </div>
              <input
                type="text"
                className="onboarding-input"
                placeholder={t("onboardingwizard.httpLocalhost145")}
                value={openaiCallbackUrl}
                onChange={(e) => {
                  setOpenaiCallbackUrl(e.target.value);
                  setOpenaiError("");
                }}
              />
              {openaiError && (
                <p style={{ fontSize: "0.75rem", color: "rgb(248,113,113)" }}>
                  {openaiError}
                </p>
              )}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                <button
                  type="button"
                  className="onboarding-confirm-btn"
                  disabled={!openaiCallbackUrl}
                  onClick={() => void handleOpenAIExchange()}
                >
                  {t("onboardingwizard.CompleteLogin")}
                </button>
                <button
                  type="button"
                  className="onboarding-back-link"
                  onClick={() => {
                    setOpenaiOAuthStarted(false);
                    setOpenaiCallbackUrl("");
                  }}
                >
                  {t("onboardingwizard.StartOver")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Generic API key providers */}
      {onboardingProvider &&
        onboardingProvider !== "anthropic-subscription" &&
        onboardingProvider !== "openai-subscription" &&
        onboardingProvider !== "miladycloud" &&
        onboardingProvider !== "ollama" &&
        onboardingProvider !== "pi-ai" && (
          <div style={{ textAlign: "left", width: "100%" }}>
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: "bold",
                display: "block",
                marginBottom: "0.5rem",
              }}
            >
              {t("onboardingwizard.APIKey1")}
            </span>
            <input
              type="password"
              className="onboarding-input"
              value={onboardingApiKey}
              onChange={handleApiKeyChange}
              placeholder={t("onboardingwizard.EnterYourAPIKey")}
            />
            {apiKeyFormatWarning && (
              <p style={{ fontSize: "0.75rem", color: "rgb(248,113,113)", marginTop: "0.5rem" }}>
                {apiKeyFormatWarning}
              </p>
            )}
          </div>
        )}

      {/* ollama */}
      {onboardingProvider === "ollama" && (
        <p className="onboarding-desc">
          {t("onboardingwizard.NoConfigurationNee")}
        </p>
      )}

      {/* pi-ai */}
      {onboardingProvider === "pi-ai" && (
        <div style={{ textAlign: "left", width: "100%" }}>
          <span
            style={{
              fontSize: "0.8125rem",
              fontWeight: "bold",
              display: "block",
              marginBottom: "0.5rem",
            }}
          >
            {t("onboardingwizard.PrimaryModelOptio")}
          </span>
          {piAiModels.length > 0 ? (
            <>
              <select
                value={piAiSelectValue}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === "__custom__") {
                    if (piAiSelectValue !== "__custom__") {
                      setState("onboardingPrimaryModel", "");
                    }
                    return;
                  }
                  setState("onboardingPrimaryModel", next);
                }}
                className="onboarding-input"
              >
                <option value="">
                  {t("onboardingwizard.UsePiDefaultModel")}
                  {piAiDefaultModel ? ` (${piAiDefaultModel})` : ""}
                </option>
                {piAiModels.map((model: PiAiModelOption) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </option>
                ))}
                <option value="__custom__">
                  {t("onboardingwizard.CustomModelSpec")}
                </option>
              </select>
              {piAiSelectValue === "__custom__" && (
                <input
                  type="text"
                  className="onboarding-input"
                  value={onboardingPrimaryModel}
                  onChange={(e) =>
                    setState("onboardingPrimaryModel", e.target.value)
                  }
                  placeholder={t("onboardingwizard.providerModelEG")}
                  style={{ marginTop: "0.5rem" }}
                />
              )}
            </>
          ) : (
            <input
              type="text"
              className="onboarding-input"
              value={onboardingPrimaryModel}
              onChange={(e) =>
                setState("onboardingPrimaryModel", e.target.value)
              }
              placeholder={t("onboardingwizard.providerModelEG")}
            />
          )}
          <p className="onboarding-desc">
            {t("onboardingwizard.UsesCredentialsFro")}
            {piAiModels.length > 0
              ? " Pick from the dropdown or choose a custom model spec."
              : " Enter provider/model manually if you want an override."}
          </p>
        </div>
      )}

      {/* openrouter model selection */}
      {onboardingProvider === "openrouter" &&
        onboardingApiKey.trim() &&
        onboardingOptions?.openrouterModels && (
          <div style={{ marginTop: "1rem", textAlign: "left", width: "100%" }}>
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: "bold",
                display: "block",
                marginBottom: "0.5rem",
              }}
            >
              {t("onboardingwizard.SelectModel")}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {onboardingOptions?.openrouterModels?.map(
                (model: OpenRouterModelOption) => (
                  <button
                    type="button"
                    key={model.id}
                    className={`onboarding-provider-card${onboardingOpenRouterModel === model.id ? " onboarding-provider-card--selected" : ""}`}
                    onClick={() => handleOpenRouterModelSelect(model.id)}
                    style={{ width: "100%" }}
                  >
                    <div>
                      <div className="onboarding-provider-name">{model.name}</div>
                      {model.description && (
                        <div className="onboarding-provider-desc">
                          {model.description}
                        </div>
                      )}
                    </div>
                  </button>
                ),
              )}
            </div>
          </div>
        )}

      <div className="onboarding-panel-footer">
        <button
          className="onboarding-back-link"
          onClick={() => {
            setState("onboardingProvider", "");
            setState("onboardingApiKey", "");
            setState("onboardingPrimaryModel", "");
          }}
          type="button"
        >
          ← Back
        </button>
        <button
          className="onboarding-confirm-btn"
          onClick={() => handleOnboardingNext()}
          type="button"
        >
          {t("onboardingwizard.confirm") || "Confirm"}
        </button>
      </div>
    </>
  );
}
