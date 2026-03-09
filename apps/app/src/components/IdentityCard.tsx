/**
 * IdentityCard — on-chain NFA identity status and actions.
 * Renders inside the wallet popover using anime-wallet-identity-* CSS classes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { client } from "../api-client";
import { IdentityOverflowMenu } from "./IdentityOverflowMenu";
import { NfaConfirmDialog, type NfaOperation } from "./NfaConfirmDialog";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function TxResultBanner({
  ok,
  message,
  onDismiss,
}: {
  ok: boolean;
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className={`anime-wallet-identity-tx ${ok ? "is-ok" : "is-error"}`}>
      <span className="anime-wallet-identity-tx-message">{message}</span>
      <button type="button" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}

function explorerUrl(network: string, path: string): string {
  const base =
    network === "bsc" ? "https://bscscan.com" : "https://testnet.bscscan.com";
  return `${base}/${path}`;
}

function shortAddr(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface PendingOp {
  op: NfaOperation;
  details?: string[];
  inputLabel?: string;
  inputPlaceholder?: string;
  inputValue?: string;
}

function getPendingOpInputValue(operation: PendingOp): string {
  return operation.inputValue?.trim() ?? "";
}

function getPendingOpInputError(operation: PendingOp | null): string | null {
  if (!operation?.inputLabel) return null;
  const inputValue = getPendingOpInputValue(operation);
  if (!inputValue) {
    return `${operation.inputLabel} is required.`;
  }
  if (!ADDRESS_RE.test(inputValue)) {
    return "Enter a valid 0x address.";
  }
  return null;
}

export function IdentityCard() {
  const app = useApp();
  const nfaStatus = app.nfaStatus;
  const nfaStatusLoading = app.nfaStatusLoading;
  const nfaStatusError = app.nfaStatusError;
  const loadNfaStatus = app.loadNfaStatus;
  const initialStatusRequestedRef = useRef(false);
  const [useWalletKey, setUseWalletKey] = useState(true);
  const [pendingOp, setPendingOp] = useState<PendingOp | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (initialStatusRequestedRef.current || nfaStatus || nfaStatusLoading) {
      return;
    }
    initialStatusRequestedRef.current = true;
    void loadNfaStatus();
  }, [loadNfaStatus, nfaStatus, nfaStatusLoading]);

  const executeOp = useCallback(
    async (operation: PendingOp): Promise<{ ok: boolean; message: string }> => {
      try {
        let message = "";
        switch (operation.op) {
          case "mint": {
            const response = await client.mintNfa({ useWalletKey });
            if (!response.success) {
              throw new Error(response.error || "Mint failed");
            }
            message = `NFA minted! tx: ${response.txHash ?? "pending"}`;
            break;
          }
          case "anchor": {
            const response = await client.anchorLearnings({ useWalletKey });
            if (!response.success) {
              throw new Error(response.error || "Anchor failed");
            }
            message = `Learnings anchored. tx: ${response.txHash ?? "pending"}`;
            break;
          }
          case "transfer": {
            const response = await client.transferNfa({
              to: getPendingOpInputValue(operation),
              useWalletKey,
            });
            if (!response.success) {
              throw new Error(response.error || "Transfer failed");
            }
            message = `NFA transferred. tx: ${response.txHash ?? "pending"}`;
            break;
          }
          case "upgrade-logic": {
            const response = await client.upgradeNfaLogic({
              newLogicAddress: getPendingOpInputValue(operation),
              useWalletKey,
            });
            if (!response.success) {
              throw new Error(response.error || "Upgrade failed");
            }
            message = `Logic upgraded. tx: ${response.txHash ?? "pending"}`;
            break;
          }
          case "pause":
          case "unpause": {
            const response = await client.toggleNfaPause({ useWalletKey });
            if (!response.success) {
              throw new Error(response.error || "Toggle failed");
            }
            message = response.paused ? "NFA paused." : "NFA unpaused.";
            break;
          }
        }
        await loadNfaStatus();
        return { ok: true, message };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return { ok: false, message };
      }
    },
    [loadNfaStatus, useWalletKey],
  );

  const handleConfirmResult = useCallback(
    async (confirmed: boolean) => {
      const operation = pendingOp;
      if (!confirmed) {
        setPendingOp(null);
        setConfirmError(null);
        return;
      }
      if (!operation || confirmBusy) {
        return;
      }

      const inputError = getPendingOpInputError(operation);
      if (inputError) {
        setConfirmError(inputError);
        return;
      }

      setConfirmBusy(true);
      setConfirmError(null);
      const result = await executeOp(operation);
      setTxResult(result);
      if (result.ok) {
        setPendingOp(null);
      } else {
        setConfirmError(result.message);
      }
      setConfirmBusy(false);
    },
    [confirmBusy, executeOp, pendingOp],
  );

  const handlePendingInputChange = useCallback((value: string) => {
    setConfirmError(null);
    setPendingOp((current) =>
      current
        ? {
            ...current,
            inputValue: value,
          }
        : current,
    );
  }, []);

  const openTransferDialog = useCallback(() => {
    setConfirmError(null);
    setPendingOp({
      op: "transfer",
      details: ["Transfer ownership of this NFA to another wallet."],
      inputLabel: "Recipient address",
      inputPlaceholder: "0x...",
      inputValue: "",
    });
  }, []);

  const openUpgradeDialog = useCallback(() => {
    setConfirmError(null);
    setPendingOp({
      op: "upgrade-logic",
      details: ["Point this NFA at a new logic contract."],
      inputLabel: "New logic contract",
      inputPlaceholder: "0x...",
      inputValue: "",
    });
  }, []);

  const status = nfaStatus;
  const loading = nfaStatusLoading && !status;
  const loadError = !status ? nfaStatusError : null;

  if (loading) {
    return (
      <div className="anime-wallet-identity">
        <div className="anime-wallet-identity-title">
          On-Chain Agent Identity
        </div>
        <div className="anime-wallet-identity-desc">Loading...</div>
      </div>
    );
  }

  const nfa = status?.nfa ?? null;
  const onChain = status?.onChain ?? null;
  const identity = status?.identity ?? null;
  const isRegistered = nfa !== null;
  const network = nfa?.network ?? identity?.network ?? "bsc";
  const paused = nfa?.paused ?? !(onChain?.active ?? true);

  return (
    <div className="anime-wallet-identity">
      {pendingOp && (
        <NfaConfirmDialog
          operation={pendingOp.op}
          details={pendingOp.details}
          inputLabel={pendingOp.inputLabel}
          inputValue={pendingOp.inputValue}
          inputPlaceholder={pendingOp.inputPlaceholder}
          inputError={confirmError}
          onInputChange={
            pendingOp.inputLabel ? handlePendingInputChange : undefined
          }
          busy={confirmBusy}
          errorMessage={pendingOp.inputLabel ? null : confirmError}
          onResult={handleConfirmResult}
        />
      )}

      {txResult ? (
        <TxResultBanner
          ok={txResult.ok}
          message={txResult.message}
          onDismiss={() => setTxResult(null)}
        />
      ) : null}

      {loadError ? (
        <>
          <div className="anime-wallet-identity-title">
            On-Chain Agent Identity
          </div>
          <div className="anime-wallet-identity-desc" role="alert">
            {loadError}
          </div>
          <div className="anime-wallet-identity-actions">
            <button
              type="button"
              className="anime-wallet-identity-btn"
              onClick={() => void loadNfaStatus()}
            >
              Retry
            </button>
          </div>
        </>
      ) : !isRegistered ? (
        <>
          <div className="anime-wallet-identity-title">
            On-Chain Agent Identity
          </div>
          <div className="anime-wallet-identity-desc">
            No NFA minted yet. Mint a Non-Fungible Agent to anchor your identity
            and learnings on-chain.
          </div>
          <label className="anime-wallet-identity-toggle">
            <input
              type="checkbox"
              checked={useWalletKey}
              onChange={(event) => setUseWalletKey(event.target.checked)}
            />
            Use wallet key as NFA owner
          </label>
          <div className="anime-wallet-identity-actions">
            <button
              type="button"
              className="anime-wallet-identity-btn is-primary"
              onClick={() => {
                setConfirmError(null);
                setPendingOp({ op: "mint" });
              }}
            >
              Mint NFA
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="anime-wallet-identity-header">
            <div className="anime-wallet-identity-title">
              NFA #{nfa.tokenId}
            </div>
            <div className="anime-wallet-identity-badges">
              <span
                className={`anime-wallet-identity-badge ${paused ? "is-paused" : "is-active"}`}
              >
                {paused ? "Paused" : "Active"}
              </span>
              {nfa.freeMint ? (
                <span className="anime-wallet-identity-badge is-free">
                  Free Mint
                </span>
              ) : null}
            </div>
          </div>

          <div className="anime-wallet-identity-row anime-wallet-identity-row-first">
            <span className="anime-wallet-identity-row-label">Owner</span>
            <span className="anime-wallet-identity-row-value">
              <a
                href={explorerUrl(network, `address/${nfa.owner}`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortAddr(nfa.owner)}
              </a>
            </span>
          </div>

          {identity ? (
            <div className="anime-wallet-identity-row">
              <span className="anime-wallet-identity-row-label">ERC-8004</span>
              <span className="anime-wallet-identity-row-value">
                {identity.agentId}
              </span>
            </div>
          ) : null}

          <div className="anime-wallet-identity-learning">
            {nfa.learningCount} learning{nfa.learningCount !== 1 ? "s" : ""}{" "}
            anchored
            {nfa.lastAnchoredAt ? (
              <span>
                {" "}
                · last: {new Date(nfa.lastAnchoredAt).toLocaleDateString()}
              </span>
            ) : null}
          </div>

          {nfa.learningRoot ? (
            <div className="anime-wallet-identity-root">
              root: {nfa.learningRoot}
            </div>
          ) : null}

          <div className="anime-wallet-identity-actions">
            <button
              type="button"
              className="anime-wallet-identity-btn is-primary"
              onClick={() => {
                setConfirmError(null);
                setPendingOp({ op: "anchor" });
              }}
            >
              Anchor Learnings
            </button>
            <IdentityOverflowMenu
              items={[
                {
                  label: paused ? "Unpause" : "Pause",
                  onClick: () => {
                    setConfirmError(null);
                    setPendingOp({ op: paused ? "unpause" : "pause" });
                  },
                },
                {
                  label: "Transfer",
                  hidden: nfa.freeMint,
                  onClick: openTransferDialog,
                },
                {
                  label: "Upgrade Logic",
                  onClick: openUpgradeDialog,
                },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
