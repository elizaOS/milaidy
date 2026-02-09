/**
 * Onboarding wizard component — multi-step onboarding flow.
 */

import { useEffect, useState, type ChangeEvent } from "react";
import { useApp, THEMES, type OnboardingStep } from "../AppContext.js";
import type { StylePreset, ProviderOption, CloudProviderOption, ModelOption, InventoryProviderOption, RpcProviderOption, OpenRouterModelOption } from "../api-client";
import { getProviderLogo } from "../provider-logos.js";

export function OnboardingWizard() {
  const {
    onboardingStep,
    onboardingOptions,
    onboardingName,
    onboardingStyle,
    onboardingTheme,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingSmallModel,
    onboardingLargeModel,
    onboardingProvider,
    onboardingApiKey,
    onboardingOpenRouterModel,
    onboardingTelegramToken,
    onboardingSelectedChains,
    onboardingRpcSelections,
    onboardingRpcKeys,
    onboardingChannels,
    onboardingRestarting,
    cloudConnected,
    cloudLoginBusy,
    cloudLoginError,
    cloudUserId,
    handleOnboardingNext,
    handleOnboardingBack,
    setState,
    setTheme,
    handleCloudLogin,
  } = useApp();

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showProviderConfirmModal, setShowProviderConfirmModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null);

  useEffect(() => {
    if (onboardingStep === "theme") {
      setTheme(onboardingTheme);
    }
  }, [onboardingStep, onboardingTheme, setTheme]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState("onboardingName", e.target.value);
  };

  const handleStyleSelect = (catchphrase: string) => {
    setState("onboardingStyle", catchphrase);
  };

  const handleThemeSelect = (themeId: string) => {
    setState("onboardingTheme", themeId as typeof onboardingTheme);
    setTheme(themeId as typeof onboardingTheme);
  };

  const handleRunModeSelect = (mode: "local" | "cloud") => {
    setState("onboardingRunMode", mode);
  };

  const handleCloudProviderSelect = (providerId: string) => {
    setState("onboardingCloudProvider", providerId);
  };

  const handleSmallModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("onboardingSmallModel", e.target.value);
  };

  const handleLargeModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("onboardingLargeModel", e.target.value);
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState("onboardingApiKey", e.target.value);
  };

  const handleOpenRouterModelSelect = (modelId: string) => {
    setState("onboardingOpenRouterModel", modelId);
  };

  const handleChainToggle = (chain: string) => {
    const newSelected = new Set(onboardingSelectedChains);
    if (newSelected.has(chain)) {
      newSelected.delete(chain);
    } else {
      newSelected.add(chain);
    }
    setState("onboardingSelectedChains", newSelected);
  };

  const handleRpcSelectionChange = (chain: string, provider: string) => {
    setState("onboardingRpcSelections", { ...onboardingRpcSelections, [chain]: provider });
  };

  const handleRpcKeyChange = (chain: string, provider: string, key: string) => {
    const keyName = `${chain}:${provider}`;
    setState("onboardingRpcKeys", { ...onboardingRpcKeys, [keyName]: key });
  };

  const handleTelegramTokenChange = (token: string) => {
    setState("onboardingChannels", {
      ...onboardingChannels,
      telegram: {
        ...(onboardingChannels.telegram ?? {}),
        botToken: token,
      },
    });
  };

  const renderStep = (step: OnboardingStep) => {
    switch (step) {
      case "welcome":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <img
              src="/pfp.jpg"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <h1 className="text-[28px] font-normal mb-1 text-txt-strong">Welcome to Milaidy</h1>
            <p className="italic text-muted text-sm mb-8">Let's get you set up</p>
          </div>
        );

      case "name":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Choose a Name</h2>
            </div>
            <div className="flex flex-col gap-2 text-left max-w-[360px] mx-auto">
              {onboardingOptions?.names.map((name: string) => (
                <button
                  key={name}
                  className={`px-4 py-3 border cursor-pointer bg-card transition-colors text-left ${
                    onboardingName === name
                      ? "border-accent bg-accent-subtle"
                      : "border-border hover:border-accent"
                  }`}
                  onClick={() => setState("onboardingName", name)}
                >
                  <div className="font-bold text-sm">{name}</div>
                </button>
              ))}
            </div>
            <div className="max-w-[360px] mx-auto mt-4">
              <label className="text-xs text-muted block mb-2 text-left">Or enter custom name:</label>
              <div
                className={`px-4 py-3 border cursor-pointer bg-card transition-colors ${
                  onboardingName && !onboardingOptions?.names.includes(onboardingName)
                    ? "border-accent bg-accent-subtle"
                    : "border-border hover:border-accent"
                }`}
              >
                <input
                  type="text"
                  value={onboardingName}
                  onChange={handleNameChange}
                  className="border-none bg-transparent text-sm font-bold w-full p-0 outline-none text-inherit"
                  placeholder="Enter custom name"
                />
              </div>
            </div>
          </div>
        );

      case "style":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Choose a Style</h2>
            </div>
            <div className="flex flex-col gap-2 text-left max-w-[360px] mx-auto">
              {onboardingOptions?.styles.map((style: StylePreset) => (
                <div
                  key={style.catchphrase}
                  className={`px-4 py-3 border cursor-pointer bg-card transition-colors ${
                    onboardingStyle === style.catchphrase
                      ? "border-accent bg-accent-subtle"
                      : "border-border hover:border-accent"
                  }`}
                  onClick={() => handleStyleSelect(style.catchphrase)}
                >
                  <div className="font-bold text-sm">{style.catchphrase}</div>
                  {style.hint && <div className="text-xs text-muted mt-0.5">{style.hint}</div>}
                </div>
              ))}
            </div>
          </div>
        );

      case "theme":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Choose a Theme</h2>
            </div>
            <div className="grid grid-cols-3 gap-2 text-left max-w-[360px] mx-auto">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  className={`px-2 py-3.5 border cursor-pointer bg-card transition-colors text-center ${
                    onboardingTheme === theme.id
                      ? "border-accent bg-accent-subtle"
                      : "border-border hover:border-accent"
                  }`}
                  onClick={() => handleThemeSelect(theme.id)}
                >
                  <div className="font-bold text-sm">{theme.label}</div>
                </button>
              ))}
            </div>
          </div>
        );

      case "runMode":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Run Mode</h2>
            </div>
            <div className="flex flex-col gap-2 text-left max-w-[360px] mx-auto">
              <button
                className={`px-4 py-3 border cursor-pointer bg-card transition-colors ${
                  onboardingRunMode === "local"
                    ? "border-accent bg-accent-subtle"
                    : "border-border hover:border-accent"
                }`}
                onClick={() => handleRunModeSelect("local")}
              >
                <div className="font-bold text-sm">Local</div>
                <div className="text-xs text-muted mt-0.5">Run on your machine with your own API keys</div>
              </button>
              <button
                className={`px-4 py-3 border cursor-pointer bg-card transition-colors ${
                  onboardingRunMode === "cloud"
                    ? "border-accent bg-accent-subtle"
                    : "border-border hover:border-accent"
                }`}
                onClick={() => handleRunModeSelect("cloud")}
              >
                <div className="font-bold text-sm">Cloud</div>
                <div className="text-xs text-muted mt-0.5">Use Eliza Cloud managed services</div>
              </button>
            </div>
          </div>
        );

      case "cloudProvider":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Cloud Provider</h2>
            </div>
            <div className="flex flex-col gap-2 text-left max-w-[360px] mx-auto">
              {onboardingOptions?.cloudProviders.map((provider: CloudProviderOption) => (
                <div
                  key={provider.id}
                  className={`px-4 py-3 border cursor-pointer bg-card transition-colors ${
                    onboardingCloudProvider === provider.id
                      ? "border-accent bg-accent-subtle"
                      : "border-border hover:border-accent"
                  }`}
                  onClick={() => handleCloudProviderSelect(provider.id)}
                >
                  <div className="font-bold text-sm">{provider.name}</div>
                  {provider.description && <div className="text-xs text-muted mt-0.5">{provider.description}</div>}
                </div>
              ))}
            </div>
          </div>
        );

      case "modelSelection":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Model Selection</h2>
            </div>
            <div className="flex flex-col gap-4 text-left max-w-[360px] mx-auto">
              <div>
                <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
                  Small Model:
                </label>
                <select
                  value={onboardingSmallModel}
                  onChange={handleSmallModelChange}
                  className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                >
                  {onboardingOptions?.models.small.map((model: ModelOption) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
                  Large Model:
                </label>
                <select
                  value={onboardingLargeModel}
                  onChange={handleLargeModelChange}
                  className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                >
                  {onboardingOptions?.models.large.map((model: ModelOption) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );

      case "cloudLogin":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Cloud Login</h2>
            </div>
            {cloudConnected ? (
              <div className="max-w-[360px] mx-auto">
                <p className="text-txt mb-2">Logged in successfully!</p>
                {cloudUserId && <p className="text-muted text-sm">User ID: {cloudUserId}</p>}
              </div>
            ) : (
              <div className="max-w-[360px] mx-auto">
                <p className="text-txt mb-4">Click the button below to log in to Eliza Cloud</p>
                <button
                  className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed mt-5"
                  onClick={handleCloudLogin}
                  disabled={cloudLoginBusy}
                >
                  {cloudLoginBusy ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin"></span>
                      Logging in...
                    </span>
                  ) : (
                    "Login to Eliza Cloud"
                  )}
                </button>
                {cloudLoginError && <p className="text-danger text-[13px] mt-2.5">{cloudLoginError}</p>}
              </div>
            )}
          </div>
        );

      case "llmProvider":
        const isDark = onboardingTheme === "dark";
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <img
              src="/pfp.jpg"
              alt="milAIdy"
              className="w-[80px] h-[80px] rounded-full object-cover border-2 border-border mx-auto mb-4 block"
            />
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              which AI provider should I use?
            </div>
            <div className="max-w-[360px] mx-auto mb-6 max-h-[400px] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-3 text-left">
              {onboardingOptions?.providers.map((provider: ProviderOption) => (
                <div
                  key={provider.id}
                  className={`p-5 border-[1.5px] cursor-pointer bg-card transition-all rounded-lg flex flex-col gap-3 ${
                    onboardingProvider === provider.id
                      ? "border-accent bg-accent-subtle shadow-[0_0_0_3px_var(--accent-subtle),var(--shadow-md)]"
                      : "border-border hover:border-border-hover hover:bg-bg-hover hover:shadow-md hover:-translate-y-0.5"
                  }`}
                  onClick={() => {
                    setSelectedProvider(provider);
                    setState("onboardingProvider", provider.id);
                    setState("onboardingApiKey", "");

                    // Check if provider needs API key
                    const needsKey = provider.envKey && provider.id !== "elizacloud" && provider.id !== "ollama";
                    if (needsKey) {
                      setShowApiKeyModal(true);
                    } else {
                      setShowProviderConfirmModal(true);
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={getProviderLogo(provider.id, isDark)}
                      alt={provider.name}
                      className="w-10 h-10 rounded-md object-contain bg-bg-muted p-1.5 shrink-0"
                    />
                    <div className="font-semibold text-sm text-txt-strong">{provider.name}</div>
                  </div>
                  {provider.description && <div className="text-xs text-muted-strong leading-relaxed">{provider.description}</div>}
                </div>
              ))}
              </div>
            </div>

            {showApiKeyModal && selectedProvider && renderApiKeyModal()}
            {showProviderConfirmModal && selectedProvider && renderProviderConfirmModal()}
            {onboardingProvider === "openrouter" && onboardingApiKey.trim() && onboardingOptions?.openrouterModels && (
              <div className="max-w-[360px] mx-auto mt-4">
                <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">Select Model:</label>
                <div className="flex flex-col gap-2">
                  {onboardingOptions.openrouterModels.map((model: OpenRouterModelOption) => (
                    <div
                      key={model.id}
                      className={`px-4 py-3 border cursor-pointer transition-colors text-left rounded-lg ${
                        onboardingOpenRouterModel === model.id
                          ? "border-accent bg-accent-subtle"
                          : "border-border bg-card hover:border-accent/50"
                      }`}
                      onClick={() => handleOpenRouterModelSelect(model.id)}
                    >
                      <div className="font-bold text-sm">{model.name}</div>
                      {model.description && <div className="text-xs text-muted mt-0.5">{model.description}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case "inventorySetup":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Inventory Setup</h2>
            </div>
            <div className="flex flex-col gap-3 text-left max-w-[360px] mx-auto">
              <h3 className="text-[13px] font-bold text-txt-strong block mb-2 text-left">Select Chains:</h3>
              {onboardingOptions?.inventoryProviders.map((provider: InventoryProviderOption) => (
                <div key={provider.id} className="px-4 py-3 border border-border bg-card">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onboardingSelectedChains.has(provider.id)}
                      onChange={() => handleChainToggle(provider.id)}
                      className="cursor-pointer"
                    />
                    <span className="font-bold text-sm">{provider.name}</span>
                  </label>
                  {provider.description && (
                    <p className="text-xs text-muted mt-0.5 ml-6">{provider.description}</p>
                  )}
                  {onboardingSelectedChains.has(provider.id) && (
                    <div className="mt-3 ml-6">
                      <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
                        RPC Provider:
                      </label>
                      <select
                        value={onboardingRpcSelections[provider.id] ?? "elizacloud"}
                        onChange={(e) => handleRpcSelectionChange(provider.id, e.target.value)}
                        className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                      >
                        {provider.rpcProviders.map((rpc: RpcProviderOption) => (
                          <option key={rpc.id} value={rpc.id}>
                            {rpc.name}
                          </option>
                        ))}
                      </select>
                      {onboardingRpcSelections[provider.id] && (
                        <div className="mt-3">
                          <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
                            RPC API Key (optional):
                          </label>
                          <input
                            type="password"
                            value={onboardingRpcKeys[`${provider.id}:${onboardingRpcSelections[provider.id]}`] ?? ""}
                            onChange={(e) =>
                              handleRpcKeyChange(
                                provider.id,
                                onboardingRpcSelections[provider.id],
                                e.target.value,
                              )
                            }
                            placeholder="Optional API key"
                            className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case "connectors":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Connect Channels</h2>
              <p className="text-xs text-muted mt-1">Optional — connect your agent to messaging platforms</p>
            </div>
            <div className="flex flex-col gap-3 text-left max-w-[360px] mx-auto">
              {/* Telegram */}
              <div className="px-4 py-3 border border-border bg-card">
                <div className="font-bold text-sm text-txt-strong mb-1">Telegram</div>
                <p className="text-xs text-muted mb-3">
                  Get a bot token from{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline"
                  >
                    @BotFather
                  </a>{" "}
                  on Telegram
                </p>
                <input
                  type="password"
                  value={onboardingTelegramToken}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setState("onboardingTelegramToken", e.target.value)}
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                />
              </div>

              {/* Discord — Coming Soon */}
              <div className="px-4 py-3 border border-border bg-card opacity-50">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-txt-strong">Discord</div>
                  <span className="text-[10px] uppercase tracking-wider text-muted border border-border px-1.5 py-0.5">Coming Soon</span>
                </div>
                <p className="text-xs text-muted mt-1">Plugin not yet available</p>
              </div>

              {/* WhatsApp — Coming Soon */}
              <div className="px-4 py-3 border border-border bg-card opacity-50">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-txt-strong">WhatsApp</div>
                  <span className="text-[10px] uppercase tracking-wider text-muted border border-border px-1.5 py-0.5">Coming Soon</span>
                </div>
                <p className="text-xs text-muted mt-1">Plugin not yet available</p>
              </div>
            </div>
          </div>
        );

      case "channels":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Messaging Channels</h2>
            </div>
            <div className="flex flex-col gap-3 text-left max-w-[360px] mx-auto">
              <div className="px-4 py-3 border border-border bg-card">
                <div className="font-bold text-sm">Telegram</div>
                <div className="text-xs text-muted mt-0.5">Connect via @BotFather bot token (optional).</div>
                <input
                  type="password"
                  value={onboardingChannels.telegram?.botToken ?? ""}
                  onChange={(e) => handleTelegramTokenChange(e.target.value)}
                  placeholder="Bot token from @BotFather"
                  className="w-full px-3 py-2 border border-border bg-card text-sm mt-3 focus:border-accent focus:outline-none"
                />
              </div>
            </div>
            {onboardingRestarting && (
              <p className="text-sm text-accent mt-4">Restarting agent...</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const renderApiKeyModal = () => {
    if (!selectedProvider) return null;
    const isDark = onboardingTheme === "dark";

    return (
      <div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-[fade-in_0.2s_ease-out]"
        onClick={() => setShowApiKeyModal(false)}
      >
        <div
          className="bg-card border border-border rounded-lg p-6 max-w-[450px] w-[90%] shadow-[0_20px_25px_-5px_rgb(0_0_0/0.3),0_8px_10px_-6px_rgb(0_0_0/0.3)] animate-[slideUp_0.2s_ease-out]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4">
            <img
              src={getProviderLogo(selectedProvider.id, isDark)}
              alt={selectedProvider.name}
              className="w-10 h-10 rounded-md object-contain bg-bg-muted p-1.5"
            />
            <div className="text-lg font-semibold text-txt-strong">{selectedProvider.name} API Key</div>
          </div>
          <div className="text-sm text-muted-strong mb-4 leading-relaxed">
            Enter your API key for {selectedProvider.name}. You can get one from their website.
          </div>
          <input
            type="password"
            value={onboardingApiKey}
            onChange={handleApiKeyChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onboardingApiKey.trim()) {
                setShowApiKeyModal(false);
                void handleOnboardingNext();
              }
            }}
            placeholder="Paste your API key here"
            className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
          />
          <div className="flex gap-2.5 justify-end mt-5">
            <button
              className="px-6 py-2 border border-border bg-transparent text-txt text-sm cursor-pointer hover:bg-accent-subtle hover:text-accent rounded-md"
              onClick={() => setShowApiKeyModal(false)}
            >
              Cancel
            </button>
            <button
              className="px-6 py-2 border border-accent bg-accent text-accent-foreground text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-md"
              onClick={() => {
                setShowApiKeyModal(false);
                void handleOnboardingNext();
              }}
              disabled={!onboardingApiKey.trim()}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderProviderConfirmModal = () => {
    if (!selectedProvider) return null;
    const isDark = onboardingTheme === "dark";

    const getProviderMessage = () => {
      if (selectedProvider.id === "elizacloud") {
        return "ElizaCloud provides managed AI inference. No API key required.";
      }
      if (selectedProvider.id === "ollama") {
        return "Ollama runs models locally on your machine. No API key required.";
      }
      return `Would you like to use ${selectedProvider.name} as your AI provider?`;
    };

    return (
      <div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-[fade-in_0.2s_ease-out]"
        onClick={() => setShowProviderConfirmModal(false)}
      >
        <div
          className="bg-card border border-border rounded-lg p-6 max-w-[450px] w-[90%] shadow-[0_20px_25px_-5px_rgb(0_0_0/0.3),0_8px_10px_-6px_rgb(0_0_0/0.3)] animate-[slideUp_0.2s_ease-out]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4">
            <img
              src={getProviderLogo(selectedProvider.id, isDark)}
              alt={selectedProvider.name}
              className="w-10 h-10 rounded-md object-contain bg-bg-muted p-1.5"
            />
            <div className="text-lg font-semibold text-txt-strong">Use {selectedProvider.name}?</div>
          </div>
          <div className="text-sm text-muted-strong mb-4 leading-relaxed">
            {getProviderMessage()}
          </div>
          <div className="flex gap-2.5 justify-end mt-5">
            <button
              className="px-6 py-2 border border-border bg-transparent text-txt text-sm cursor-pointer hover:bg-accent-subtle hover:text-accent rounded-md"
              onClick={() => {
                setShowProviderConfirmModal(false);
                setState("onboardingProvider", "");
              }}
            >
              Cancel
            </button>
            <button
              className="px-6 py-2 border border-accent bg-accent text-accent-foreground text-sm cursor-pointer hover:bg-accent-hover rounded-md"
              onClick={() => {
                setShowProviderConfirmModal(false);
                void handleOnboardingNext();
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  };

  const canGoNext = () => {
    switch (onboardingStep) {
      case "welcome":
        return true;
      case "name":
        return onboardingName.trim().length > 0;
      case "style":
        return onboardingStyle.length > 0;
      case "theme":
        return true;
      case "runMode":
        return onboardingRunMode !== "";
      case "cloudProvider":
        return onboardingCloudProvider.length > 0;
      case "modelSelection":
        return onboardingSmallModel.length > 0 && onboardingLargeModel.length > 0;
      case "cloudLogin":
        return cloudConnected;
      case "llmProvider":
        // Provider selection is handled by modals which auto-progress
        return onboardingProvider.length > 0;
      case "inventorySetup":
        return true;
      case "connectors":
        return true; // fully optional — user can skip
      case "channels":
        return true;
      default:
        return false;
    }
  };

  const canGoBack = onboardingStep !== "welcome";

  return (
    <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
      {renderStep(onboardingStep)}
      <div className="flex gap-2 mt-4 justify-center">
        {canGoBack && (
          <button
            className="px-6 py-2 border border-border bg-transparent text-txt text-sm cursor-pointer hover:bg-accent-subtle hover:text-accent mt-5"
            onClick={handleOnboardingBack}
            disabled={onboardingRestarting}
          >
            Back
          </button>
        )}
        <button
          className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed mt-5"
          onClick={() => void handleOnboardingNext()}
          disabled={!canGoNext() || onboardingRestarting}
        >
          {onboardingRestarting ? "Restarting agent..." : "Next"}
        </button>
      </div>
    </div>
  );
}
