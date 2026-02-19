import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { InventoryView } from "../../src/components/InventoryView";

function createWalletBalances(bnbBalance = "0.006", bscError: string | null = null) {
  return {
    evm: {
      address: "0x1111111111111111111111111111111111111111",
      chains: [
        {
          chain: "BSC",
          chainId: 56,
          nativeBalance: bnbBalance,
          nativeSymbol: "BNB",
          nativeValueUsd: "4.20",
          tokens: [
            {
              symbol: "CAKE",
              name: "PancakeSwap",
              contractAddress: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
              balance: "12.3",
              decimals: 18,
              valueUsd: "31.20",
              logoUrl: "",
            },
          ],
          error: bscError,
        },
        {
          chain: "Ethereum",
          chainId: 1,
          nativeBalance: "0.15",
          nativeSymbol: "ETH",
          nativeValueUsd: "460.00",
          tokens: [],
          error: null,
        },
      ],
    },
    solana: {
      address: "So11111111111111111111111111111111111111112",
      solBalance: "1.0",
      solValueUsd: "100.00",
      tokens: [],
    },
  };
}

function createWalletConfig() {
  return {
    alchemyKeySet: true,
    infuraKeySet: false,
    ankrKeySet: true,
    nodeRealBscRpcSet: true,
    quickNodeBscRpcSet: true,
    managedBscRpcReady: true,
    heliusKeySet: false,
    birdeyeKeySet: false,
    evmChains: ["Ethereum", "Base", "BSC"],
    evmAddress: "0x1111111111111111111111111111111111111111",
    solanaAddress: "So11111111111111111111111111111111111111112",
  };
}

function createPreflight(ok = true) {
  return {
    ok,
    walletAddress: "0x1111111111111111111111111111111111111111",
    rpcUrlHost: "bsc-mainnet.nodereal.io",
    chainId: 56,
    bnbBalance: "0.1",
    minGasBnb: "0.005",
    checks: {
      walletReady: true,
      rpcReady: true,
      chainReady: true,
      gasReady: true,
      tokenAddressValid: true,
    },
    reasons: [] as string[],
  };
}

function createQuote(side: "buy" | "sell" = "buy") {
  const isBuy = side === "buy";
  return {
    ok: true,
    side,
    routerAddress: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    wrappedNativeAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    tokenAddress: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
    slippageBps: 500,
    route: isBuy
      ? [
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
          "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
        ]
      : [
          "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        ],
    quoteIn: isBuy
      ? { symbol: "BNB", amount: "0.1", amountWei: "100000000000000000" }
      : { symbol: "CAKE", amount: "1.0", amountWei: "1000000000000000000" },
    quoteOut: isBuy
      ? { symbol: "CAKE", amount: "2.5", amountWei: "2500000000000000000" }
      : { symbol: "BNB", amount: "0.03", amountWei: "30000000000000000" },
    minReceive: isBuy
      ? { symbol: "CAKE", amount: "2.375", amountWei: "2375000000000000000" }
      : { symbol: "BNB", amount: "0.0285", amountWei: "28500000000000000" },
    price: "25.0000",
    preflight: createPreflight(true),
  };
}

function createExecuteResult(executed = true) {
  return {
    ok: true,
    side: "buy" as const,
    mode: executed ? ("local-key" as const) : ("user-sign" as const),
    quote: createQuote(),
    executed,
    requiresUserSignature: !executed,
    unsignedTx: {
      chainId: 56,
      from: "0x1111111111111111111111111111111111111111",
      to: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
      data: "0x1234",
      valueWei: "100000000000000000",
      deadline: Math.floor(Date.now() / 1000) + 600,
      explorerUrl: "https://bscscan.com",
    },
    execution: executed
      ? {
          hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          nonce: 12,
          gasLimit: "220000",
          valueWei: "100000000000000000",
          explorerUrl: "https://bscscan.com/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          blockNumber: 51_234_567,
          status: "success" as const,
        }
      : undefined,
  };
}

function createContext(
  overrides?: Partial<{
    inventoryView: "tokens" | "nfts";
    inventorySort: "chain" | "symbol" | "value";
    inventoryChainFocus: "bsc" | "all";
    walletBalances: ReturnType<typeof createWalletBalances> | null;
    walletConfig: ReturnType<typeof createWalletConfig> | null;
    cloudConnected: boolean;
    walletError: string | null;
  }>,
) {
  const ctx: Record<string, unknown> = {
    walletConfig: createWalletConfig(),
    walletAddresses: {
      evmAddress: "0x1111111111111111111111111111111111111111",
      solanaAddress: "So11111111111111111111111111111111111111112",
    },
    walletBalances: createWalletBalances(),
    walletNfts: { evm: [], solana: null },
    walletLoading: false,
    walletNftsLoading: false,
    inventoryView: "tokens",
    inventorySort: "value",
    inventoryChainFocus: "bsc",
    inventoryCollapseOtherEvm: true,
    inventoryCollapseSolana: true,
    walletError: null,
    cloudConnected: true,
    loadBalances: vi.fn(async () => {}),
    loadNfts: vi.fn(async () => {}),
    getBscTradePreflight: vi.fn(async () => createPreflight(true)),
    getBscTradeQuote: vi.fn(async (request?: { side?: "buy" | "sell" }) => createQuote(request?.side ?? "buy")),
    executeBscTrade: vi.fn(async () => createExecuteResult(true)),
    setTab: vi.fn(),
    setActionNotice: vi.fn(),
    copyToClipboard: vi.fn(async () => {}),
  };

  if (overrides) {
    Object.assign(ctx, overrides);
  }

  ctx.setState = vi.fn((key: string, value: unknown) => {
    ctx[key] = value;
  });

  return ctx;
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : text(child)))
    .join("");
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("InventoryView BSC-first", () => {
  it("defaults to BSC-focused token list", async () => {
    const ctx = createContext();
    mockUseApp.mockImplementation(() => ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });

    const content = text(tree!.root);
    expect(content).toContain("Portfolio");
    expect(content).toContain("BSC");
    expect(content).not.toContain("Ethereum native");
  });

  it("switches focus with BSC/All controls", async () => {
    const ctx = createContext();
    mockUseApp.mockImplementation(() => ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });

    const allButton = tree!.root.findAll(
      (node) => node.type === "button" && node.props["data-testid"] === "wallet-focus-all",
    )[0];
    expect(allButton).toBeDefined();

    await act(async () => {
      allButton.props.onClick();
    });
    expect(ctx.setState).toHaveBeenCalledWith("inventoryChainFocus", "all");

    await act(async () => {
      tree!.update(React.createElement(InventoryView));
    });

    const content = text(tree!.root);
    expect(content).toContain("Ethereum");
  });

  it("applies BNB gas readiness threshold at 0.005", async () => {
    const lowCtx = createContext({
      walletBalances: createWalletBalances("0.0049"),
    });
    mockUseApp.mockImplementation(() => lowCtx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });
    let content = text(tree!.root);
    expect(content).toContain("Trade Not Ready");

    const readyCtx = createContext({
      walletBalances: createWalletBalances("0.005"),
    });
    mockUseApp.mockImplementation(() => readyCtx);
    await act(async () => {
      tree!.update(React.createElement(InventoryView));
    });
    content = text(tree!.root);
    expect(content).toContain("Trade Ready");
  });

  it("renders BSC chain errors and token preflight/quote actions", async () => {
    const errorCtx = createContext({
      walletBalances: createWalletBalances("0.006", "BSC RPC timeout"),
    });
    mockUseApp.mockImplementation(() => errorCtx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });

    let content = text(tree!.root);
    expect(content).toContain("Feed Offline");

    const normalCtx = createContext({
      walletBalances: createWalletBalances("0.006", null),
    });
    mockUseApp.mockImplementation(() => normalCtx);
    await act(async () => {
      tree!.update(React.createElement(InventoryView));
    });

    const preflightButton = tree!.root.findAll(
      (node) => node.type === "button" && node.props["data-testid"] === "wallet-token-preflight",
    )[0];
    const quoteButton = tree!.root.findAll(
      (node) => node.type === "button" && node.props["data-testid"] === "wallet-token-quote",
    )[0];
    expect(preflightButton).toBeDefined();
    expect(quoteButton).toBeDefined();

    await act(async () => {
      preflightButton.props.onClick();
      quoteButton.props.onClick();
      await flushAsync();
    });
    expect(normalCtx.getBscTradePreflight).toHaveBeenCalled();
    expect(normalCtx.getBscTradeQuote).toHaveBeenCalled();
  });

  it("shows managed RPC setup guidance when no providers are available", async () => {
    const ctx = createContext({
      cloudConnected: false,
      walletConfig: {
        ...createWalletConfig(),
        alchemyKeySet: false,
        ankrKeySet: false,
        infuraKeySet: false,
        nodeRealBscRpcSet: false,
        quickNodeBscRpcSet: false,
        managedBscRpcReady: false,
      },
    });
    mockUseApp.mockImplementation(() => ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });

    const content = text(tree!.root);
    expect(content).toContain("NODEREAL_BSC_RPC_URL");
    expect(content).toContain("QUICKNODE_BSC_RPC_URL");
  });

  it("supports quick trade input and preset actions", async () => {
    const ctx = createContext({
      walletBalances: createWalletBalances("0.006", null),
    });
    mockUseApp.mockImplementation(() => ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(InventoryView));
    });

    const tokenInput = tree!.root.findAll(
      (node) => node.type === "input" && node.props["data-testid"] === "wallet-quick-token-input",
    )[0];
    expect(tokenInput).toBeDefined();

    await act(async () => {
      tokenInput.props.onChange({ target: { value: "0x1234567890abcdef1234567890abcdef12345678" } });
    });

    const amountPreset = tree!.root.findAll(
      (node) => node.type === "button" && node.props["data-testid"] === "wallet-quick-amount-0.2",
    )[0];
    const quickBuy = tree!.root.findAll(
      (node) => node.type === "button" && node.props["data-testid"] === "wallet-quick-buy",
    )[0];
    const quickSell = tree!.root.findAll(
      (node) => node.type === "button" && node.props["data-testid"] === "wallet-quick-sell",
    )[0];
    expect(amountPreset).toBeDefined();
    expect(quickBuy).toBeDefined();
    expect(quickSell).toBeDefined();

    await act(async () => {
      amountPreset.props.onClick();
      quickBuy.props.onClick();
      await flushAsync();
    });

    expect(ctx.getBscTradeQuote).toHaveBeenCalled();
    const content = text(tree!.root);
    expect(content).toContain("Latest Quote");

    await act(async () => {
      quickSell.props.onClick();
      await flushAsync();
    });
    expect(ctx.getBscTradeQuote).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell" }),
    );
  });

  it("executes latest quote via execute action", async () => {
    const ctx = createContext({
      walletBalances: createWalletBalances("0.02", null),
    });
    mockUseApp.mockImplementation(() => ctx);

    const confirmMock = vi.fn(() => true);
    const originalWindow = globalThis.window;
    const originalConfirm =
      originalWindow && typeof originalWindow.confirm === "function"
        ? originalWindow.confirm
        : undefined;
    if (originalWindow) {
      Object.defineProperty(originalWindow, "confirm", {
        value: confirmMock,
        configurable: true,
      });
    } else {
      Object.defineProperty(globalThis, "window", {
        value: { confirm: confirmMock },
        configurable: true,
      });
    }

    try {
      let tree: TestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = TestRenderer.create(React.createElement(InventoryView));
      });

      const tokenInput = tree!.root.findAll(
        (node) => node.type === "input" && node.props["data-testid"] === "wallet-quick-token-input",
      )[0];
      await act(async () => {
        tokenInput.props.onChange({ target: { value: "0x1234567890abcdef1234567890abcdef12345678" } });
      });

      const quickBuy = tree!.root.findAll(
        (node) => node.type === "button" && node.props["data-testid"] === "wallet-quick-buy",
      )[0];
      await act(async () => {
        quickBuy.props.onClick();
        await flushAsync();
      });

      const executeButton = tree!.root.findAll(
        (node) => node.type === "button" && node.props["data-testid"] === "wallet-quote-execute",
      )[0];
      await act(async () => {
        executeButton.props.onClick();
        await flushAsync();
      });

      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(ctx.executeBscTrade).toHaveBeenCalledTimes(1);
      expect(text(tree!.root)).toContain("View tx 0xaaaaaaaa");
    } finally {
      if (originalWindow) {
        Object.defineProperty(originalWindow, "confirm", {
          value: originalConfirm,
          configurable: true,
        });
      } else {
        Object.defineProperty(globalThis, "window", {
          value: undefined,
          configurable: true,
        });
      }
    }
  });
});
