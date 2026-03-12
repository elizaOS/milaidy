import { useApp } from "../../AppContext";

export function ActivateStep() {
  const { onboardingName, handleOnboardingNext } = useApp();

  return (
    <>
      <div className="onboarding-section-title">Ready</div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      <div className="onboarding-question">
        {onboardingName || "Your companion"} is ready.
      </div>
      <p className="onboarding-desc">
        All systems configured. You can adjust settings anytime.
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
