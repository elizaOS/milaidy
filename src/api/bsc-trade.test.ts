import { ethers } from "ethers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBscApproveUnsignedTx,
  BSC_WBNB_FALLBACK,
  buildBscBuyUnsignedTx,
  buildBscSellUnsignedTx,
  buildBscTradePreflight,
  buildBscTradeQuote,
  PANCAKE_SWAP_V2_ROUTER,
} from "./bsc-trade.js";

const WALLET = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x55d398326f99059fF775485246999027B3197955";
const NODE_REAL = "https://bsc-mainnet.nodereal.io/v1/test-key";
const QUICK_NODE = "https://example-bsc.quiknode.pro/test-key";

const ROUTER_IFACE = new ethers.Interface([
  "function WETH() view returns (address)",
  "function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)",
]);
const ERC20_IFACE = new ethers.Interface([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
]);

function decodeMethod(init: RequestInit | undefined): {
  method: string;
  params: unknown[];
} {
  const raw = typeof init?.body === "string" ? init.body : "{}";
  const body = JSON.parse(raw) as { method?: string; params?: unknown[] };
  return {
    method: body.method ?? "",
    params: body.params ?? [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bsc-trade preflight", () => {
  it("returns not-ready when no managed RPC is configured", async () => {
    const result = await buildBscTradePreflight({
      walletAddress: WALLET,
      tokenAddress: TOKEN,
      nodeRealBscRpcUrl: "",
      quickNodeBscRpcUrl: "",
    });

    expect(result.ok).toBe(false);
    expect(result.checks.walletReady).toBe(true);
    expect(result.checks.rpcReady).toBe(false);
    expect(result.reasons.join(" ")).toContain("BSC RPC not configured");
  });

  it("falls back from NodeReal to QuickNode when primary endpoint fails", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("nodereal")) {
          throw new Error("primary down");
        }

        const { method } = decodeMethod(init);
        if (method === "eth_chainId") {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x38" }),
          );
        }
        if (method === "eth_getBalance") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: `0x${ethers.parseEther("0.02").toString(16)}`,
            }),
          );
        }
        if (method === "eth_getCode") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: "0x60006000",
            }),
          );
        }
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }),
        );
      },
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await buildBscTradePreflight({
      walletAddress: WALLET,
      tokenAddress: TOKEN,
      nodeRealBscRpcUrl: NODE_REAL,
      quickNodeBscRpcUrl: QUICK_NODE,
    });

    expect(result.ok).toBe(true);
    expect(result.checks.rpcReady).toBe(true);
    expect(result.rpcUrlHost).toContain("quiknode.pro");
    expect(result.chainId).toBe(56);
    expect(result.checks.gasReady).toBe(true);
  });
});

describe("bsc-trade quote", () => {
  it("builds a buy quote with slippage and route details", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const { method, params } = decodeMethod(init);
        if (method === "eth_chainId") {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x38" }),
          );
        }
        if (method === "eth_getBalance") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: `0x${ethers.parseEther("1").toString(16)}`,
            }),
          );
        }
        if (method === "eth_getCode") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: "0x60006000",
            }),
          );
        }
        if (method !== "eth_call") {
          throw new Error(`Unexpected RPC method: ${method}`);
        }

        const callObj = params[0] as { to?: string; data?: string };
        const data = callObj?.data ?? "";
        const to = ethers.getAddress(callObj?.to ?? ethers.ZeroAddress);
        if (to !== PANCAKE_SWAP_V2_ROUTER) {
          if (data.startsWith(ERC20_IFACE.getFunction("decimals")?.selector)) {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                result: ERC20_IFACE.encodeFunctionResult("decimals", [18]),
              }),
            );
          }
          if (data.startsWith(ERC20_IFACE.getFunction("symbol")?.selector)) {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                result: ERC20_IFACE.encodeFunctionResult("symbol", ["USDT"]),
              }),
            );
          }
          throw new Error(`Unexpected token call: ${data.slice(0, 10)}`);
        }

        if (data.startsWith(ROUTER_IFACE.getFunction("WETH")?.selector)) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: ROUTER_IFACE.encodeFunctionResult("WETH", [
                BSC_WBNB_FALLBACK,
              ]),
            }),
          );
        }

        if (
          data.startsWith(ROUTER_IFACE.getFunction("getAmountsOut")?.selector)
        ) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: ROUTER_IFACE.encodeFunctionResult("getAmountsOut", [
                [ethers.parseEther("0.1"), ethers.parseUnits("30", 18)],
              ]),
            }),
          );
        }

        throw new Error(`Unexpected router call: ${data.slice(0, 10)}`);
      },
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const quote = await buildBscTradeQuote({
      walletAddress: WALLET,
      nodeRealBscRpcUrl: NODE_REAL,
      quickNodeBscRpcUrl: QUICK_NODE,
      request: {
        side: "buy",
        tokenAddress: TOKEN,
        amount: "0.1",
        slippageBps: 500,
      },
    });

    expect(quote.ok).toBe(true);
    expect(quote.side).toBe("buy");
    expect(quote.quoteIn.symbol).toBe("BNB");
    expect(quote.quoteOut.symbol).toBe("USDT");
    expect(quote.quoteIn.amount).toBe("0.1");
    expect(quote.quoteOut.amount).toBe("30.0");
    expect(quote.minReceive.amount).toBe("28.5");
    expect(quote.route[0]).toBe(BSC_WBNB_FALLBACK);
    expect(quote.route[1]).toBe(ethers.getAddress(TOKEN));
  });

  it("builds a sell quote with token balance validation", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const { method, params } = decodeMethod(init);
        if (method === "eth_chainId") {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x38" }),
          );
        }
        if (method === "eth_getBalance") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: `0x${ethers.parseEther("0.1").toString(16)}`,
            }),
          );
        }
        if (method === "eth_getCode") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: "0x60006000",
            }),
          );
        }
        if (method !== "eth_call") {
          throw new Error(`Unexpected RPC method: ${method}`);
        }

        const callObj = params[0] as { to?: string; data?: string };
        const data = callObj?.data ?? "";
        const to = ethers.getAddress(callObj?.to ?? ethers.ZeroAddress);
        if (to !== PANCAKE_SWAP_V2_ROUTER) {
          if (data.startsWith(ERC20_IFACE.getFunction("decimals")?.selector)) {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                result: ERC20_IFACE.encodeFunctionResult("decimals", [18]),
              }),
            );
          }
          if (data.startsWith(ERC20_IFACE.getFunction("symbol")?.selector)) {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                result: ERC20_IFACE.encodeFunctionResult("symbol", ["USDT"]),
              }),
            );
          }
          if (data.startsWith(ERC20_IFACE.getFunction("balanceOf")?.selector)) {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                result: ERC20_IFACE.encodeFunctionResult("balanceOf", [
                  ethers.parseUnits("10", 18),
                ]),
              }),
            );
          }
          throw new Error(`Unexpected token call: ${data.slice(0, 10)}`);
        }

        if (data.startsWith(ROUTER_IFACE.getFunction("WETH")?.selector)) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: ROUTER_IFACE.encodeFunctionResult("WETH", [
                BSC_WBNB_FALLBACK,
              ]),
            }),
          );
        }

        if (
          data.startsWith(ROUTER_IFACE.getFunction("getAmountsOut")?.selector)
        ) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: ROUTER_IFACE.encodeFunctionResult("getAmountsOut", [
                [ethers.parseUnits("1", 18), ethers.parseEther("0.0032")],
              ]),
            }),
          );
        }

        throw new Error(`Unexpected router call: ${data.slice(0, 10)}`);
      },
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const quote = await buildBscTradeQuote({
      walletAddress: WALLET,
      nodeRealBscRpcUrl: NODE_REAL,
      quickNodeBscRpcUrl: QUICK_NODE,
      request: {
        side: "sell",
        tokenAddress: TOKEN,
        amount: "1",
        slippageBps: 500,
      },
    });

    expect(quote.ok).toBe(true);
    expect(quote.side).toBe("sell");
    expect(quote.quoteIn.symbol).toBe("USDT");
    expect(quote.quoteOut.symbol).toBe("BNB");
    expect(quote.quoteIn.amount).toBe("1.0");
    expect(quote.route[0]).toBe(ethers.getAddress(TOKEN));
    expect(quote.route[1]).toBe(BSC_WBNB_FALLBACK);
  });
});

describe("bsc-trade execute payload", () => {
  const baseBuyQuote = {
    ok: true as const,
    side: "buy" as const,
    routerAddress: PANCAKE_SWAP_V2_ROUTER,
    wrappedNativeAddress: BSC_WBNB_FALLBACK,
    tokenAddress: ethers.getAddress(TOKEN),
    slippageBps: 500,
    route: [BSC_WBNB_FALLBACK, ethers.getAddress(TOKEN)],
    quoteIn: {
      symbol: "BNB",
      amount: "0.1",
      amountWei: ethers.parseEther("0.1").toString(),
    },
    quoteOut: {
      symbol: "USDT",
      amount: "30.0",
      amountWei: ethers.parseUnits("30", 18).toString(),
    },
    minReceive: {
      symbol: "USDT",
      amount: "28.5",
      amountWei: ethers.parseUnits("28.5", 18).toString(),
    },
    price: "300.0000",
    preflight: {
      ok: true,
      walletAddress: WALLET,
      rpcUrlHost: "bsc-mainnet.nodereal.io",
      chainId: 56,
      bnbBalance: "0.2",
      minGasBnb: "0.005",
      checks: {
        walletReady: true,
        rpcReady: true,
        chainReady: true,
        gasReady: true,
        tokenAddressValid: true,
      },
      reasons: [],
    },
  };

  const baseSellQuote = {
    ...baseBuyQuote,
    side: "sell" as const,
    route: [ethers.getAddress(TOKEN), BSC_WBNB_FALLBACK],
    quoteIn: {
      symbol: "USDT",
      amount: "1.0",
      amountWei: ethers.parseUnits("1", 18).toString(),
    },
    quoteOut: {
      symbol: "BNB",
      amount: "0.0032",
      amountWei: ethers.parseEther("0.0032").toString(),
    },
    minReceive: {
      symbol: "BNB",
      amount: "0.0030",
      amountWei: ethers.parseEther("0.0030").toString(),
    },
  };

  it("builds unsigned buy tx with bounded deadline", () => {
    const now = Math.floor(Date.now() / 1000);
    const tx = buildBscBuyUnsignedTx(baseBuyQuote, WALLET, 5);

    expect(tx.chainId).toBe(56);
    expect(tx.to).toBe(PANCAKE_SWAP_V2_ROUTER);
    expect(tx.from).toBe(ethers.getAddress(WALLET));
    expect(tx.valueWei).toBe(ethers.parseEther("0.1").toString());
    expect(tx.data.startsWith("0x")).toBe(true);
    expect(tx.deadline).toBeGreaterThanOrEqual(now + 60);
    expect(tx.deadline).toBeLessThanOrEqual(now + 120);
  });

  it("rejects non-buy quotes", () => {
    expect(() =>
      buildBscBuyUnsignedTx(
        { ...baseBuyQuote, side: "sell" as const },
        WALLET,
        600,
      ),
    ).toThrow(/buy execution/i);
  });

  it("rejects invalid recipient address", () => {
    expect(() =>
      buildBscBuyUnsignedTx(baseBuyQuote, "bad-address", 600),
    ).toThrow(/recipient wallet address/i);
  });

  it("builds unsigned sell tx with zero native value", () => {
    const tx = buildBscSellUnsignedTx(baseSellQuote, WALLET, 600);

    expect(tx.chainId).toBe(56);
    expect(tx.to).toBe(PANCAKE_SWAP_V2_ROUTER);
    expect(tx.from).toBe(ethers.getAddress(WALLET));
    expect(tx.valueWei).toBe("0");
    expect(tx.data.startsWith("0x")).toBe(true);
  });

  it("rejects non-sell quote for sell payload builder", () => {
    expect(() => buildBscSellUnsignedTx(baseBuyQuote, WALLET, 600)).toThrow(
      /sell execution/i,
    );
  });

  it("builds unsigned approval tx", () => {
    const tx = buildBscApproveUnsignedTx(
      TOKEN,
      WALLET,
      PANCAKE_SWAP_V2_ROUTER,
      ethers.parseUnits("1", 18).toString(),
    );

    expect(tx.chainId).toBe(56);
    expect(tx.to).toBe(ethers.getAddress(TOKEN));
    expect(tx.from).toBe(ethers.getAddress(WALLET));
    expect(tx.spender).toBe(PANCAKE_SWAP_V2_ROUTER);
    expect(tx.valueWei).toBe("0");
    expect(tx.data.startsWith("0x")).toBe(true);
  });
});
