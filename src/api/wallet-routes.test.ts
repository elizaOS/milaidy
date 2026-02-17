import { afterEach, describe, expect, test, vi } from "vitest";
import type { MiladyConfig } from "../config/config";
import {
  handleWalletRoutes,
  type WalletRouteDependencies,
} from "./wallet-routes";

const ENV_KEYS = [
  "ALCHEMY_API_KEY",
  "INFURA_API_KEY",
  "ANKR_API_KEY",
  "HELIUS_API_KEY",
  "BIRDEYE_API_KEY",
  "EVM_PRIVATE_KEY",
  "SOLANA_PRIVATE_KEY",
  "SOLANA_RPC_URL",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.restoreAllMocks();
});

type InvokeResult = {
  handled: boolean;
  status: number;
  payload: unknown;
  config: MiladyConfig;
  saveConfig: ReturnType<typeof vi.fn>;
  ensureWalletKeysInEnvAndConfig: ReturnType<typeof vi.fn>;
};

function createDeps(): WalletRouteDependencies {
  return {
    getWalletAddresses: vi.fn(() => ({
      evmAddress: "0xabc",
      solanaAddress: "So111",
    })),
    fetchEvmBalances: vi.fn(async () => []),
    fetchSolanaBalances: vi.fn(async () => ({
      solBalance: "1",
      solValueUsd: "100",
      tokens: [],
    })),
    fetchEvmNfts: vi.fn(async () => []),
    fetchSolanaNfts: vi.fn(async () => []),
    validatePrivateKey: vi.fn(() => ({
      valid: true,
      chain: "evm" as const,
      address: "0xabc",
      error: null,
    })),
    importWallet: vi.fn(() => ({
      success: true,
      chain: "evm" as const,
      address: "0xabc",
      error: null,
    })),
    generateWalletForChain: vi.fn((chain) => ({
      chain,
      address: chain === "evm" ? "0xgenerated" : "SoGenerated",
      privateKey: chain === "evm" ? "evm-key" : "sol-key",
    })),
  };
}

async function invoke(args: {
  method: string;
  pathname: string;
  body?: Record<string, unknown> | null;
  config?: MiladyConfig;
  deps?: WalletRouteDependencies;
  resolveWalletExportRejection?: (
    _req: unknown,
    _body: unknown,
  ) => { status: 401 | 403; reason: string } | null;
}): Promise<InvokeResult> {
  let status = 200;
  let payload: unknown = null;

  const config = args.config ?? ({ env: {} } as MiladyConfig);
  const deps = args.deps ?? createDeps();
  const saveConfig = vi.fn();
  const ensureWalletKeysInEnvAndConfig = vi.fn();

  const handled = await handleWalletRoutes({
    req: {} as never,
    res: {} as never,
    method: args.method,
    pathname: args.pathname,
    config,
    saveConfig,
    ensureWalletKeysInEnvAndConfig,
    resolveWalletExportRejection:
      args.resolveWalletExportRejection ?? (() => null),
    deps,
    readJsonBody: vi.fn(async () => args.body ?? null),
    json: (_res, data, code = 200) => {
      status = code;
      payload = data;
    },
    error: (_res, message, code = 400) => {
      status = code;
      payload = { error: message };
    },
  });

  return {
    handled,
    status,
    payload,
    config,
    saveConfig,
    ensureWalletKeysInEnvAndConfig,
  };
}

describe("wallet routes", () => {
  test("returns false for unrelated route", async () => {
    const result = await invoke({ method: "GET", pathname: "/api/status" });

    expect(result.handled).toBe(false);
  });

  test("returns wallet addresses", async () => {
    const deps = createDeps();
    const result = await invoke({
      method: "GET",
      pathname: "/api/wallet/addresses",
      deps,
    });

    expect(result.handled).toBe(true);
    expect(result.payload).toEqual({
      evmAddress: "0xabc",
      solanaAddress: "So111",
    });
    expect(deps.getWalletAddresses).toHaveBeenCalled();
  });

  test("returns wallet balances when provider keys exist", async () => {
    process.env.ALCHEMY_API_KEY = "alchemy";
    process.env.HELIUS_API_KEY = "helius";

    const deps = createDeps();
    const result = await invoke({
      method: "GET",
      pathname: "/api/wallet/balances",
      deps,
    });

    expect(result.handled).toBe(true);
    expect(deps.fetchEvmBalances).toHaveBeenCalledWith("0xabc", "alchemy");
    expect(deps.fetchSolanaBalances).toHaveBeenCalledWith("So111", "helius");
    expect(result.payload).toEqual({
      evm: { address: "0xabc", chains: [] },
      solana: {
        address: "So111",
        solBalance: "1",
        solValueUsd: "100",
        tokens: [],
      },
    });
  });

  test("requires privateKey for wallet import", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/wallet/import",
      body: {},
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(400);
    expect(result.payload).toEqual({ error: "privateKey is required" });
  });

  test("rejects unsupported wallet import chain", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/wallet/import",
      body: { chain: "bitcoin", privateKey: "key" },
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(400);
    expect(result.payload).toEqual({
      error: 'Unsupported chain: bitcoin. Must be "evm" or "solana".',
    });
  });

  test("imports wallet, persists key, and saves config", async () => {
    process.env.EVM_PRIVATE_KEY = "persisted-key";

    const deps = createDeps();
    const result = await invoke({
      method: "POST",
      pathname: "/api/wallet/import",
      body: { privateKey: "key" },
      deps,
      config: { env: {} } as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(deps.validatePrivateKey).toHaveBeenCalledWith("key");
    expect(deps.importWallet).toHaveBeenCalledWith("evm", "key");
    expect((result.config.env as Record<string, string>).EVM_PRIVATE_KEY).toBe(
      "persisted-key",
    );
    expect(result.saveConfig).toHaveBeenCalledWith(result.config);
    expect(result.payload).toEqual({
      ok: true,
      chain: "evm",
      address: "0xabc",
    });
  });

  test("generates both wallets and updates env/config", async () => {
    const deps = createDeps();
    const result = await invoke({
      method: "POST",
      pathname: "/api/wallet/generate",
      body: { chain: "both" },
      deps,
      config: { env: {} } as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(deps.generateWalletForChain).toHaveBeenCalledWith("evm");
    expect(deps.generateWalletForChain).toHaveBeenCalledWith("solana");
    expect(process.env.EVM_PRIVATE_KEY).toBe("evm-key");
    expect(process.env.SOLANA_PRIVATE_KEY).toBe("sol-key");
    expect(result.saveConfig).toHaveBeenCalledWith(result.config);
    expect(result.payload).toEqual({
      ok: true,
      wallets: [
        { chain: "evm", address: "0xgenerated" },
        { chain: "solana", address: "SoGenerated" },
      ],
    });
  });

  test("updates wallet provider config and derives SOLANA_RPC_URL", async () => {
    const result = await invoke({
      method: "PUT",
      pathname: "/api/wallet/config",
      body: {
        ALCHEMY_API_KEY: "a-key",
        HELIUS_API_KEY: "h-key",
      },
      config: { env: {} } as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(process.env.ALCHEMY_API_KEY).toBe("a-key");
    expect(process.env.HELIUS_API_KEY).toBe("h-key");
    expect(process.env.SOLANA_RPC_URL).toBe(
      "https://mainnet.helius-rpc.com/?api-key=h-key",
    );
    expect(result.ensureWalletKeysInEnvAndConfig).toHaveBeenCalledWith(
      result.config,
    );
    expect(result.saveConfig).toHaveBeenCalledWith(result.config);
    expect(result.payload).toEqual({ ok: true });
  });

  test("blocks wallet export when rejection is returned", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/wallet/export",
      body: { confirm: true },
      resolveWalletExportRejection: () => ({ status: 403, reason: "blocked" }),
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(403);
    expect(result.payload).toEqual({ error: "blocked" });
  });

  test("exports wallet keys when authorized", async () => {
    process.env.EVM_PRIVATE_KEY = "evm-secret";
    process.env.SOLANA_PRIVATE_KEY = "sol-secret";

    const result = await invoke({
      method: "POST",
      pathname: "/api/wallet/export",
      body: { confirm: true },
      resolveWalletExportRejection: () => null,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toEqual({
      evm: { privateKey: "evm-secret", address: "0xabc" },
      solana: { privateKey: "sol-secret", address: "So111" },
    });
  });
});
