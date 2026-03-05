import type http from "node:http";
import { logger } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import { createIntegrationTelemetrySpan } from "../diagnostics/integration-observability";
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

function configuredAddressFromEnv(
  key: "EVM_ADDRESS" | "SOLANA_ADDRESS",
): string | null {
  const value = process.env[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isEvmDisabled(): boolean {
  return (
    process.env.WALLET_DISABLE_EVM === "1" ||
    process.env.MILADY_WALLET_DISABLE_EVM === "1"
  );
}

function resolveEffectiveAddresses(
  derived: { evmAddress: string | null; solanaAddress: string | null },
  opts?: { evmDisabled?: boolean },
): { evmAddress: string | null; solanaAddress: string | null } {
  const evmDisabled = opts?.evmDisabled ?? false;
  const configuredEvm = configuredAddressFromEnv("EVM_ADDRESS");
  const configuredSolana = configuredAddressFromEnv("SOLANA_ADDRESS");
  return {
    // Prefer explicitly configured addresses (wallet-connect/read-only mode)
    // before derived signing addresses.
    evmAddress: evmDisabled ? null : (configuredEvm ?? derived.evmAddress),
    solanaAddress: configuredSolana ?? derived.solanaAddress,
  };
}

async function fetchSolanaBalancePublic(address: string): Promise<{
  solBalance: string;
  solValueUsd: string;
  tokens: Array<{
    symbol: string;
    name: string;
    mint: string;
    balance: string;
    decimals: number;
    valueUsd: string;
    logoUrl: string;
  }>;
}> {
  try {
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [address],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = (await res.json()) as {
      result?: { value?: number };
      error?: { message?: string };
    };
    if (payload.error?.message) throw new Error(payload.error.message);
    const lamports = Number(payload.result?.value ?? 0);
    const sol = Number.isFinite(lamports) ? lamports / 1_000_000_000 : 0;
    return {
      solBalance: sol.toFixed(9),
      solValueUsd: "0",
      tokens: [],
    };
  } catch (err) {
    logger.warn(`[wallet] Public Solana balance fallback failed: ${err}`);
    return {
      solBalance: "0.000000000",
      solValueUsd: "0",
      tokens: [],
    };
  }
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
    const addresses = resolveEffectiveAddresses(deps.getWalletAddresses(), {
      evmDisabled: isEvmDisabled(),
    });
    const evmDisabled = isEvmDisabled();
    json(res, {
      evmAddress: evmDisabled ? null : addresses.evmAddress,
      solanaAddress: addresses.solanaAddress,
    });
    return true;
  }

  // GET /api/wallet/balances
  if (method === "GET" && pathname === "/api/wallet/balances") {
    const evmDisabled = isEvmDisabled();
    const addresses = resolveEffectiveAddresses(deps.getWalletAddresses(), {
      evmDisabled,
    });
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const heliusKey = process.env.HELIUS_API_KEY;

    const result: WalletBalancesResponse = { evm: null, solana: null };

    if (!evmDisabled && addresses.evmAddress && alchemyKey) {
      const evmBalancesSpan = createIntegrationTelemetrySpan({
        boundary: "wallet",
        operation: "fetch_evm_balances",
      });
      try {
        const chains = await deps.fetchEvmBalances(
          addresses.evmAddress,
          alchemyKey,
        );
        result.evm = { address: addresses.evmAddress, chains };
        evmBalancesSpan.success();
      } catch (err) {
        evmBalancesSpan.failure({ error: err });
        logger.warn(`[wallet] EVM balance fetch failed: ${err}`);
      }
    }

    if (addresses.solanaAddress && heliusKey) {
      const solanaBalancesSpan = createIntegrationTelemetrySpan({
        boundary: "wallet",
        operation: "fetch_solana_balances",
      });
      try {
        const solanaData = await deps.fetchSolanaBalances(
          addresses.solanaAddress,
          heliusKey,
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
    const evmDisabled = isEvmDisabled();
    const addresses = resolveEffectiveAddresses(deps.getWalletAddresses(), {
      evmDisabled,
    });
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const heliusKey = process.env.HELIUS_API_KEY;

    const result: WalletNftsResponse = { evm: [], solana: null };

    if (!evmDisabled && addresses.evmAddress && alchemyKey) {
      const evmNftsSpan = createIntegrationTelemetrySpan({
        boundary: "wallet",
        operation: "fetch_evm_nfts",
      });
      try {
        result.evm = await deps.fetchEvmNfts(addresses.evmAddress, alchemyKey);
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
    const evmDisabled = isEvmDisabled();
    const evmConfiguredAddress = configuredAddressFromEnv("EVM_ADDRESS");
    const solanaConfiguredAddress = configuredAddressFromEnv("SOLANA_ADDRESS");
    const effectiveAddresses = resolveEffectiveAddresses(
      deps.getWalletAddresses(),
      {
        evmDisabled,
      },
    );
    const effectiveEvmAddress = effectiveAddresses.evmAddress;
    const effectiveSolanaAddress = effectiveAddresses.solanaAddress;
    const walletConnectionLocked =
      process.env.MILADY_WALLET_CONNECTION_LOCKED === "1";

    const configStatus = {
      alchemyKeySet: Boolean(process.env.ALCHEMY_API_KEY),
      infuraKeySet: Boolean(process.env.INFURA_API_KEY),
      ankrKeySet: Boolean(process.env.ANKR_API_KEY),
      heliusKeySet: Boolean(process.env.HELIUS_API_KEY),
      birdeyeKeySet: Boolean(process.env.BIRDEYE_API_KEY),
      evmPublicSource: true,
      solanaPublicSource: true,
      pricePublicSource: true,
      walletExportEnabled: Boolean(
        process.env.MILADY_ALLOW_WALLET_EXPORT === "1" ||
          process.env.MILADY_WALLET_EXPORT_TOKEN?.trim(),
      ),
      solanaWalletConnected: Boolean(effectiveSolanaAddress),
      walletConnectionLocked,
      evmDisabled,
      evmConfiguredAddress,
      solanaConfiguredAddress,
      evmSigningEnabled: Boolean(process.env.EVM_PRIVATE_KEY?.trim()),
      solanaSigningEnabled: Boolean(process.env.SOLANA_PRIVATE_KEY?.trim()),
      evmChains: ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"],
      evmAddress: effectiveEvmAddress,
      solanaAddress: effectiveSolanaAddress,
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
      "EVM_ADDRESS",
      "SOLANA_ADDRESS",
      "WALLET_DISCONNECT",
      "WALLET_DISABLE_EVM",
    ];

    if (!config.env) config.env = {};

    for (const key of allowedKeys) {
      if (!Object.hasOwn(body, key)) continue;
      const value = body[key];
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
          process.env[key] = trimmed;
          (config.env as Record<string, string>)[key] = trimmed;
        } else {
          delete process.env[key];
          (config.env as Record<string, string>)[key] = "";
        }
      }
    }

    const heliusValue = body.HELIUS_API_KEY;
    if (typeof heliusValue === "string" && heliusValue.trim()) {
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusValue.trim()}`;
      process.env.SOLANA_RPC_URL = rpcUrl;
      (config.env as Record<string, string>).SOLANA_RPC_URL = rpcUrl;
    }

    if (body.WALLET_DISCONNECT === "1") {
      delete process.env.EVM_PRIVATE_KEY;
      delete process.env.SOLANA_PRIVATE_KEY;
      (config.env as Record<string, string>).EVM_PRIVATE_KEY = "";
      (config.env as Record<string, string>).SOLANA_PRIVATE_KEY = "";
      process.env.WALLET_DISCONNECT = "1";
      (config.env as Record<string, string>).WALLET_DISCONNECT = "1";
    } else {
      delete process.env.WALLET_DISCONNECT;
      ensureWalletKeysInEnvAndConfig(config);
    }

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

  // POST /api/wallet/disconnect (and v2 alias)
  if (
    method === "POST" &&
    (pathname === "/api/wallet/disconnect" ||
      pathname === "/api/v2/wallet/disconnect")
  ) {
    if (!config.env) config.env = {};

    delete process.env.EVM_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;
    delete process.env.EVM_ADDRESS;
    delete process.env.SOLANA_ADDRESS;
    process.env.WALLET_DISCONNECT = "1";

    const env = config.env as Record<string, string>;
    env.EVM_PRIVATE_KEY = "";
    env.SOLANA_PRIVATE_KEY = "";
    env.EVM_ADDRESS = "";
    env.SOLANA_ADDRESS = "";
    env.WALLET_DISCONNECT = "1";

    try {
      saveConfig(config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, { ok: true });
    ctx.scheduleRuntimeRestart?.("Wallet disconnected");
    return true;
  }

  // GET /api/wallet/connected-data
  if (method === "GET" && pathname === "/api/wallet/connected-data") {
    const evmDisabled = isEvmDisabled();
    const effectiveAddresses = resolveEffectiveAddresses(
      deps.getWalletAddresses(),
      {
        evmDisabled,
      },
    );

    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const heliusKey = process.env.HELIUS_API_KEY;

    const balances: WalletBalancesResponse = { evm: null, solana: null };
    const nfts: WalletNftsResponse = { evm: [], solana: null };

    if (!evmDisabled && effectiveAddresses.evmAddress && alchemyKey) {
      try {
        const chains = await deps.fetchEvmBalances(
          effectiveAddresses.evmAddress,
          alchemyKey,
        );
        balances.evm = { address: effectiveAddresses.evmAddress, chains };
        nfts.evm = await deps.fetchEvmNfts(
          effectiveAddresses.evmAddress,
          alchemyKey,
        );
      } catch (err) {
        logger.warn(`[wallet] connected-data EVM fetch failed: ${err}`);
      }
    }

    if (effectiveAddresses.solanaAddress && heliusKey) {
      try {
        const solanaData = await deps.fetchSolanaBalances(
          effectiveAddresses.solanaAddress,
          heliusKey,
        );
        balances.solana = {
          address: effectiveAddresses.solanaAddress,
          ...solanaData,
        };
        const solanaNfts = await deps.fetchSolanaNfts(
          effectiveAddresses.solanaAddress,
          heliusKey,
        );
        nfts.solana = { nfts: solanaNfts };
      } catch (err) {
        logger.warn(`[wallet] connected-data Solana fetch failed: ${err}`);
      }
    } else if (effectiveAddresses.solanaAddress) {
      const solanaData = await fetchSolanaBalancePublic(
        effectiveAddresses.solanaAddress,
      );
      balances.solana = {
        address: effectiveAddresses.solanaAddress,
        ...solanaData,
      };
    }

    json(res, {
      account: { mode: "server", username: null },
      addresses: effectiveAddresses,
      balances,
      nfts,
      polymarket: {
        wallet: effectiveAddresses.evmAddress ?? null,
        connected: false,
        availableBalanceUsd: null,
        openExposureUsd: null,
        unsettledPnlUsd: null,
        openPositionsCount: 0,
        positions: [],
      },
    });
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
