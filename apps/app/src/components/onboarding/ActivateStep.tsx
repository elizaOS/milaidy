import { useApp } from "../../AppContext";

export function ActivateStep() {
  const { onboardingName, handleOnboardingNext, t } = useApp();

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.activateTitle") || "Activation Complete"}
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      <div className="onboarding-question">
        {onboardingName || "Your companion"}{" "}
        {t("onboarding.activateReady") || "is ready."}
      </div>
      <p className="onboarding-desc">
        {t("onboarding.activateDesc") ||
          "Your AI companion has been configured and is ready to go. You can adjust advanced settings anytime."}
      </p>
      <div className="onboarding-panel-footer">
        <span />
        <button
          className="onboarding-confirm-btn"
          onClick={() => handleOnboardingNext()}
          type="button"
        >
          Enter
        </button>
      </div>
    </>
  );
}
