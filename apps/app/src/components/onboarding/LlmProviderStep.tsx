import { client } from "@milady/app-core/api";
import { Button, Input } from "@milady/ui";
import { useState } from "react";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";

function formatRequestError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

import type {
  OpenRouterModelOption,
  PiAiModelOption,
  ProviderOption,
} from "@milady/app-core/api";
import { getProviderLogo } from "../../provider-logos";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function LlmProviderStep() {
  const {
    t,
    onboardingOptions,
    onboardingProvider,
    onboardingSubscriptionTab,
    onboardingApiKey,
    onboardingPrimaryModel,
    onboardingMiladyCloudTab,
    onboardingOpenRouterModel,
    onboardingAvatar,
    customVrmUrl,
    miladyCloudConnected,
    miladyCloudLoginBusy,
    miladyCloudLoginError,
    handleCloudLogin,
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

  const avatarVrmPath =
    onboardingAvatar === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(onboardingAvatar || 1);
  const avatarFallbackPreviewUrl =
    onboardingAvatar > 0
      ? getVrmPreviewUrl(onboardingAvatar)
      : getVrmPreviewUrl(1);

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

  const renderProviderCard = (
    provider: ProviderOption,
    size: "lg" | "sm" = "sm",
  ) => {
    const display = getProviderDisplay(provider);
    const isSelected = onboardingProvider === provider.id;
    const padding = size === "lg" ? "px-5 py-4" : "px-4 py-3";
    return (
      <button
        type="button"
        key={provider.id}
        className={`${padding} border-[1.5px] cursor-pointer transition-all text-left flex items-center gap-3 rounded-lg ${
          isSelected
            ? "border-accent !bg-accent !text-accent-fg shadow-[0_0_0_3px_var(--accent),var(--shadow-md)]"
            : "border-border bg-card hover:border-border-hover hover:bg-bg-hover hover:shadow-md hover:-translate-y-0.5"
        }`}
        onClick={() => handleProviderSelect(provider.id)}
      >
        <img
          src={getProviderLogo(provider.id, false)}
          alt={display.name}
          className="w-9 h-9 rounded-md object-contain bg-bg-muted p-1.5 shrink-0"
        />
        <div>
          <div className="font-semibold text-sm">{display.name}</div>
          {display.description && (
            <div
              className={`text-xs mt-0.5 ${isSelected ? "opacity-80" : "text-muted"}`}
            >
              {display.description}
            </div>
          )}
        </div>
      </button>
    );
  };

  if (!onboardingProvider) {
    return (
      <div className="w-full mx-auto mt-10 text-center font-body">
        <OnboardingVrmAvatar
          vrmPath={avatarVrmPath}
          fallbackPreviewUrl={avatarFallbackPreviewUrl}
        />
        <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-4 max-w-[420px] relative text-[15px] text-txt leading-relaxed">
          <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
            {t("onboardingwizard.whatIsMyBrain")}
          </h2>
        </div>
        <div className="w-full mx-auto px-2">
          <div className="mb-4 text-left">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {cloudProviders.map((p: ProviderOption) => renderProviderCard(p))}
              {subscriptionProviders.map((p: ProviderOption) =>
                renderProviderCard(p),
              )}
              {apiProviders.map((p: ProviderOption) => renderProviderCard(p))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedProvider = providers.find(
    (p: ProviderOption) => p.id === onboardingProvider,
  );
  const selectedDisplay = selectedProvider
    ? getProviderDisplay(selectedProvider)
    : { name: onboardingProvider, description: "" };

  return (
    <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
      <div className="flex items-center justify-center gap-3 mb-6">
        {selectedProvider && (
          <img
            src={getProviderLogo(selectedProvider.id, false)}
            alt={selectedDisplay.name}
            className="w-10 h-10 rounded-md object-contain bg-bg-muted p-1.5"
          />
        )}
        <div className="text-left">
          <h2 className="text-[22px] font-normal text-txt-strong leading-tight">
            {selectedDisplay.name}
          </h2>
          {selectedDisplay.description && (
            <p className="text-xs text-muted mt-0.5">
              {selectedDisplay.description}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-2 rounded-full border-accent/30 text-accent hover:bg-accent/10"
          onClick={() => {
            setState("onboardingProvider", "");
            setState("onboardingApiKey", "");
            setState("onboardingPrimaryModel", "");
          }}
        >
          {t("onboardingwizard.change")}
        </Button>
      </div>

      {onboardingProvider === "miladycloud" && (
        <div className="max-w-[600px] mx-auto text-left">
          <div className="flex items-center gap-4 border-b border-border mb-4">
            <button
              type="button"
              className={`text-sm pb-2 border-b-2 ${
                onboardingMiladyCloudTab === "login"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-txt"
              }`}
              onClick={() => setState("onboardingMiladyCloudTab", "login")}
            >
              {t("onboardingwizard.Login")}
            </button>
            <button
              type="button"
              className={`text-sm pb-2 border-b-2 ${
                onboardingMiladyCloudTab === "apikey"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-txt"
              }`}
              onClick={() => setState("onboardingMiladyCloudTab", "apikey")}
            >
              {t("onboardingwizard.APIKey")}
            </button>
          </div>

          {onboardingMiladyCloudTab === "login" ? (
            <div className="text-center">
              {miladyCloudConnected ? (
                <div className="flex items-center gap-2 px-4 py-2.5 border border-green-500/30 bg-green-500/10 text-green-400 text-sm rounded-lg justify-center">
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
                <Button
                  variant="default"
                  className="w-full rounded-full"
                  onClick={handleCloudLogin}
                  disabled={miladyCloudLoginBusy}
                >
                  {miladyCloudLoginBusy ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin" />
                      {t("onboardingwizard.connecting")}
                    </span>
                  ) : (
                    "connect account"
                  )}
                </Button>
              )}
              {miladyCloudLoginError && (
                <p className="text-danger text-[13px] mt-2">
                  {miladyCloudLoginError}
                </p>
              )}
              <p className="text-xs text-muted mt-3">
                {t("onboardingwizard.FreeCreditsToStar")}
              </p>
            </div>
          ) : (
            <div>
              <label
                htmlFor="miladycloud-apikey"
                className="block text-sm text-txt mb-1.5"
              >
                {t("onboardingwizard.MiladyCloudAPIKey")}
              </label>
              <Input
                id="miladycloud-apikey"
                type="password"
                placeholder={t("onboardingwizard.ec")}
                value={onboardingApiKey}
                onChange={handleApiKeyChange}
                className="rounded-lg bg-card"
              />
              <p className="text-xs text-muted mt-2">
                {t("onboardingwizard.UseThisIfBrowser")}{" "}
                <a
                  href="https://miladycloud.ai/dashboard/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {t("onboardingwizard.miladycloudAiDashbo")}
                </a>
              </p>
            </div>
          )}
        </div>
      )}

      {onboardingProvider === "anthropic-subscription" && (
        <div className="text-left">
          <div className="flex items-center gap-4 border-b border-border mb-3">
            <button
              type="button"
              className={`text-sm pb-2 border-b-2 ${
                onboardingSubscriptionTab === "token"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-txt"
              }`}
              onClick={() => setState("onboardingSubscriptionTab", "token")}
            >
              {t("onboardingwizard.SetupToken")}
            </button>
            <button
              type="button"
              className={`text-sm pb-2 border-b-2 ${
                onboardingSubscriptionTab === "oauth"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-txt"
              }`}
              onClick={() => setState("onboardingSubscriptionTab", "oauth")}
            >
              {t("onboardingwizard.OAuthLogin")}
            </button>
          </div>

          {onboardingSubscriptionTab === "token" ? (
            <>
              <span className="text-[13px] font-bold text-txt-strong block mb-2">
                {t("onboardingwizard.SetupToken1")}
              </span>
              <Input
                type="password"
                value={onboardingApiKey}
                onChange={handleApiKeyChange}
                placeholder={t("onboardingwizard.skAntOat01")}
                className="bg-card"
              />
              <p className="text-xs text-muted mt-2 whitespace-pre-line">
                {
                  'How to get your setup token:\n\n• Option A: Run  claude setup-token  in your terminal (if you have Claude Code CLI installed)\n\n• Option B: Go to claude.ai/settings/api → "Claude Code" → "Use setup token"'
                }
              </p>
            </>
          ) : anthropicConnected ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 px-6 py-3 border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium w-full max-w-xs justify-center">
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
              <p className="text-xs text-muted text-center">
                {t("onboardingwizard.YourClaudeSubscrip")}
              </p>
            </div>
          ) : !anthropicOAuthStarted ? (
            <div className="flex flex-col items-center gap-3">
              <Button
                variant="default"
                className="w-full max-w-xs"
                onClick={() => void handleAnthropicStart()}
              >
                {t("onboardingwizard.LoginWithAnthropic")}
              </Button>
              <p className="text-xs text-muted text-center">
                {t("onboardingwizard.RequiresClaudePro")}
              </p>
              {anthropicError && (
                <p className="text-xs text-red-400">{anthropicError}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-txt text-center">
                {t("onboardingwizard.AfterLoggingInYo")}
                <br />
                {t("onboardingwizard.CopyAndPasteItBe")}
              </p>
              <Input
                type="text"
                placeholder={t("onboardingwizard.PasteTheAuthorizat")}
                value={anthropicCode}
                onChange={(e) => setAnthropicCode(e.target.value)}
                className="w-full max-w-xs text-center bg-card"
              />
              {anthropicError && (
                <p className="text-xs text-red-400">{anthropicError}</p>
              )}
              <Button
                variant="default"
                className="w-full max-w-xs"
                disabled={!anthropicCode}
                onClick={() => void handleAnthropicExchange()}
              >
                {t("onboardingwizard.Connect")}
              </Button>
            </div>
          )}
        </div>
      )}

      {onboardingProvider === "openai-subscription" && (
        <div className="space-y-4">
          {openaiConnected ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 px-6 py-3 border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium w-full max-w-xs justify-center">
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
              <p className="text-xs text-muted text-center">
                {t("onboardingwizard.YourChatGPTSubscri")}
              </p>
            </div>
          ) : !openaiOAuthStarted ? (
            <div className="flex flex-col items-center gap-3">
              <Button
                variant="default"
                className="w-full max-w-xs"
                onClick={() => void handleOpenAIStart()}
              >
                {t("onboardingwizard.LoginWithOpenAI")}
              </Button>
              <p className="text-xs text-muted text-center">
                {t("onboardingwizard.RequiresChatGPTPlu")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="p-3 border border-border bg-card text-sm text-fg rounded">
                <p className="font-medium mb-1">
                  {t("onboardingwizard.AlmostThere")}
                </p>
                <p className="text-muted text-xs leading-relaxed">
                  {t("onboardingwizard.AfterLoggingInYo1")}{" "}
                  <code className="text-fg bg-input px-1 py-0.5 text-xs">
                    {t("onboardingwizard.localhost1455")}
                  </code>
                  {t("onboardingwizard.CopyThe")}{" "}
                  <strong>{t("onboardingwizard.entireURL")}</strong>{" "}
                  {t("onboardingwizard.fromYour")}
                </p>
              </div>
              <Input
                type="text"
                className="bg-input"
                placeholder={t("onboardingwizard.httpLocalhost145")}
                value={openaiCallbackUrl}
                onChange={(e) => {
                  setOpenaiCallbackUrl(e.target.value);
                  setOpenaiError("");
                }}
              />
              {openaiError && (
                <p className="text-xs text-red-400">{openaiError}</p>
              )}
              <div className="flex gap-2 justify-center">
                <Button
                  variant="default"
                  disabled={!openaiCallbackUrl}
                  onClick={() => void handleOpenAIExchange()}
                >
                  {t("onboardingwizard.CompleteLogin")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpenaiOAuthStarted(false);
                    setOpenaiCallbackUrl("");
                  }}
                >
                  {t("onboardingwizard.StartOver")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {onboardingProvider &&
        onboardingProvider !== "anthropic-subscription" &&
        onboardingProvider !== "openai-subscription" &&
        onboardingProvider !== "miladycloud" &&
        onboardingProvider !== "ollama" &&
        onboardingProvider !== "pi-ai" && (
          <div className="text-left">
            <span className="text-[13px] font-bold text-txt-strong block mb-2">
              {t("onboardingwizard.APIKey1")}
            </span>
            <Input
              type="password"
              value={onboardingApiKey}
              onChange={handleApiKeyChange}
              placeholder={t("onboardingwizard.EnterYourAPIKey")}
              className="bg-card"
            />
            {apiKeyFormatWarning && (
              <p className="text-xs text-red-400 mt-2">{apiKeyFormatWarning}</p>
            )}
          </div>
        )}

      {onboardingProvider === "ollama" && (
        <p className="text-xs text-muted">
          {t("onboardingwizard.NoConfigurationNee")}
        </p>
      )}

      {onboardingProvider === "pi-ai" && (
        <div className="text-left">
          <span className="text-[13px] font-bold text-txt-strong block mb-2">
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
                className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
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
                  value={onboardingPrimaryModel}
                  onChange={(e) =>
                    setState("onboardingPrimaryModel", e.target.value)
                  }
                  placeholder={t("onboardingwizard.providerModelEG")}
                  className="w-full mt-2 px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                />
              )}
            </>
          ) : (
            <input
              type="text"
              value={onboardingPrimaryModel}
              onChange={(e) =>
                setState("onboardingPrimaryModel", e.target.value)
              }
              placeholder={t("onboardingwizard.providerModelEG")}
              className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
            />
          )}
          <p className="text-xs text-muted mt-2">
            {t("onboardingwizard.UsesCredentialsFro")}
            {piAiModels.length > 0
              ? " Pick from the dropdown or choose a custom model spec."
              : " Enter provider/model manually if you want an override."}
          </p>
        </div>
      )}

      {onboardingProvider === "openrouter" &&
        onboardingApiKey.trim() &&
        onboardingOptions?.openrouterModels && (
          <div className="mt-4 text-left">
            <span className="text-[13px] font-bold text-txt-strong block mb-2">
              {t("onboardingwizard.SelectModel")}
            </span>
            <div className="flex flex-col gap-2">
              {onboardingOptions?.openrouterModels?.map(
                (model: OpenRouterModelOption) => (
                  <button
                    type="button"
                    key={model.id}
                    className={`w-full px-4 py-3 border cursor-pointer transition-colors text-left rounded-lg ${
                      onboardingOpenRouterModel === model.id
                        ? "border-accent !bg-accent !text-accent-fg"
                        : "border-border bg-card hover:border-accent/50"
                    }`}
                    onClick={() => handleOpenRouterModelSelect(model.id)}
                  >
                    <div className="font-bold text-sm">{model.name}</div>
                    {model.description && (
                      <div className="text-xs text-muted mt-0.5">
                        {model.description}
                      </div>
                    )}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
    </div>
  );
}
