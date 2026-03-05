import { useCallback, useMemo, useState } from "react";
import type {
  BscTransferExecuteRequest,
  BscTransferExecuteResponse,
  EvmChainBalance,
} from "../../api-client";
import {
  BSC_USDC_TOKEN_ADDRESS,
  BSC_USDT_TOKEN_ADDRESS,
  HEX_ADDRESS_RE,
  mapWalletTradeError,
  type TranslatorFn,
} from "./walletUtils";

export type UseWalletSendStateArgs = {
  evmAddress: string | null;
  bscChain: EvmChainBalance | null;
  loadBalances: () => Promise<void>;
  executeBscTransfer: (
    request: BscTransferExecuteRequest,
  ) => Promise<BscTransferExecuteResponse>;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
  t: TranslatorFn;
};

export function useWalletSendState(args: UseWalletSendStateArgs) {
  const {
    evmAddress,
    bscChain,
    loadBalances,
    executeBscTransfer,
    setActionNotice,
    t,
  } = args;

  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendAsset, setSendAsset] = useState("BNB");
  const [sendExecuteBusy, setSendExecuteBusy] = useState(false);
  const [sendLastTxHash, setSendLastTxHash] = useState<string | null>(null);
  const [sendUserSignTx, setSendUserSignTx] = useState<string | null>(null);

  const sendToValid = HEX_ADDRESS_RE.test(sendTo.trim());
  const sendAmountNum = Number.parseFloat(sendAmount);
  const sendAmountValid = Number.isFinite(sendAmountNum) && sendAmountNum > 0;
  const sendReady = Boolean(evmAddress && sendToValid && sendAmountValid);

  const sendAssetTokenAddress = useMemo(() => {
    const normalizedAsset = sendAsset.trim().toUpperCase();
    if (normalizedAsset === "BNB") return null;
    const fromWallet = (bscChain?.tokens ?? []).find(
      (token) => token.symbol.trim().toUpperCase() === normalizedAsset,
    );
    if (
      fromWallet?.contractAddress &&
      HEX_ADDRESS_RE.test(fromWallet.contractAddress.trim())
    ) {
      return fromWallet.contractAddress.trim();
    }
    if (normalizedAsset === "USDT") return BSC_USDT_TOKEN_ADDRESS;
    if (normalizedAsset === "USDC") return BSC_USDC_TOKEN_ADDRESS;
    return null;
  }, [bscChain, sendAsset]);

  const handleSendExecute = useCallback(async () => {
    if (!sendReady || !evmAddress) {
      setActionNotice(t("wallet.enterValidDestinationAmount"), "error", 2600);
      return;
    }

    const normalizedAsset = sendAsset.trim().toUpperCase();
    if (normalizedAsset !== "BNB" && !sendAssetTokenAddress) {
      setActionNotice(
        t("wallet.noTokenContractForAsset", { asset: normalizedAsset }),
        "error",
        3200,
      );
      return;
    }

    setSendExecuteBusy(true);
    setSendLastTxHash(null);
    setSendUserSignTx(null);

    try {
      const result = await executeBscTransfer({
        toAddress: sendTo.trim(),
        amount: sendAmount.trim(),
        assetSymbol: normalizedAsset,
        ...(sendAssetTokenAddress
          ? { tokenAddress: sendAssetTokenAddress }
          : {}),
        confirm: true,
      });

      if (result.requiresUserSignature) {
        setSendUserSignTx(JSON.stringify(result.unsignedTx, null, 2));
        setActionNotice(t("wallet.userSignPayloadReady"), "info", 4200);
        return;
      }

      if (result.execution?.hash) {
        setSendLastTxHash(result.execution.hash);
        setActionNotice(t("wallet.transferSubmitted"), "success", 3200);
        await loadBalances();
        return;
      }

      setActionNotice(
        t("wallet.transferExecutionDidNotComplete"),
        "error",
        3200,
      );
    } catch (err) {
      setActionNotice(
        mapWalletTradeError(err, t, "wallet.transferExecutionFailed"),
        "error",
        4200,
      );
    } finally {
      setSendExecuteBusy(false);
    }
  }, [
    evmAddress,
    executeBscTransfer,
    loadBalances,
    sendAmount,
    sendAsset,
    sendAssetTokenAddress,
    sendReady,
    sendTo,
    setActionNotice,
    t,
  ]);

  /** Reset send flow state -- called on mount and mode changes. */
  const resetSendFlow = useCallback(() => {
    setSendLastTxHash(null);
    setSendUserSignTx(null);
  }, []);

  return {
    sendTo,
    setSendTo,
    sendAmount,
    setSendAmount,
    sendAsset,
    setSendAsset,
    sendExecuteBusy,
    sendLastTxHash,
    sendUserSignTx,
    sendReady,
    handleSendExecute,
    resetSendFlow,
  };
}
