import { useApp } from "../../AppContext";
import { PermissionsOnboardingSection } from "../PermissionsSection";

export function PermissionsStep() {
  const { handleOnboardingNext } = useApp();

  return (
    <>
      <div className="onboarding-section-title">System Access</div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      <PermissionsOnboardingSection
        onContinue={(options) => void handleOnboardingNext(options)}
      />
    </>
  );
}
