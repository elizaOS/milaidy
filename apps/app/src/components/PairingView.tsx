/**
 * Pairing view component — simple pairing screen for authentication.
 */

import { useApp } from "../AppContext.js";
import { createTranslator } from "../i18n";

export function PairingView() {
  const {
    pairingEnabled,
    pairingExpiresAt,
    pairingCodeInput,
    pairingError,
    pairingBusy,
    uiLanguage,
    handlePairingSubmit,
    setState,
  } = useApp();
  const t = createTranslator(uiLanguage);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState("pairingCodeInput", e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handlePairingSubmit();
  };

  const formatExpiry = (timestamp: number | null): string => {
    if (!timestamp) return "";
    const now = Date.now();
    const diff = timestamp - now;
    if (diff <= 0) return t("pairing.expired");
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    if (minutes >= 1) {
      return t("pairing.codeValidFor", { minutes, seconds });
    }
    return t("pairing.expiresIn", { seconds });
  };

  return (
    <div className="max-w-[560px] mx-auto mt-15 p-6 border border-border bg-card rounded-[10px]">
      <h1 className="text-lg font-semibold mb-2 text-txt-strong">{t("pairing.title")}</h1>
      <p className="text-muted mb-4 leading-relaxed">{t("pairing.description")}</p>

      {pairingEnabled ? (
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="pairing-code" className="text-sm text-txt-strong block mb-2">
              {t("pairing.codeLabel")}
            </label>
            <input
              id="pairing-code"
              type="text"
              value={pairingCodeInput}
              onChange={handleCodeChange}
              placeholder={t("pairing.codePlaceholder")}
              disabled={pairingBusy}
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-bg-muted text-txt text-sm focus:border-accent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="mt-1 text-[11px] text-muted">{t("pairing.tip")}</p>
          </div>

          <div className="mt-3 flex gap-2.5">
            <button
              type="submit"
              className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={pairingBusy || !pairingCodeInput.trim()}
            >
              {pairingBusy ? t("pairing.submitting") : t("pairing.submit")}
            </button>
          </div>

          {pairingError && (
            <>
              <p className="mt-2.5 text-danger text-[13px]">{pairingError}</p>
              <p className="mt-1.5 text-[12px] text-muted">
                {t("pairing.checkTerminal")}
              </p>
            </>
          )}

          {pairingExpiresAt && (
            <p className="mt-2.5 text-muted text-[13px]">{formatExpiry(pairingExpiresAt)}</p>
          )}
        </form>
      ) : (
        <p className="text-muted">{t("pairing.notEnabled")}</p>
      )}
    </div>
  );
}
