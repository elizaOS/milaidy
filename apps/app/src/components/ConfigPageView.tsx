/**
 * Config page — agent-level configuration.
 *
 * Sections:
 *   1. Wallet & RPC providers
 *   2. Secrets (modal)
 */

import { useState, useCallback } from "react";
import { useApp } from "../AppContext";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";
import { SecretsView } from "./SecretsView";

/* ── ConfigPageView ──────────────────────────────────────────────────── */

export function ConfigPageView({ embedded = false }: { embedded?: boolean }) {
  const {
    cloudConnected,
    cloudCredits,
    cloudCreditsLow,
    cloudCreditsCritical,
    cloudTopUpUrl,
    cloudLoginBusy,
    walletConfig,
    walletApiKeySaving,
    handleWalletApiKeySave,
    handleCloudLogin,
  } = useApp();

  const [secretsOpen, setSecretsOpen] = useState(false);

  /* ── RPC provider field values ─────────────────────────────────────── */
  const [rpcFieldValues, setRpcFieldValues] = useState<Record<string, string>>({});

  const handleRpcFieldChange = useCallback((key: string, value: unknown) => {
    setRpcFieldValues((prev) => ({ ...prev, [key]: String(value ?? "") }));
  }, []);

  const handleWalletSaveAll = useCallback(() => {
    const config: Record<string, string> = {};
    for (const [key, value] of Object.entries(rpcFieldValues)) {
      if (value) config[key] = value;
    }
    void handleWalletApiKeySave(config);
  }, [handleWalletApiKeySave, rpcFieldValues]);

  /* ── RPC provider selection state ──────────────────────────────────── */
  const [selectedEvmRpc, setSelectedEvmRpc] = useState<"eliza-cloud" | "alchemy" | "infura" | "ankr">("eliza-cloud");
  const [selectedSolanaRpc, setSelectedSolanaRpc] = useState<"eliza-cloud" | "helius-birdeye">("eliza-cloud");

  return (
    <div>
      {!embedded && (
        <>
          <h2 className="text-lg font-bold mb-1">Config</h2>
          <p className="text-[13px] text-[var(--muted)] mb-5">
            Wallet providers and secrets.
          </p>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          1. WALLET & RPC
          ═══════════════════════════════════════════════════════════════ */}
      <div className="p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-sm">Wallet &amp; RPC</div>
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--txt)] bg-transparent border border-[var(--border)] rounded cursor-pointer transition-colors hover:border-[var(--accent)]"
            onClick={() => setSecretsOpen(true)}
            title="Secrets Vault"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Secrets
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* EVM */}
          <div>
            <div className="text-xs font-bold mb-1">EVM</div>
            <div className="text-[11px] text-[var(--muted)] mb-2">Ethereum, Base, Arbitrum, Optimism, Polygon</div>

            <div className="grid grid-cols-4 gap-1.5">
              {([
                { id: "eliza-cloud" as const, label: "Eliza Cloud" },
                { id: "alchemy" as const, label: "Alchemy" },
                { id: "infura" as const, label: "Infura" },
                { id: "ankr" as const, label: "Ankr" },
              ]).map((p) => {
                const active = selectedEvmRpc === p.id;
                return (
                  <button
                    key={p.id}
                    className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                    }`}
                    onClick={() => setSelectedEvmRpc(p.id)}
                  >
                    <div className={`text-xs font-bold whitespace-nowrap ${active ? "" : "text-[var(--text)]"}`}>
                      {p.label}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedEvmRpc === "eliza-cloud" ? (
              <div className="mt-3">
                {cloudConnected ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                    <span className="font-semibold">Connected to Eliza Cloud</span>
                    {cloudCredits !== null && (
                      <span className="text-[var(--muted)] ml-auto">
                        Credits: <span className={cloudCreditsCritical ? "text-[var(--danger,#e74c3c)] font-bold" : cloudCreditsLow ? "text-[#b8860b] font-bold" : ""}>${cloudCredits.toFixed(2)}</span>
                        {cloudTopUpUrl && <a href={cloudTopUpUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] ml-1.5 text-[var(--accent)]">Top up</a>}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2 h-2 rounded-full bg-[var(--muted)]" />
                      <span className="text-[var(--muted)]">Requires Eliza Cloud connection</span>
                    </div>
                    <button
                      className="btn text-xs py-[3px] px-3 !mt-0 font-bold"
                      onClick={() => void handleCloudLogin()}
                      disabled={cloudLoginBusy}
                    >
                      {cloudLoginBusy ? "Connecting..." : "Log in"}
                    </button>
                  </div>
                )}
              </div>
            ) : (() => {
              const evmProviders: Record<"alchemy" | "infura" | "ankr", { configKey: string; label: string; isSet: boolean }> = {
                alchemy: { configKey: "ALCHEMY_API_KEY", label: "Alchemy API Key", isSet: walletConfig?.alchemyKeySet ?? false },
                infura: { configKey: "INFURA_API_KEY", label: "Infura API Key", isSet: walletConfig?.infuraKeySet ?? false },
                ankr: { configKey: "ANKR_API_KEY", label: "Ankr API Key", isSet: walletConfig?.ankrKeySet ?? false },
              };
              const p = evmProviders[selectedEvmRpc as "alchemy" | "infura" | "ankr"];
              if (!p) return null;
              const evmSchema: JsonSchemaObject = {
                type: "object",
                properties: { [p.configKey]: { type: "string", description: p.label } },
                required: [],
              };
              const evmHints: Record<string, ConfigUiHint> = {
                [p.configKey]: { label: p.label, sensitive: true, placeholder: p.isSet ? "Already set \u2014 leave blank to keep" : "Enter API key", width: "full" },
              };
              const evmValues: Record<string, unknown> = {};
              const evmSetKeys = new Set<string>();
              if (rpcFieldValues[p.configKey] !== undefined) evmValues[p.configKey] = rpcFieldValues[p.configKey];
              if (p.isSet) evmSetKeys.add(p.configKey);

              return (
                <div className="mt-3">
                  <ConfigRenderer
                    schema={evmSchema}
                    hints={evmHints}
                    values={evmValues}
                    setKeys={evmSetKeys}
                    registry={defaultRegistry}
                    onChange={handleRpcFieldChange}
                  />
                </div>
              );
            })()}
          </div>

          {/* Solana */}
          <div>
            <div className="text-xs font-bold mb-1">Solana</div>
            <div className="text-[11px] text-[var(--muted)] mb-2">Solana mainnet tokens and NFTs</div>

            <div className="grid grid-cols-2 gap-1.5">
              {([
                { id: "eliza-cloud" as const, label: "Eliza Cloud" },
                { id: "helius-birdeye" as const, label: "Helius + Birdeye" },
              ]).map((p) => {
                const active = selectedSolanaRpc === p.id;
                return (
                  <button
                    key={p.id}
                    className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                    }`}
                    onClick={() => setSelectedSolanaRpc(p.id)}
                  >
                    <div className={`text-xs font-bold whitespace-nowrap ${active ? "" : "text-[var(--text)]"}`}>
                      {p.label}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedSolanaRpc === "eliza-cloud" ? (
              <div className="mt-3">
                {cloudConnected ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                    <span className="font-semibold">Connected to Eliza Cloud</span>
                    {cloudCredits !== null && (
                      <span className="text-[var(--muted)] ml-auto">
                        Credits: <span className={cloudCreditsCritical ? "text-[var(--danger,#e74c3c)] font-bold" : cloudCreditsLow ? "text-[#b8860b] font-bold" : ""}>${cloudCredits.toFixed(2)}</span>
                        {cloudTopUpUrl && <a href={cloudTopUpUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] ml-1.5 text-[var(--accent)]">Top up</a>}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2 h-2 rounded-full bg-[var(--muted)]" />
                      <span className="text-[var(--muted)]">Requires Eliza Cloud connection</span>
                    </div>
                    <button
                      className="btn text-xs py-[3px] px-3 !mt-0 font-bold"
                      onClick={() => void handleCloudLogin()}
                      disabled={cloudLoginBusy}
                    >
                      {cloudLoginBusy ? "Connecting..." : "Log in"}
                    </button>
                  </div>
                )}
              </div>
            ) : (() => {
              const solProviders: Record<string, { configKey: string; label: string; isSet: boolean }> = {
                helius: { configKey: "HELIUS_API_KEY", label: "Helius API Key", isSet: walletConfig?.heliusKeySet ?? false },
                birdeye: { configKey: "BIRDEYE_API_KEY", label: "Birdeye API Key", isSet: walletConfig?.birdeyeKeySet ?? false },
              };
              const solKeys = selectedSolanaRpc === "helius-birdeye" ? ["helius", "birdeye"] : [];
              const allSchemaProps: Record<string, Record<string, unknown>> = {};
              const allHints: Record<string, ConfigUiHint> = {};
              const allValues: Record<string, unknown> = {};
              const allSetKeys = new Set<string>();
              for (const sk of solKeys) {
                const p = solProviders[sk];
                if (!p) continue;
                allSchemaProps[p.configKey] = { type: "string", description: p.label };
                allHints[p.configKey] = { label: p.label, sensitive: true, placeholder: p.isSet ? "Already set \u2014 leave blank to keep" : "Enter API key", width: "full" };
                if (rpcFieldValues[p.configKey] !== undefined) allValues[p.configKey] = rpcFieldValues[p.configKey];
                if (p.isSet) allSetKeys.add(p.configKey);
              }
              const solSchema: JsonSchemaObject = { type: "object", properties: allSchemaProps, required: [] };
              return (
                <div className="mt-3">
                  <ConfigRenderer
                    schema={solSchema}
                    hints={allHints}
                    values={allValues}
                    setKeys={allSetKeys}
                    registry={defaultRegistry}
                    onChange={handleRpcFieldChange}
                  />
                </div>
              );
            })()}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button
            className="btn text-[11px] py-1 px-3.5 !mt-0"
            onClick={handleWalletSaveAll}
            disabled={walletApiKeySaving}
          >
            {walletApiKeySaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* ── Secrets modal ── */}
      {secretsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setSecretsOpen(false); }}
        >
          <div className="w-full max-w-2xl max-h-[80vh] border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="font-bold text-sm">Secrets Vault</span>
              </div>
              <button
                className="text-[var(--muted)] hover:text-[var(--txt)] text-lg leading-none px-1 bg-transparent border-0 cursor-pointer"
                onClick={() => setSecretsOpen(false)}
              >
                &times;
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <SecretsView />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
