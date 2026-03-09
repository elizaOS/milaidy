import type { RefObject } from "react";

import type { NfaStatusResponse } from "../api-client";

function resolveBscExplorerBase(network?: string): string {
  return network === "bsc-testnet"
    ? "https://testnet.bscscan.com"
    : "https://bscscan.com";
}

type CompanionIdentityPopoverProps = {
  panelRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  status: NfaStatusResponse | null;
  loading: boolean;
  error: string | null;
  onToggle: () => void;
};

export function CompanionIdentityPopover({
  panelRef,
  open,
  status,
  loading,
  error,
  onToggle,
}: CompanionIdentityPopoverProps) {
  return (
    <div className="anime-header-identity-shell" ref={panelRef}>
      <button
        type="button"
        className={`anime-header-pill anime-header-identity-trigger ${open ? "is-open" : ""}`}
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 10a2 2 0 1 0 4 0 2 2 0 1 0-4 0" />
          <path d="M2 12C2 6.5 6.5 2 12 2s10 4.5 10 10-4.5 10-10 10S2 17.5 2 12" />
          <path d="M7 20.7a7 7 0 0 1 10 0" />
        </svg>
        <span className="anime-header-pill-text">ID</span>
        <svg
          className={`anime-header-wallet-caret ${open ? "is-open" : ""}`}
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div
        className={`anime-identity-popover ${open ? "is-open" : ""}`}
        role="dialog"
        aria-label="On-chain Identity"
      >
        <div className="anime-identity-popover-head">
          <div className="anime-identity-popover-title">On-Chain Identity</div>
          <div className="anime-identity-popover-sub">
            {status?.nfa
              ? `NFA #${status.nfa.tokenId}`
              : status?.identity
                ? `Agent ${status.identity.agentId}`
                : "Not registered"}
          </div>
        </div>

        {loading && <div className="anime-identity-loading">Loading...</div>}

        {error && <div className="anime-identity-error">{error}</div>}

        {!loading && !status?.identity && !status?.nfa && (
          <div className="anime-identity-empty">
            No on-chain identity registered.
            <br />
            Use chat to <strong>register milady on bnb chain</strong> or{" "}
            <strong>mint nfa</strong>.
          </div>
        )}

        {status?.identity && (
          <div className="anime-identity-section">
            <div className="anime-identity-section-title">
              ERC-8004 Agent Registry
            </div>
            <div className="anime-identity-row">
              <span>Agent ID</span>
              <code>{status.identity.agentId}</code>
            </div>
            <div className="anime-identity-row">
              <span>Network</span>
              <span>{status.identity.network}</span>
            </div>
            <div className="anime-identity-row">
              <span>Owner</span>
              <a
                href={`${resolveBscExplorerBase(status.identity.network)}/address/${status.identity.ownerAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="anime-identity-link"
              >
                {`${status.identity.ownerAddress.slice(0, 6)}...${status.identity.ownerAddress.slice(-4)}`}
              </a>
            </div>
            <div className="anime-identity-row">
              <span>Registered</span>
              <span>
                {new Date(status.identity.registeredAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}

        {status?.nfa && (
          <div className="anime-identity-section">
            <div className="anime-identity-section-title">
              BAP-578 NFA
              <span
                className={`anime-identity-badge ${status.onChain?.active !== false ? "is-active" : "is-paused"}`}
              >
                {status.onChain?.active !== false ? "Active" : "Paused"}
              </span>
              {status.nfa.freeMint && (
                <span className="anime-identity-badge is-free">Free Mint</span>
              )}
            </div>
            <div className="anime-identity-row">
              <span>Token ID</span>
              {status.contractAddress ? (
                <a
                  href={`${resolveBscExplorerBase(status.nfa.network)}/token/${status.contractAddress}?a=${status.nfa.tokenId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="anime-identity-link"
                >
                  #{status.nfa.tokenId}
                </a>
              ) : (
                <span>#{status.nfa.tokenId}</span>
              )}
            </div>
            <div className="anime-identity-row">
              <span>Owner</span>
              <a
                href={`${resolveBscExplorerBase(status.nfa.network)}/address/${status.nfa.owner}`}
                target="_blank"
                rel="noopener noreferrer"
                className="anime-identity-link"
              >
                {`${status.nfa.owner.slice(0, 6)}...${status.nfa.owner.slice(-4)}`}
              </a>
            </div>
            <div className="anime-identity-row">
              <span>Network</span>
              <span>{status.nfa.network}</span>
            </div>
            {status.nfa.logicContract && (
              <div className="anime-identity-row">
                <span>Logic</span>
                <a
                  href={`${resolveBscExplorerBase(status.nfa.network)}/address/${status.nfa.logicContract}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="anime-identity-link"
                >
                  {`${status.nfa.logicContract.slice(0, 6)}...${status.nfa.logicContract.slice(-4)}`}
                </a>
              </div>
            )}
          </div>
        )}

        {status?.nfa && (
          <div className="anime-identity-section">
            <div className="anime-identity-section-title">Learning History</div>
            <div className="anime-identity-row">
              <span>Entries</span>
              <span>{status.nfa.learningCount}</span>
            </div>
            <div className="anime-identity-row">
              <span>Merkle Root</span>
              <code title={status.nfa.learningRoot}>
                {status.nfa.learningRoot
                  ? `${status.nfa.learningRoot.slice(0, 10)}...${status.nfa.learningRoot.slice(-6)}`
                  : "—"}
              </code>
            </div>
            <div className="anime-identity-row">
              <span>Last Anchored</span>
              <span>
                {status.nfa.lastAnchoredAt
                  ? new Date(status.nfa.lastAnchoredAt).toLocaleDateString()
                  : "Never"}
              </span>
            </div>
          </div>
        )}

        {status?.onChain?.metadata && (
          <div className="anime-identity-section">
            <div className="anime-identity-section-title">
              On-Chain Metadata
            </div>
            {status.onChain.metadata.persona && (
              <div className="anime-identity-row">
                <span>Persona</span>
                <span>{status.onChain.metadata.persona}</span>
              </div>
            )}
            {status.onChain.metadata.experience && (
              <div className="anime-identity-row">
                <span>Experience</span>
                <span>{status.onChain.metadata.experience}</span>
              </div>
            )}
            {status.onChain.metadata.vaultHash && (
              <div className="anime-identity-row">
                <span>Vault Hash</span>
                <code title={status.onChain.metadata.vaultHash}>
                  {`${status.onChain.metadata.vaultHash.slice(0, 10)}...`}
                </code>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
