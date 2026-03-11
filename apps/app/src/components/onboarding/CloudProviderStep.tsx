import type { CloudProviderOption } from "@milady/app-core/api";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function CloudProviderStep() {
  const {
    t,
    onboardingOptions,
    onboardingCloudProvider,
    onboardingAvatar,
    customVrmUrl,
    miladyCloudConnected,
    miladyCloudLoginBusy,
    miladyCloudLoginError,
    handleCloudLogin,
    setState,
  } = useApp();

  const handleCloudProviderSelect = (providerId: string) => {
    setState("onboardingCloudProvider", providerId);
  };

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
          {t("onboardingwizard.okayWhichCloud")}
        </h2>
      </div>
      <div className="flex flex-col gap-2 text-left max-w-[600px] mx-auto">
        {onboardingOptions?.cloudProviders.map(
          (provider: CloudProviderOption) => (
            <button
              type="button"
              key={provider.id}
              className={`w-full px-4 py-3 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
                onboardingCloudProvider === provider.id
                  ? "border-accent !bg-accent !text-accent-fg"
                  : "border-border hover:border-accent"
              }`}
              onClick={() => handleCloudProviderSelect(provider.id)}
            >
              <div className="font-bold text-sm">{provider.name}</div>
              {provider.description && (
                <div
                  className={`text-xs mt-0.5 ${
                    onboardingCloudProvider === provider.id
                      ? "text-accent-fg/70"
                      : "text-muted"
                  }`}
                >
                  {provider.description}
                </div>
              )}
            </button>
          ),
        )}
      </div>
      {onboardingCloudProvider === "miladycloud" && (
        <div className="max-w-[600px] mx-auto mt-4">
          {miladyCloudConnected ? (
            <div className="flex items-center gap-2 px-4 py-2.5 border border-green-500/30 bg-green-500/10 text-green-400 text-sm rounded-lg justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>{t("onboardingwizard.Connected")}</title>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {t("onboardingwizard.connected")}
            </div>
          ) : (
            <button
              type="button"
              className="px-6 py-2.5 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleCloudLogin}
              disabled={miladyCloudLoginBusy}
            >
              {miladyCloudLoginBusy ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin" />
                  {t("onboardingwizard.connecting")}
                </span>
              ) : (
                "connect account"
              )}
            </button>
          )}
          {miladyCloudLoginError && (
            <p className="text-danger text-[13px] mt-2">
              {miladyCloudLoginError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
