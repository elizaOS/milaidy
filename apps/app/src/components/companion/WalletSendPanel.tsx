import { shortHash, type TranslatorFn } from "./walletUtils";

type WalletSendPanelProps = {
  sendTo: string;
  setSendTo: (value: string) => void;
  sendAmount: string;
  setSendAmount: (value: string) => void;
  sendAsset: string;
  setSendAsset: (value: string) => void;
  sendReady: boolean;
  sendExecuteBusy: boolean;
  sendLastTxHash: string | null;
  sendUserSignTx: string | null;
  handleSendExecute: () => Promise<void>;
  handleCopyUserSignPayload: (payload: string) => Promise<void>;
  t: TranslatorFn;
};

export function WalletSendPanel({
  sendTo,
  setSendTo,
  sendAmount,
  setSendAmount,
  sendAsset,
  setSendAsset,
  sendReady,
  sendExecuteBusy,
  sendLastTxHash,
  sendUserSignTx,
  handleSendExecute,
  handleCopyUserSignPayload,
  t,
}: WalletSendPanelProps) {
  return (
    <div className="anime-wallet-action-body">
      <label className="anime-wallet-field">
        <span>{t("wallet.toAddressBsc")}</span>
        <input
          type="text"
          value={sendTo}
          onChange={(event) => setSendTo(event.target.value)}
          placeholder={t("walletsendpanel.0x")}
        />
      </label>
      <div className="anime-wallet-field-grid">
        <label className="anime-wallet-field">
          <span>{t("wallet.amount")}</span>
          <input
            type="text"
            value={sendAmount}
            onChange={(event) => setSendAmount(event.target.value)}
            placeholder="0.01"
          />
        </label>
        <label className="anime-wallet-field">
          <span>{t("wallet.asset")}</span>
          <select
            value={sendAsset}
            onChange={(event) => setSendAsset(event.target.value)}
          >
            <option value="BNB">{t("walletsendpanel.BNB")}</option>
            <option value="USDT">{t("walletsendpanel.USDT")}</option>
            <option value="USDC">{t("walletsendpanel.USDC")}</option>
          </select>
        </label>
      </div>
      <div className="anime-wallet-send-hint">{t("wallet.sendHint")}</div>
      <div className="anime-wallet-popover-actions">
        <button
          type="button"
          className="anime-wallet-popover-action"
          disabled={!sendReady || sendExecuteBusy}
          onClick={() => {
            void handleSendExecute();
          }}
        >
          {sendExecuteBusy ? t("wallet.executing") : t("wallet.executeSend")}
        </button>
      </div>

      {sendUserSignTx && (
        <div className="anime-wallet-usersign">
          <div className="anime-wallet-usersign-title">
            {t("wallet.userSignSendPayload")}
          </div>
          <div className="anime-wallet-usersign-actions">
            <button
              type="button"
              className="anime-wallet-address-copy"
              onClick={() => {
                void handleCopyUserSignPayload(sendUserSignTx);
              }}
            >
              {t("wallet.copySendPayload")}
            </button>
          </div>
        </div>
      )}

      {sendLastTxHash && (
        <div className="anime-wallet-tx-row">
          <span>{t("wallet.latestTx")}</span>
          <code>{shortHash(sendLastTxHash)}</code>
          <a
            href={`https://bscscan.com/tx/${sendLastTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="anime-wallet-tx-link"
          >
            {t("wallet.view")}
          </a>
        </div>
      )}
    </div>
  );
}
