import {
  getVrmBackgroundUrl,
  getVrmPreviewUrl,
  getVrmUrl,
  useApp,
} from "../AppContext";
import { VrmStage } from "./companion/VrmStage";
import { OnboardingStepNav } from "./onboarding/OnboardingStepNav";
import { OnboardingPanel } from "./onboarding/OnboardingPanel";
import { WakeUpStep } from "./onboarding/WakeUpStep";
import { LanguageStep } from "./onboarding/LanguageStep";
import { IdentityStep } from "./onboarding/IdentityStep";
import { ConnectionStep } from "./onboarding/ConnectionStep";
import { PermissionsStep } from "./onboarding/PermissionsStep";
import { ActivateStep } from "./onboarding/ActivateStep";

export function OnboardingWizard() {
  const { onboardingStep, onboardingAvatar, customVrmUrl, t } = useApp();

  const vrmPath = customVrmUrl || getVrmUrl(onboardingAvatar || 1);
  const fallbackPreview = getVrmPreviewUrl(onboardingAvatar || 1);
  const bgUrl = getVrmBackgroundUrl(onboardingAvatar || 1);

  function renderStep() {
    switch (onboardingStep) {
      case "wakeUp":
        return <WakeUpStep />;
      case "language":
        return <LanguageStep />;
      case "identity":
        return <IdentityStep />;
      case "connection":
        return <ConnectionStep />;
      case "senses":
        return <PermissionsStep />;
      case "activate":
        return <ActivateStep />;
      default:
        return null;
    }
  }

  return (
    <div className="onboarding-screen">
      {/* Background */}
      <div
        className="onboarding-bg"
        style={{ backgroundImage: `url(${bgUrl})` }}
      />
      <div className="onboarding-bg-overlay" />

      {/* Corner decorations */}
      <svg
        className="onboarding-corner onboarding-corner--tl"
        viewBox="0 0 36 36"
        fill="none"
        stroke="rgba(240,185,11,0.18)"
        strokeWidth="1"
      >
        <path d="M0 18 L0 0 L18 0" />
        <circle cx="0" cy="0" r="2" fill="rgba(240,185,11,0.25)" stroke="none" />
      </svg>
      <svg
        className="onboarding-corner onboarding-corner--tr"
        viewBox="0 0 36 36"
        fill="none"
        stroke="rgba(240,185,11,0.18)"
        strokeWidth="1"
      >
        <path d="M0 18 L0 0 L18 0" />
        <circle cx="0" cy="0" r="2" fill="rgba(240,185,11,0.25)" stroke="none" />
      </svg>
      <svg
        className="onboarding-corner onboarding-corner--bl"
        viewBox="0 0 36 36"
        fill="none"
        stroke="rgba(240,185,11,0.18)"
        strokeWidth="1"
      >
        <path d="M0 18 L0 0 L18 0" />
        <circle cx="0" cy="0" r="2" fill="rgba(240,185,11,0.25)" stroke="none" />
      </svg>
      <svg
        className="onboarding-corner onboarding-corner--br"
        viewBox="0 0 36 36"
        fill="none"
        stroke="rgba(240,185,11,0.18)"
        strokeWidth="1"
      >
        <path d="M0 18 L0 0 L18 0" />
        <circle cx="0" cy="0" r="2" fill="rgba(240,185,11,0.25)" stroke="none" />
      </svg>

      {/* Left: Step Navigation */}
      <OnboardingStepNav />

      {/* Center: VRM Model */}
      <div className="onboarding-center">
        <VrmStage
          vrmPath={vrmPath}
          fallbackPreviewUrl={fallbackPreview}
          needsFlip={false}
          cameraProfile="companion"
          t={t}
        />
      </div>

      {/* Right: Content Panel */}
      <OnboardingPanel step={onboardingStep}>
        {renderStep()}
      </OnboardingPanel>
    </div>
  );
}
