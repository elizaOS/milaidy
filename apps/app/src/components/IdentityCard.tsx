/**
 * IdentityCard — on-chain NFA identity status and actions.
 * Renders inside the Inventory view as a self-contained card.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  client,
  type NfaStatusResponse,
} from "../api-client";
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
    <div
      className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
      style={{
        border: `1px solid ${ok ? "var(--ok)" : "var(--danger, #f44)"}`,
        background: ok
          ? "color-mix(in srgb, var(--ok) 8%, var(--bg) 92%)"
          : "color-mix(in srgb, var(--danger, #f44) 8%, var(--bg) 92%)",
        color: ok ? "var(--ok)" : "var(--danger, #f44)",
      }}
    >
      <span className="truncate">{message}</span>
      <button
        type="button"
        className="shrink-0 opacity-60 hover:opacity-100"
        onClick={onDismiss}
      >
        x
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
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="wt__btn"
        style={{ minWidth: 32 }}
        onClick={() => setOpen((v) => !v)}
      >
        ...
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 20,
            minWidth: 160,
            border: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              className="block w-full text-left px-3 py-2 text-xs hover:bg-[var(--border)]"
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
    network === "bsc"
      ? "https://bscscan.com"
      : "https://testnet.bscscan.com";
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
    async (op: PendingOp) => {
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
            msg = `Anchored ${res.count ?? "?"} learnings. root: ${res.root?.slice(0, 14) ?? "?"}...`;
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
        setTxResult({ ok: true, message: msg });
        fetchStatus();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        setTxResult({ ok: false, message });
      }
    },
    [useWalletKey, fetchStatus],
  );

  // ── Confirm handler ─────────────────────────────────────────────────

  const handleConfirmResult = useCallback(
    (confirmed: boolean) => {
      const op = pendingOp;
      setPendingOp(null);
      if (confirmed && op) {
        executeOp(op);
      }
    },
    [pendingOp, executeOp],
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
    setPendingOp({ op: "transfer", details: [`To: ${addr}`] });
  }, []);

  const promptUpgrade = useCallback(() => {
    const addr = window.prompt("Enter new logic contract address (0x...):");
    if (!addr) return;
    if (!ADDRESS_RE.test(addr)) {
      setTxResult({ ok: false, message: "Invalid address format." });
      return;
    }
    setPendingOp({ op: "upgrade-logic", details: [`New logic: ${addr}`] });
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="wt__portfolio">
        <div className="wt__portfolio-label">On-Chain Agent Identity</div>
        <div className="text-xs text-muted">Loading...</div>
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
    <div className="wt__portfolio">
      {/* Confirm dialog */}
      {pendingOp && (
        <NfaConfirmDialog
          operation={pendingOp.op}
          details={pendingOp.details}
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
          <div className="wt__portfolio-label">On-Chain Agent Identity</div>
          <div className="text-xs text-muted" style={{ marginTop: 6 }}>
            No NFA minted yet. Mint a Non-Fungible Agent to anchor your
            identity and learnings on-chain.
          </div>
          <label
            className="flex items-center gap-2 text-xs text-muted"
            style={{ marginTop: 8, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={useWalletKey}
              onChange={(e) => setUseWalletKey(e.target.checked)}
            />
            Use wallet key as NFA owner
          </label>
          <button
            type="button"
            className="wt__btn is-buy"
            style={{ marginTop: 10, width: "100%" }}
            onClick={() => setPendingOp({ op: "mint" })}
          >
            Mint NFA
          </button>
        </>
      ) : (
        /* ── Registered state ──────────────────────────────────── */
        <>
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="wt__portfolio-label" style={{ margin: 0 }}>
              NFA #{nfa.tokenId}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] px-1.5 py-0.5"
                style={{
                  border: `1px solid ${paused ? "var(--warn)" : "var(--ok)"}`,
                  color: paused ? "var(--warn)" : "var(--ok)",
                }}
              >
                {paused ? "Paused" : "Active"}
              </span>
              {nfa.freeMint && (
                <span
                  className="text-[10px] px-1.5 py-0.5"
                  style={{
                    border: "1px solid var(--accent)",
                    color: "var(--accent)",
                  }}
                >
                  Free Mint
                </span>
              )}
            </div>
          </div>

          {/* Owner */}
          <div style={{ marginTop: 8 }}>
            <span className="text-xs text-muted">Owner: </span>
            <a
              className="wt__quote-link font-mono text-xs"
              href={explorerUrl(network, `address/${nfa.owner}`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {shortAddr(nfa.owner)}
            </a>
          </div>

          {/* ERC-8004 agent ID */}
          {identity && (
            <div style={{ marginTop: 4 }}>
              <span className="text-xs text-muted">ERC-8004 Agent: </span>
              <span className="font-mono text-xs">{identity.agentId}</span>
            </div>
          )}

          {/* Learnings summary */}
          <div className="wt__bnb-sub" style={{ marginTop: 8 }}>
            <span>
              {nfa.learningCount} learning{nfa.learningCount !== 1 ? "s" : ""}{" "}
              anchored
            </span>
            {nfa.lastAnchoredAt && (
              <span className="text-muted">
                {" "}
                &middot; last:{" "}
                {new Date(nfa.lastAnchoredAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Merkle root */}
          {nfa.learningRoot && (
            <div className="font-mono text-[10px] text-muted truncate" style={{ marginTop: 4 }}>
              root: {nfa.learningRoot}
            </div>
          )}

          {/* Wallet key toggle */}
          <label
            className="flex items-center gap-2 text-xs text-muted"
            style={{ marginTop: 8, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={useWalletKey}
              onChange={(e) => setUseWalletKey(e.target.checked)}
            />
            Use wallet key as NFA owner
          </label>

          {/* Action buttons */}
          <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="wt__btn is-buy flex-1"
              onClick={() => setPendingOp({ op: "anchor" })}
            >
              Anchor Learnings
            </button>
            <OverflowMenu
              items={[
                {
                  label: paused ? "Unpause" : "Pause",
                  onClick: () =>
                    setPendingOp({ op: paused ? "unpause" : "pause" }),
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
