/**
 * IdentityView — ERC-8004 + BAP-578 NFA on-chain identity tab.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { useApp } from "../AppContext";

const BSCSCAN = "https://bscscan.com";

function bscscanToken(tokenId: string): string {
  return `${BSCSCAN}/token/0x8cc16Dd6d816A33A6822344C3F8958e6dfEfcA34?a=${tokenId}`;
}

function bscscanAddress(addr: string): string {
  return `${BSCSCAN}/address/${addr}`;
}

function bscscanTx(hash: string): string {
  return `${BSCSCAN}/tx/${hash}`;
}

function StatusBadge({ active }: { active: boolean | null }) {
  if (active === null) {
    return (
      <span className="px-2 py-0.5 text-[11px] rounded border border-border text-muted bg-card">
        Not Registered
      </span>
    );
  }
  return active ? (
    <span className="px-2 py-0.5 text-[11px] rounded border border-ok text-ok bg-ok/10">
      Active
    </span>
  ) : (
    <span className="px-2 py-0.5 text-[11px] rounded border border-danger text-danger bg-danger/10">
      Paused
    </span>
  );
}

function FreeMintBadge() {
  return (
    <span className="px-2 py-0.5 text-[11px] rounded border border-accent text-accent bg-accent/10">
      Free Mint
    </span>
  );
}

function SectionHeader({
  title,
  count,
  collapsed,
  onToggle,
}: {
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
      onClick={onToggle}
    >
      <span>
        {title}
        {count !== undefined && ` (${count})`}
      </span>
      {collapsed ? (
        <ChevronRight className="w-3.5 h-3.5" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

function Field({
  label,
  value,
  href,
  mono,
}: {
  label: string;
  value: string | number | undefined | null;
  href?: string;
  mono?: boolean;
}) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <span className="text-muted min-w-[120px] shrink-0">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-accent hover:underline truncate flex items-center gap-1 ${mono ? "font-mono" : ""}`}
        >
          {value}
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>
      ) : (
        <span className={`text-txt truncate ${mono ? "font-mono" : ""}`}>
          {String(value)}
        </span>
      )}
    </div>
  );
}

export function IdentityView() {
  const { nfaStatus, nfaStatusLoading, nfaStatusError, loadNfaStatus } =
    useApp();

  const [registryCollapsed, setRegistryCollapsed] = useState(false);
  const [nfaCollapsed, setNfaCollapsed] = useState(false);
  const [learningCollapsed, setLearningCollapsed] = useState(true);
  const [metadataCollapsed, setMetadataCollapsed] = useState(true);

  useEffect(() => {
    loadNfaStatus();
  }, [loadNfaStatus]);

  const identity = nfaStatus?.identity;
  const nfa = nfaStatus?.nfa;
  const onChain = nfaStatus?.onChain;
  const isEmpty = !identity && !nfa;

  return (
    <div className="max-w-2xl mx-auto space-y-1">
      <h2 className="text-lg font-semibold text-txt-strong mb-3">Identity</h2>

      {nfaStatusLoading && (
        <div className="flex items-center gap-2 text-muted text-[13px] py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading on-chain identity...
        </div>
      )}

      {nfaStatusError && (
        <div className="text-danger text-[12px] px-3 py-2 border border-danger rounded bg-danger/5">
          {nfaStatusError}
        </div>
      )}

      {!nfaStatusLoading && isEmpty && (
        <div className="text-muted text-[13px] px-3 py-6 border border-border rounded bg-card text-center">
          No on-chain identity registered. Use chat to{" "}
          <strong>register milady on bnb chain</strong> or{" "}
          <strong>mint nfa</strong>.
        </div>
      )}

      {/* ERC-8004 Agent Registry */}
      {identity && (
        <>
          <SectionHeader
            title="ERC-8004 Agent Registry"
            collapsed={registryCollapsed}
            onToggle={() => setRegistryCollapsed(!registryCollapsed)}
          />
          {!registryCollapsed && (
            <div className="px-3 pb-3 space-y-1.5">
              <Field label="Agent ID" value={identity.agentId} mono />
              <Field label="Network" value={identity.network} />
              <Field
                label="Owner"
                value={identity.ownerAddress}
                href={bscscanAddress(identity.ownerAddress)}
                mono
              />
              <Field label="Agent URI" value={identity.agentURI} />
              <Field
                label="Registered"
                value={new Date(identity.registeredAt).toLocaleString()}
              />
              <Field
                label="Tx Hash"
                value={identity.txHash}
                href={bscscanTx(identity.txHash)}
                mono
              />
            </div>
          )}
        </>
      )}

      {/* BAP-578 NFA */}
      {nfa && (
        <>
          <SectionHeader
            title="BAP-578 NFA"
            collapsed={nfaCollapsed}
            onToggle={() => setNfaCollapsed(!nfaCollapsed)}
          />
          {!nfaCollapsed && (
            <div className="px-3 pb-3 space-y-1.5">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge active={onChain ? onChain.active : !nfa.paused} />
                {nfa.freeMint && <FreeMintBadge />}
              </div>
              <Field
                label="Token ID"
                value={nfa.tokenId}
                href={bscscanToken(nfa.tokenId)}
                mono
              />
              <Field label="Network" value={nfa.network} />
              <Field
                label="Owner"
                value={nfa.owner}
                href={bscscanAddress(nfa.owner)}
                mono
              />
              {nfa.logicContract && (
                <Field
                  label="Logic Contract"
                  value={nfa.logicContract}
                  href={bscscanAddress(nfa.logicContract)}
                  mono
                />
              )}
              <Field
                label="Mint Tx"
                value={nfa.mintTxHash}
                href={bscscanTx(nfa.mintTxHash)}
                mono
              />
            </div>
          )}
        </>
      )}

      {/* Learning History */}
      {nfa && (
        <>
          <SectionHeader
            title="Learning History"
            count={nfa.learningCount}
            collapsed={learningCollapsed}
            onToggle={() => setLearningCollapsed(!learningCollapsed)}
          />
          {!learningCollapsed && (
            <div className="px-3 pb-3 space-y-1.5">
              <Field label="Merkle Root" value={nfa.learningRoot} mono />
              <Field label="Entry Count" value={nfa.learningCount} />
              <Field
                label="Last Anchored"
                value={
                  nfa.lastAnchoredAt
                    ? new Date(nfa.lastAnchoredAt).toLocaleString()
                    : "Never"
                }
              />
            </div>
          )}
        </>
      )}

      {/* On-Chain Metadata */}
      {onChain?.metadata && (
        <>
          <SectionHeader
            title="On-Chain Metadata"
            collapsed={metadataCollapsed}
            onToggle={() => setMetadataCollapsed(!metadataCollapsed)}
          />
          {!metadataCollapsed && (
            <div className="px-3 pb-3 space-y-1.5">
              <Field label="Persona" value={onChain.metadata.persona} />
              <Field label="Experience" value={onChain.metadata.experience} />
              <Field
                label="Vault Hash"
                value={onChain.metadata.vaultHash}
                mono
              />
              <Field label="Vault URI" value={onChain.metadata.vaultURI} />
              <Field
                label="Voice Hash"
                value={onChain.metadata.voiceHash}
                mono
              />
              <Field
                label="Animation URI"
                value={onChain.metadata.animationURI}
              />
              <Field label="Metadata URI" value={onChain.metadataURI} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
