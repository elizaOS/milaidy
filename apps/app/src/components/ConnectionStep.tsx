import { client } from "@elizaos/app-core/api";
import { useApp } from "@elizaos/app-core/state";
import { ConnectionStep as UpstreamConnectionStep } from "@milady/upstream-app-core-connection-step";
import { useEffect, useState } from "react";
import {
  ELIZA_TOOLS_OAUTH_PROVIDER,
  isElizaToolsOAuthProvider,
} from "../onboarding-auth";

function renderCloudLoginError(error: string) {
  const urlMatch = error.match(/^Open this link to log in: (.+)$/);
  if (urlMatch) {
    return (
      <p
        style={{
          fontSize: "0.8125rem",
          marginTop: "0.5rem",
          color: "var(--text)",
        }}
      >
        Open this link to log in:{" "}
        <a
          href={urlMatch[1]}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--text)",
            textDecoration: "underline",
          }}
        >
          Click here
        </a>
      </p>
    );
  }

  return (
    <p
      style={{
        color: "var(--danger)",
        fontSize: "0.8125rem",
        marginTop: "0.5rem",
      }}
    >
      {error}
    </p>
  );
}

export function ConnectionStep() {
  const {
    elizaCloudConnected,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
    handleCloudLogin,
    handleOnboardingBack,
    handleOnboardingNext,
    onboardingProvider,
    onboardingRemoteConnected,
    onboardingRunMode,
    setState,
    t,
  } = useApp();
  const [showProviderSelection, setShowProviderSelection] = useState(false);
  const [continueRequested, setContinueRequested] = useState(false);
  const [persistedCloudConnected, setPersistedCloudConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void client
      .getCloudStatus()
      .then((status) => {
        if (cancelled) {
          return;
        }
        setPersistedCloudConnected(
          status.connected === true || status.hasApiKey === true,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setPersistedCloudConnected(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (elizaCloudConnected) {
      setPersistedCloudConnected(true);
    }
  }, [elizaCloudConnected]);

  const toolsOAuthConnected = elizaCloudConnected || persistedCloudConnected;
  const hasToolsOAuthSelection = isElizaToolsOAuthProvider(onboardingProvider);

  const showAccountConnectOnly =
    onboardingRunMode === "local" &&
    !onboardingRemoteConnected &&
    !showProviderSelection &&
    (!onboardingProvider || hasToolsOAuthSelection);

  if (!showAccountConnectOnly) {
    return <UpstreamConnectionStep />;
  }

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.neuralLinkTitle")}
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>

      <div style={{ width: "100%", textAlign: "left" }}>
        <div className="onboarding-question">Connect your Eliza account</div>
        <p className="onboarding-desc" style={{ marginBottom: "1rem" }}>
          Sign in once to keep your Eliza account linked. You can choose a model
          provider later if you want local or cloud inference.
        </p>

        <div style={{ textAlign: "center" }}>
          {elizaCloudConnected ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1rem",
                border: "1px solid var(--ok-muted)",
                background: "var(--ok-subtle)",
                color: "var(--ok)",
                fontSize: "0.875rem",
                borderRadius: "0.5rem",
                justifyContent: "center",
              }}
            >
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
                <title>{t("onboarding.connected")}</title>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {t("onboarding.connected")}
            </div>
          ) : (
            <button
              type="button"
              className="onboarding-confirm-btn"
              onClick={handleCloudLogin}
              disabled={elizaCloudLoginBusy || continueRequested}
            >
              {elizaCloudLoginBusy
                ? t("onboarding.connecting")
                : t("onboarding.connectAccount")}
            </button>
          )}
          {elizaCloudLoginError && renderCloudLoginError(elizaCloudLoginError)}
        </div>
      </div>

      <div className="onboarding-panel-footer">
        <button
          className="onboarding-back-link"
          onClick={handleOnboardingBack}
          type="button"
        >
          {t("onboarding.back")}
        </button>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            className="onboarding-back-link"
            onClick={() => {
              setState("onboardingProvider", "");
              setShowProviderSelection(true);
            }}
            type="button"
          >
            Choose a model provider
          </button>
          <button
            className="onboarding-confirm-btn"
            onClick={() => {
              setContinueRequested(true);
              setState("onboardingProvider", ELIZA_TOOLS_OAUTH_PROVIDER);
              setState("onboardingApiKey", "");
              setState("onboardingPrimaryModel", "");
              setState("onboardingOpenRouterModel", "");
              void handleOnboardingNext().finally(() => {
                setContinueRequested(false);
              });
            }}
            disabled={!toolsOAuthConnected || continueRequested}
            type="button"
          >
            {continueRequested
              ? t("onboarding.connecting")
              : t("onboarding.confirm")}
          </button>
        </div>
      </div>
    </>
  );
}
