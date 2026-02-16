/**
 * Onboarding wizard component — multi-step onboarding flow.
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useApp, THEMES, type OnboardingStep } from "../AppContext";
import {
  client,
  type ProviderOption,
  type CloudProviderOption,
  type ModelOption,
  type InventoryProviderOption,
  type RpcProviderOption,
  type OpenRouterModelOption,
  type StylePreset,
  type SandboxPlatformStatus,
} from "../api-client";
import { getProviderLogo } from "../provider-logos";
import { AvatarSelector } from "./AvatarSelector";
import { PermissionsOnboardingSection } from "./PermissionsSection";

const SANDBOX_POLL_INTERVAL_MS = 3000;
const SANDBOX_START_MAX_ATTEMPTS = 20;

const inferPlatform = (): string => {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  if (navigator.platform.toLowerCase().includes("mac")) return "darwin";
  if (navigator.platform.toLowerCase().includes("win")) return "win32";
  if (navigator.platform.toLowerCase().includes("linux")) return "linux";
  return "unknown";
};

function formatRequestError(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}

function mapSandboxPlatform(status: SandboxPlatformStatus): {
  installed: boolean;
  running: boolean;
  platform: string;
  appleContainerAvailable: boolean;
  engineRecommendation: string;
} {
  return {
    installed: Boolean(status.dockerInstalled ?? status.dockerAvailable),
    running: Boolean(status.dockerRunning),
    platform: status.platform ?? inferPlatform(),
    appleContainerAvailable: Boolean(status.appleContainerAvailable),
    engineRecommendation: status.recommended ?? "docker",
  };
}

// Platform detection for mobile — on iOS/Android only cloud mode is available
let isMobilePlatform = false;
try {
  const { Capacitor } = await import("@capacitor/core");
  const plat = Capacitor.getPlatform();
  isMobilePlatform = plat === "ios" || plat === "android";
} catch {
  // Not in a Capacitor environment — check user agent as fallback
  if (typeof navigator !== "undefined") {
    isMobilePlatform = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }
}

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
    onboardingDiscordToken,
    onboardingTwilioAccountSid,
    onboardingTwilioAuthToken,
    onboardingTwilioPhoneNumber,
    onboardingBlooioApiKey,
    onboardingBlooioPhoneNumber,
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

  const [openaiOAuthStarted, setOpenaiOAuthStarted] = useState(false);
  const [openaiCallbackUrl, setOpenaiCallbackUrl] = useState("");
  const [openaiConnected, setOpenaiConnected] = useState(false);
  const [openaiError, setOpenaiError] = useState("");
  const [anthropicOAuthStarted, setAnthropicOAuthStarted] = useState(false);
  const [anthropicCode, setAnthropicCode] = useState("");
  const [anthropicConnected, setAnthropicConnected] = useState(false);
  const [anthropicError, setAnthropicError] = useState("");
  const [customNameText, setCustomNameText] = useState("");
  const [isCustomSelected, setIsCustomSelected] = useState(false);

  // ── Agent import during onboarding ──────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const importBusyRef = useRef(false);

  const handleImportAgent = useCallback(async () => {
    if (importBusyRef.current || importBusy) return;
    if (!importFile) {
      setImportError("Select an export file before importing.");
      return;
    }
    if (!importPassword || importPassword.length < 4) {
      setImportError("Password must be at least 4 characters.");
      return;
    }
    try {
      importBusyRef.current = true;
      setImportBusy(true);
      setImportError(null);
      setImportSuccess(null);
      const fileBuffer = await importFile.arrayBuffer();
      const result = await client.importAgent(importPassword, fileBuffer);
      const counts = result.counts;
      const summary = [
        counts.memories ? `${counts.memories} memories` : null,
        counts.entities ? `${counts.entities} entities` : null,
        counts.rooms ? `${counts.rooms} rooms` : null,
      ]
        .filter(Boolean)
        .join(", ");
      setImportSuccess(
        `Imported "${result.agentName}" successfully${summary ? `: ${summary}` : ""}. Restarting...`,
      );
      setImportPassword("");
      setImportFile(null);
      // Reload after short delay to let user see success message
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      importBusyRef.current = false;
      setImportBusy(false);
    }
  }, [importBusy, importFile, importPassword]);

  useEffect(() => {
    if (onboardingStep === "theme") {
      setTheme(onboardingTheme);
    }
  }, [onboardingStep, onboardingTheme, setTheme]);

  const handleStyleSelect = (catchphrase: string) => {
    setState("onboardingStyle", catchphrase);
  };

  const handleThemeSelect = (themeId: string) => {
    setState("onboardingTheme", themeId as typeof onboardingTheme);
    setTheme(themeId as typeof onboardingTheme);
  };

  const handleRunModeSelect = (mode: "local-rawdog" | "local-sandbox" | "cloud") => {
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

  const handleAnthropicStart = async () => {
    setAnthropicError("");
    try {
      const { authUrl } = await client.startAnthropicLogin();
      if (authUrl) {
        window.open(authUrl, "anthropic-oauth", "width=600,height=700,top=50,left=200");
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
        window.open(authUrl, "openai-oauth", "width=500,height=700,top=50,left=200");
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
      setOpenaiError(msg.includes("No active flow") ? "Login session expired. Click 'Start Over' and try again." : msg);
    } catch (err) {
      setOpenaiError("Network error — check your connection and try again.");
    }
  };

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
            <h1 className="text-[28px] font-normal mb-1 text-txt-strong">ohhh uhhhh hey there!</h1>
            <h1 className="text-[28px] font-normal mb-1 text-txt-strong">welcome to milady!</h1>

            {!showImport ? (
              <button
                className="mt-6 text-[13px] text-muted hover:text-txt underline cursor-pointer bg-transparent border-none"
                onClick={() => setShowImport(true)}
              >
                restore from backup
              </button>
            ) : (
              <div className="mt-6 mx-auto max-w-[400px] border border-border bg-card rounded-xl p-4 text-left">
                <div className="flex justify-between items-center mb-3">
                  <div className="font-bold text-sm text-txt-strong">Import Agent</div>
                  <button
                    className="text-[11px] text-muted hover:text-txt cursor-pointer bg-transparent border-none"
                    onClick={() => {
                      setShowImport(false);
                      setImportError(null);
                      setImportSuccess(null);
                      setImportFile(null);
                      setImportPassword("");
                    }}
                  >
                    cancel
                  </button>
                </div>
                <div className="text-xs text-muted mb-3">
                  Select an <code className="text-[11px]">.eliza-agent</code> export file and enter
                  the password used during export.
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".eliza-agent"
                    onChange={(e) => {
                      setImportFile(e.target.files?.[0] ?? null);
                      setImportError(null);
                    }}
                    className="text-xs"
                  />
                  <input
                    type="password"
                    placeholder="Decryption password"
                    value={importPassword}
                    onChange={(e) => {
                      setImportPassword(e.target.value);
                      setImportError(null);
                    }}
                    className="px-2.5 py-1.5 border border-border bg-bg text-xs font-mono focus:border-accent focus:outline-none rounded"
                  />
                  {importError && (
                    <div className="text-[11px] text-[var(--danger,#e74c3c)]">{importError}</div>
                  )}
                  {importSuccess && (
                    <div className="text-[11px] text-[var(--ok,#16a34a)]">{importSuccess}</div>
                  )}
                  <button
                    className="btn text-xs py-1.5 px-4 mt-1"
                    disabled={importBusy || !importFile}
                    onClick={() => void handleImportAgent()}
                  >
                    {importBusy ? "Importing..." : "Import & Restore"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case "name":
        return (
          <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
            <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">ohhh... what's my name again?</h2>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mx-auto mb-3">
              {onboardingOptions?.names.slice(0, 5).map((name: string) => (
                <button
                  key={name}
                  className={`px-5 py-2 border cursor-pointer bg-card transition-colors rounded-full text-sm font-bold ${
                    onboardingName === name && !isCustomSelected
                      ? "border-accent !bg-accent !text-accent-fg"
                      : "border-border hover:border-accent"
                  }`}
                  onClick={() => {
                    setState("onboardingName", name);
                    setIsCustomSelected(false);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="max-w-[260px] mx-auto">
              <div
                className={`px-4 py-2.5 border cursor-text bg-card transition-colors rounded-full ${
                  isCustomSelected
                    ? "border-accent ring-2 ring-accent/30"
                    : "border-border hover:border-accent"
                }`}
                onClick={() => {
                  setIsCustomSelected(true);
                  setState("onboardingName", customNameText);
                }}
              >
                <input
                  type="text"
                  value={customNameText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setCustomNameText(e.target.value);
                    setState("onboardingName", e.target.value);
                    setIsCustomSelected(true);
                  }}
                  onFocus={() => {
                    setIsCustomSelected(true);
                    setState("onboardingName", customNameText);
                  }}
                  className="border-none bg-transparent text-sm font-bold w-full p-0 outline-none text-txt text-center placeholder:text-muted"
                  placeholder="enter custom name..."
                />
              </div>
            </div>
          </div>
        );

      case "avatar":
        return (
          <div className="mx-auto mt-10 text-center font-body">
                                    <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">what body should i, uhhh, use?</h2>
            </div>
            <div className="mx-auto">
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
          <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
            <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">whats my vibe?</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mx-auto max-w-[480px]">
              {onboardingOptions?.styles.map((preset: StylePreset) => (
                <button
                  key={preset.catchphrase}
                  className={`px-3 py-3 border cursor-pointer bg-card transition-colors text-center rounded-lg ${
                    onboardingStyle === preset.catchphrase
                      ? "border-accent !bg-accent !text-accent-fg"
                      : "border-border hover:border-accent"
                  }`}
                  onClick={() => handleStyleSelect(preset.catchphrase)}
                >
                  <div className="font-bold text-sm">{preset.catchphrase}</div>
                  <div className={`text-[11px] mt-0.5 ${
                    onboardingStyle === preset.catchphrase ? "text-accent-fg/70" : "text-muted"
                  }`}>{preset.hint}</div>
                </button>
              ))}
            </div>
          </div>
        );

      case "theme":
        return (
          <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
            <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">what colors do u like?</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-[600px] mx-auto">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  className={`px-2 py-3.5 border cursor-pointer bg-card transition-colors text-center rounded-lg ${
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
        // On mobile (iOS/Android), only cloud is available
        if (isMobilePlatform) {
          // Auto-select cloud and show a simple confirmation
          if (onboardingRunMode !== "cloud") {
            handleRunModeSelect("cloud");
          }
          return (
            <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
              <img
                src="/android-chrome-512x512.png"
                alt="Avatar"
                className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
              />
              <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
                <h2 className="text-[28px] font-normal mb-1 text-txt-strong">i'll live in the cloud~</h2>
                <p className="text-[13px] text-txt mt-1 opacity-70">
                  since ur on mobile i'll run on eliza cloud. i can still do everything — browse the web, manage ur stuff, and more
                </p>
              </div>
              <div className="flex flex-col gap-3 max-w-[460px] mx-auto">
                <div className="px-4 py-4 border border-accent bg-accent text-accent-fg rounded-lg text-left">
                  <div className="font-bold text-sm">☁️ cloud</div>
                  <div className="text-[12px] mt-1 opacity-80">
                    always on, works from any device, easiest setup
                  </div>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="max-w-[580px] mx-auto mt-10 text-center font-body">
            <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">where should i live?</h2>
              <p className="text-[13px] text-txt mt-1 opacity-70">pick how u want me to run bb</p>
            </div>
            <div className="flex flex-col gap-3 max-w-[460px] mx-auto">
              <button
                className={`px-4 py-4 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
                  onboardingRunMode === "cloud"
                    ? "border-accent !bg-accent !text-accent-fg"
                    : "border-border hover:border-accent"
                }`}
                onClick={() => handleRunModeSelect("cloud")}
              >
                <div className="font-bold text-sm">☁️ cloud</div>
                <div className="text-[12px] mt-1 opacity-70">
                  i run on eliza cloud. easiest setup, always on, can still use ur browser &amp; computer if u let me
                </div>
              </button>
              <button
                className={`px-4 py-4 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
                  onboardingRunMode === "local-sandbox"
                    ? "border-accent !bg-accent !text-accent-fg"
                    : "border-border hover:border-accent"
                }`}
                onClick={() => handleRunModeSelect("local-sandbox")}
              >
                <div className="font-bold text-sm">🔒 local (sandbox)</div>
                <div className="text-[12px] mt-1 opacity-70">
                  i run on ur machine in a secure container. ur api keys stay hidden even from me. needs docker
                </div>
              </button>
              <button
                className={`px-4 py-4 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
                  onboardingRunMode === "local-rawdog"
                    ? "border-accent !bg-accent !text-accent-fg"
                    : "border-border hover:border-accent"
                }`}
                onClick={() => handleRunModeSelect("local-rawdog")}
              >
                <div className="font-bold text-sm">⚡ local (raw)</div>
                <div className="text-[12px] mt-1 opacity-70">
                  i run directly on ur machine w full access. fastest &amp; simplest but no sandbox protection
                </div>
              </button>
            </div>
          </div>
        );

      case "dockerSetup":
        return <DockerSetupStep />;

      case "cloudProvider":
        return (
          <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
            <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">okay which cloud?</h2>
            </div>
            <div className="flex flex-col gap-2 text-left max-w-[600px] mx-auto">
              {onboardingOptions?.cloudProviders.map((provider: CloudProviderOption) => (
                <div
                  key={provider.id}
                  className={`px-4 py-3 border cursor-pointer bg-card transition-colors rounded-lg ${
                    onboardingCloudProvider === provider.id
                      ? "border-accent !bg-accent !text-accent-fg"
                      : "border-border hover:border-accent"
                  }`}
                  onClick={() => handleCloudProviderSelect(provider.id)}
                >
                  <div className="font-bold text-sm">{provider.name}</div>
                  {provider.description && (
                    <div className={`text-xs mt-0.5 ${
                      onboardingCloudProvider === provider.id ? "text-accent-fg/70" : "text-muted"
                    }`}>{provider.description}</div>
                  )}
                </div>
              ))}
            </div>
            {onboardingCloudProvider === "elizacloud" && (
              <div className="max-w-[600px] mx-auto mt-4">
                {cloudConnected ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 border border-green-500/30 bg-green-500/10 text-green-400 text-sm rounded-lg justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    connected~
                  </div>
                ) : (
                  <button
                    className="px-6 py-2.5 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={handleCloudLogin}
                    disabled={cloudLoginBusy}
                  >
                    {cloudLoginBusy ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></span>
                        connecting...
                      </span>
                    ) : (
                      "connect account"
                    )}
                  </button>
                )}
                {cloudLoginError && <p className="text-danger text-[13px] mt-2">{cloudLoginError}</p>}
              </div>
            )}
          </div>
        );

      case "modelSelection":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Model Selection</h2>
            </div>
            <div className="flex flex-col gap-4 text-left max-w-[600px] mx-auto">
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
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Cloud Login</h2>
            </div>
            {cloudConnected ? (
              <div className="max-w-[600px] mx-auto">
                <p className="text-txt mb-2">Logged in successfully!</p>
                {cloudUserId && <p className="text-muted text-sm">User ID: {cloudUserId}</p>}
              </div>
            ) : (
              <div className="max-w-[600px] mx-auto">
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
        const isDark = onboardingTheme !== "milady" && onboardingTheme !== "qt314";
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
          setState("onboardingPrimaryModel", "");
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

        // ── Phase 1: provider grid (no provider selected yet) ──────────
        if (!onboardingProvider) {
          return (
            <div className="w-full mx-auto mt-10 text-center font-body">
              <img
                src="/android-chrome-512x512.png"
                alt="Avatar"
                className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
              />
              <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-4 max-w-[420px] relative text-[15px] text-txt leading-relaxed">
                <h2 className="text-[28px] font-normal mb-1 text-txt-strong">what is my brain?</h2>
              </div>
              <div className="w-full mx-auto px-2">
                <div className="mb-4 text-left">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {cloudProviders.map((p: ProviderOption) => renderProviderCard(p))}
                    {subscriptionProviders.map((p: ProviderOption) => renderProviderCard(p))}
                    {apiProviders.map((p: ProviderOption) => renderProviderCard(p))}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // ── Phase 2: config for the selected provider ─────────────────
        const selectedProvider = providers.find((p: ProviderOption) => p.id === onboardingProvider);
        const selectedDisplay = selectedProvider ? getProviderDisplay(selectedProvider) : { name: onboardingProvider, description: "" };

        return (
          <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
            {/* Header with selected provider + change link */}
            <div className="flex items-center justify-center gap-3 mb-6">
              {selectedProvider && (
                <img
                  src={getProviderLogo(selectedProvider.id, isDark)}
                  alt={selectedDisplay.name}
                  className="w-10 h-10 rounded-md object-contain bg-bg-muted p-1.5"
                />
              )}
              <div className="text-left">
                <h2 className="text-[22px] font-normal text-txt-strong leading-tight">{selectedDisplay.name}</h2>
                {selectedDisplay.description && (
                  <p className="text-xs text-muted mt-0.5">{selectedDisplay.description}</p>
                )}
              </div>
              <button
                className="ml-2 text-xs text-accent bg-transparent border border-accent/30 px-2.5 py-1 rounded-full cursor-pointer hover:bg-accent/10"
                onClick={() => {
                  setState("onboardingProvider", "");
                  setState("onboardingApiKey", "");
                  setState("onboardingPrimaryModel", "");
                }}
              >
                change
              </button>
            </div>

            {/* Eliza Cloud — cloud login */}
            {onboardingProvider === "elizacloud" && (
              <div className="max-w-[600px] mx-auto">
                {cloudConnected ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 border border-green-500/30 bg-green-500/10 text-green-400 text-sm rounded-lg justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    connected~
                  </div>
                ) : (
                  <button
                    className="w-full px-6 py-2.5 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={handleCloudLogin}
                    disabled={cloudLoginBusy}
                  >
                    {cloudLoginBusy ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin" />
                        connecting...
                      </span>
                    ) : (
                      "connect account"
                    )}
                  </button>
                )}
                {cloudLoginError && <p className="text-danger text-[13px] mt-2">{cloudLoginError}</p>}
                <p className="text-xs text-muted mt-3">Free credits to start. No API key needed.</p>
              </div>
            )}

            {/* Claude Subscription — setup token / OAuth */}
            {onboardingProvider === "anthropic-subscription" && (
              <div className="text-left">
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
                      {"How to get your setup token:\n\n• Option A: Run  claude setup-token  in your terminal (if you have Claude Code CLI installed)\n\n• Option B: Go to claude.ai/settings/api → \"Claude Code\" → \"Use setup token\""}
                    </p>
                  </>
                ) : anthropicConnected ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2 px-6 py-3 border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium w-full max-w-xs justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Connected to Claude
                    </div>
                    <p className="text-xs text-muted text-center">
                      Your Claude subscription is linked. Click Next to continue.
                    </p>
                  </div>
                ) : !anthropicOAuthStarted ? (
                  <div className="flex flex-col items-center gap-3">
                    <button
                      className="w-full max-w-xs px-6 py-3 border border-accent bg-accent text-accent-fg text-sm font-medium cursor-pointer hover:bg-accent-hover transition-colors"
                      onClick={() => void handleAnthropicStart()}
                    >
                      Login with Anthropic
                    </button>
                    <p className="text-xs text-muted text-center">
                      Requires Claude Pro ($20/mo) or Max ($100/mo).
                    </p>
                    {anthropicError && (
                      <p className="text-xs text-red-400">{anthropicError}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-txt text-center">
                      After logging in, you'll see a code on Anthropic's page.
                      <br />Copy and paste it below:
                    </p>
                    <input
                      type="text"
                      placeholder="Paste the authorization code here..."
                      value={anthropicCode}
                      onChange={(e) => setAnthropicCode(e.target.value)}
                      className="w-full max-w-xs px-3 py-2 border border-border bg-card text-sm text-center focus:border-accent focus:outline-none"
                    />
                    {anthropicError && (
                      <p className="text-xs text-red-400">{anthropicError}</p>
                    )}
                    <button
                      disabled={!anthropicCode}
                      className="w-full max-w-xs px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => void handleAnthropicExchange()}
                    >
                      Connect
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ChatGPT Subscription — OAuth */}
            {onboardingProvider === "openai-subscription" && (
              <div className="space-y-4">
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
                      onClick={() => void handleOpenAIStart()}
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
                        onClick={() => void handleOpenAIExchange()}
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
                <div className="text-left">
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

            {/* Ollama — no config needed */}
            {onboardingProvider === "ollama" && (
              <p className="text-xs text-muted">No configuration needed. Make sure Ollama is running locally.</p>
            )}

            {/* OpenRouter model selection */}
            {onboardingProvider === "openrouter" && onboardingApiKey.trim() && onboardingOptions?.openrouterModels && (
              <div className="mt-4 text-left">
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

      case "inventorySetup": {
        return (
          <div className="w-full mx-auto mt-10 text-center font-body">
            <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">soooo can i have a wallet?</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left w-full px-4">
              <h3 className="text-[13px] font-bold text-txt-strong col-span-full mb-2">Select Chains:</h3>
              {onboardingOptions?.inventoryProviders.map((provider: InventoryProviderOption) => {
                const selectedRpc = onboardingRpcSelections[provider.id] ?? "elizacloud";
                const isElizaCloudRpc = selectedRpc === "elizacloud";
                return (
                  <div key={provider.id} className="px-4 py-3 border rounded-lg border-border bg-card min-w-0">
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
                          value={selectedRpc}
                          onChange={(e) => handleRpcSelectionChange(provider.id, e.target.value)}
                          className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                        >
                          {provider.rpcProviders.map((rpc: RpcProviderOption) => (
                            <option key={rpc.id} value={rpc.id}>
                              {rpc.name}
                            </option>
                          ))}
                        </select>
                        {isElizaCloudRpc ? (
                          <div className="mt-3">
                            {cloudConnected ? (
                              <div className="flex items-center gap-2 px-4 py-2.5 border border-green-500/30 bg-green-500/10 text-green-400 text-sm rounded-lg w-fit">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                connected~ no keys needed
                              </div>
                            ) : (
                              <div className="mt-2">
                                <p className="text-xs text-muted mb-2">Eliza Cloud RPC — no keys necessary. Log in to use.</p>
                                <button
                                  className="px-6 py-2.5 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                                  onClick={handleCloudLogin}
                                  disabled={cloudLoginBusy}
                                >
                                  {cloudLoginBusy ? (
                                    <span className="flex items-center justify-center gap-2">
                                      <span className="inline-block w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></span>
                                      connecting...
                                    </span>
                                  ) : (
                                    "connect account"
                                  )}
                                </button>
                                {cloudLoginError && <p className="text-danger text-[13px] mt-2">{cloudLoginError}</p>}
                              </div>
                            )}
                          </div>
                        ) : (
                          onboardingRpcSelections[provider.id] && (
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
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      case "connectors":
        return (
          <div className="w-full mx-auto mt-10 text-center font-body">
                        <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">how do you want to reach me?</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left w-full max-w-[800px] mx-auto px-2">
              {/* Telegram */}
              <div className={`px-4 py-3 border rounded-lg bg-card transition-colors min-w-0 ${onboardingTelegramToken.trim() ? "border-accent" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-txt-strong">Telegram</div>
                  {onboardingTelegramToken.trim() && (
                    <span className="text-[10px] text-accent border border-accent px-1.5 py-0.5 rounded">Configured</span>
                  )}
                </div>
                <p className="text-xs text-muted mb-3 mt-1">
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
                  className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
                />
              </div>

              {/* Discord */}
              <div className={`px-4 py-3 border rounded-lg bg-card transition-colors min-w-0 ${onboardingDiscordToken.trim() ? "border-accent" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-txt-strong">Discord</div>
                  {onboardingDiscordToken.trim() && (
                    <span className="text-[10px] text-accent border border-accent px-1.5 py-0.5 rounded">Configured</span>
                  )}
                </div>
                <p className="text-xs text-muted mb-3 mt-1">
                  Create a bot at the{" "}
                  <a
                    href="https://discord.com/developers/applications"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline"
                  >
                    Discord Developer Portal
                  </a>{" "}
                  and copy the bot token
                </p>
                <input
                  type="password"
                  value={onboardingDiscordToken}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setState("onboardingDiscordToken", e.target.value)}
                  placeholder="Discord bot token"
                  className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
                />
              </div>

              {/* Twilio (SMS / Green Text) */}
              <div className={`px-4 py-3 border rounded-lg bg-card transition-colors min-w-0 ${onboardingTwilioAccountSid.trim() && onboardingTwilioAuthToken.trim() ? "border-accent" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-txt-strong">Twilio SMS</div>
                  {onboardingTwilioAccountSid.trim() && onboardingTwilioAuthToken.trim() && (
                    <span className="text-[10px] text-accent border border-accent px-1.5 py-0.5 rounded">Configured</span>
                  )}
                </div>
                <p className="text-xs text-muted mb-3 mt-1">
                  SMS green-text messaging via{" "}
                  <a
                    href="https://www.twilio.com/console"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline"
                  >
                    Twilio Console
                  </a>
                </p>
                <div className="flex flex-col gap-2">
                  <input
                    type="password"
                    value={onboardingTwilioAccountSid}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setState("onboardingTwilioAccountSid", e.target.value)}
                    placeholder="Account SID"
                    className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
                  />
                  <input
                    type="password"
                    value={onboardingTwilioAuthToken}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setState("onboardingTwilioAuthToken", e.target.value)}
                    placeholder="Auth Token"
                    className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
                  />
                  <input
                    type="tel"
                    value={onboardingTwilioPhoneNumber}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setState("onboardingTwilioPhoneNumber", e.target.value)}
                    placeholder="+1234567890 (Twilio phone number)"
                    className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
                  />
                </div>
              </div>

              {/* Blooio (iMessage / Blue Text) */}
              <div className={`px-4 py-3 border rounded-lg bg-card transition-colors min-w-0 ${onboardingBlooioApiKey.trim() ? "border-accent" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-txt-strong">Blooio iMessage</div>
                  {onboardingBlooioApiKey.trim() && (
                    <span className="text-[10px] text-accent border border-accent px-1.5 py-0.5 rounded">Configured</span>
                  )}
                </div>
                <p className="text-xs text-muted mb-3 mt-1">
                  Blue-text iMessage integration via{" "}
                  <a
                    href="https://blooio.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline"
                  >
                    Blooio
                  </a>
                </p>
                <div className="flex flex-col gap-2">
                  <input
                    type="password"
                    value={onboardingBlooioApiKey}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setState("onboardingBlooioApiKey", e.target.value)}
                    placeholder="Blooio API key"
                    className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
                  />
                  <input
                    type="tel"
                    value={onboardingBlooioPhoneNumber}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setState("onboardingBlooioPhoneNumber", e.target.value)}
                    placeholder="+1234567890 (your phone number)"
                    className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case "permissions":
        return (
          <div className="max-w-[600px] mx-auto mt-10 font-body">
            <PermissionsOnboardingSection onContinue={(options) => void handleOnboardingNext(options)} />
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
      case "avatar":
        return true; // always valid — defaults to 1
      case "style":
        return onboardingStyle.length > 0;
      case "theme":
        return true;
      case "runMode":
        return onboardingRunMode !== "";
      case "dockerSetup":
        return true; // informational step, always valid
      case "cloudProvider":
        if (onboardingCloudProvider === "elizacloud") return cloudConnected;
        return onboardingCloudProvider.length > 0;
      case "modelSelection":
        return onboardingSmallModel.length > 0 && onboardingLargeModel.length > 0;
      case "cloudLogin":
        return cloudConnected;
      case "llmProvider":
        if (onboardingProvider === "anthropic-subscription") {
          return onboardingSubscriptionTab === "token" ? onboardingApiKey.length > 0 : anthropicConnected;
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
      case "permissions":
        return true; // optional — user can skip and configure later
      default:
        return false;
    }
  };

  const canGoBack = onboardingStep !== "welcome";
  const showPrimaryNext = onboardingStep !== "permissions";

  /** On the llmProvider config screen, "back" returns to the provider grid. */
  const handleBack = () => {
    if (onboardingStep === "llmProvider" && onboardingProvider) {
      setState("onboardingProvider", "");
      setState("onboardingApiKey", "");
      setState("onboardingPrimaryModel", "");
    } else {
      handleOnboardingBack();
    }
  };

  return (
    <div className="mx-auto px-4 pb-16 text-center font-body h-full overflow-y-auto">
      {renderStep(onboardingStep)}
      <div className="flex gap-2 mt-8 justify-center">
        {canGoBack && (
          <button
            className="px-6 py-2 border border-border bg-transparent text-txt text-sm cursor-pointer rounded-full hover:bg-accent-subtle hover:text-accent"
            onClick={handleBack}
            disabled={onboardingRestarting}
          >
            back
          </button>
        )}
        {showPrimaryNext && (
          <button
            className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => void handleOnboardingNext()}
            disabled={!canGoNext() || onboardingRestarting}
          >
            {onboardingRestarting ? "restarting..." : "next"}
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Docker Setup Step — checks Docker availability and guides installation
// ═══════════════════════════════════════════════════════════════════════════

function DockerSetupStep() {
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startMessage, setStartMessage] = useState("");
  const [dockerStatus, setDockerStatus] = useState<{
    installed: boolean;
    running: boolean;
    platform: string;
    appleContainerAvailable: boolean;
    engineRecommendation: string;
  } | null>(null);

  const checkDocker = async () => {
    setChecking(true);
    try {
      const data = await client.getSandboxPlatform();
      setDockerStatus(mapSandboxPlatform(data));
    } catch {
      setDockerStatus({
        installed: false,
        running: false,
        platform: inferPlatform(),
        appleContainerAvailable: false,
        engineRecommendation: "docker",
      });
    }
    setChecking(false);
  };

  // Auto-start Docker and poll until it's ready
  const handleStartDocker = async () => {
    setStarting(true);
    setStartMessage("starting docker...");
    try {
      const data = await client.startDocker();
      if (data.success) {
        setStartMessage(data.message || "starting up...");
        // Poll every 3 seconds until Docker is running
        for (let i = 0; i < SANDBOX_START_MAX_ATTEMPTS; i++) {
          await new Promise((r) => setTimeout(r, SANDBOX_POLL_INTERVAL_MS));
          setStartMessage(
            `waiting for docker to start... (${(i + 1) * 3}s)`,
          );
          try {
            const status = await client.getSandboxPlatform();
            if (status.dockerRunning) {
              setDockerStatus(
                (prev) =>
                  prev
                    ? { ...prev, ...mapSandboxPlatform(status), running: true }
                    : prev,
              );
              setStartMessage("docker is running!");
              setStarting(false);
              return;
            }
          } catch { /* keep polling */ }
        }
        setStartMessage("docker is taking a while... try opening Docker Desktop manually");
      } else {
        setStartMessage(data.message || "could not auto-start docker");
      }
    } catch (err) {
      setStartMessage(`failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
    setStarting(false);
  };

  useEffect(() => {
    void checkDocker();
  }, []);

  const getInstallUrl = () => {
    if (!dockerStatus) return "https://docs.docker.com/get-docker/";
    switch (dockerStatus.platform) {
      case "darwin":
        return "https://docs.docker.com/desktop/install/mac-install/";
      case "win32":
        return "https://docs.docker.com/desktop/install/windows-install/";
      case "linux":
        return "https://docs.docker.com/engine/install/";
      default:
        return "https://docs.docker.com/get-docker/";
    }
  };

  const getPlatformName = () => {
    if (!dockerStatus) return "your computer";
    switch (dockerStatus.platform) {
      case "darwin": return "macOS";
      case "win32": return "Windows";
      case "linux": return "Linux";
      default: return "your computer";
    }
  };

  if (checking) {
    return (
      <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
        <img
          src="/android-chrome-512x512.png"
          alt="Avatar"
          className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block animate-pulse"
        />
        <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
          <p>checking ur machine for sandbox stuff...</p>
        </div>
      </div>
    );
  }

  const isInstalled = dockerStatus?.installed;
  const isRunning = dockerStatus?.running;
  const isReady = isInstalled && isRunning;
  const hasAppleContainer = dockerStatus?.appleContainerAvailable;

  return (
    <div className="max-w-[540px] mx-auto mt-10 text-center font-body">
      <img
        src="/android-chrome-512x512.png"
        alt="Avatar"
        className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
      />
      <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
        {isReady ? (
          <>
            <h2 className="text-[24px] font-normal mb-2 text-txt-strong">
              {hasAppleContainer ? "omg ur set up perfectly" : "nice, docker is ready"}
            </h2>
            <p className="text-[13px] opacity-70">
              {hasAppleContainer
                ? "found apple container on ur mac — thats the strongest isolation. each container gets its own tiny VM. very safe very cool"
                : "docker is installed and running. i'll use it to keep myself sandboxed so i cant accidentally mess up ur stuff"}
            </p>
          </>
        ) : isInstalled && !isRunning ? (
          <>
            <h2 className="text-[24px] font-normal mb-2 text-txt-strong">
              docker is installed but sleeping
            </h2>
            <p className="text-[13px] opacity-70 mb-3">
              i found docker on ur machine but the daemon isn't running yet.
              lemme try to wake it up for u~
            </p>
          </>
        ) : (
          <>
            <h2 className="text-[24px] font-normal mb-2 text-txt-strong">
              need docker for sandbox mode
            </h2>
            <p className="text-[13px] opacity-70 mb-3">
              to run me in a sandbox i need docker installed on {getPlatformName()}.
              it's like a little apartment building where i live safely separated from ur files
            </p>
            {dockerStatus?.platform === "win32" && (
              <p className="text-[12px] opacity-60 mb-2">
                on windows u also need WSL2 enabled — docker desktop will set it up for u
              </p>
            )}
            {dockerStatus?.platform === "darwin" && (
              <p className="text-[12px] opacity-60 mb-2">
                pro tip: if ur on apple silicon u can also install apple container tools for even better isolation (brew install apple/apple/container-tools)
              </p>
            )}
          </>
        )}
      </div>

      {/* Status indicators */}
      <div className="flex flex-col gap-2 max-w-[400px] mx-auto mb-4">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm ${
          isInstalled
            ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
            : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
        }`}>
          <span>{isInstalled ? "✅" : "❌"}</span>
          <span>Docker {isInstalled ? "installed" : "not found"}</span>
        </div>

        {isInstalled && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm ${
            isRunning
              ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
              : "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200"
          }`}>
            <span>{isRunning ? "✅" : "⚠️"}</span>
            <span>Docker daemon {isRunning ? "running" : "not running"}</span>
          </div>
        )}

        {dockerStatus?.platform === "darwin" && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm ${
            hasAppleContainer
              ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
              : "bg-card border-border text-txt opacity-60"
          }`}>
            <span>{hasAppleContainer ? "✅" : "➖"}</span>
            <span>Apple Container {hasAppleContainer ? "available (preferred)" : "not installed (optional)"}</span>
          </div>
        )}
      </div>

      {/* Start message */}
      {startMessage && (
        <p className="text-[13px] text-accent mb-3 animate-pulse">{startMessage}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 justify-center flex-wrap">
        {!isInstalled && (
          <a
            href={getInstallUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover inline-block no-underline"
          >
            install docker
          </a>
        )}
        {isInstalled && !isRunning && !starting && (
          <button
            className="px-4 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover"
            onClick={() => void handleStartDocker()}
          >
            start docker for me
          </button>
        )}
        {!starting && (
          <button
            className="px-4 py-2 border border-border bg-transparent text-txt text-sm cursor-pointer rounded-full hover:bg-accent-subtle hover:text-accent"
            onClick={() => void checkDocker()}
          >
            {isReady ? "re-check" : "check again"}
          </button>
        )}
      </div>

      {isReady && (
        <p className="text-[12px] text-txt opacity-50 mt-4">
          using: {hasAppleContainer ? "Apple Container" : "Docker"} on {getPlatformName()}
        </p>
      )}
      {!isReady && !starting && (
        <p className="text-[12px] text-txt opacity-40 mt-4">
          u can still continue without docker — i just won't have sandbox protection
        </p>
      )}
    </div>
  );
}
