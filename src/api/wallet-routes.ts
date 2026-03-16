import type http from "node:http";
import { logger } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import { createIntegrationTelemetrySpan } from "../diagnostics/integration-observability";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";
import {
  fetchEvmBalances,
  fetchEvmNfts,
  fetchSolanaBalances,
  fetchSolanaNativeBalanceViaRpc,
  fetchSolanaNfts,
  generateWalletForChain,
  getWalletAddresses,
  importWallet,
  validatePrivateKey,
  type WalletBalancesResponse,
  type WalletChain,
  type WalletConfigStatus,
  type WalletConfigUpdateRequest,
  type WalletNftsResponse,
} from "./wallet";
import {
  applyWalletRpcConfigUpdate,
  resolveWalletRpcReadiness,
} from "./wallet-rpc";

interface WalletExportRequestBody {
  confirm?: boolean;
  exportToken?: string;
}

interface WalletExportRejectionLike {
  status: 401 | 403;
  reason: string;
}

const WALLET_CONFIG_COMPAT_KEYS = new Set([
  "ALCHEMY_API_KEY",
  "INFURA_API_KEY",
  "ANKR_API_KEY",
  "ETHEREUM_RPC_URL",
  "BASE_RPC_URL",
  "AVALANCHE_RPC_URL",
  "HELIUS_API_KEY",
  "BIRDEYE_API_KEY",
  "NODEREAL_BSC_RPC_URL",
  "QUICKNODE_BSC_RPC_URL",
  "BSC_RPC_URL",
  "SOLANA_RPC_URL",
]);

function resolveWalletConfigUpdateRequest(
  body: unknown,
  currentSelections: WalletConfigStatus["selectedRpcProviders"],
): WalletConfigUpdateRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const record = body as Record<string, unknown>;
  if (
    record.selections &&
    typeof record.selections === "object" &&
    !Array.isArray(record.selections)
  ) {
    const credentials =
      record.credentials &&
      typeof record.credentials === "object" &&
      !Array.isArray(record.credentials)
        ? Object.fromEntries(
            Object.entries(
              record.credentials as Record<string, unknown>,
            ).filter(([, value]) => typeof value === "string"),
          )
        : undefined;
    return {
      selections: record.selections as WalletConfigUpdateRequest["selections"],
      credentials: credentials as WalletConfigUpdateRequest["credentials"],
    };
  }

  const compatCredentials = Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) =>
        WALLET_CONFIG_COMPAT_KEYS.has(key) && typeof value === "string",
    ),
  );

  if (Object.keys(compatCredentials).length === 0) {
    return null;
  }

  return {
    selections: currentSelections,
    credentials: compatCredentials,
  };
}

export interface WalletRouteDependencies {
  getWalletAddresses: typeof getWalletAddresses;
  fetchEvmBalances: typeof fetchEvmBalances;
  fetchSolanaBalances: typeof fetchSolanaBalances;
  fetchSolanaNativeBalanceViaRpc: typeof fetchSolanaNativeBalanceViaRpc;
  fetchEvmNfts: typeof fetchEvmNfts;
  fetchSolanaNfts: typeof fetchSolanaNfts;
  validatePrivateKey: typeof validatePrivateKey;
  importWallet: typeof importWallet;
  generateWalletForChain: typeof generateWalletForChain;
}

export const DEFAULT_WALLET_ROUTE_DEPENDENCIES: WalletRouteDependencies = {
  getWalletAddresses,
  fetchEvmBalances,
  fetchSolanaBalances,
  fetchSolanaNativeBalanceViaRpc,
  fetchEvmNfts,
  fetchSolanaNfts,
  validatePrivateKey,
  importWallet,
  generateWalletForChain,
};

export interface WalletRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "readJsonBody" | "json" | "error"> {
  config: MiladyConfig;
  saveConfig: (config: MiladyConfig) => void;
  ensureWalletKeysInEnvAndConfig: (config: MiladyConfig) => boolean;
  resolveWalletExportRejection: (
    req: http.IncomingMessage,
    body: WalletExportRequestBody,
  ) => WalletExportRejectionLike | null;
  scheduleRuntimeRestart?: (reason: string) => void;
  deps?: WalletRouteDependencies;
}

export async function handleWalletRoutes(
  ctx: WalletRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    config,
    saveConfig,
    ensureWalletKeysInEnvAndConfig,
    resolveWalletExportRejection,
    readJsonBody,
    json,
    error,
  } = ctx;
  const deps = ctx.deps ?? DEFAULT_WALLET_ROUTE_DEPENDENCIES;

  // GET /api/wallet/addresses
  if (method === "GET" && pathname === "/api/wallet/addresses") {
    json(res, deps.getWalletAddresses());
    return true;
  }

  // GET /api/wallet/balances
  if (method === "GET" && pathname === "/api/wallet/balances") {
    const addresses = deps.getWalletAddresses();
    const rpcReadiness = resolveWalletRpcReadiness(config);
    const alchemyKey = rpcReadiness.activeAlchemyKey;
    const ankrKey = rpcReadiness.activeAnkrKey;
    const heliusKey = rpcReadiness.activeHeliusKey;

    const result: WalletBalancesResponse = { evm: null, solana: null };

    if (addresses.evmAddress && rpcReadiness.evmBalanceReady) {
      const evmBalancesSpan = createIntegrationTelemetrySpan({
        boundary: "wallet",
        operation: "fetch_evm_balances",
      });
      try {
        const chains = await deps.fetchEvmBalances(addresses.evmAddress, {
          alchemyKey,
          ankrKey,
          cloudManagedAccess: rpcReadiness.cloudManagedAccess,
          bscRpcUrls: rpcReadiness.bscRpcUrls,
          ethereumRpcUrls: rpcReadiness.ethereumRpcUrls,
          baseRpcUrls: rpcReadiness.baseRpcUrls,
          arbitrumRpcUrls: rpcReadiness.arbitrumRpcUrls,
          optimismRpcUrls: rpcReadiness.optimismRpcUrls,
          polygonRpcUrls: rpcReadiness.polygonRpcUrls,
          avaxRpcUrls: rpcReadiness.avalancheRpcUrls,
          chainProviderMode: rpcReadiness.chainProviderMode,
        });
        result.evm = { address: addresses.evmAddress, chains };
        evmBalancesSpan.success();
      } catch (err) {
        evmBalancesSpan.failure({ error: err });
        logger.warn(`[wallet] EVM balance fetch failed: ${err}`);
      }
    }

    if (addresses.solanaAddress && rpcReadiness.solanaBalanceReady) {
      const solanaBalancesSpan = createIntegrationTelemetrySpan({
        boundary: "wallet",
        operation: "fetch_solana_balances",
      });
      try {
        const solanaData = heliusKey
          ? await deps.fetchSolanaBalances(addresses.solanaAddress, heliusKey)
          : await deps.fetchSolanaNativeBalanceViaRpc(
              addresses.solanaAddress,
              rpcReadiness.solanaRpcUrls,
            );
        result.solana = { address: addresses.solanaAddress, ...solanaData };
        solanaBalancesSpan.success();
      } catch (err) {
        solanaBalancesSpan.failure({ error: err });
        logger.warn(`[wallet] Solana balance fetch failed: ${err}`);
      }
    }

    json(res, result);
    return true;
  }

  // GET /api/wallet/nfts
  if (method === "GET" && pathname === "/api/wallet/nfts") {
    const addresses = deps.getWalletAddresses();
    const rpcReadiness = resolveWalletRpcReadiness(config);
    const alchemyKey = rpcReadiness.activeAlchemyKey;
    const ankrKey = rpcReadiness.activeAnkrKey;
    const heliusKey = rpcReadiness.activeHeliusKey;

    const result: WalletNftsResponse = { evm: [], solana: null };

    if (addresses.evmAddress && rpcReadiness.evmBalanceReady) {
      const evmNftsSpan = createIntegrationTelemetrySpan({
        boundary: "wallet",
        operation: "fetch_evm_nfts",
      });
      try {
        result.evm = await deps.fetchEvmNfts(addresses.evmAddress, {
          alchemyKey,
          ankrKey,
          cloudManagedAccess: rpcReadiness.cloudManagedAccess,
          bscRpcUrls: rpcReadiness.bscRpcUrls,
          ethereumRpcUrls: rpcReadiness.ethereumRpcUrls,
          baseRpcUrls: rpcReadiness.baseRpcUrls,
          arbitrumRpcUrls: rpcReadiness.arbitrumRpcUrls,
          optimismRpcUrls: rpcReadiness.optimismRpcUrls,
          polygonRpcUrls: rpcReadiness.polygonRpcUrls,
          avaxRpcUrls: rpcReadiness.avalancheRpcUrls,
          chainProviderMode: rpcReadiness.chainProviderMode,
        });
        evmNftsSpan.success();
      } catch (err) {
        evmNftsSpan.failure({ error: err });
        logger.warn(`[wallet] EVM NFT fetch failed: ${err}`);
      }
    }

    if (addresses.solanaAddress && heliusKey) {
      const solanaNftsSpan = createIntegrationTelemetrySpan({
        boundary: "wallet",
        operation: "fetch_solana_nfts",
      });
      try {
        const nfts = await deps.fetchSolanaNfts(
          addresses.solanaAddress,
          heliusKey,
        );
        result.solana = { nfts };
        solanaNftsSpan.success();
      } catch (err) {
        solanaNftsSpan.failure({ error: err });
        logger.warn(`[wallet] Solana NFT fetch failed: ${err}`);
      }
    }

    json(res, result);
    return true;
  }

  // POST /api/wallet/import
  if (method === "POST" && pathname === "/api/wallet/import") {
    const body = await readJsonBody<{ chain?: string; privateKey?: string }>(
      req,
      res,
    );
    if (!body) return true;

    if (!body.privateKey?.trim()) {
      error(res, "privateKey is required");
      return true;
    }

    let chain: WalletChain;
    if (body.chain === "evm" || body.chain === "solana") {
      chain = body.chain;
    } else if (body.chain) {
      error(
        res,
        `Unsupported chain: ${body.chain}. Must be "evm" or "solana".`,
      );
      return true;
    } else {
      const detection = deps.validatePrivateKey(body.privateKey.trim());
      chain = detection.chain;
    }

    const result = deps.importWallet(chain, body.privateKey.trim());

    if (!result.success) {
      error(res, result.error ?? "Import failed", 422);
      return true;
    }

    if (!config.env) config.env = {};
    const envKey = chain === "evm" ? "EVM_PRIVATE_KEY" : "SOLANA_PRIVATE_KEY";
    (config.env as Record<string, string>)[envKey] = process.env[envKey] ?? "";

    try {
      saveConfig(config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, {
      ok: true,
      chain,
      address: result.address,
    });
    return true;
  }

  // POST /api/wallet/generate
  if (method === "POST" && pathname === "/api/wallet/generate") {
    const body = await readJsonBody<{ chain?: string }>(req, res);
    if (!body) return true;

    const chain = body.chain as string | undefined;
    const validChains: Array<WalletChain | "both"> = ["evm", "solana", "both"];

    if (chain && !validChains.includes(chain as WalletChain | "both")) {
      error(
        res,
        `Unsupported chain: ${chain}. Must be "evm", "solana", or "both".`,
      );
      return true;
    }

    const targetChain = (chain ?? "both") as WalletChain | "both";

    if (!config.env) config.env = {};

    const generated: Array<{ chain: WalletChain; address: string }> = [];

    if (targetChain === "both" || targetChain === "evm") {
      const result = deps.generateWalletForChain("evm");
      process.env.EVM_PRIVATE_KEY = result.privateKey;
      (config.env as Record<string, string>).EVM_PRIVATE_KEY =
        result.privateKey;
      generated.push({ chain: "evm", address: result.address });
      logger.info(`[milady-api] Generated EVM wallet: ${result.address}`);
    }

    if (targetChain === "both" || targetChain === "solana") {
      const result = deps.generateWalletForChain("solana");
      process.env.SOLANA_PRIVATE_KEY = result.privateKey;
      (config.env as Record<string, string>).SOLANA_PRIVATE_KEY =
        result.privateKey;
      generated.push({ chain: "solana", address: result.address });
      logger.info(`[milady-api] Generated Solana wallet: ${result.address}`);
    }

    try {
      saveConfig(config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, { ok: true, wallets: generated });
    return true;
  }

  // GET /api/wallet/config
  if (method === "GET" && pathname === "/api/wallet/config") {
    const addresses = deps.getWalletAddresses();
    const rpcReadiness = resolveWalletRpcReadiness(config);
    const configStatus: WalletConfigStatus = {
      selectedRpcProviders: rpcReadiness.selectedRpcProviders,
      legacyCustomChains: rpcReadiness.legacyCustomChains,
      alchemyKeySet: rpcReadiness.alchemyKeySet,
      infuraKeySet: rpcReadiness.infuraKeySet,
      ankrKeySet: rpcReadiness.ankrKeySet,
      nodeRealBscRpcSet: rpcReadiness.nodeRealBscRpcSet,
      quickNodeBscRpcSet: rpcReadiness.quickNodeBscRpcSet,
      managedBscRpcReady: rpcReadiness.managedBscRpcReady,
      cloudManagedAccess: rpcReadiness.cloudManagedAccess,
      evmBalanceReady: rpcReadiness.evmBalanceReady,
      ethereumBalanceReady: rpcReadiness.ethereumBalanceReady,
      baseBalanceReady: rpcReadiness.baseBalanceReady,
      bscBalanceReady: rpcReadiness.bscBalanceReady,
      avalancheBalanceReady: rpcReadiness.avalancheBalanceReady,
      solanaBalanceReady: rpcReadiness.solanaBalanceReady,
      heliusKeySet: rpcReadiness.heliusKeySet,
      birdeyeKeySet: rpcReadiness.birdeyeKeySet,
      evmChains: [
        "Ethereum",
        "Base",
        "Arbitrum",
        "Optimism",
        "Polygon",
        "BSC",
        "Avalanche",
      ],
      evmAddress: addresses.evmAddress,
      solanaAddress: addresses.solanaAddress,
    };
    json(res, configStatus);
    return true;
  }

  // PUT /api/wallet/config
  if (method === "PUT" && pathname === "/api/wallet/config") {
    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return true;
    const currentSelections = resolveWalletRpcReadiness(config);
    const updateRequest = resolveWalletConfigUpdateRequest(
      body,
      currentSelections.selectedRpcProviders,
    );
    if (!updateRequest) {
      error(res, "Invalid wallet config payload", 400);
      return true;
    }

    applyWalletRpcConfigUpdate(config, updateRequest);

    ensureWalletKeysInEnvAndConfig(config);

    try {
      saveConfig(config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, { ok: true });
    ctx.scheduleRuntimeRestart?.("Wallet configuration updated");
    return true;
  }

  // POST /api/wallet/export
  if (method === "POST" && pathname === "/api/wallet/export") {
    const body = await readJsonBody<WalletExportRequestBody>(req, res);
    if (!body) return true;

    const rejection = resolveWalletExportRejection(req, body);
    if (rejection) {
      error(res, rejection.reason, rejection.status);
      return true;
    }

    const evmKey = process.env.EVM_PRIVATE_KEY ?? null;
    const solanaKey = process.env.SOLANA_PRIVATE_KEY ?? null;
    const addresses = deps.getWalletAddresses();

    logger.warn("[wallet] Private keys exported via API");

    json(res, {
      evm: evmKey
        ? { privateKey: evmKey, address: addresses.evmAddress }
        : null,
      solana: solanaKey
        ? { privateKey: solanaKey, address: addresses.solanaAddress }
        : null,
    });
    return true;
  }

  return false;
}
