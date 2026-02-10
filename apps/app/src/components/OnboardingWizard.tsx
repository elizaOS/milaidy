/**
 * Onboarding wizard component — multi-step onboarding flow.
 */

import { useEffect, useState, type ChangeEvent } from "react";
import { useApp, THEMES, type OnboardingStep } from "../AppContext.js";
import type { StylePreset, ProviderOption, CloudProviderOption, ModelOption, InventoryProviderOption, RpcProviderOption, OpenRouterModelOption } from "../api-client";
import { getProviderLogo } from "../provider-logos.js";
import { AvatarSelector } from "./AvatarSelector.js";

/* ── Inline SVG Icons ─────────────────────────────────────────────── */

function DiceIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.5" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BlendIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v10m0 0l-4-4m4 4l4-4" />
      <path d="M5 16c0 2.2 3.1 4 7 4s7-1.8 7-4" />
      <path d="M5 12c0 2.2 3.1 4 7 4s7-1.8 7-4" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

const fallbackArchetypes = [
  { id: "the-oracle", name: "The Oracle", tagline: "sees what others can't. cryptic, poetic, pattern-pilled." },
  { id: "the-operator", name: "The Operator", tagline: "gets it done. dry wit, zero fluff, hyper-competent." },
  { id: "the-degen", name: "The Degen", tagline: "chaos agent. risk-loving, terminally online, unhinged." },
  { id: "the-companion", name: "The Companion", tagline: "actually present. warm, real, genuinely gives a shit." },
  { id: "custom", name: "Custom", tagline: "start blank. define everything yourself." },
];

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
    onboardingSubscriptionTab,
    onboardingSelectedChains,
    onboardingRpcSelections,
    onboardingRpcKeys,
    onboardingAvatar,
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

  const [archetypes, setArchetypes] = useState<Array<{ id: string; name: string; tagline: string }>>([]);
  const [openaiOAuthStarted, setOpenaiOAuthStarted] = useState(false);
  const [openaiCallbackUrl, setOpenaiCallbackUrl] = useState("");
  const [openaiConnected, setOpenaiConnected] = useState(false);
  const [openaiError, setOpenaiError] = useState("");

  // Soul multi-select + blend
  const [selectedSouls, setSelectedSouls] = useState<string[]>([]);
  const [blending, setBlending] = useState(false);
  const [blendError, setBlendError] = useState("");

  const toggleSoul = (id: string) => {
    setBlendError("");
    setSelectedSouls((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      // Single select: apply directly
      if (next.length === 1) {
        handleStyleSelect(next[0]);
      } else if (next.length === 0) {
        handleStyleSelect("");
      }
      return next;
    });
  };

  // Deterministic blend for onboarding (no LLM needed — AI blend available in character page post-setup)
  const blendArchetypesLocal = async (ids: string[]) => {
    const fetched = await Promise.all(
      ids.map((id) => fetch(`/api/archetypes/${id}`).then((r) => r.json()).catch(() => null))
    );
    const chars = fetched.filter(Boolean).map((d: any) => d.character).filter(Boolean);
    if (chars.length < 2) return null;

    // Merge: combine bios, pick first system as base + blend note, union style rules
    const allBio = chars.flatMap((c: any) => c.bio ?? []);
    const names = ids.map((id) => {
      const a = (archetypes.length > 0 ? archetypes : fallbackArchetypes).find((a) => a.id === id);
      return a?.name ?? id;
    });

    const systemParts = chars.map((c: any) => c.system ?? "").filter(Boolean);
    const blendedSystem = `${systemParts[0]}\n\nyou also draw from other sides of yourself:\n${systemParts.slice(1).map((s: string) => s.split("\n").slice(0, 3).join("\n")).join("\n\n")}`;

    return {
      bio: allBio.slice(0, 6),
      system: blendedSystem,
      style: {
        all: [...new Set(chars.flatMap((c: any) => c.style?.all ?? []))].slice(0, 10),
        chat: [...new Set(chars.flatMap((c: any) => c.style?.chat ?? []))].slice(0, 8),
        post: [...new Set(chars.flatMap((c: any) => c.style?.post ?? []))].slice(0, 6),
      },
      adjectives: [...new Set(chars.flatMap((c: any) => c.adjectives ?? []))].slice(0, 8),
      topics: [...new Set(chars.flatMap((c: any) => c.topics ?? []))].slice(0, 8),
      messageExamples: chars.flatMap((c: any) => c.messageExamples ?? []).slice(0, 4),
      _blendedFrom: names,
    };
  };

  const handleBlendSouls = async () => {
    if (selectedSouls.length < 2) return;
    setBlending(true);
    setBlendError("");
    try {
      const blended = await blendArchetypesLocal(selectedSouls);
      if (blended) {
        (window as any).__blendedCharacter = blended;
        handleStyleSelect("__blended");
      } else {
        setBlendError("could not load archetype data.");
      }
    } catch {
      setBlendError("blend failed. try again.");
    }
    setBlending(false);
  };

  const handleRandomSoul = async () => {
    setBlending(true);
    setBlendError("");
    const nonCustom = (archetypes.length > 0 ? archetypes : fallbackArchetypes).filter((a) => a.id !== "custom");
    const shuffled = [...nonCustom].sort(() => Math.random() - 0.5);
    const count = Math.random() > 0.5 ? 3 : 2;
    const picked = shuffled.slice(0, count);
    setSelectedSouls(picked.map((a) => a.id));
    try {
      const blended = await blendArchetypesLocal(picked.map((a) => a.id));
      if (blended) {
        (window as any).__blendedCharacter = blended;
        handleStyleSelect("__blended");
      } else {
        setBlendError("could not load archetype data.");
      }
    } catch {
      setBlendError("random blend failed. try again.");
    }
    setBlending(false);
  };

  // Fetch archetypes on mount
  useEffect(() => {
    fetch("/api/archetypes")
      .then((r) => r.json())
      .then((data) => {
        if (data.archetypes) setArchetypes(data.archetypes);
      })
      .catch(() => {});
  }, []);

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

  /* Telegram token is handled by onboardingTelegramToken state */

  const renderStep = (step: OnboardingStep) => {
    switch (step) {
      case "welcome":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <img
              src="/android-chrome-512x512.png"
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
                      ? "border-accent !bg-accent !text-accent-fg"
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
                    ? "border-accent !bg-accent !text-accent-fg"
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

      case "avatar":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[360px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Choose Your Avatar</h2>
              <p className="text-xs text-muted mt-1">Pick a milady or upload your own .vrm</p>
            </div>
            <div className="max-w-[400px] mx-auto">
              <AvatarSelector
                selected={onboardingAvatar}
                onSelect={(i) => setState("onboardingAvatar", i)}
                onUpload={(file) => {
                  const url = URL.createObjectURL(file);
                  setState("customVrmUrl", url);
                  setState("onboardingAvatar", 0);
                }}
                showUpload
              />
            </div>
          </div>
        );

      case "style":
        return (
          <div className="max-w-[600px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[400px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Choose a Soul</h2>
              <p className="text-xs text-muted">pick one or combine multiple. your agent blends the traits.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 text-left max-w-[440px] mx-auto">
              {(archetypes.length > 0 ? archetypes : fallbackArchetypes).filter((a) => a.id !== "custom").map((arch) => {
                const isSelected = selectedSouls.includes(arch.id);
                return (
                  <div
                    key={arch.id}
                    className={`group px-4 py-3 border cursor-pointer bg-card transition-all ${
                      isSelected
                        ? "border-accent !bg-accent !text-accent-fg"
                        : "border-border hover:border-accent/60"
                    }`}
                    onClick={() => toggleSoul(arch.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm tracking-wide uppercase">
                        {arch.name}
                      </div>
                      {isSelected && <CheckIcon className={isSelected ? "text-accent-fg" : ""} />}
                    </div>
                    <div className={`text-xs mt-1 leading-relaxed ${isSelected ? "text-accent-fg/70" : "text-muted"}`}>
                      {arch.tagline}
                    </div>
                  </div>
                );
              })}

              {/* Blend / Random buttons */}
              <div className="flex gap-2 mt-1">
                {selectedSouls.length >= 2 && (
                  <button
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-accent bg-card text-accent cursor-pointer hover:bg-accent hover:text-accent-fg transition-all font-bold text-sm tracking-wide uppercase disabled:opacity-40"
                    onClick={() => void handleBlendSouls()}
                    disabled={blending}
                    type="button"
                  >
                    <BlendIcon />
                    {blending ? "blending..." : "blend souls"}
                  </button>
                )}
                <button
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-border bg-card text-muted cursor-pointer hover:border-accent hover:text-accent transition-all font-bold text-sm tracking-wide uppercase disabled:opacity-40"
                  onClick={() => void handleRandomSoul()}
                  disabled={blending}
                  type="button"
                >
                  <DiceIcon />
                  {blending ? "generating..." : "random"}
                </button>
              </div>

              {blendError && (
                <div className="text-xs text-[var(--danger,#e74c3c)] text-center mt-1">{blendError}</div>
              )}
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
                      ? "border-accent !bg-accent !text-accent-fg"
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
                    ? "border-accent !bg-accent !text-accent-fg"
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
                    ? "border-accent !bg-accent !text-accent-fg"
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
                      ? "border-accent !bg-accent !text-accent-fg"
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

      case "llmProvider": {
        const isDark = onboardingTheme === "dark";
        const providers = onboardingOptions?.providers ?? [];
        const cloudProviders = providers.filter((p: ProviderOption) => p.id === "elizacloud");
        const subscriptionProviders = providers.filter((p: ProviderOption) =>
          p.id === "anthropic-subscription" || p.id === "openai-subscription",
        );
        const apiProviders = providers.filter(
          (p: ProviderOption) => !subscriptionProviders.some((s) => s.id === p.id) && p.id !== "elizacloud",
        );


        const providerOverrides: Record<string, { name: string; description?: string }> = {
          elizacloud: { name: "Eliza Cloud" },
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
        };

        const getProviderDisplay = (provider: ProviderOption) => {
          const override = providerOverrides[provider.id];
          return {
            name: override?.name ?? provider.name,
            description: override?.description ?? provider.description,
          };
        };

        const handleProviderSelect = (providerId: string) => {
          setState("onboardingProvider", providerId);
          setState("onboardingApiKey", "");
          if (providerId === "anthropic-subscription") {
            setState("onboardingSubscriptionTab", "token");
          }
        };

        const renderProviderCard = (provider: ProviderOption, size: "lg" | "sm" = "sm") => {
          const display = getProviderDisplay(provider);
          const isSelected = onboardingProvider === provider.id;
          const padding = size === "lg" ? "px-5 py-4" : "px-4 py-3";
          return (
            <button
              key={provider.id}
              className={`${padding} border-[1.5px] cursor-pointer transition-all text-left flex items-center gap-3 rounded-lg ${
                isSelected
                  ? "border-accent !bg-accent !text-accent-fg shadow-[0_0_0_3px_var(--accent),var(--shadow-md)]"
                  : "border-border bg-card hover:border-border-hover hover:bg-bg-hover hover:shadow-md hover:-translate-y-0.5"
              }`}
              onClick={() => handleProviderSelect(provider.id)}
            >
              <img
                src={getProviderLogo(provider.id, isDark)}
                alt={display.name}
                className="w-9 h-9 rounded-md object-contain bg-bg-muted p-1.5 shrink-0"
              />
              <div>
                <div className="font-semibold text-sm">{display.name}</div>
                {display.description && (
                  <div className={`text-xs mt-0.5 ${isSelected ? "opacity-80" : "text-muted"}`}>
                    {display.description}
                  </div>
                )}
              </div>
            </button>
          );
        };

        return (
          <div className="max-w-[760px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-4 max-w-[420px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">LLM Provider</h2>
            </div>

            <div className="border border-border bg-card text-xs text-muted p-3 rounded text-left max-w-[760px] mx-auto mb-4">
              Most providers need an API key or subscription. Free options like Eliza Cloud have limited credits.
              Subscriptions (Claude/ChatGPT) are the easiest way to get started if you already pay for one.
            </div>

            <div className="max-w-[760px] mx-auto">
              {cloudProviders.length > 0 && (
                <div className="mb-3 text-left">
                  <div className="text-[11px] uppercase tracking-wide text-muted mb-2">Cloud</div>
                  <div className="grid grid-cols-1 gap-2">
                    {cloudProviders.map((p: ProviderOption) => renderProviderCard(p, "lg"))}
                  </div>
                </div>
              )}

              {subscriptionProviders.length > 0 && (
                <div className="mb-4 text-left">
                  <div className="text-[11px] uppercase tracking-wide text-muted mb-2">Subscriptions</div>
                  <div className="grid grid-cols-1 gap-2">
                    {subscriptionProviders.map((p: ProviderOption) => renderProviderCard(p, "lg"))}
                  </div>
                </div>
              )}

              {apiProviders.length > 0 && (
                <div className="text-left">
                  <div className="text-[11px] uppercase tracking-wide text-muted mb-2">API Keys</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {apiProviders.map((p: ProviderOption) => renderProviderCard(p))}
                  </div>
                </div>
              )}
            </div>

            {/* Claude Subscription — setup token / OAuth */}
            {onboardingProvider === "anthropic-subscription" && (
              <div className="max-w-[520px] mx-auto mt-4 text-left">
                <div className="flex items-center gap-4 border-b border-border mb-3">
                  <button
                    className={`text-sm pb-2 border-b-2 ${
                      onboardingSubscriptionTab === "token"
                        ? "border-accent text-accent"
                        : "border-transparent text-muted hover:text-txt"
                    }`}
                    onClick={() => setState("onboardingSubscriptionTab", "token")}
                  >
                    Setup Token
                  </button>
                  <button
                    className={`text-sm pb-2 border-b-2 ${
                      onboardingSubscriptionTab === "oauth"
                        ? "border-accent text-accent"
                        : "border-transparent text-muted hover:text-txt"
                    }`}
                    onClick={() => setState("onboardingSubscriptionTab", "oauth")}
                  >
                    OAuth Login
                  </button>
                </div>

                {onboardingSubscriptionTab === "token" ? (
                  <>
                    <label className="text-[13px] font-bold text-txt-strong block mb-2">Setup Token:</label>
                    <input
                      type="password"
                      value={onboardingApiKey}
                      onChange={handleApiKeyChange}
                      placeholder="sk-ant-oat01-..."
                      className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                    />
                    <p className="text-xs text-muted mt-2 whitespace-pre-line">
                      {"Paste your Claude Code setup token.\nGet it from: claude.ai/settings/api → \"Claude Code\" → \"Use setup token\""}
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover"
                      onClick={() => {
                        window.open("/api/subscription/anthropic/start", "anthropic-oauth", "width=600,height=700");
                      }}
                    >
                      Login with Anthropic
                    </button>
                    <p className="text-xs text-muted mt-2">
                      Opens Anthropic login to connect your Claude subscription.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ChatGPT Subscription — OAuth */}
            {onboardingProvider === "openai-subscription" && (
              <div className="max-w-[520px] mx-auto mt-4 space-y-4">
                {openaiConnected ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2 px-6 py-3 border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium w-full max-w-xs justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Connected to ChatGPT
                    </div>
                    <p className="text-xs text-muted text-center">
                      Your ChatGPT subscription is linked. Click Next to continue.
                    </p>
                  </div>
                ) : !openaiOAuthStarted ? (
                  <div className="flex flex-col items-center gap-3">
                    <button
                      className="w-full max-w-xs px-6 py-3 border border-accent bg-accent text-accent-fg text-sm font-medium cursor-pointer hover:bg-accent-hover transition-colors"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/subscription/openai/start", { method: "POST" });
                          const data = await res.json();
                          if (data.authUrl) {
                            window.open(data.authUrl, "openai-oauth", "width=500,height=700,top=50,left=200");
                            setOpenaiOAuthStarted(true);
                          } else {
                            console.error("No authUrl in response", data);
                          }
                        } catch (err) {
                          console.error("Failed to start OpenAI OAuth:", err);
                        }
                      }}
                    >
                      Login with OpenAI
                    </button>
                    <p className="text-xs text-muted text-center">
                      Requires ChatGPT Plus ($20/mo) or Pro ($200/mo).
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="p-3 border border-border bg-card text-sm text-fg rounded">
                      <p className="font-medium mb-1">Almost there!</p>
                      <p className="text-muted text-xs leading-relaxed">
                        After logging in, you'll be redirected to a page that won't load
                        (starts with <code className="text-fg bg-input px-1 py-0.5 text-xs">localhost:1455</code>).
                        Copy the <strong>entire URL</strong> from your browser's address bar and paste it below.
                      </p>
                    </div>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 border border-border bg-input text-fg text-sm placeholder:text-muted"
                      placeholder="http://localhost:1455/auth/callback?code=..."
                      value={openaiCallbackUrl}
                      onChange={(e) => { setOpenaiCallbackUrl(e.target.value); setOpenaiError(""); }}
                      autoFocus
                    />
                    {openaiError && (
                      <p className="text-xs text-red-400">{openaiError}</p>
                    )}
                    <div className="flex gap-2 justify-center">
                      <button
                        className="px-6 py-2.5 border border-accent bg-accent text-accent-fg text-sm font-medium cursor-pointer hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={!openaiCallbackUrl}
                        onClick={async () => {
                          setOpenaiError("");
                          try {
                            const res = await fetch("/api/subscription/openai/exchange", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ code: openaiCallbackUrl }),
                            });
                            const data = await res.json();
                            if (data.success) {
                              setOpenaiOAuthStarted(false);
                              setOpenaiCallbackUrl("");
                              setOpenaiConnected(true);
                              setState("onboardingProvider", "openai-subscription");
                            } else {
                              const msg = data.error || "Exchange failed";
                              if (msg.includes("No active flow")) {
                                setOpenaiError("Login session expired. Click 'Start Over' and try again.");
                              } else {
                                setOpenaiError(msg);
                              }
                            }
                          } catch (err) {
                            setOpenaiError("Network error — check your connection and try again.");
                          }
                        }}
                      >
                        Complete Login
                      </button>
                      <button
                        className="px-4 py-2.5 border border-border text-muted text-sm cursor-pointer hover:text-fg transition-colors"
                        onClick={() => { setOpenaiOAuthStarted(false); setOpenaiCallbackUrl(""); }}
                      >
                        Start Over
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Regular API key input */}
            {onboardingProvider &&
              onboardingProvider !== "anthropic-subscription" &&
              onboardingProvider !== "openai-subscription" &&
              onboardingProvider !== "elizacloud" &&
              onboardingProvider !== "ollama" && (
                <div className="max-w-[520px] mx-auto mt-4 text-left">
                  <label className="text-[13px] font-bold text-txt-strong block mb-2">API Key:</label>
                  <input
                    type="password"
                    value={onboardingApiKey}
                    onChange={handleApiKeyChange}
                    placeholder="Enter your API key"
                    className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                  />
                </div>
              )}

            {/* OpenRouter model selection */}
            {onboardingProvider === "openrouter" && onboardingApiKey.trim() && onboardingOptions?.openrouterModels && (
              <div className="max-w-[520px] mx-auto mt-4 text-left">
                <label className="text-[13px] font-bold text-txt-strong block mb-2">Select Model:</label>
                <div className="flex flex-col gap-2">
                  {onboardingOptions.openrouterModels.map((model: OpenRouterModelOption) => (
                    <div
                      key={model.id}
                      className={`px-4 py-3 border cursor-pointer transition-colors text-left rounded-lg ${
                        onboardingOpenRouterModel === model.id
                          ? "border-accent !bg-accent !text-accent-fg"
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
      }

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
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Connectors</h2>
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

      /* "channels" step removed — consolidated into "connectors" above */

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
      case "avatar":
        return true; // always valid — defaults to 1
      case "style":
        return onboardingStyle.length > 0 || selectedSouls.length > 0;
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
        if (onboardingProvider === "anthropic-subscription") {
          return onboardingSubscriptionTab === "token" ? onboardingApiKey.length > 0 : true;
        }
        if (onboardingProvider === "openai-subscription") {
          return openaiConnected;
        }
        if (onboardingProvider === "elizacloud" || onboardingProvider === "ollama") {
          return true;
        }
        return onboardingProvider.length > 0 && onboardingApiKey.length > 0;
      case "inventorySetup":
        return true;
      case "connectors":
        return true; // fully optional — user can skip
      default:
        return false;
    }
  };

  const canGoBack = onboardingStep !== "welcome";

  return (
    <div className="max-w-[500px] mx-auto flex flex-col h-[100dvh] text-center font-body">
      <div className="flex-1 overflow-y-auto pt-10 pb-4 px-1">
        {renderStep(onboardingStep)}
      </div>
      <div className="flex gap-2 py-4 justify-center shrink-0 border-t border-border/30">
        {canGoBack && (
          <button
            className="px-6 py-2 border border-border bg-transparent text-txt text-sm cursor-pointer hover:bg-accent-subtle hover:text-accent"
            onClick={handleOnboardingBack}
            disabled={onboardingRestarting}
          >
            Back
          </button>
        )}
        <button
          className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => void handleOnboardingNext()}
          disabled={!canGoNext() || onboardingRestarting}
        >
          {onboardingRestarting ? "Restarting agent..." : "Next"}
        </button>
      </div>
    </div>
  );
}
