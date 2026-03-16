import type { MiladyConfig } from "../config/config";
import {
  DEFAULT_WALLET_RPC_SELECTIONS,
  normalizeWalletRpcProviderId,
  normalizeWalletRpcSelections,
  type WalletConfigUpdateRequest,
  type WalletRpcChain,
  type WalletRpcCredentialKey,
  type WalletRpcSelections,
} from "../contracts/wallet";

export const DEFAULT_CLOUD_API_BASE_URL = "https://elizacloud.ai/api/v1";
export const DEFAULT_PUBLIC_BSC_RPC_URLS = [
  "https://bsc-dataseed1.binance.org/",
] as const;
export const DEFAULT_PUBLIC_ETHEREUM_RPC_URLS = [
  "https://ethereum.publicnode.com/",
] as const;
export const DEFAULT_PUBLIC_BASE_RPC_URLS = [
  "https://base.publicnode.com/",
] as const;
export const DEFAULT_PUBLIC_AVALANCHE_RPC_URLS = [
  "https://avalanche.publicnode.com/ext/bc/C/rpc",
] as const;
export const DEFAULT_PUBLIC_SOLANA_RPC_URLS = [
  "https://api.mainnet-beta.solana.com",
] as const;

export interface WalletRpcResolutionOptions {
  cloudManagedAccess?: boolean | null;
  cloudApiKey?: string | null;
  cloudBaseUrl?: string | null;
}

export interface WalletRpcReadiness {
  selectedRpcProviders: WalletRpcSelections;
  legacyCustomChains: WalletRpcChain[];
  cloudManagedAccess: boolean;
  alchemyKeySet: boolean;
  infuraKeySet: boolean;
  ankrKeySet: boolean;
  nodeRealBscRpcSet: boolean;
  quickNodeBscRpcSet: boolean;
  heliusKeySet: boolean;
  birdeyeKeySet: boolean;
  activeAlchemyKey: string | null;
  activeAnkrKey: string | null;
  activeHeliusKey: string | null;
  evmBalanceReady: boolean;
  managedBscRpcReady: boolean;
  ethereumBalanceReady: boolean;
  baseBalanceReady: boolean;
  bscBalanceReady: boolean;
  avalancheBalanceReady: boolean;
  solanaBalanceReady: boolean;
  ethereumRpcUrls: string[];
  baseRpcUrls: string[];
  arbitrumRpcUrls: string[];
  optimismRpcUrls: string[];
  polygonRpcUrls: string[];
  bscRpcUrls: string[];
  avalancheRpcUrls: string[];
  solanaRpcUrls: string[];
  chainProviderMode: Record<
    | "ethereum"
    | "base"
    | "arbitrum"
    | "optimism"
    | "polygon"
    | "bsc"
    | "avalanche",
    "alchemy" | "ankr" | "rpc" | "disabled"
  >;
}

type SupportedCloudEvmRpcChain = "mainnet" | "base" | "bsc" | "avalanche";
type SupportedInfuraEvmRpcChain =
  | "mainnet"
  | "base"
  | "arbitrum"
  | "optimism"
  | "polygon";

const WALLET_RPC_PROVIDER_CREDENTIAL_KEYS: Record<
  WalletRpcChain,
  Record<string, WalletRpcCredentialKey[]>
> = {
  evm: {
    "eliza-cloud": [],
    alchemy: ["ALCHEMY_API_KEY"],
    infura: ["INFURA_API_KEY"],
    ankr: ["ANKR_API_KEY"],
  },
  bsc: {
    "eliza-cloud": [],
    alchemy: ["ALCHEMY_API_KEY"],
    ankr: ["ANKR_API_KEY"],
    nodereal: ["NODEREAL_BSC_RPC_URL"],
    quicknode: ["QUICKNODE_BSC_RPC_URL"],
  },
  solana: {
    "eliza-cloud": [],
    "helius-birdeye": ["HELIUS_API_KEY", "BIRDEYE_API_KEY"],
  },
};

const LEGACY_WALLET_RPC_KEYS: Record<WalletRpcChain, WalletRpcCredentialKey[]> =
  {
    evm: ["ETHEREUM_RPC_URL", "BASE_RPC_URL", "AVALANCHE_RPC_URL"],
    bsc: ["BSC_RPC_URL"],
    solana: ["SOLANA_RPC_URL"],
  };

const WALLET_RPC_CREDENTIAL_KEYS: WalletRpcCredentialKey[] = [
  "ALCHEMY_API_KEY",
  "INFURA_API_KEY",
  "ANKR_API_KEY",
  "NODEREAL_BSC_RPC_URL",
  "QUICKNODE_BSC_RPC_URL",
  "HELIUS_API_KEY",
  "BIRDEYE_API_KEY",
  "ETHEREUM_RPC_URL",
  "BASE_RPC_URL",
  "AVALANCHE_RPC_URL",
  "BSC_RPC_URL",
  "SOLANA_RPC_URL",
];

export function normalizeRpcUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function uniqueRpcUrls(
  ...groups: Array<ReadonlyArray<string | null | undefined>>
): string[] {
  return [
    ...new Set(
      groups
        .flat()
        .map((url) => normalizeRpcUrl(url))
        .filter((url): url is string => Boolean(url)),
    ),
  ];
}

function normalizeSecret(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getEnvConfigRecord(
  config: Pick<MiladyConfig, "env">,
): Record<string, string> {
  if (
    !config.env ||
    typeof config.env !== "object" ||
    Array.isArray(config.env)
  ) {
    config.env = {};
  }
  return config.env as Record<string, string>;
}

function setCredentialValue(
  config: Pick<MiladyConfig, "env">,
  key: WalletRpcCredentialKey,
  value: string,
): void {
  const envConfig = getEnvConfigRecord(config);
  envConfig[key] = value;
  process.env[key] = value;
}

function clearCredentialValue(
  config: Pick<MiladyConfig, "env">,
  key: WalletRpcCredentialKey,
): void {
  const envConfig = getEnvConfigRecord(config);
  delete envConfig[key];
  delete process.env[key];
}

function collectSelectedCredentialKeys(
  selections: WalletRpcSelections,
): Set<WalletRpcCredentialKey> {
  const selected = new Set<WalletRpcCredentialKey>();
  for (const chain of Object.keys(selections) as WalletRpcChain[]) {
    for (const key of WALLET_RPC_PROVIDER_CREDENTIAL_KEYS[chain][
      selections[chain]
    ] ?? []) {
      selected.add(key);
    }
  }
  return selected;
}

export function applyWalletRpcConfigUpdate(
  config: MiladyConfig,
  request: WalletConfigUpdateRequest,
): WalletRpcSelections {
  const selections = normalizeWalletRpcSelections(request.selections);
  if (!config.wallet || typeof config.wallet !== "object") {
    config.wallet = {};
  }
  config.wallet.rpcProviders = selections;

  const credentials = request.credentials ?? {};
  const selectedCredentialKeys = collectSelectedCredentialKeys(selections);

  for (const key of WALLET_RPC_CREDENTIAL_KEYS) {
    if (key === "SOLANA_RPC_URL") {
      continue;
    }

    if (!selectedCredentialKeys.has(key)) {
      clearCredentialValue(config, key);
      continue;
    }

    if (!Object.hasOwn(credentials, key)) {
      continue;
    }

    const value = normalizeSecret(credentials[key]);
    if (value) {
      setCredentialValue(config, key, value);
    } else {
      clearCredentialValue(config, key);
    }
  }

  for (const chain of Object.keys(LEGACY_WALLET_RPC_KEYS) as WalletRpcChain[]) {
    for (const key of LEGACY_WALLET_RPC_KEYS[chain]) {
      clearCredentialValue(config, key);
    }
  }

  if (selections.solana === "helius-birdeye") {
    const envConfig = getEnvConfigRecord(config);
    const heliusKey = normalizeSecret(
      Object.hasOwn(credentials, "HELIUS_API_KEY")
        ? credentials.HELIUS_API_KEY
        : (envConfig.HELIUS_API_KEY ?? process.env.HELIUS_API_KEY),
    );
    if (heliusKey) {
      setCredentialValue(
        config,
        "SOLANA_RPC_URL",
        `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`,
      );
    } else {
      clearCredentialValue(config, "SOLANA_RPC_URL");
    }
  } else {
    clearCredentialValue(config, "SOLANA_RPC_URL");
  }

  return selections;
}

function hasCloudRpcServiceEnabled(
  config?: Pick<MiladyConfig, "cloud"> | null,
): boolean {
  return config?.cloud?.services?.rpc !== false;
}

function hasLegacyCustomEvmRpc(): boolean {
  return Boolean(
    process.env.ETHEREUM_RPC_URL?.trim() ||
      process.env.BASE_RPC_URL?.trim() ||
      process.env.AVALANCHE_RPC_URL?.trim(),
  );
}

function hasLegacyCustomBscRpc(): boolean {
  return Boolean(process.env.BSC_RPC_URL?.trim());
}

function hasLegacyCustomSolanaRpc(): boolean {
  return Boolean(process.env.SOLANA_RPC_URL?.trim());
}

function resolveConfiguredWalletRpcSelections(
  config?: Pick<MiladyConfig, "wallet"> | null,
): Partial<WalletRpcSelections> {
  const persisted = config?.wallet?.rpcProviders;
  return {
    evm: normalizeWalletRpcProviderId("evm", persisted?.evm) ?? undefined,
    bsc: normalizeWalletRpcProviderId("bsc", persisted?.bsc) ?? undefined,
    solana:
      normalizeWalletRpcProviderId("solana", persisted?.solana) ?? undefined,
  };
}

function resolvePersistedOrMigratedWalletSelections(
  config?: Pick<MiladyConfig, "wallet"> | null,
): {
  selectedRpcProviders: WalletRpcSelections;
  legacyCustomChains: WalletRpcChain[];
} {
  const configured = resolveConfiguredWalletRpcSelections(config);
  const alchemyKeySet = Boolean(process.env.ALCHEMY_API_KEY?.trim());
  const infuraKeySet = Boolean(process.env.INFURA_API_KEY?.trim());
  const ankrKeySet = Boolean(process.env.ANKR_API_KEY?.trim());
  const nodeRealBscRpcSet = Boolean(process.env.NODEREAL_BSC_RPC_URL?.trim());
  const quickNodeBscRpcSet = Boolean(process.env.QUICKNODE_BSC_RPC_URL?.trim());
  const heliusKeySet = Boolean(process.env.HELIUS_API_KEY?.trim());
  const birdeyeKeySet = Boolean(process.env.BIRDEYE_API_KEY?.trim());

  const legacyCustomChains: WalletRpcChain[] = [];

  const evm =
    configured.evm ??
    (alchemyKeySet
      ? "alchemy"
      : infuraKeySet
        ? "infura"
        : ankrKeySet
          ? "ankr"
          : DEFAULT_WALLET_RPC_SELECTIONS.evm);
  if (
    !configured.evm &&
    !alchemyKeySet &&
    !infuraKeySet &&
    !ankrKeySet &&
    hasLegacyCustomEvmRpc()
  ) {
    legacyCustomChains.push("evm");
  }

  const bsc =
    configured.bsc ??
    (nodeRealBscRpcSet
      ? "nodereal"
      : quickNodeBscRpcSet
        ? "quicknode"
        : alchemyKeySet
          ? "alchemy"
          : ankrKeySet
            ? "ankr"
            : DEFAULT_WALLET_RPC_SELECTIONS.bsc);
  if (
    !configured.bsc &&
    !nodeRealBscRpcSet &&
    !quickNodeBscRpcSet &&
    !alchemyKeySet &&
    !ankrKeySet &&
    hasLegacyCustomBscRpc()
  ) {
    legacyCustomChains.push("bsc");
  }

  const solana =
    configured.solana ??
    (heliusKeySet || birdeyeKeySet
      ? "helius-birdeye"
      : DEFAULT_WALLET_RPC_SELECTIONS.solana);
  if (
    !configured.solana &&
    !heliusKeySet &&
    !birdeyeKeySet &&
    hasLegacyCustomSolanaRpc()
  ) {
    legacyCustomChains.push("solana");
  }

  return {
    selectedRpcProviders: { evm, bsc, solana },
    legacyCustomChains,
  };
}

export function resolveCloudApiBaseUrl(
  rawBaseUrl?: string | null,
): string | null {
  const candidate =
    normalizeSecret(rawBaseUrl ?? process.env.ELIZAOS_CLOUD_BASE_URL) ??
    DEFAULT_CLOUD_API_BASE_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    parsed.search = "";
    const normalizedBase = parsed.toString().replace(/\/+$/, "");
    return normalizedBase.endsWith("/api/v1")
      ? normalizedBase
      : `${normalizedBase}/api/v1`;
  } catch {
    return null;
  }
}

export function resolveCloudApiKey(
  config?: Pick<MiladyConfig, "cloud"> | null,
): string | null {
  if (!hasCloudRpcServiceEnabled(config)) {
    return null;
  }
  return normalizeSecret(
    config?.cloud?.apiKey ?? process.env.ELIZAOS_CLOUD_API_KEY,
  );
}

function buildCloudRpcProxyUrl(
  pathname: string,
  options: WalletRpcResolutionOptions = {},
): string | null {
  const cloudApiKey = normalizeSecret(
    options.cloudApiKey ?? process.env.ELIZAOS_CLOUD_API_KEY,
  );
  const cloudManagedAccess = options.cloudManagedAccess ?? Boolean(cloudApiKey);
  if (!cloudManagedAccess || !cloudApiKey) {
    return null;
  }

  const cloudBaseUrl = resolveCloudApiBaseUrl(options.cloudBaseUrl);
  if (!cloudBaseUrl) {
    return null;
  }

  const url = new URL(
    pathname.replace(/^\/+/, ""),
    `${cloudBaseUrl.replace(/\/+$/, "")}/`,
  );
  url.searchParams.set("api_key", cloudApiKey);
  return normalizeRpcUrl(url.toString());
}

export function buildCloudEvmRpcUrl(
  chain: SupportedCloudEvmRpcChain,
  options: WalletRpcResolutionOptions = {},
): string | null {
  return buildCloudRpcProxyUrl(`proxy/evm-rpc/${chain}`, options);
}

export function buildCloudSolanaRpcUrl(
  options: WalletRpcResolutionOptions = {},
): string | null {
  return buildCloudRpcProxyUrl("proxy/solana-rpc", options);
}

function buildInfuraRpcUrl(
  chain: SupportedInfuraEvmRpcChain,
  apiKey: string | null,
): string | null {
  if (!apiKey) return null;
  const hosts: Record<SupportedInfuraEvmRpcChain, string> = {
    mainnet: "https://mainnet.infura.io/v3",
    base: "https://base-mainnet.infura.io/v3",
    arbitrum: "https://arbitrum-mainnet.infura.io/v3",
    optimism: "https://optimism-mainnet.infura.io/v3",
    polygon: "https://polygon-mainnet.infura.io/v3",
  };
  return normalizeRpcUrl(`${hosts[chain]}/${apiKey}`);
}

export function hasElizaCloudRpcAccess(
  config?: Pick<MiladyConfig, "cloud"> | null,
): boolean {
  return Boolean(resolveCloudApiKey(config));
}

export function resolveBscRpcUrls(
  options: WalletRpcResolutionOptions = {},
): string[] {
  return uniqueRpcUrls(
    [
      process.env.NODEREAL_BSC_RPC_URL,
      process.env.QUICKNODE_BSC_RPC_URL,
      process.env.BSC_RPC_URL,
      buildCloudEvmRpcUrl("bsc", options),
    ],
    options.cloudManagedAccess ? DEFAULT_PUBLIC_BSC_RPC_URLS : [],
  );
}

export function resolveEthereumRpcUrls(
  options: WalletRpcResolutionOptions = {},
): string[] {
  return uniqueRpcUrls(
    [process.env.ETHEREUM_RPC_URL, buildCloudEvmRpcUrl("mainnet", options)],
    options.cloudManagedAccess ? DEFAULT_PUBLIC_ETHEREUM_RPC_URLS : [],
  );
}

export function resolveBaseRpcUrls(
  options: WalletRpcResolutionOptions = {},
): string[] {
  return uniqueRpcUrls(
    [process.env.BASE_RPC_URL, buildCloudEvmRpcUrl("base", options)],
    options.cloudManagedAccess ? DEFAULT_PUBLIC_BASE_RPC_URLS : [],
  );
}

export function resolveAvalancheRpcUrls(
  options: WalletRpcResolutionOptions = {},
): string[] {
  return uniqueRpcUrls(
    [process.env.AVALANCHE_RPC_URL, buildCloudEvmRpcUrl("avalanche", options)],
    options.cloudManagedAccess ? DEFAULT_PUBLIC_AVALANCHE_RPC_URLS : [],
  );
}

export function resolveSolanaRpcUrls(
  options: WalletRpcResolutionOptions = {},
): string[] {
  return uniqueRpcUrls(
    [process.env.SOLANA_RPC_URL, buildCloudSolanaRpcUrl(options)],
    options.cloudManagedAccess ? DEFAULT_PUBLIC_SOLANA_RPC_URLS : [],
  );
}

export function getInventoryProviderOptions(): Array<{
  id: string;
  name: string;
  description: string;
  rpcProviders: Array<{
    id: string;
    name: string;
    description: string;
    envKey: string | null;
    requiresKey: boolean;
  }>;
}> {
  return [
    {
      id: "evm",
      name: "EVM",
      description: "Ethereum, Base, Arbitrum, Optimism, Polygon.",
      rpcProviders: [
        {
          id: "eliza-cloud",
          name: "Eliza Cloud",
          description: "Managed RPC. No setup needed.",
          envKey: null,
          requiresKey: false,
        },
        {
          id: "infura",
          name: "Infura",
          description: "Reliable EVM infrastructure.",
          envKey: "INFURA_API_KEY",
          requiresKey: true,
        },
        {
          id: "alchemy",
          name: "Alchemy",
          description: "Full-featured multi-chain data platform.",
          envKey: "ALCHEMY_API_KEY",
          requiresKey: true,
        },
        {
          id: "ankr",
          name: "Ankr",
          description: "Decentralized multi-chain RPC provider.",
          envKey: "ANKR_API_KEY",
          requiresKey: true,
        },
      ],
    },
    {
      id: "bsc",
      name: "BSC",
      description: "BNB Smart Chain balances and trading.",
      rpcProviders: [
        {
          id: "eliza-cloud",
          name: "Eliza Cloud",
          description: "Managed RPC. No setup needed.",
          envKey: null,
          requiresKey: false,
        },
        {
          id: "alchemy",
          name: "Alchemy",
          description: "BSC support via shared Alchemy key.",
          envKey: "ALCHEMY_API_KEY",
          requiresKey: true,
        },
        {
          id: "ankr",
          name: "Ankr",
          description: "BSC support via shared Ankr key.",
          envKey: "ANKR_API_KEY",
          requiresKey: true,
        },
        {
          id: "nodereal",
          name: "NodeReal",
          description: "Dedicated BSC RPC endpoint.",
          envKey: "NODEREAL_BSC_RPC_URL",
          requiresKey: true,
        },
        {
          id: "quicknode",
          name: "QuickNode",
          description: "Dedicated BSC RPC endpoint.",
          envKey: "QUICKNODE_BSC_RPC_URL",
          requiresKey: true,
        },
      ],
    },
    {
      id: "solana",
      name: "Solana",
      description: "Solana mainnet tokens and NFTs.",
      rpcProviders: [
        {
          id: "eliza-cloud",
          name: "Eliza Cloud",
          description: "Managed RPC. No setup needed.",
          envKey: null,
          requiresKey: false,
        },
        {
          id: "helius-birdeye",
          name: "Helius + Birdeye",
          description: "Solana RPC plus token metadata.",
          envKey: "HELIUS_API_KEY",
          requiresKey: true,
        },
      ],
    },
  ];
}

export function resolveWalletRpcReadiness(
  config?: Pick<MiladyConfig, "cloud" | "wallet"> | null,
): WalletRpcReadiness {
  const cloudApiKey = resolveCloudApiKey(config);
  const cloudBaseUrl = resolveCloudApiBaseUrl(config?.cloud?.baseUrl);
  const cloudManagedAccess = Boolean(cloudApiKey);
  const cloudOptions = {
    cloudManagedAccess,
    cloudApiKey,
    cloudBaseUrl,
  } satisfies WalletRpcResolutionOptions;

  const { selectedRpcProviders, legacyCustomChains } =
    resolvePersistedOrMigratedWalletSelections(config);
  const legacyCustomChainSet = new Set(legacyCustomChains);

  const alchemyKey = normalizeSecret(process.env.ALCHEMY_API_KEY);
  const infuraKey = normalizeSecret(process.env.INFURA_API_KEY);
  const ankrKey = normalizeSecret(process.env.ANKR_API_KEY);
  const heliusKey = normalizeSecret(process.env.HELIUS_API_KEY);
  const birdeyeKey = normalizeSecret(process.env.BIRDEYE_API_KEY);
  const nodeRealBscRpcUrl = normalizeSecret(process.env.NODEREAL_BSC_RPC_URL);
  const quickNodeBscRpcUrl = normalizeSecret(process.env.QUICKNODE_BSC_RPC_URL);

  const ethereumRpcUrls = legacyCustomChainSet.has("evm")
    ? uniqueRpcUrls([process.env.ETHEREUM_RPC_URL])
    : selectedRpcProviders.evm === "eliza-cloud"
      ? uniqueRpcUrls(
          [buildCloudEvmRpcUrl("mainnet", cloudOptions)],
          cloudManagedAccess ? DEFAULT_PUBLIC_ETHEREUM_RPC_URLS : [],
        )
      : selectedRpcProviders.evm === "infura"
        ? uniqueRpcUrls([buildInfuraRpcUrl("mainnet", infuraKey)])
        : [];

  const baseRpcUrls = legacyCustomChainSet.has("evm")
    ? uniqueRpcUrls([process.env.BASE_RPC_URL])
    : selectedRpcProviders.evm === "eliza-cloud"
      ? uniqueRpcUrls(
          [buildCloudEvmRpcUrl("base", cloudOptions)],
          cloudManagedAccess ? DEFAULT_PUBLIC_BASE_RPC_URLS : [],
        )
      : selectedRpcProviders.evm === "infura"
        ? uniqueRpcUrls([buildInfuraRpcUrl("base", infuraKey)])
        : [];

  const arbitrumRpcUrls =
    selectedRpcProviders.evm === "infura"
      ? uniqueRpcUrls([buildInfuraRpcUrl("arbitrum", infuraKey)])
      : [];

  const optimismRpcUrls =
    selectedRpcProviders.evm === "infura"
      ? uniqueRpcUrls([buildInfuraRpcUrl("optimism", infuraKey)])
      : [];

  const polygonRpcUrls =
    selectedRpcProviders.evm === "infura"
      ? uniqueRpcUrls([buildInfuraRpcUrl("polygon", infuraKey)])
      : [];

  const avalancheRpcUrls = legacyCustomChainSet.has("evm")
    ? uniqueRpcUrls([process.env.AVALANCHE_RPC_URL])
    : selectedRpcProviders.evm === "eliza-cloud"
      ? uniqueRpcUrls(
          [buildCloudEvmRpcUrl("avalanche", cloudOptions)],
          cloudManagedAccess ? DEFAULT_PUBLIC_AVALANCHE_RPC_URLS : [],
        )
      : [];

  const bscRpcUrls = legacyCustomChainSet.has("bsc")
    ? uniqueRpcUrls([process.env.BSC_RPC_URL])
    : selectedRpcProviders.bsc === "eliza-cloud"
      ? uniqueRpcUrls(
          [buildCloudEvmRpcUrl("bsc", cloudOptions)],
          cloudManagedAccess ? DEFAULT_PUBLIC_BSC_RPC_URLS : [],
        )
      : selectedRpcProviders.bsc === "nodereal"
        ? uniqueRpcUrls([nodeRealBscRpcUrl])
        : selectedRpcProviders.bsc === "quicknode"
          ? uniqueRpcUrls([quickNodeBscRpcUrl])
          : uniqueRpcUrls(DEFAULT_PUBLIC_BSC_RPC_URLS);

  const solanaRpcUrls = legacyCustomChainSet.has("solana")
    ? uniqueRpcUrls([process.env.SOLANA_RPC_URL])
    : selectedRpcProviders.solana === "eliza-cloud"
      ? uniqueRpcUrls(
          [buildCloudSolanaRpcUrl(cloudOptions)],
          cloudManagedAccess ? DEFAULT_PUBLIC_SOLANA_RPC_URLS : [],
        )
      : heliusKey
        ? uniqueRpcUrls([
            `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`,
          ])
        : [];

  const evmMode = legacyCustomChainSet.has("evm")
    ? "rpc"
    : selectedRpcProviders.evm === "alchemy"
      ? "alchemy"
      : selectedRpcProviders.evm === "ankr"
        ? "ankr"
        : selectedRpcProviders.evm === "infura" ||
            selectedRpcProviders.evm === "eliza-cloud"
          ? "rpc"
          : "disabled";

  const bscMode = legacyCustomChainSet.has("bsc")
    ? "rpc"
    : selectedRpcProviders.bsc === "alchemy"
      ? "alchemy"
      : selectedRpcProviders.bsc === "ankr"
        ? "ankr"
        : selectedRpcProviders.bsc === "nodereal" ||
            selectedRpcProviders.bsc === "quicknode" ||
            selectedRpcProviders.bsc === "eliza-cloud"
          ? "rpc"
          : "disabled";

  const activeAlchemyKey =
    selectedRpcProviders.evm === "alchemy" ||
    selectedRpcProviders.bsc === "alchemy"
      ? alchemyKey
      : null;
  const activeAnkrKey =
    selectedRpcProviders.evm === "ankr" || selectedRpcProviders.bsc === "ankr"
      ? ankrKey
      : null;
  const activeHeliusKey =
    selectedRpcProviders.solana === "helius-birdeye" ? heliusKey : null;

  const ethereumBalanceReady =
    evmMode === "alchemy"
      ? Boolean(alchemyKey)
      : evmMode === "ankr"
        ? Boolean(ankrKey)
        : ethereumRpcUrls.length > 0;

  const baseBalanceReady =
    evmMode === "alchemy"
      ? Boolean(alchemyKey)
      : evmMode === "ankr"
        ? Boolean(ankrKey)
        : baseRpcUrls.length > 0;

  const avalancheBalanceReady =
    evmMode === "alchemy"
      ? Boolean(alchemyKey)
      : evmMode === "ankr"
        ? Boolean(ankrKey)
        : avalancheRpcUrls.length > 0;

  const bscBalanceReady =
    bscMode === "alchemy"
      ? Boolean(alchemyKey)
      : bscMode === "ankr"
        ? Boolean(ankrKey)
        : bscRpcUrls.length > 0;

  const solanaBalanceReady =
    selectedRpcProviders.solana === "helius-birdeye"
      ? Boolean(heliusKey) || solanaRpcUrls.length > 0
      : solanaRpcUrls.length > 0;

  return {
    selectedRpcProviders,
    legacyCustomChains,
    cloudManagedAccess,
    alchemyKeySet: Boolean(alchemyKey),
    infuraKeySet: Boolean(infuraKey),
    ankrKeySet: Boolean(ankrKey),
    nodeRealBscRpcSet: Boolean(nodeRealBscRpcUrl),
    quickNodeBscRpcSet: Boolean(quickNodeBscRpcUrl),
    heliusKeySet: Boolean(heliusKey),
    birdeyeKeySet: Boolean(birdeyeKey),
    activeAlchemyKey,
    activeAnkrKey,
    activeHeliusKey,
    evmBalanceReady: Boolean(
      ethereumBalanceReady ||
        baseBalanceReady ||
        avalancheBalanceReady ||
        arbitrumRpcUrls.length > 0 ||
        optimismRpcUrls.length > 0 ||
        polygonRpcUrls.length > 0,
    ),
    managedBscRpcReady: bscRpcUrls.length > 0,
    ethereumBalanceReady,
    baseBalanceReady,
    bscBalanceReady,
    avalancheBalanceReady,
    solanaBalanceReady,
    ethereumRpcUrls,
    baseRpcUrls,
    arbitrumRpcUrls,
    optimismRpcUrls,
    polygonRpcUrls,
    bscRpcUrls,
    avalancheRpcUrls,
    solanaRpcUrls,
    chainProviderMode: {
      ethereum: evmMode,
      base: evmMode,
      arbitrum: evmMode,
      optimism: evmMode,
      polygon: evmMode,
      bsc: bscMode,
      avalanche: evmMode,
    },
  };
}
