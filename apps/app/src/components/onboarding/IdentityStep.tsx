import { useApp } from "../../AppContext";

export function IdentityStep() {
  const { onboardingName, handleOnboardingNext, handleOnboardingBack, setState, t } = useApp();

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.identityTitle") || "Designation"}
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      <div className="onboarding-question">
        {t("onboarding.identityQuestion") || "What should I be called?"}
      </div>
      <input
        className="onboarding-input"
        type="text"
        placeholder={t("onboarding.enterAgentName") || "Enter agent name..."}
        value={onboardingName}
        onChange={(e) => setState("onboardingName", e.target.value)}
        autoFocus
      />
      <p className="onboarding-desc">
        {t("onboarding.identityDesc") ||
          "Choose a name for your AI companion. You can change this later in settings."}
      </p>
      <div className="onboarding-panel-footer">
        <button className="onboarding-back-link" onClick={handleOnboardingBack} type="button">
          ← Back
        </button>
        <button
          className="onboarding-confirm-btn"
          onClick={() => handleOnboardingNext()}
          disabled={!onboardingName.trim()}
          type="button"
        >
          Confirm
        </button>
      </div>
    </>
  );
}
