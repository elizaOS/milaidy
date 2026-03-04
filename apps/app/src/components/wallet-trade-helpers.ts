type TranslatorFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/**
 * Human-readable label for a BSC trade transaction status.
 * Provides i18n-aware labels via the supplied translator, falling back to the
 * raw status string when no translation key exists.
 */
export function getWalletTxStatusLabel(
  status: string,
  t: TranslatorFn,
): string {
  const key = `wallet.txStatus.${status}`;
  const translated = t(key);
  // If the translator returns the key itself, no translation exists — use status directly.
  return translated === key ? status : translated;
}

/**
 * Extract a user-facing error message from a caught wallet-trade error.
 * Falls back to a generic translated message keyed by `fallbackKey`.
 */
export function mapWalletTradeError(
  err: unknown,
  t: TranslatorFn,
  fallbackKey: string,
): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "string" && err.length > 0) {
    return err;
  }
  return t(fallbackKey);
}

type PreflightResult = { ok: boolean; reasons: string[] } & Record<
  string,
  unknown
>;

/**
 * Build a user-facing notice from a trade preflight result.
 */
export function buildWalletPreflightNotice(
  result: PreflightResult,
  t: TranslatorFn,
): { text: string; tone: "success" | "error" | "info" } {
  if (result.ok) {
    return { text: t("wallet.preflightPassed"), tone: "success" };
  }
  const reason =
    result.reasons.length > 0
      ? result.reasons.join(", ")
      : t("wallet.preflightFailed");
  return { text: reason, tone: "error" };
}

type PreflightCheck = { key: string; passed: boolean; label: string };

type PreflightData = { reasons: string[] } & Record<string, unknown>;

/**
 * Convert a preflight data object into an array of UI check chips.
 */
export function getWalletPreflightChecks(
  preflight: PreflightData,
  t: TranslatorFn,
): PreflightCheck[] {
  const checks: PreflightCheck[] = [];
  for (const [key, value] of Object.entries(preflight)) {
    if (key === "reasons" || key === "ok") continue;
    if (typeof value === "boolean") {
      const labelKey = `wallet.preflight.${key}`;
      const label = t(labelKey);
      checks.push({
        key,
        passed: value,
        label: label === labelKey ? key : label,
      });
    }
  }
  return checks;
}
