import { Cloud, Lock, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function RunModeStep() {
  const { t, onboardingRunMode, onboardingAvatar, customVrmUrl, setState } =
    useApp();
  const [isMobilePlatform, setIsMobilePlatform] = useState(false);

  useEffect(() => {
    let mobile = false;
    try {
      import("@capacitor/core")
        .then(({ Capacitor }) => {
          const plat = Capacitor.getPlatform();
          mobile = plat === "ios" || plat === "android";
          setIsMobilePlatform(mobile);
          if (mobile && onboardingRunMode !== "cloud") {
            setState("onboardingRunMode", "cloud");
          }
        })
        .catch(() => {
          if (typeof navigator !== "undefined") {
            mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            setIsMobilePlatform(mobile);
            if (mobile && onboardingRunMode !== "cloud") {
              setState("onboardingRunMode", "cloud");
            }
          }
        });
    } catch {
      // Ignored
    }
  }, [onboardingRunMode, setState]);

  const handleRunModeSelect = (
    mode: "local-rawdog" | "local-sandbox" | "cloud",
  ) => {
    setState("onboardingRunMode", mode);
  };

  const avatarVrmPath =
    onboardingAvatar === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(onboardingAvatar || 1);
  const avatarFallbackPreviewUrl =
    onboardingAvatar > 0
      ? getVrmPreviewUrl(onboardingAvatar)
      : getVrmPreviewUrl(1);

  if (isMobilePlatform) {
    return (
      <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
        <OnboardingVrmAvatar
          vrmPath={avatarVrmPath}
          fallbackPreviewUrl={avatarFallbackPreviewUrl}
        />
        <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
          <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
            {t("onboardingwizard.iLlLiveInTheClo")}
          </h2>
          <p className="text-[13px] text-txt mt-1 opacity-70">
            {t("onboardingwizard.sinceUrOnMobileI")}
          </p>
        </div>
        <div className="flex flex-col gap-3 max-w-[460px] mx-auto">
          <div className="px-4 py-4 border border-accent bg-accent text-accent-fg rounded-lg text-left">
            <div className="font-bold text-sm flex items-center gap-1.5">
              <Cloud className="w-4 h-4" /> {t("onboardingwizard.cloud")}
            </div>
            <div className="text-[12px] mt-1 opacity-80">
              {t("onboardingwizard.alwaysOnWorksFro")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[580px] mx-auto mt-10 text-center font-body">
      <OnboardingVrmAvatar
        vrmPath={avatarVrmPath}
        fallbackPreviewUrl={avatarFallbackPreviewUrl}
      />
      <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
        <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
          {t("onboarding.whereShouldILive")}
        </h2>
        <p className="text-[13px] text-txt mt-1 opacity-70">
          {t("onboarding.pickHowToRun")}
        </p>
      </div>
      <div className="flex flex-col gap-3 max-w-[460px] mx-auto">
        <button
          type="button"
          className={`px-4 py-4 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
            onboardingRunMode === "cloud"
              ? "border-accent !bg-accent !text-accent-fg"
              : "border-border hover:border-accent"
          }`}
          onClick={() => handleRunModeSelect("cloud")}
        >
          <div className="font-bold text-sm flex items-center gap-1.5">
            <Cloud className="w-4 h-4" /> {t("onboardingwizard.cloud")}
          </div>
          <div className="text-[12px] mt-1 opacity-70">
            {t("onboardingwizard.iRunOnElizaCloud")}
          </div>
        </button>
        <button
          type="button"
          className={`px-4 py-4 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
            onboardingRunMode === "local-sandbox"
              ? "border-accent !bg-accent !text-accent-fg"
              : "border-border hover:border-accent"
          }`}
          onClick={() => handleRunModeSelect("local-sandbox")}
        >
          <div className="font-bold text-sm flex items-center gap-1.5">
            <Lock className="w-4 h-4" /> {t("onboardingwizard.localSandbox")}
          </div>
          <div className="text-[12px] mt-1 opacity-70">
            {t("onboardingwizard.iRunOnUrMachine")}
          </div>
        </button>
        <button
          type="button"
          className={`px-4 py-4 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
            onboardingRunMode === "local-rawdog"
              ? "border-accent !bg-accent !text-accent-fg"
              : "border-border hover:border-accent"
          }`}
          onClick={() => handleRunModeSelect("local-rawdog")}
        >
          <div className="font-bold text-sm flex items-center gap-1.5">
            <Zap className="w-4 h-4" /> {t("onboardingwizard.localRaw")}
          </div>
          <div className="text-[12px] mt-1 opacity-70">
            {t("onboardingwizard.iRunDirectlyOnUr")}
          </div>
        </button>
      </div>
    </div>
  );
}
