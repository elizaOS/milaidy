/**
 * IdentityCard — on-chain NFA identity status and actions.
 * Renders inside the wallet popover using anime-wallet-identity-* CSS classes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { client, type NfaStatusResponse } from "../api-client";
import { NfaConfirmDialog, type NfaOperation } from "./NfaConfirmDialog";

// ---------------------------------------------------------------------------
// Helper: TxResultBanner
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helper: OverflowMenu
// ---------------------------------------------------------------------------

function OverflowMenu({
  items,
}: {
  items: { label: string; onClick: () => void; hidden?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="anime-wallet-identity-btn"
        style={{ padding: "7px 10px", flex: "none" }}
        onClick={() => setOpen(!open)}
      >
        ···
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: "calc(100% + 4px)",
            minWidth: 120,
            background:
              "linear-gradient(165deg, rgba(17, 23, 34, 0.98), rgba(7, 10, 18, 0.98))",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            borderRadius: 8,
            boxShadow: "0 12px 28px rgba(0,0,0,0.5)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 10px",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase" as const,
                color: "rgba(241, 244, 252, 0.85)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.background =
                  "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.background = "none";
              }}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Explorer URL helper
// ---------------------------------------------------------------------------

function explorerUrl(network: string, path: string): string {
  const base =
    network === "bsc" ? "https://bscscan.com" : "https://testnet.bscscan.com";
  return `${base}/${path}`;
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// IdentityCard
// ---------------------------------------------------------------------------

interface PendingOp {
  op: NfaOperation;
  details?: string[];
}

export function IdentityCard() {
  const [status, setStatus] = useState<NfaStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [useWalletKey, setUseWalletKey] = useState(true);
  const [pendingOp, setPendingOp] = useState<PendingOp | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // ── Fetch status ────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res = await client.getNfaStatus();
      setStatus(res);
    } catch {
      // silently ignore — card just stays in loading/empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ── Execute confirmed operation ─────────────────────────────────────

  const executeOp = useCallback(
    async (op: PendingOp): Promise<{ ok: boolean; message: string }> => {
      try {
        let msg = "";
        switch (op.op) {
          case "mint": {
            const res = await client.mintNfa({ useWalletKey });
            if (!res.success) throw new Error(res.error || "Mint failed");
            msg = `NFA minted! tx: ${res.txHash ?? "pending"}`;
            break;
          }
          case "anchor": {
            const res = await client.anchorLearnings({ useWalletKey });
            if (!res.success) throw new Error(res.error || "Anchor failed");
            msg = `Learnings anchored. tx: ${res.txHash ?? "pending"}`;
            break;
          }
          case "transfer": {
            const to = op.details?.[0]?.replace("To: ", "") ?? "";
            const res = await client.transferNfa({ to, useWalletKey });
            if (!res.success) throw new Error(res.error || "Transfer failed");
            msg = `NFA transferred. tx: ${res.txHash ?? "pending"}`;
            break;
          }
          case "upgrade-logic": {
            const addr = op.details?.[0]?.replace("New logic: ", "") ?? "";
            const res = await client.upgradeNfaLogic({
              logicAddress: addr,
              useWalletKey,
            });
            if (!res.success) throw new Error(res.error || "Upgrade failed");
            msg = `Logic upgraded. tx: ${res.txHash ?? "pending"}`;
            break;
          }
          case "pause":
          case "unpause": {
            const res = await client.toggleNfaPause({ useWalletKey });
            if (!res.success) throw new Error(res.error || "Toggle failed");
            msg = res.paused ? "NFA paused." : "NFA unpaused.";
            break;
          }
        }
        await fetchStatus();
        return { ok: true, message: msg };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { ok: false, message };
      }
    },
    [useWalletKey, fetchStatus],
  );

  // ── Confirm handler ─────────────────────────────────────────────────

  const handleConfirmResult = useCallback(
    async (confirmed: boolean) => {
      const op = pendingOp;
      if (!confirmed) {
        setPendingOp(null);
        setConfirmError(null);
        return;
      }
      if (!op || confirmBusy) {
        return;
      }

      setConfirmBusy(true);
      setConfirmError(null);
      const result = await executeOp(op);
      setTxResult(result);
      if (result.ok) {
        setPendingOp(null);
      } else {
        // Keep dialog open so errors are visible without switching views.
        setConfirmError(result.message);
      }
      setConfirmBusy(false);
    },
    [pendingOp, confirmBusy, executeOp],
  );

  // ── Prompt helpers (Transfer / Upgrade) ─────────────────────────────

  const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

  const promptTransfer = useCallback(() => {
    const addr = window.prompt("Enter recipient address (0x...):");
    if (!addr) return;
    if (!ADDRESS_RE.test(addr)) {
      setTxResult({ ok: false, message: "Invalid address format." });
      return;
    }
    setConfirmError(null);
    setPendingOp({ op: "transfer", details: [`To: ${addr}`] });
  }, []);

  const promptUpgrade = useCallback(() => {
    const addr = window.prompt("Enter new logic contract address (0x...):");
    if (!addr) return;
    if (!ADDRESS_RE.test(addr)) {
      setTxResult({ ok: false, message: "Invalid address format." });
      return;
    }
    setConfirmError(null);
    setPendingOp({ op: "upgrade-logic", details: [`New logic: ${addr}`] });
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

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
      {/* Confirm dialog */}
      {pendingOp && (
        <NfaConfirmDialog
          operation={pendingOp.op}
          details={pendingOp.details}
          busy={confirmBusy}
          errorMessage={confirmError}
          onResult={handleConfirmResult}
        />
      )}

      {/* Tx result banner */}
      {txResult && (
        <TxResultBanner
          ok={txResult.ok}
          message={txResult.message}
          onDismiss={() => setTxResult(null)}
        />
      )}

      {!isRegistered ? (
        /* ── Unregistered state ────────────────────────────────── */
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
              onChange={(e) => setUseWalletKey(e.target.checked)}
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
        /* ── Registered state ──────────────────────────────────── */
        <>
          {/* Header row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div className="anime-wallet-identity-title">
              NFA #{nfa.tokenId}
            </div>
            <div className="anime-wallet-identity-badges">
              <span
                className={`anime-wallet-identity-badge ${paused ? "is-paused" : "is-active"}`}
              >
                {paused ? "Paused" : "Active"}
              </span>
              {nfa.freeMint && (
                <span className="anime-wallet-identity-badge is-free">
                  Free Mint
                </span>
              )}
            </div>
          </div>

          {/* Owner */}
          <div className="anime-wallet-identity-row" style={{ marginTop: 6 }}>
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

          {/* ERC-8004 agent ID */}
          {identity && (
            <div className="anime-wallet-identity-row">
              <span className="anime-wallet-identity-row-label">ERC-8004</span>
              <span className="anime-wallet-identity-row-value">
                {identity.agentId}
              </span>
            </div>
          )}

          {/* Learnings summary */}
          <div className="anime-wallet-identity-learning">
            {nfa.learningCount} learning{nfa.learningCount !== 1 ? "s" : ""}{" "}
            anchored
            {nfa.lastAnchoredAt && (
              <span>
                {" "}
                · last: {new Date(nfa.lastAnchoredAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Merkle root */}
          {nfa.learningRoot && (
            <div className="anime-wallet-identity-root">
              root: {nfa.learningRoot}
            </div>
          )}

          {/* Action buttons */}
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
            <OverflowMenu
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
                  onClick: promptTransfer,
                },
                {
                  label: "Upgrade Logic",
                  onClick: promptUpgrade,
                },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
