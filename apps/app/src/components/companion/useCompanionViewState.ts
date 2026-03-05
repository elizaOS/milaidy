import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../../AppContext";
import type {
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "../../api-client";
import { client } from "../../api-client";
import { resolveApiUrl } from "../../asset-url";
import type { TranslatorFn } from "./walletUtils";
import { isBscChainName } from "./walletUtils";

/** Trading-profile modal state + VRM/background upload callbacks. */
export function useCompanionViewState(t: TranslatorFn) {
  const {
    selectedVrmIndex,
    setState,
    walletBalances,
    loadWalletTradingProfile,
  } = useApp();

  // ── Trading profile state ──────────────────────────────────────────
  const [walletProfileOpen, setWalletProfileOpen] = useState(false);
  const [walletProfileLoading, setWalletProfileLoading] = useState(false);
  const [walletProfileError, setWalletProfileError] = useState<string | null>(
    null,
  );
  const [walletProfileWindow, setWalletProfileWindow] =
    useState<WalletTradingProfileWindow>("30d");
  const [walletProfileSource, setWalletProfileSource] =
    useState<WalletTradingProfileSourceFilter>("all");
  const [walletProfileData, setWalletProfileData] =
    useState<WalletTradingProfileResponse | null>(null);

  const walletBnbUsdEstimate = useMemo(() => {
    const bscNative = walletBalances?.evm?.chains.find((chain) =>
      isBscChainName(chain.chain),
    );
    if (!bscNative) return null;
    const nativeBalance = Number.parseFloat(bscNative.nativeBalance);
    const nativeValueUsd = Number.parseFloat(bscNative.nativeValueUsd);
    if (!Number.isFinite(nativeBalance) || nativeBalance <= 0) return null;
    if (!Number.isFinite(nativeValueUsd) || nativeValueUsd <= 0) return null;
    const estimate = nativeValueUsd / nativeBalance;
    return Number.isFinite(estimate) && estimate > 0 ? estimate : null;
  }, [walletBalances]);

  const refreshWalletTradingProfile = useCallback(async () => {
    setWalletProfileLoading(true);
    setWalletProfileError(null);
    try {
      const profile = await loadWalletTradingProfile(
        walletProfileWindow,
        walletProfileSource,
      );
      setWalletProfileData(profile);
    } catch (err) {
      setWalletProfileError(
        err instanceof Error ? err.message : t("wallet.profile.loadFailed"),
      );
    } finally {
      setWalletProfileLoading(false);
    }
  }, [loadWalletTradingProfile, t, walletProfileSource, walletProfileWindow]);

  useEffect(() => {
    if (!walletProfileOpen) return;
    void refreshWalletTradingProfile();
  }, [walletProfileOpen, refreshWalletTradingProfile]);

  // ── VRM / Background upload callbacks ──────────────────────────────
  const handleRosterVrmUpload = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".vrm")) return;
      void (async () => {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf.slice(0, 32));
        const text = new TextDecoder().decode(bytes);
        if (text.startsWith("version https://git-lfs.github.com/spec/v1")) {
          alert("This .vrm is a Git LFS pointer, not the real model file.");
          return;
        }
        if (
          bytes.length < 4 ||
          bytes[0] !== 0x67 ||
          bytes[1] !== 0x6c ||
          bytes[2] !== 0x54 ||
          bytes[3] !== 0x46
        ) {
          alert("Invalid VRM file. Please select a valid .vrm binary.");
          return;
        }
        const previousIndex = selectedVrmIndex;
        const url = URL.createObjectURL(file);
        setState("customVrmUrl", url);
        setState("selectedVrmIndex", 0);
        client
          .uploadCustomVrm(file)
          .then(() => {
            setState(
              "customVrmUrl",
              resolveApiUrl(`/api/avatar/vrm?t=${Date.now()}`),
            );
            requestAnimationFrame(() => URL.revokeObjectURL(url));
          })
          .catch(() => {
            setState("selectedVrmIndex", previousIndex);
            URL.revokeObjectURL(url);
          });
      })();
    },
    [selectedVrmIndex, setState],
  );

  const handleBgUpload = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      setState("customBackgroundUrl", url);
      if (selectedVrmIndex !== 0) setState("selectedVrmIndex", 0);
      client
        .uploadCustomBackground(file)
        .then(() => {
          setState(
            "customBackgroundUrl",
            resolveApiUrl(`/api/avatar/background?t=${Date.now()}`),
          );
          requestAnimationFrame(() => URL.revokeObjectURL(url));
        })
        .catch(() => {
          setState("customBackgroundUrl", "");
          URL.revokeObjectURL(url);
        });
    },
    [selectedVrmIndex, setState],
  );

  return {
    // Trading profile modal
    walletProfileOpen,
    setWalletProfileOpen,
    walletProfileLoading,
    walletProfileError,
    walletProfileData,
    walletBnbUsdEstimate,
    walletProfileWindow,
    setWalletProfileWindow,
    walletProfileSource,
    setWalletProfileSource,
    refreshWalletTradingProfile,
    // Upload callbacks
    handleRosterVrmUpload,
    handleBgUpload,
  };
}
