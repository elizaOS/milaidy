import { describe, test, expect, vi } from "vitest";
import {
  createMockIncomingMessage,
  createMockHttpResponse,
} from "../../src/test-support/test-helpers";
import { handleWalletRoutes } from "../../src/api/wallet-routes";
import type { WalletRouteContext } from "../../src/api/wallet-routes";

function buildCtx(
  method: string,
  pathname: string,
  overrides?: Partial<WalletRouteContext>,
): WalletRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: pathname }),
    res,
    method,
    pathname,
    json: vi.fn((r, data, status = 200) => {
      r.writeHead(status);
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, msg, status = 500) => {
      r.writeHead(status);
      r.end(JSON.stringify({ error: msg }));
    }),
    readJsonBody: vi.fn(async () => ({})),
    config: {} as any,
    saveConfig: vi.fn(),
    ensureWalletKeysInEnvAndConfig: vi.fn(() => true),
    resolveWalletExportRejection: vi.fn(() => null),
    scheduleRuntimeRestart: vi.fn(),
    deps: {
      getWalletAddresses: vi.fn(() => ({
        evmAddress: "0x1234567890abcdef",
        solanaAddress: null,
      })),
      fetchEvmBalances: vi.fn(async () => []),
      fetchSolanaBalances: vi.fn(async () => ({ tokens: [] })),
      fetchSolanaNativeBalanceViaRpc: vi.fn(async () => "0"),
      fetchEvmNfts: vi.fn(async () => []),
      fetchSolanaNfts: vi.fn(async () => []),
      validatePrivateKey: vi.fn(() => true),
      importWallet: vi.fn(async () => ({ success: true })),
      generateWalletForChain: vi.fn(async () => ({ address: "0xnew" })),
    },
    ...overrides,
  } as WalletRouteContext;
}

describe("wallet-routes", () => {
  describe("GET /api/wallet/addresses", () => {
    test("returns wallet addresses", async () => {
      const ctx = buildCtx("GET", "/api/wallet/addresses");
      const handled = await handleWalletRoutes(ctx);
      expect(handled).toBe(true);
      expect(ctx.json).toHaveBeenCalled();
      expect(ctx.deps!.getWalletAddresses).toHaveBeenCalled();
    });
  });

  describe("GET /api/wallet/balances", () => {
    test("handles request", async () => {
      const ctx = buildCtx("GET", "/api/wallet/balances");
      const handled = await handleWalletRoutes(ctx);
      expect(handled).toBe(true);
      expect(ctx.json).toHaveBeenCalled();
    });
  });

  describe("GET /api/wallet/nfts", () => {
    test("handles request", async () => {
      const ctx = buildCtx("GET", "/api/wallet/nfts");
      const handled = await handleWalletRoutes(ctx);
      expect(handled).toBe(true);
      expect(ctx.json).toHaveBeenCalled();
    });
  });

  describe("POST /api/wallet/export", () => {
    test("rejects when export rejection resolved", async () => {
      const ctx = buildCtx("POST", "/api/wallet/export", {
        resolveWalletExportRejection: vi.fn(() => ({
          status: 403 as const,
          reason: "denied",
        })),
        readJsonBody: vi.fn(async () => ({ confirm: true })),
      });
      const handled = await handleWalletRoutes(ctx);
      expect(handled).toBe(true);
      expect(ctx.error).toHaveBeenCalled();
    });
  });

  describe("routing", () => {
    test("unrelated path returns false", async () => {
      const ctx = buildCtx("GET", "/api/other");
      expect(await handleWalletRoutes(ctx)).toBe(false);
    });

    test("wallet prefix but unknown sub-path returns false", async () => {
      const ctx = buildCtx("GET", "/api/wallet/unknown");
      expect(await handleWalletRoutes(ctx)).toBe(false);
    });
  });
});
