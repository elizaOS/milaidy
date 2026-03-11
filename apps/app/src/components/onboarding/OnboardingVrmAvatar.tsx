import { resolveAppAssetUrl } from "@milady/app-core/utils";

type OnboardingVrmAvatarProps = {
  vrmPath: string;
  fallbackPreviewUrl: string;
  pulse?: boolean;
};

export function OnboardingVrmAvatar({
  vrmPath: _vrmPath,
  fallbackPreviewUrl: _fallbackPreviewUrl,
  pulse = false,
}: OnboardingVrmAvatarProps) {
  return (
    <div
      className={`relative w-[140px] h-[140px] rounded-full border-[3px] border-border mx-auto mb-5 overflow-hidden bg-card ${
        pulse ? "animate-pulse" : ""
      }`}
    >
      <img
        src={resolveAppAssetUrl("apple-touch-icon.png")}
        alt="Milady"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
