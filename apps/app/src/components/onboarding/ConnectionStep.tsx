import type {
  OpenRouterModelOption,
  PiAiModelOption,
  ProviderOption,
} from "@milady/app-core/api";
import { client } from "@milady/app-core/api";
import { useState } from "react";
import { useApp } from "../../AppContext";
import { getProviderLogo } from "../../provider-logos";
import { openExternalUrl } from "../../utils/openExternalUrl";

function formatRequestError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function ConnectionStep() {
  const {
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

  const handleAnthropicStart = async () => {
    setAnthropicError("");
    try {
      const { authUrl } = await client.startAnthropicLogin();
      if (authUrl) {
        await openExternalUrl(authUrl);
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
        await openExternalUrl(authUrl);
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
    miladycloud: { name: "Eliza Cloud", description: "Free to start" },
    "anthropic-subscription": {
      name: "Claude Sub",
      description: "Pro/Max subscription",
    },
    "openai-subscription": {
      name: "ChatGPT Sub",
      description: "Plus/Pro subscription",
    },
    anthropic: { name: "Anthropic", description: "Claude API key" },
    openai: { name: "OpenAI", description: "GPT API key" },
    openrouter: { name: "OpenRouter", description: "Multi-model API" },
    gemini: { name: "Gemini", description: "Google AI" },
    grok: { name: "xAI (Grok)" },
    groq: { name: "Groq", description: "Fast inference" },
    deepseek: { name: "DeepSeek" },
    "pi-ai": { name: "Pi Credentials", description: "Local auth" },
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
        <div className="onboarding-section-title">Neural Link</div>
        <div className="onboarding-divider">
          <div className="onboarding-divider-diamond" />
        </div>
        <div className="onboarding-question">Choose your AI provider</div>
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
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            justifyContent: "center",
          }}
        >
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
            Change
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
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              marginBottom: "1rem",
            }}
          >
            <button
              type="button"
              style={{
                fontSize: "0.875rem",
                paddingBottom: "0.5rem",
                color:
                  onboardingMiladyCloudTab === "login"
                    ? "#f0b90b"
                    : "rgba(240,238,250,0.4)",
                background: "none",
                border: "none",
                borderBottom:
                  onboardingMiladyCloudTab === "login"
                    ? "2px solid #f0b90b"
                    : "2px solid transparent",
                cursor: "pointer",
              }}
              onClick={() => setState("onboardingMiladyCloudTab", "login")}
            >
              Login
            </button>
            <button
              type="button"
              style={{
                fontSize: "0.875rem",
                paddingBottom: "0.5rem",
                borderBottom:
                  onboardingMiladyCloudTab === "apikey"
                    ? "2px solid #f0b90b"
                    : "2px solid transparent",
                color:
                  onboardingMiladyCloudTab === "apikey"
                    ? "#f0b90b"
                    : "rgba(240,238,250,0.4)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              onClick={() => setState("onboardingMiladyCloudTab", "apikey")}
            >
              API Key
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
                    <title>Connected</title>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Connected
                </div>
              ) : (
                <button
                  type="button"
                  className="onboarding-confirm-btn"
                  onClick={handleCloudLogin}
                  disabled={miladyCloudLoginBusy}
                >
                  {miladyCloudLoginBusy ? "Connecting..." : "Connect Account"}
                </button>
              )}
              {miladyCloudLoginError && (
                <p
                  style={{
                    color: "rgb(248,113,113)",
                    fontSize: "0.8125rem",
                    marginTop: "0.5rem",
                  }}
                >
                  {miladyCloudLoginError}
                </p>
              )}
              <p className="onboarding-desc">Free credits to get started.</p>
            </div>
          ) : (
            <div>
              <label
                htmlFor="miladycloud-apikey"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  marginBottom: "0.375rem",
                  color: "rgba(240,238,250,0.6)",
                }}
              >
                API Key
              </label>
              <input
                id="miladycloud-apikey"
                type="password"
                className="onboarding-input"
                placeholder="ec-..."
                value={onboardingApiKey}
                onChange={handleApiKeyChange}
              />
              <p className="onboarding-desc">
                Use this if you already have a key.{" "}
                <a
                  href="https://miladycloud.ai/dashboard/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#f0b90b" }}
                >
                  Get one here
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
              borderBottom: "1px solid rgba(255,255,255,0.1)",
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
                    ? "2px solid #f0b90b"
                    : "2px solid transparent",
                color:
                  onboardingSubscriptionTab === "token"
                    ? "#f0b90b"
                    : "rgba(240,238,250,0.4)",
                cursor: "pointer",
              }}
              onClick={() => setState("onboardingSubscriptionTab", "token")}
            >
              Setup Token
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
                    ? "2px solid #f0b90b"
                    : "2px solid transparent",
                color:
                  onboardingSubscriptionTab === "oauth"
                    ? "#f0b90b"
                    : "rgba(240,238,250,0.4)",
                cursor: "pointer",
              }}
              onClick={() => setState("onboardingSubscriptionTab", "oauth")}
            >
              OAuth Login
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
                  color: "rgba(240,238,250,0.7)",
                }}
              >
                Enter your setup token
              </span>
              <input
                type="password"
                className="onboarding-input"
                value={onboardingApiKey}
                onChange={handleApiKeyChange}
                placeholder="sk-ant-oat01-..."
              />
              <p
                className="onboarding-desc"
                style={{ whiteSpace: "pre-line", textAlign: "left" }}
              >
                {
                  'How to get your setup token:\n\n\u2022 Option A: Run  claude setup-token  in your terminal\n\n\u2022 Option B: Go to claude.ai/settings/api \u2192 "Claude Code" \u2192 "Use setup token"'
                }
              </p>
            </>
          ) : anthropicConnected ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
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
                  <title>Connected</title>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Connected to Claude
              </div>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                Your Claude subscription is ready to use.
              </p>
            </div>
          ) : !anthropicOAuthStarted ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <button
                type="button"
                className="onboarding-confirm-btn"
                onClick={() => void handleAnthropicStart()}
              >
                Login with Anthropic
              </button>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                Requires a Claude Pro or Max subscription.
              </p>
              {anthropicError && (
                <p style={{ fontSize: "0.75rem", color: "rgb(248,113,113)" }}>
                  {anthropicError}
                </p>
              )}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <p
                style={{
                  fontSize: "0.875rem",
                  textAlign: "center",
                  color: "rgba(240,238,250,0.7)",
                }}
              >
                After logging in, you will receive an authorization code.
                <br />
                Copy and paste it below.
              </p>
              <input
                type="text"
                className="onboarding-input"
                placeholder="Paste authorization code..."
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
                Connect
              </button>
            </div>
          )}
        </div>
      )}

      {/* openai-subscription */}
      {onboardingProvider === "openai-subscription" && (
        <div style={{ width: "100%" }}>
          {openaiConnected ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
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
                  <title>Connected</title>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Connected to ChatGPT
              </div>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                Your ChatGPT subscription is ready to use.
              </p>
            </div>
          ) : !openaiOAuthStarted ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <button
                type="button"
                className="onboarding-confirm-btn"
                onClick={() => void handleOpenAIStart()}
              >
                Login with OpenAI
              </button>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                Requires a ChatGPT Plus or Pro subscription.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  padding: "0.75rem",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  fontSize: "0.875rem",
                  borderRadius: "0.25rem",
                }}
              >
                <p
                  style={{
                    fontWeight: "500",
                    marginBottom: "0.25rem",
                    color: "rgba(240,238,250,0.8)",
                  }}
                >
                  Almost there!
                </p>
                <p
                  className="onboarding-desc"
                  style={{ lineHeight: "1.5", textAlign: "left" }}
                >
                  After logging in, your browser will redirect to{" "}
                  <code
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      padding: "0 0.25rem",
                      fontSize: "0.75rem",
                    }}
                  >
                    localhost:1455
                  </code>
                  . Copy the <strong>entire URL</strong> from your browser's
                  address bar.
                </p>
              </div>
              <input
                type="text"
                className="onboarding-input"
                placeholder="http://localhost:1455/..."
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
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  className="onboarding-confirm-btn"
                  disabled={!openaiCallbackUrl}
                  onClick={() => void handleOpenAIExchange()}
                >
                  Complete Login
                </button>
                <button
                  type="button"
                  className="onboarding-back-link"
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
                color: "rgba(240,238,250,0.7)",
              }}
            >
              API Key
            </span>
            <input
              type="password"
              className="onboarding-input"
              value={onboardingApiKey}
              onChange={handleApiKeyChange}
              placeholder="Enter your API key..."
            />
            {apiKeyFormatWarning && (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "rgb(248,113,113)",
                  marginTop: "0.5rem",
                }}
              >
                {apiKeyFormatWarning}
              </p>
            )}
          </div>
        )}

      {/* ollama */}
      {onboardingProvider === "ollama" && (
        <p className="onboarding-desc">
          No configuration needed. Ollama will be used automatically.
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
              color: "rgba(240,238,250,0.7)",
            }}
          >
            Primary Model (optional)
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
                  Use default model
                  {piAiDefaultModel ? ` (${piAiDefaultModel})` : ""}
                </option>
                {piAiModels.map((model: PiAiModelOption) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </option>
                ))}
                <option value="__custom__">Custom model...</option>
              </select>
              {piAiSelectValue === "__custom__" && (
                <input
                  type="text"
                  className="onboarding-input"
                  value={onboardingPrimaryModel}
                  onChange={(e) =>
                    setState("onboardingPrimaryModel", e.target.value)
                  }
                  placeholder="provider/model (e.g. anthropic/claude-3.5-sonnet)"
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
              placeholder="provider/model (e.g. anthropic/claude-3.5-sonnet)"
            />
          )}
          <p className="onboarding-desc" style={{ textAlign: "left" }}>
            Uses credentials from ~/.pi/agent/auth.json.
            {piAiModels.length > 0
              ? " Pick from the dropdown or choose a custom model."
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
                color: "rgba(240,238,250,0.7)",
              }}
            >
              Select Model
            </span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
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
                      <div className="onboarding-provider-name">
                        {model.name}
                      </div>
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
          Confirm
        </button>
      </div>
    </>
  );
}
