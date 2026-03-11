import type { ChangeEvent } from "react";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function ConnectorsStep() {
  const {
    t,
    onboardingOptions,
    onboardingTelegramToken,
    onboardingDiscordToken,
    onboardingTwilioAccountSid,
    onboardingTwilioAuthToken,
    onboardingTwilioPhoneNumber,
    onboardingBlooioApiKey,
    onboardingBlooioPhoneNumber,
    onboardingGithubToken,
    onboardingAvatar,
    customVrmUrl,
    setState,
  } = useApp();

  const avatarVrmPath =
    onboardingAvatar === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(onboardingAvatar || 1);
  const avatarFallbackPreviewUrl =
    onboardingAvatar > 0
      ? getVrmPreviewUrl(onboardingAvatar)
      : getVrmPreviewUrl(1);

  return (
    <div className="w-full mx-auto mt-10 text-center font-body">
      <OnboardingVrmAvatar
        vrmPath={avatarVrmPath}
        fallbackPreviewUrl={avatarFallbackPreviewUrl}
      />
      <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
        <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
          {t("onboardingwizard.howDoYouWantToR")}
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left w-full max-w-[800px] mx-auto px-2">
        {/* Telegram */}
        <div
          className={`px-4 py-3 border rounded-lg bg-card transition-colors min-w-0 ${onboardingTelegramToken.trim() ? "border-accent" : "border-border"}`}
        >
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm text-txt-strong">
              {t("onboardingwizard.Telegram")}
            </div>
            {onboardingTelegramToken.trim() && (
              <span className="text-[10px] text-accent border border-accent px-1.5 py-0.5 rounded">
                {t("onboardingwizard.Configured")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mb-3 mt-1">
            {t("onboardingwizard.GetABotTokenFrom")}{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              {t("onboardingwizard.BotFather")}
            </a>{" "}
            {t("onboardingwizard.onTelegram")}
          </p>
          <input
            type="password"
            value={onboardingTelegramToken}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setState("onboardingTelegramToken", e.target.value)
            }
            placeholder={t("onboardingwizard.123456ABCDEF1234gh")}
            className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
          />
        </div>

        {/* Discord */}
        <div
          className={`px-4 py-3 border rounded-lg bg-card transition-colors min-w-0 ${onboardingDiscordToken.trim() ? "border-accent" : "border-border"}`}
        >
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm text-txt-strong">
              {t("onboardingwizard.Discord")}
            </div>
            {onboardingDiscordToken.trim() && (
              <span className="text-[10px] text-accent border border-accent px-1.5 py-0.5 rounded">
                {t("onboardingwizard.Configured")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mb-3 mt-1">
            {t("onboardingwizard.OnlyABotTokenIs")}{" "}
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {t("onboardingwizard.CreateABot")}
            </a>
          </p>
          <input
            type="password"
            value={onboardingDiscordToken}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setState("onboardingDiscordToken", e.target.value)
            }
            placeholder={t("onboardingwizard.DiscordBotToken")}
            className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
          />
        </div>

        {/* Twilio (SMS / Green Text) */}
        <div
          className={`px-4 py-3 border rounded-lg bg-card transition-colors min-w-0 ${onboardingTwilioAccountSid.trim() && onboardingTwilioAuthToken.trim() ? "border-accent" : "border-border"}`}
        >
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm text-txt-strong">
              {t("onboardingwizard.TwilioSMS")}
            </div>
            {onboardingTwilioAccountSid.trim() &&
              onboardingTwilioAuthToken.trim() && (
                <span className="text-[10px] text-accent border border-accent px-1.5 py-0.5 rounded">
                  {t("onboardingwizard.Configured")}
                </span>
              )}
          </div>
          <p className="text-xs text-muted mb-3 mt-1">
            {t("onboardingwizard.SMSGreenTextMessa")}{" "}
            <a
              href="https://www.twilio.com/console"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              {t("onboardingwizard.TwilioConsole")}
            </a>
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="password"
              value={onboardingTwilioAccountSid}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setState("onboardingTwilioAccountSid", e.target.value)
              }
              placeholder={t("onboardingwizard.AccountSID")}
              className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
            />
            <input
              type="password"
              value={onboardingTwilioAuthToken}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setState("onboardingTwilioAuthToken", e.target.value)
              }
              placeholder={t("onboardingwizard.AuthToken")}
              className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
            />
            <input
              type="tel"
              value={onboardingTwilioPhoneNumber}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setState("onboardingTwilioPhoneNumber", e.target.value)
              }
              placeholder={t("onboardingwizard.1234567890Twilio")}
              className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
            />
          </div>
        </div>

        {/* Blooio (iMessage / Blue Text) */}
        <div
          className={`px-4 py-3 border rounded-lg bg-card transition-colors min-w-0 ${onboardingBlooioApiKey.trim() ? "border-accent" : "border-border"}`}
        >
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm text-txt-strong">
              {t("onboardingwizard.BlooioIMessage")}
            </div>
            {onboardingBlooioApiKey.trim() && (
              <span className="text-[10px] text-accent border border-accent px-1.5 py-0.5 rounded">
                {t("onboardingwizard.Configured")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mb-3 mt-1">
            {t("onboardingwizard.BlueTextIMessageI")}{" "}
            <a
              href="https://blooio.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              {t("onboardingwizard.Blooio")}
            </a>
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="password"
              value={onboardingBlooioApiKey}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setState("onboardingBlooioApiKey", e.target.value)
              }
              placeholder={t("onboardingwizard.BlooioAPIKey")}
              className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
            />
            <input
              type="tel"
              value={onboardingBlooioPhoneNumber}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setState("onboardingBlooioPhoneNumber", e.target.value)
              }
              placeholder={t("onboardingwizard.1234567890YourPh")}
              className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
            />
          </div>
        </div>

        {/* GitHub */}
        <div
          className={`px-4 py-3 border rounded-lg bg-card transition-colors min-w-0 ${(onboardingGithubToken ?? "").trim() ? "border-accent" : "border-border"}`}
        >
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm text-txt-strong">
              {t("onboardingwizard.GitHub")}
            </div>
            {(onboardingGithubToken ?? "").trim() && (
              <span className="text-[10px] text-accent border border-accent px-1.5 py-0.5 rounded">
                {t("onboardingwizard.Configured")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mb-3 mt-1">
            {t("onboardingwizard.ForCodingAgentsP")}{" "}
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              {t("onboardingwizard.CreateAToken")}
            </a>
          </p>
          <input
            type="password"
            value={onboardingGithubToken}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setState("onboardingGithubToken", e.target.value)
            }
            placeholder={t("onboardingwizard.ghpXxxxxxxxxxxxxxxx")}
            className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
          />
          {onboardingOptions?.githubOAuthAvailable &&
            !(onboardingGithubToken ?? "").trim() && (
              <p className="text-[11px] text-muted mt-2">
                {t("onboardingwizard.OrSkipThisYouL")}
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
