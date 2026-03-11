import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function SetupModeStep() {
  const { t, onboardingSetupMode, onboardingAvatar, customVrmUrl, setState } =
    useApp();

  const avatarVrmPath =
    onboardingAvatar === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(onboardingAvatar || 1);
  const avatarFallbackPreviewUrl =
    onboardingAvatar > 0
      ? getVrmPreviewUrl(onboardingAvatar)
      : getVrmPreviewUrl(1);

  return (
    <div className="max-w-[480px] mx-auto mt-10 text-center font-body">
      <OnboardingVrmAvatar
        vrmPath={avatarVrmPath}
        fallbackPreviewUrl={avatarFallbackPreviewUrl}
      />
      <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[420px] relative text-[15px] text-txt leading-relaxed">
        <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
          {t("onboarding.howMuchSetup")}
        </h2>
        <p className="text-muted text-sm">{t("onboarding.choosePath")}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[420px] mx-auto">
        <button
          type="button"
          className={`p-5 border-[1.5px] rounded-lg cursor-pointer transition-all text-left ${
            onboardingSetupMode === "quick"
              ? "border-accent bg-accent text-accent-fg shadow-md"
              : "border-border bg-card hover:border-border-hover hover:bg-bg-hover"
          }`}
          onClick={() => setState("onboardingSetupMode", "quick")}
        >
          <div className="font-semibold text-sm mb-1">
            {t("onboarding.quickSetup")}
          </div>
          <div
            className={`text-xs ${
              onboardingSetupMode === "quick" ? "opacity-80" : "text-muted"
            }`}
          >
            {t("onboarding.quickSetupHint")}
          </div>
        </button>
        <button
          type="button"
          className={`p-5 border-[1.5px] rounded-lg cursor-pointer transition-all text-left ${
            onboardingSetupMode === "advanced"
              ? "border-accent bg-accent text-accent-fg shadow-md"
              : "border-border bg-card hover:border-border-hover hover:bg-bg-hover"
          }`}
          onClick={() => setState("onboardingSetupMode", "advanced")}
        >
          <div className="font-semibold text-sm mb-1">
            {t("onboarding.fullSetup")}
          </div>
          <div
            className={`text-xs ${
              onboardingSetupMode === "advanced" ? "opacity-80" : "text-muted"
            }`}
          >
            {t("onboarding.fullSetupHint")}
          </div>
        </button>
      </div>
    </div>
  );
}
