/**
 * Config page — agent-level configuration.
 *
 * Sections:
 *   1. Wallet & RPC providers
 *   2. Secrets (modal)
 */

import { useCallback, useState } from "react";
import { useApp } from "../AppContext";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import { SecretsView } from "./SecretsView";

type RpcProviderOption<T extends string> = {
  id: T;
  label: string;
};

type RpcFieldDefinition = {
  configKey: string;
  label: string;
  isSet: boolean;
};

type RpcFieldGroup = ReadonlyArray<RpcFieldDefinition>;

type RpcSectionConfigMap = Record<string, RpcFieldGroup>;

const EVM_RPC_OPTIONS = [
  { id: "eliza-cloud", label: "Eliza Cloud" },
  { id: "alchemy", label: "Alchemy" },
  { id: "infura", label: "Infura" },
  { id: "ankr", label: "Ankr" },
] as const;

const SOLANA_RPC_OPTIONS = [
  { id: "eliza-cloud", label: "Eliza Cloud" },
  { id: "helius-birdeye", label: "Helius + Birdeye" },
] as const;

type CloudRpcStatusProps = {
  connected: boolean;
  credits: number | null;
  creditsLow: boolean;
  creditsCritical: boolean;
  topUpUrl: string | null;
  loginBusy: boolean;
  onLogin: () => void;
};

function CloudRpcStatus({
  connected,
  credits,
  creditsLow,
  creditsCritical,
  topUpUrl,
  loginBusy,
  onLogin,
}: CloudRpcStatusProps) {
  if (connected) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
        <span className="font-semibold">Connected to Eliza Cloud</span>
        {credits !== null && (
          <span className="text-[var(--muted)] ml-auto">
            Credits:{" "}
            <span
              className={
                creditsCritical
                  ? "text-[var(--danger,#e74c3c)] font-bold"
                  : creditsLow
                    ? "text-[#b8860b] font-bold"
                    : ""
              }
            >
              ${credits.toFixed(2)}
            </span>
            {topUpUrl && (
              <a
                href={topUpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] ml-1.5 text-[var(--accent)]"
              >
                Top up
              </a>
            )}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--muted)]" />
        <span className="text-[var(--muted)]">
          Requires Eliza Cloud connection
        </span>
      </div>
      <button
        type="button"
        className="btn text-xs py-[3px] px-3 !mt-0 font-bold"
        onClick={() => void onLogin()}
        disabled={loginBusy}
      >
        {loginBusy ? "Connecting..." : "Log in"}
      </button>
    </div>
  );
}

function buildRpcRendererConfig(
  selectedProvider: string,
  providerConfigs: RpcSectionConfigMap,
  rpcFieldValues: Record<string, string>,
) {
  const fields = providerConfigs[selectedProvider];
  if (!fields?.length) return null;

  const props: {
    schema: JsonSchemaObject;
    hints: Record<string, ConfigUiHint>;
    values: Record<string, unknown>;
    setKeys: Set<string>;
  } = {
    schema: {
      type: "object",
      properties: {},
      required: [],
    },
    hints: {},
    values: {},
    setKeys: new Set<string>(),
  };

  for (const field of fields) {
    props.schema.properties[field.configKey] = {
      type: "string",
      description: field.label,
    };
    props.hints[field.configKey] = {
      label: field.label,
      sensitive: true,
      placeholder: field.isSet
        ? "Already set — leave blank to keep"
        : "Enter API key",
      width: "full",
    };
    if (rpcFieldValues[field.configKey] !== undefined) {
      props.values[field.configKey] = rpcFieldValues[field.configKey];
    }
    if (field.isSet) {
      props.setKeys.add(field.configKey);
    }
  }

  return props;
}

type RpcSectionCloudProps = CloudRpcStatusProps;

type RpcSectionProps<T extends string> = {
  title: string;
  description: string;
  options: readonly RpcProviderOption<T>[];
  selectedProvider: T;
  onSelect: (provider: T) => void;
  providerConfigs: RpcSectionConfigMap;
  rpcFieldValues: Record<string, string>;
  onRpcFieldChange: (key: string, value: unknown) => void;
  cloud: RpcSectionCloudProps;
  containerClassName: string;
};

function RpcConfigSection<T extends string>({
  title,
  description,
  options,
  selectedProvider,
  onSelect,
  providerConfigs,
  rpcFieldValues,
  onRpcFieldChange,
  cloud,
  containerClassName,
}: RpcSectionProps<T>) {
  const rpcConfig = buildRpcRendererConfig(
    selectedProvider,
    providerConfigs,
    rpcFieldValues,
  );

  return (
    <div>
      <div className="text-xs font-bold mb-1">{title}</div>
      <div className="text-[11px] text-[var(--muted)] mb-2">{description}</div>

      {renderRpcProviderButtons(
        options,
        selectedProvider,
        onSelect,
        containerClassName,
      )}

      <div className="mt-3">
        {selectedProvider === "eliza-cloud" ? (
          <CloudRpcStatus
            connected={cloud.connected}
            credits={cloud.credits}
            creditsLow={cloud.creditsLow}
            creditsCritical={cloud.creditsCritical}
            topUpUrl={cloud.topUpUrl}
            loginBusy={cloud.loginBusy}
            onLogin={() => void cloud.onLogin()}
          />
        ) : rpcConfig ? (
          <ConfigRenderer
            schema={rpcConfig.schema}
            hints={rpcConfig.hints}
            values={rpcConfig.values}
            setKeys={rpcConfig.setKeys}
            registry={defaultRegistry}
            onChange={onRpcFieldChange}
          />
        ) : null}
      </div>
    </div>
  );
}

function renderRpcProviderButtons<T extends string>(
  options: readonly RpcProviderOption<T>[],
  selectedProvider: T,
  onSelect: (provider: T) => void,
  containerClassName: string,
) {
  return (
    <div className={containerClassName}>
      {options.map((provider) => {
        const active = selectedProvider === provider.id;
        return (
          <button
            type="button"
            key={provider.id}
            className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
              active
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
            }`}
            onClick={() => onSelect(provider.id)}
          >
            <div
              className={`text-xs font-bold whitespace-nowrap ${active ? "" : "text-[var(--text)]"}`}
            >
              {provider.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

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
  const [rpcFieldValues, setRpcFieldValues] = useState<Record<string, string>>(
    {},
  );

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
  const [selectedEvmRpc, setSelectedEvmRpc] = useState<
    "eliza-cloud" | "alchemy" | "infura" | "ankr"
  >("eliza-cloud");
  const [selectedSolanaRpc, setSelectedSolanaRpc] = useState<
    "eliza-cloud" | "helius-birdeye"
  >("eliza-cloud");

  const evmRpcConfigs: RpcSectionConfigMap = {
    alchemy: [
      {
        configKey: "ALCHEMY_API_KEY",
        label: "Alchemy API Key",
        isSet: walletConfig?.alchemyKeySet ?? false,
      },
    ],
    infura: [
      {
        configKey: "INFURA_API_KEY",
        label: "Infura API Key",
        isSet: walletConfig?.infuraKeySet ?? false,
      },
    ],
    ankr: [
      {
        configKey: "ANKR_API_KEY",
        label: "Ankr API Key",
        isSet: walletConfig?.ankrKeySet ?? false,
      },
    ],
  };

  const solanaRpcConfigs: RpcSectionConfigMap = {
    "helius-birdeye": [
      {
        configKey: "HELIUS_API_KEY",
        label: "Helius API Key",
        isSet: walletConfig?.heliusKeySet ?? false,
      },
      {
        configKey: "BIRDEYE_API_KEY",
        label: "Birdeye API Key",
        isSet: walletConfig?.birdeyeKeySet ?? false,
      },
    ],
  };

  const cloudStatusProps = {
    connected: cloudConnected,
    credits: cloudCredits,
    creditsLow: cloudCreditsLow,
    creditsCritical: cloudCreditsCritical,
    topUpUrl: cloudTopUpUrl,
    loginBusy: cloudLoginBusy,
    onLogin: () => void handleCloudLogin(),
  };

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
            type="button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--txt)] bg-transparent border border-[var(--border)] rounded cursor-pointer transition-colors hover:border-[var(--accent)]"
            onClick={() => setSecretsOpen(true)}
            title="Secrets Vault"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Secrets vault</title>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Secrets
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* EVM */}
          <RpcConfigSection
            title="EVM"
            description="Ethereum, Base, Arbitrum, Optimism, Polygon"
            options={EVM_RPC_OPTIONS}
            selectedProvider={selectedEvmRpc}
            onSelect={setSelectedEvmRpc}
            providerConfigs={evmRpcConfigs}
            rpcFieldValues={rpcFieldValues}
            onRpcFieldChange={handleRpcFieldChange}
            cloud={cloudStatusProps}
            containerClassName="grid grid-cols-4 gap-1.5"
          />

          {/* Solana */}
          <RpcConfigSection
            title="Solana"
            description="Solana mainnet tokens and NFTs"
            options={SOLANA_RPC_OPTIONS}
            selectedProvider={selectedSolanaRpc}
            onSelect={setSelectedSolanaRpc}
            providerConfigs={solanaRpcConfigs}
            rpcFieldValues={rpcFieldValues}
            onRpcFieldChange={handleRpcFieldChange}
            cloud={cloudStatusProps}
            containerClassName="grid grid-cols-2 gap-1.5"
          />
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setSecretsOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSecretsOpen(false);
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl max-h-[80vh] border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-[var(--accent)]"
                >
                  <title>Secrets vault</title>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="font-bold text-sm">Secrets Vault</span>
              </div>
              <button
                type="button"
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
