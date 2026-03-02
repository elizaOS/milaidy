import type { BscTradePreflightResponse, BscTradeTxStatusResponse } from "../api-client";
import type { TranslationVars } from "../i18n";

type NoticeTone = "info" | "success" | "error";
type TranslateFn = (key: string, vars?: TranslationVars) => string;

export interface WalletPreflightCheckItem {
  key: keyof BscTradePreflightResponse["checks"];
  label: string;
  passed: boolean;
}

const PRECHECK_LABEL_KEY: Record<keyof BscTradePreflightResponse["checks"], string> = {
  walletReady: "wallet.preflightCheck.wallet",
  rpcReady: "wallet.preflightCheck.rpc",
  chainReady: "wallet.preflightCheck.chain",
  gasReady: "wallet.preflightCheck.gas",
  tokenAddressValid: "wallet.preflightCheck.token",
};

function includesAny(input: string, patterns: string[]): boolean {
  return patterns.some((pattern) => input.includes(pattern));
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && typeof err.message === "string") return err.message;
  if (typeof err === "string") return err;
  return "";
}

function stripServerPrefix(message: string): string {
  return message
    .replace(/^trade preflight failed:\s*/i, "")
    .replace(/^trade quote failed:\s*/i, "")
    .replace(/^trade execution failed:\s*/i, "")
    .replace(/^transfer execution failed:\s*/i, "")
    .trim();
}

export function mapWalletTradeError(
  err: unknown,
  t: TranslateFn,
  fallbackKey: string,
): string {
  const raw = extractErrorMessage(err).trim();
  if (!raw) return t(fallbackKey);

  const stripped = stripServerPrefix(raw);
  const lower = stripped.toLowerCase();

  if (includesAny(lower, ["confirm=true is required"])) {
    return t("wallet.error.confirmRequired");
  }
  if (includesAny(lower, ["insufficient funds", "insufficient bnb gas", "exceeds safety cap"])) {
    return t("wallet.error.insufficientFunds");
  }
  if (includesAny(lower, ["nonce too low", "replacement transaction underpriced", "already known"])) {
    return t("wallet.error.nonceConflict");
  }
  if (includesAny(lower, ["slippage", "insufficient output amount", "insufficient_output_amount"])) {
    return t("wallet.error.slippage");
  }
  if (includesAny(lower, ["execution reverted", "reverted"])) {
    return t("wallet.error.reverted");
  }
  if (
    includesAny(lower, [
      "user rejected",
      "user denied",
      "rejected the request",
      "transaction was rejected",
      "denied transaction",
    ])
  ) {
    return t("wallet.error.rejected");
  }
  if (includesAny(lower, ["timeout", "timed out", "aborterror", "aborted"])) {
    return t("wallet.error.timeout");
  }
  if (
    includesAny(lower, [
      "rpc unavailable",
      "no managed bsc rpc",
      "failed to fetch",
      "network error",
      "429",
      "503",
      "gateway",
      "econn",
    ])
  ) {
    return t("wallet.error.network");
  }

  return stripped || t(fallbackKey);
}

export function getWalletPreflightChecks(
  preflight: BscTradePreflightResponse,
  t: TranslateFn,
): WalletPreflightCheckItem[] {
  return (Object.keys(preflight.checks) as Array<keyof BscTradePreflightResponse["checks"]>).map(
    (key) => ({
      key,
      label: t(PRECHECK_LABEL_KEY[key]),
      passed: Boolean(preflight.checks[key]),
    }),
  );
}

export function buildWalletPreflightNotice(
  preflight: BscTradePreflightResponse,
  t: TranslateFn,
): { text: string; tone: NoticeTone } {
  if (preflight.ok) {
    return {
      text: t("wallet.preflightPassedAll"),
      tone: "success",
    };
  }

  const reasons = preflight.reasons.filter((reason) => reason.trim().length > 0);
  if (reasons.length === 0) {
    return { text: t("wallet.preflightFailed"), tone: "error" };
  }
  if (reasons.length === 1) {
    return { text: reasons[0], tone: "error" };
  }
  return {
    text: t("wallet.preflightFailedWithMore", {
      reason: reasons[0],
      count: reasons.length - 1,
    }),
    tone: "error",
  };
}

export function getWalletTxStatusLabel(
  status: BscTradeTxStatusResponse["status"],
  t: TranslateFn,
): string {
  if (status === "success") return t("wallet.txStatus.success");
  if (status === "reverted") return t("wallet.txStatus.reverted");
  if (status === "not_found") return t("wallet.txStatus.notFound");
  return t("wallet.txStatus.pending");
}
