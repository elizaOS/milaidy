import type http from "node:http";
import { logger } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";
import {
  fetchEvmBalances,
  fetchEvmNfts,
  fetchSolanaBalances,
  fetchSolanaNfts,
  generateWalletForChain,
  getWalletAddresses,
  importWallet,
  validatePrivateKey,
  type WalletBalancesResponse,
  type WalletChain,
  type WalletConfigStatus,
  type WalletNftsResponse,
} from "./wallet";

interface WalletExportRequestBody {
  confirm?: boolean;
  exportToken?: string;
}

interface WalletExportRejectionLike {
  status: 401 | 403;
  reason: string;
}

export interface WalletRouteDependencies {
  getWalletAddresses: typeof getWalletAddresses;
  fetchEvmBalances: typeof fetchEvmBalances;
  fetchSolanaBalances: typeof fetchSolanaBalances;
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
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const heliusKey = process.env.HELIUS_API_KEY;

    const result: WalletBalancesResponse = { evm: null, solana: null };

    if (addresses.evmAddress && alchemyKey) {
      try {
        const chains = await deps.fetchEvmBalances(
          addresses.evmAddress,
          alchemyKey,
        );
        result.evm = { address: addresses.evmAddress, chains };
      } catch (err) {
        logger.warn(`[wallet] EVM balance fetch failed: ${err}`);
      }
    }

    if (addresses.solanaAddress && heliusKey) {
      try {
        const solanaData = await deps.fetchSolanaBalances(
          addresses.solanaAddress,
          heliusKey,
        );
        result.solana = { address: addresses.solanaAddress, ...solanaData };
      } catch (err) {
        logger.warn(`[wallet] Solana balance fetch failed: ${err}`);
      }
    }

    json(res, result);
    return true;
  }

  // GET /api/wallet/nfts
  if (method === "GET" && pathname === "/api/wallet/nfts") {
    const addresses = deps.getWalletAddresses();
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const heliusKey = process.env.HELIUS_API_KEY;

    const result: WalletNftsResponse = { evm: [], solana: null };

    if (addresses.evmAddress && alchemyKey) {
      try {
        result.evm = await deps.fetchEvmNfts(addresses.evmAddress, alchemyKey);
      } catch (err) {
        logger.warn(`[wallet] EVM NFT fetch failed: ${err}`);
      }
    }

    if (addresses.solanaAddress && heliusKey) {
      try {
        const nfts = await deps.fetchSolanaNfts(
          addresses.solanaAddress,
          heliusKey,
        );
        result.solana = { nfts };
      } catch (err) {
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
    const configStatus: WalletConfigStatus = {
      alchemyKeySet: Boolean(process.env.ALCHEMY_API_KEY),
      infuraKeySet: Boolean(process.env.INFURA_API_KEY),
      ankrKeySet: Boolean(process.env.ANKR_API_KEY),
      heliusKeySet: Boolean(process.env.HELIUS_API_KEY),
      birdeyeKeySet: Boolean(process.env.BIRDEYE_API_KEY),
      evmChains: ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"],
      evmAddress: addresses.evmAddress,
      solanaAddress: addresses.solanaAddress,
    };
    json(res, configStatus);
    return true;
  }

  // PUT /api/wallet/config
  if (method === "PUT" && pathname === "/api/wallet/config") {
    const body = await readJsonBody<Record<string, string>>(req, res);
    if (!body) return true;

    const allowedKeys = [
      "ALCHEMY_API_KEY",
      "INFURA_API_KEY",
      "ANKR_API_KEY",
      "HELIUS_API_KEY",
      "BIRDEYE_API_KEY",
    ];

    if (!config.env) config.env = {};

    for (const key of allowedKeys) {
      const value = body[key];
      if (typeof value === "string" && value.trim()) {
        process.env[key] = value.trim();
        (config.env as Record<string, string>)[key] = value.trim();
      }
    }

    const heliusValue = body.HELIUS_API_KEY;
    if (typeof heliusValue === "string" && heliusValue.trim()) {
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusValue.trim()}`;
      process.env.SOLANA_RPC_URL = rpcUrl;
      (config.env as Record<string, string>).SOLANA_RPC_URL = rpcUrl;
    }

    ensureWalletKeysInEnvAndConfig(config);

    try {
      saveConfig(config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    ctx.scheduleRuntimeRestart?.("Wallet configuration updated");
    json(res, { ok: true });
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
