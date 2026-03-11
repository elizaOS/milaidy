import type {
  InventoryProviderOption,
  RpcProviderOption,
} from "@milady/app-core/api";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function InventorySetupStep() {
  const {
    t,
    onboardingOptions,
    onboardingSelectedChains,
    onboardingRpcSelections,
    onboardingRpcKeys,
    onboardingAvatar,
    customVrmUrl,
    miladyCloudConnected,
    miladyCloudLoginBusy,
    miladyCloudLoginError,
    handleCloudLogin,
    setState,
  } = useApp();

  const handleChainToggle = (chain: string) => {
    const newSelected = new Set(onboardingSelectedChains);
    if (newSelected.has(chain)) {
      newSelected.delete(chain);
    } else {
      newSelected.add(chain);
    }
    setState("onboardingSelectedChains", newSelected);
  };

  const handleRpcSelectionChange = (chain: string, provider: string) => {
    setState("onboardingRpcSelections", {
      ...onboardingRpcSelections,
      [chain]: provider,
    });
  };

  const handleRpcKeyChange = (chain: string, provider: string, key: string) => {
    const keyName = `${chain}:${provider}`;
    setState("onboardingRpcKeys", { ...onboardingRpcKeys, [keyName]: key });
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
    <div className="w-full mx-auto mt-10 text-center font-body">
      <OnboardingVrmAvatar
        vrmPath={avatarVrmPath}
        fallbackPreviewUrl={avatarFallbackPreviewUrl}
      />
      <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
        <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
          {t("onboardingwizard.sooooCanIHaveAW")}
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left w-full px-4">
        <h3 className="text-[13px] font-bold text-txt-strong col-span-full mb-2">
          {t("onboardingwizard.SelectChains")}
        </h3>
        {onboardingOptions?.inventoryProviders.map(
          (provider: InventoryProviderOption) => {
            const selectedRpc =
              onboardingRpcSelections[provider.id] ?? "miladycloud";
            const isElizaCloudRpc = selectedRpc === "miladycloud";
            return (
              <div
                key={provider.id}
                className="px-4 py-3 border rounded-lg border-border bg-card min-w-0"
              >
                <span className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onboardingSelectedChains.has(provider.id)}
                    onChange={() => handleChainToggle(provider.id)}
                    className="cursor-pointer"
                  />
                  <span className="font-bold text-sm">{provider.name}</span>
                </span>
                {provider.description && (
                  <p className="text-xs text-muted mt-0.5 ml-6">
                    {provider.description}
                  </p>
                )}
                {onboardingSelectedChains.has(provider.id) && (
                  <div className="mt-3 ml-6">
                    <span className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
                      {t("onboardingwizard.RPCProvider")}
                    </span>
                    <select
                      value={selectedRpc}
                      onChange={(e) =>
                        handleRpcSelectionChange(provider.id, e.target.value)
                      }
                      className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                    >
                      {provider.rpcProviders?.map((rpc: RpcProviderOption) => (
                        <option key={rpc.id} value={rpc.id}>
                          {rpc.name}
                        </option>
                      ))}
                    </select>
                    {isElizaCloudRpc ? (
                      <div className="mt-3">
                        {miladyCloudConnected ? (
                          <div className="flex items-center gap-2 px-4 py-2.5 border border-green-500/30 bg-green-500/10 text-green-400 text-sm rounded-lg w-fit">
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
                            {t("onboardingwizard.connectedNoKeysN")}
                          </div>
                        ) : (
                          <div className="mt-2">
                            <p className="text-xs text-muted mb-2">
                              {t("onboardingwizard.ElizaCloudRPCNo")}
                            </p>
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
                            {miladyCloudLoginError && (
                              <p className="text-danger text-[13px] mt-2">
                                {miladyCloudLoginError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      onboardingRpcSelections[provider.id] && (
                        <div className="mt-3">
                          <span className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
                            {t("onboardingwizard.RPCAPIKeyOptiona")}
                          </span>
                          <input
                            type="password"
                            value={
                              onboardingRpcKeys[
                                `${provider.id}:${onboardingRpcSelections[provider.id]}`
                              ] ?? ""
                            }
                            onChange={(e) =>
                              handleRpcKeyChange(
                                provider.id,
                                onboardingRpcSelections[provider.id],
                                e.target.value,
                              )
                            }
                            placeholder={t("onboardingwizard.OptionalAPIKey")}
                            className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                          />
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
