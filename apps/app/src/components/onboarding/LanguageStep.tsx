import { normalizeLanguage } from "@milady/app-core/i18n";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function LanguageStep() {
  const {
    t,
    uiLanguage,
    onboardingAvatar,
    customVrmUrl,
    setState,
    handleOnboardingNext,
  } = useApp();

  const avatarVrmPath =
    onboardingAvatar === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(onboardingAvatar || 1);
  const avatarFallbackPreviewUrl =
    onboardingAvatar > 0
      ? getVrmPreviewUrl(onboardingAvatar)
      : getVrmPreviewUrl(1);

  return (
    <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
      <OnboardingVrmAvatar
        vrmPath={avatarVrmPath}
        fallbackPreviewUrl={avatarFallbackPreviewUrl}
      />
      <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
        <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
          {t("onboarding.languageQuestion")}
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-[600px] mx-auto">
        {[
          { id: "en", label: "English" },
          { id: "zh-CN", label: "ZH" },
          { id: "ko", label: "Korean" },
          { id: "es", label: "Espanol" },
          { id: "pt", label: "Portuguese" },
        ].map((lang) => (
          <button
            type="button"
            key={lang.id}
            className={`px-3 py-3 border cursor-pointer bg-card transition-colors text-center rounded-lg ${
              uiLanguage === lang.id
                ? "border-accent !bg-accent !text-accent-fg"
                : "border-border hover:border-accent"
            }`}
            onClick={() => {
              setState("uiLanguage", normalizeLanguage(lang.id));
              handleOnboardingNext();
            }}
          >
            <div className="font-bold text-sm">{lang.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
