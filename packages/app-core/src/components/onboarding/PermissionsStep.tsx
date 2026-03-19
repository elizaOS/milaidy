import { PermissionsOnboardingSection } from "@miladyai/app-core/components";
import { useApp } from "@miladyai/app-core/state";
import { FlaminaGuideCard } from "../FlaminaGuide";

export function PermissionsStep() {
  const { handleOnboardingNext, onboardingMode, t } = useApp();

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.systemAccessTitle")}
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      {onboardingMode === "advanced" && (
        <FlaminaGuideCard topic="permissions" className="mb-4" />
      )}
      <PermissionsOnboardingSection
        onContinue={(options) =>
          void handleOnboardingNext(
            options?.allowPermissionBypass
              ? { ...options, skipTask: "permissions" }
              : options,
          )
        }
      />
    </>
  );
}
