/**
 * Identity view — unified ERC-8004 + BAP-578 NFA on-chain identity.
 *
 * Displays the agent's on-chain identity state, NFA token info,
 * and learning history with Merkle root verification.
 */

import { useCallback, useEffect, useState } from "react";
import { useApp } from "../AppContext";
import {
  client,
  type NfaLearningsResponse,
  type NfaStatusResponse,
} from "../api-client";
import { createTranslator } from "../i18n";

type SectionStatus = "loading" | "loaded" | "error";

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg bg-bg-elevated">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-txt-strong">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  href?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-1.5 text-xs">
      <span className="text-muted min-w-[100px] shrink-0">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-accent hover:underline break-all ${mono ? "font-mono" : ""}`}
        >
          {value}
        </a>
      ) : (
        <span
          className={`text-txt-strong break-all ${mono ? "font-mono" : ""}`}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
        active
          ? "bg-ok/15 text-ok border border-ok/30"
          : "bg-muted/15 text-muted border border-muted/30"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${active ? "bg-ok" : "bg-muted"}`}
      />
      {active ? "Active" : "Not configured"}
    </span>
  );
}

export function IdentityView() {
  const { uiLanguage, setTab } = useApp();
  const t = createTranslator(uiLanguage);

  const [nfaStatus, setNfaStatus] = useState<NfaStatusResponse | null>(null);
  const [learnings, setLearnings] = useState<NfaLearningsResponse | null>(null);
  const [statusState, setStatusState] = useState<SectionStatus>("loading");
  const [learningsState, setLearningsState] =
    useState<SectionStatus>("loading");

  const loadStatus = useCallback(async () => {
    try {
      setStatusState("loading");
      const data = await client.getNfaStatus();
      setNfaStatus(data);
      setStatusState("loaded");
    } catch {
      setStatusState("error");
    }
  }, []);

  const loadLearnings = useCallback(async () => {
    try {
      setLearningsState("loading");
      const data = await client.getNfaLearnings();
      setLearnings(data);
      setLearningsState("loaded");
    } catch {
      setLearningsState("error");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadLearnings();
  }, [loadStatus, loadLearnings]);

  const identity = nfaStatus?.identity;
  const nfa = nfaStatus?.nfa;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-txt-strong mb-1">
          On-Chain Identity
        </h2>
        <p className="text-xs text-muted">
          ERC-8004 agent identity and BAP-578 NFA learning provenance on BNB
          Chain.
        </p>
      </div>

      <div className="space-y-4">
        {/* ERC-8004 Identity Section */}
        <SectionCard title="ERC-8004 Agent Identity">
          {statusState === "loading" ? (
            <div className="text-xs text-muted animate-pulse">Loading...</div>
          ) : statusState === "error" ? (
            <div className="text-xs text-danger">
              Failed to load identity status.{" "}
              <button
                type="button"
                onClick={loadStatus}
                className="text-accent hover:underline"
              >
                Retry
              </button>
            </div>
          ) : identity ? (
            <div>
              <div className="mb-3">
                <StatusBadge active />
              </div>
              <InfoRow label="Agent ID" value={identity.agentId} mono />
              <InfoRow label="Network" value={identity.network} />
              <InfoRow label="Owner" value={identity.ownerAddress} mono />
              <InfoRow label="Registered" value={identity.registeredAt} />
              <InfoRow
                label="8004Scan"
                value="View on 8004Scan"
                href={identity.scanUrl}
              />
            </div>
          ) : (
            <div>
              <div className="mb-3">
                <StatusBadge active={false} />
              </div>
              <p className="text-xs text-muted">
                No ERC-8004 identity registered. Use the{" "}
                <button
                  type="button"
                  onClick={() => setTab("character")}
                  className="text-accent hover:underline"
                >
                  Character
                </button>{" "}
                tab or say &quot;register milady on bnb chain&quot; in chat.
              </p>
            </div>
          )}
        </SectionCard>

        {/* BAP-578 NFA Section */}
        <SectionCard title="BAP-578 Non-Fungible Agent">
          {statusState === "loading" ? (
            <div className="text-xs text-muted animate-pulse">Loading...</div>
          ) : statusState === "error" ? (
            <div className="text-xs text-danger">
              Failed to load NFA status.{" "}
              <button
                type="button"
                onClick={loadStatus}
                className="text-accent hover:underline"
              >
                Retry
              </button>
            </div>
          ) : nfa ? (
            <div>
              <div className="mb-3">
                <StatusBadge active />
              </div>
              <InfoRow label="Token ID" value={nfa.tokenId} mono />
              <InfoRow label="Contract" value={nfa.contractAddress} mono />
              <InfoRow label="Network" value={nfa.network} />
              <InfoRow label="Owner" value={nfa.ownerAddress} mono />
              <InfoRow
                label="Merkle Root"
                value={nfa.merkleRoot}
                mono
              />
              <InfoRow label="Minted" value={nfa.mintedAt} />
              <InfoRow label="Last Updated" value={nfa.lastUpdatedAt} />
              <InfoRow
                label="BscScan"
                value="View transaction"
                href={nfa.bscscanUrl}
              />
            </div>
          ) : (
            <div>
              <div className="mb-3">
                <StatusBadge active={false} />
              </div>
              <p className="text-xs text-muted">
                No NFA token minted. Say &quot;mint nfa&quot; in chat to create
                one. Requires BAP578_CONTRACT_ADDRESS in environment and
                BNB_PRIVATE_KEY.
              </p>
            </div>
          )}
        </SectionCard>

        {/* Learning History Section */}
        <SectionCard title="Learning History">
          {learningsState === "loading" ? (
            <div className="text-xs text-muted animate-pulse">Loading...</div>
          ) : learningsState === "error" ? (
            <div className="text-xs text-danger">
              Failed to load learnings.{" "}
              <button
                type="button"
                onClick={loadLearnings}
                className="text-accent hover:underline"
              >
                Retry
              </button>
            </div>
          ) : learnings && learnings.totalEntries > 0 ? (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs text-muted">
                  {learnings.totalEntries} entries
                </span>
                <span className="text-[10px] text-muted font-mono">
                  Root: {learnings.merkleRoot.slice(0, 16)}...
                </span>
                {nfa && learnings.merkleRoot === nfa.merkleRoot ? (
                  <span className="text-[10px] text-ok">
                    In sync with on-chain root
                  </span>
                ) : nfa ? (
                  <span className="text-[10px] text-warn">
                    Out of sync — say &quot;update nfa learning root&quot; to
                    sync
                  </span>
                ) : null}
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {learnings.entries.map((entry, i) => (
                  <div
                    key={`${entry.date}-${i}`}
                    className="border border-border/50 rounded p-3 bg-bg"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-accent">
                        {entry.date}
                      </span>
                      <span className="text-[9px] font-mono text-muted">
                        {entry.hash.slice(0, 12)}...
                      </span>
                    </div>
                    <p className="text-xs text-txt whitespace-pre-wrap line-clamp-3">
                      {entry.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">
              No LEARNINGS.md found. Create one at ~/.milady/LEARNINGS.md to
              track agent learning history. Entries should use ## YYYY-MM-DD
              headings.
            </p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
