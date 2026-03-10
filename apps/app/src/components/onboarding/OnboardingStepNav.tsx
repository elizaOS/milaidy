import { ONBOARDING_STEPS, type OnboardingStep } from "@milady/app-core/state/types";
import { useApp } from "../../AppContext";

export function OnboardingStepNav() {
  const { onboardingStep } = useApp();

  const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.id === onboardingStep);

  return (
    <div className="onboarding-left">
      <div className={`onboarding-step-list step-${currentIndex}`}>
        {ONBOARDING_STEPS.map((step, i) => {
          let state = "";
          if (i < currentIndex) state = "onboarding-step-item--done";
          else if (i === currentIndex) state = "onboarding-step-item--active";

          return (
            <div key={step.id} className={`onboarding-step-item ${state}`}>
              <div className="onboarding-step-dot" />
              <div className="onboarding-step-info">
                <span className="onboarding-step-name">{step.name}</span>
                <span className="onboarding-step-sub">{step.subtitle}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
