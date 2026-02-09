/**
 * Onboarding wizard component — multi-step onboarding flow.
 */

import { useEffect } from "react";
import { useApp, THEMES, type OnboardingStep } from "../AppContext.js";
import { client, type StylePreset, type ProviderOption, type CloudProviderOption, type ModelOption, type InventoryProviderOption, type RpcProviderOption } from "../api-client";

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
    subscriptionAuthMode,
    subscriptionAuthUrl,
    subscriptionAuthState,
    subscriptionAuthStep,
    subscriptionAuthError,
    subscriptionSetupToken,
    onboardingSelectedChains,
    onboardingRpcSelections,
    onboardingRpcKeys,
    onboardingChannels,
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

  const handleProviderSelect = (providerId: string) => {
    setState("onboardingProvider", providerId);
    setState("subscriptionAuthStep", "idle");
    setState("subscriptionAuthError", null);
    setState("subscriptionSetupToken", "");
    setState("subscriptionAuthUrl", "");
    setState("subscriptionAuthState", "");
    setState("subscriptionAuthMode", "oauth");
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState("onboardingApiKey", e.target.value);
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
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">LLM Provider</h2>
            </div>
            <div className="flex flex-col gap-2 text-left max-w-[360px] mx-auto">
              {onboardingOptions?.providers.map((provider: ProviderOption) => (
                <div
                  key={provider.id}
                  className={`px-4 py-3 border cursor-pointer bg-card transition-colors ${
                    onboardingProvider === provider.id
                      ? "border-accent bg-accent-subtle"
                      : "border-border hover:border-accent"
                  }`}
                  onClick={() => handleProviderSelect(provider.id)}
                >
                  <div className="font-bold text-sm">{provider.name}</div>
                  {provider.description && <div className="text-xs text-muted mt-0.5">{provider.description}</div>}
                </div>
              ))}
            </div>
            {onboardingProvider && onboardingProvider !== "anthropic-subscription" && onboardingProvider !== "openai-subscription" && (
              <div className="max-w-[360px] mx-auto mt-4">
                <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">API Key:</label>
                <input
                  type="password"
                  value={onboardingApiKey}
                  onChange={handleApiKeyChange}
                  placeholder="Enter your API key"
                  className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                />
              </div>
            )}
            {onboardingProvider === "anthropic-subscription" && (
              <div className="max-w-[360px] mx-auto mt-4">
                <div className="flex gap-2 mb-4">
                  <button
                    className={`flex-1 px-3 py-2 border text-sm ${
                      subscriptionAuthMode === "oauth"
                        ? "border-accent bg-accent-subtle"
                        : "border-border hover:border-accent"
                    }`}
                    onClick={() => setState("subscriptionAuthMode", "oauth")}
                  >
                    OAuth Login
                  </button>
                  <button
                    className={`flex-1 px-3 py-2 border text-sm ${
                      subscriptionAuthMode === "token"
                        ? "border-accent bg-accent-subtle"
                        : "border-border hover:border-accent"
                    }`}
                    onClick={() => setState("subscriptionAuthMode", "token")}
                  >
                    Setup Token
                  </button>
                </div>

                {subscriptionAuthMode === "oauth" ? (
                  <div>
                    {subscriptionAuthStep === "idle" && (
                      <button
                        className="w-full px-4 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover"
                        onClick={async () => {
                          try {
                            const { authUrl } = await client.startAnthropicAuth();
                            window.open(authUrl, "_blank");
                            setState("subscriptionAuthStep", "waiting");
                            setState("subscriptionAuthUrl", authUrl);
                            setState("subscriptionAuthError", null);
                          } catch (err) {
                            setState("subscriptionAuthError", String(err));
                          }
                        }}
                      >
                        Login with Claude
                      </button>
                    )}
                    {subscriptionAuthStep === "waiting" && (
                      <div>
                        <p className="text-sm text-muted mb-2">Paste the code from the browser:</p>
                        {subscriptionAuthUrl && (
                          <p className="text-xs text-muted mb-2 break-all">Auth URL: {subscriptionAuthUrl}</p>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Paste code here"
                            className="flex-1 px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                            onChange={async (e) => {
                              const code = e.target.value.trim();
                              if (code.length > 10) {
                                try {
                                  await client.exchangeAnthropicCode(code);
                                  setState("subscriptionAuthStep", "done");
                                  setState("subscriptionAuthError", null);
                                } catch (err) {
                                  setState("subscriptionAuthError", String(err));
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {subscriptionAuthStep === "done" && (
                      <p className="text-sm text-accent">✓ Anthropic subscription connected</p>
                    )}
                    {subscriptionAuthError && (
                      <p className="text-sm text-danger mt-2">{subscriptionAuthError}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted mb-2">
                      Paste your setup token (sk-ant-oat01-...) from Claude Code settings
                    </p>
                    <input
                      type="password"
                      value={subscriptionSetupToken}
                      onChange={(e) => setState("subscriptionSetupToken", e.target.value)}
                      placeholder="sk-ant-oat01-..."
                      className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                    />
                    {subscriptionSetupToken.trim() && (
                      <button
                        className="w-full mt-2 px-4 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover"
                        onClick={async () => {
                          try {
                            await client.saveSetupToken(subscriptionSetupToken);
                            setState("subscriptionAuthStep", "done");
                            setState("subscriptionAuthError", null);
                          } catch (err) {
                            setState("subscriptionAuthError", String(err));
                          }
                        }}
                      >
                        Save Token
                      </button>
                    )}
                    {subscriptionAuthStep === "done" && subscriptionAuthMode === "token" && (
                      <p className="text-sm text-accent mt-2">✓ Setup token saved</p>
                    )}
                    {subscriptionAuthError && (
                      <p className="text-sm text-danger mt-2">{subscriptionAuthError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {onboardingProvider === "openai-subscription" && (
              <div className="max-w-[360px] mx-auto mt-4">
                {subscriptionAuthStep === "idle" && (
                  <button
                    className="w-full px-4 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover"
                    onClick={async () => {
                      try {
                        const { authUrl, state } = await client.startOpenAIAuth();
                        window.open(authUrl, "_blank");
                        setState("subscriptionAuthState", state);
                        setState("subscriptionAuthStep", "waiting");
                        setState("subscriptionAuthError", null);
                      } catch (err) {
                        setState("subscriptionAuthError", String(err));
                      }
                    }}
                  >
                    Login with OpenAI
                  </button>
                )}
                {subscriptionAuthStep === "waiting" && (
                  <div>
                    <p className="text-sm text-muted mb-2">Paste the redirect URL from the browser:</p>
                    <input
                      type="text"
                      placeholder="Paste the full URL or code"
                      className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          const input = (e.target as HTMLInputElement).value.trim();
                          try {
                            await client.exchangeOpenAICode(input, subscriptionAuthState);
                            setState("subscriptionAuthStep", "done");
                            setState("subscriptionAuthError", null);
                          } catch (err) {
                            setState("subscriptionAuthError", String(err));
                          }
                        }
                      }}
                    />
                    <p className="text-xs text-muted mt-1">Press Enter after pasting</p>
                  </div>
                )}
                {subscriptionAuthStep === "done" && (
                  <p className="text-sm text-accent">✓ OpenAI subscription connected</p>
                )}
                {subscriptionAuthError && (
                  <p className="text-sm text-danger mt-2">{subscriptionAuthError}</p>
                )}
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

      case "channels":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Messaging Channels</h2>
              <p className="text-muted text-sm">Connect your agent to messaging platforms (optional)</p>
            </div>
            <div className="flex flex-col gap-3 text-left max-w-[360px] mx-auto">
              <div className="px-4 py-3 border border-border bg-card">
                <div className="font-bold text-sm">Telegram</div>
                <div className="text-xs text-muted mt-0.5">Connect via @BotFather bot token</div>
                <div className="mt-3">
                  <input
                    type="password"
                    value={onboardingChannels.telegram?.botToken || ""}
                    onChange={(e) => {
                      const updated = { ...onboardingChannels };
                      updated.telegram = { ...updated.telegram, botToken: e.target.value };
                      setState("onboardingChannels", updated);
                    }}
                    placeholder="Bot token from @BotFather"
                    className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="px-4 py-3 border border-border bg-card opacity-50">
                <div className="font-bold text-sm flex items-center gap-2">
                  Discord <span className="text-xs bg-border px-2 py-0.5 rounded">Coming Soon</span>
                </div>
                <div className="text-xs text-muted mt-0.5">Discord bot integration (plugin in development)</div>
              </div>

              <div className="px-4 py-3 border border-border bg-card opacity-50">
                <div className="font-bold text-sm flex items-center gap-2">
                  WhatsApp <span className="text-xs bg-border px-2 py-0.5 rounded">Coming Soon</span>
                </div>
                <div className="text-xs text-muted mt-0.5">WhatsApp via Baileys (plugin in development)</div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
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
      case "llmProvider": {
        if (!onboardingProvider) return false;
        if (onboardingProvider === "anthropic-subscription") {
          return subscriptionAuthStep === "done" || subscriptionSetupToken.trim().length > 0;
        }
        if (onboardingProvider === "openai-subscription") {
          return subscriptionAuthStep === "done";
        }
        return onboardingApiKey.length > 0;
      }
      case "inventorySetup":
        return true;
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
          >
            Back
          </button>
        )}
        <button
          className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed mt-5"
          onClick={() => void handleOnboardingNext()}
          disabled={!canGoNext()}
        >
          Next
        </button>
      </div>
    </div>
  );
}
