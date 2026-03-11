import { useApp } from "../../AppContext";

export function CloudLoginStep() {
  const {
    t,
    miladyCloudConnected,
    miladyCloudUserId,
    miladyCloudLoginBusy,
    miladyCloudLoginError,
    handleCloudLogin,
  } = useApp();

  return (
    <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
      <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
        <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
          {t("onboardingwizard.CloudLogin")}
        </h2>
      </div>
      {miladyCloudConnected ? (
        <div className="max-w-[600px] mx-auto">
          <p className="text-txt mb-2">
            {t("onboardingwizard.LoggedInSuccessful")}
          </p>
          {miladyCloudUserId && (
            <p className="text-muted text-sm">
              {t("onboardingwizard.UserID")} {miladyCloudUserId}
            </p>
          )}
        </div>
      ) : (
        <div className="max-w-[600px] mx-auto">
          <p className="text-txt mb-4">
            {t("onboardingwizard.ClickTheButtonBel")}
          </p>
          <button
            type="button"
            className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed mt-5"
            onClick={handleCloudLogin}
            disabled={miladyCloudLoginBusy}
          >
            {miladyCloudLoginBusy ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
                {t("onboardingwizard.LoggingIn")}
              </span>
            ) : (
              "Login to Milady Cloud"
            )}
          </button>
          {miladyCloudLoginError && (
            <p className="text-danger text-[13px] mt-2.5">
              {miladyCloudLoginError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
