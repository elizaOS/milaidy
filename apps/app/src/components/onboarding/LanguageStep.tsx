import { normalizeLanguage } from "@milady/app-core/i18n";
import { useApp } from "../../AppContext";

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "zh-CN", label: "中文" },
  { id: "ko", label: "한국어" },
  { id: "es", label: "Español" },
  { id: "pt", label: "Português" },
];

export function LanguageStep() {
  const { uiLanguage, handleOnboardingNext, handleOnboardingBack, setState } =
    useApp();

  function selectLanguage(langId: string) {
    setState("uiLanguage", normalizeLanguage(langId));
    handleOnboardingNext();
  }

  return (
    <>
      <div className="onboarding-section-title">Communication</div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      <div className="onboarding-question">Select your language</div>
      <div className="onboarding-pill-row">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.id}
            className={`onboarding-pill ${normalizeLanguage(lang.id) === uiLanguage ? "onboarding-pill--selected" : ""}`}
            onClick={() => selectLanguage(lang.id)}
            type="button"
          >
            {lang.label}
          </button>
        ))}
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
