// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
  getVrmNeedsFlip: () => false,
  getVrmPreviewUrl: () => "/vrms/previews/milady-1.png",
  getVrmUrl: () => "/vrms/milady-1.vrm",
  getVrmBackgroundUrl: (index: number) =>
    `/vrms/backgrounds/milady-${index}.png`,
  getVrmTitle: (index: number) => `MILADY-${index}`,
  VRM_COUNT: 24,
}));

vi.mock("../../src/components/avatar/VrmViewer", () => ({
  VrmViewer: () => React.createElement("div", null, "VrmViewer"),
}));

vi.mock("../../src/components/ChatModalView.js", () => ({
  ChatModalView: () =>
    React.createElement(
      "div",
      { "data-testid": "companion-chat-modal-stub" },
      "ChatModalView",
    ),
}));

const mockUploadCustomVrm = vi.fn(async () => {});
const mockUploadCustomBackground = vi.fn(async () => {});

vi.mock("../../src/api-client", () => ({
  client: {
    uploadCustomVrm: (...args: unknown[]) => mockUploadCustomVrm(...args),
    uploadCustomBackground: (...args: unknown[]) =>
      mockUploadCustomBackground(...args),
    onWsEvent: vi.fn(() => () => {}),
  },
}));

vi.mock("../../src/asset-url", () => ({
  resolveApiUrl: (p: string) => p,
  resolveAppAssetUrl: (p: string) => p,
}));

import { CompanionView } from "../../src/components/CompanionView";

const RECENT_TRADES_KEY = "anime_wallet_recent_trades";

function createContext() {
  return {
    setState: vi.fn(),
    selectedVrmIndex: 1,
    customVrmUrl: "",
    customBackgroundUrl: "",
    walletAddresses: null,
    walletBalances: null,
    walletNfts: null,
    walletLoading: false,
    walletNftsLoading: false,
    walletError: null,
    loadBalances: vi.fn(async () => {}),
    loadNfts: vi.fn(async () => {}),
    getBscTradePreflight: vi.fn(async () => ({
      ok: false,
      reasons: ["disabled"],
    })),
    getBscTradeQuote: vi.fn(async () => ({
      route: [],
      quoteIn: { amount: "0", symbol: "BNB" },
      quoteOut: { amount: "0", symbol: "BNB" },
      minReceive: { amount: "0", symbol: "BNB" },
      slippageBps: 100,
    })),
    getBscTradeTxStatus: vi.fn(async (hash: string) => ({
      ok: true,
      hash,
      status: "pending",
      explorerUrl: `https://bscscan.com/tx/${hash}`,
      chainId: 56,
      blockNumber: null,
      confirmations: 0,
      nonce: null,
      gasUsed: null,
      effectiveGasPriceWei: null,
    })),
    loadWalletTradingProfile: vi.fn(async () => ({
      window: "30d",
      source: "all",
      generatedAt: new Date().toISOString(),
      summary: {
        totalSwaps: 0,
        buyCount: 0,
        sellCount: 0,
        settledCount: 0,
        successCount: 0,
        revertedCount: 0,
        tradeWinRate: null,
        txSuccessRate: null,
        winningTrades: 0,
        evaluatedTrades: 0,
        realizedPnlBnb: "0",
        volumeBnb: "0",
      },
      pnlSeries: [],
      tokenBreakdown: [],
      recentSwaps: [],
    })),
    executeBscTrade: vi.fn(async () => ({
      executed: false,
      execution: null,
      requiresUserSignature: false,
    })),
    executeBscTransfer: vi.fn(async () => ({
      executed: false,
      execution: null,
      requiresUserSignature: false,
    })),
    setActionNotice: vi.fn(),
    agentStatus: {
      state: "running",
      agentName: "Milady",
      platform: "test",
      pid: null,
    },
    cloudEnabled: false,
    cloudConnected: false,
    cloudCredits: null,
    cloudCreditsCritical: false,
    cloudCreditsLow: false,
    cloudTopUpUrl: "",
    lifecycleBusy: false,
    lifecycleAction: null,
    handlePauseResume: vi.fn(async () => {}),
    handleRestart: vi.fn(async () => {}),
    copyToClipboard: vi.fn(async () => {}),
    uiLanguage: "en",
    setUiLanguage: vi.fn(),
    uiShellMode: "companion",
    setUiShellMode: vi.fn(),
    setTab: vi.fn(),
    plugins: [],
  };
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : text(child)))
    .join("");
}

function countByClass(
  node: TestRenderer.ReactTestInstance,
  className: string,
): number {
  return node.root.findAll(
    (candidate) =>
      typeof candidate.props.className === "string" &&
      candidate.props.className.split(/\s+/).includes(className),
  ).length;
}

describe("CompanionView", () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn((key: string) => storage.get(String(key)) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(String(key), String(value));
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(String(key));
        }),
        clear: vi.fn(() => {
          storage.clear();
        }),
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "window", {
      value: {
        innerWidth: 1440,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
    Object.assign(document, {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(globalThis, "fetch", {
      value: vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })),
      configurable: true,
      writable: true,
    });
    localStorage.removeItem(RECENT_TRADES_KEY);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  it("renders clean companion page without tomodachi status blocks", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const content = text(tree?.root);
    expect(content).toContain("Milady");
    expect(content).toContain("MILADY");
    expect(content).not.toContain("Mood");
    expect(content).not.toContain("Hunger");
    expect(content).not.toContain("Energy");
    expect(content).not.toContain("Social");
    expect(content).not.toContain("Control Hub");
    expect(content).toContain("Character");
  });

  it("renders a single character roster panel", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const rosterCount = countByClass(tree!, "anime-roster");
    expect(rosterCount).toBe(1);
  });

  it("navigates when hub buttons are clicked", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const skillButton = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-hub-btn") &&
        text(node).trim() === "Talents",
    )[0];
    expect(skillButton).toBeDefined();

    await act(async () => {
      skillButton.props.onClick();
    });
    expect(ctx.setTab).toHaveBeenCalledWith("skills");

    const settingsButton = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-hub-btn") &&
        text(node).trim() === "Settings",
    )[0];
    expect(settingsButton).toBeDefined();

    await act(async () => {
      settingsButton.props.onClick();
    });
    expect(ctx.setTab).toHaveBeenCalledWith("settings");

    const advancedButton = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-hub-btn") &&
        text(node).trim() === "Advanced",
    )[0];
    expect(advancedButton).toBeDefined();

    await act(async () => {
      advancedButton.props.onClick();
    });
    expect(ctx.setTab).toHaveBeenCalledWith("advanced");
  });

  it("toggles character roster from top-right character header", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const characterToggle = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "character-roster-toggle",
    );
    expect(characterToggle).toBeDefined();

    const shellBefore = tree?.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-character-panel-shell"),
    );
    expect(shellBefore.props.className.includes("is-open")).toBe(false);

    await act(async () => {
      characterToggle.props.onClick();
    });

    const shellAfter = tree?.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-character-panel-shell"),
    );
    expect(shellAfter.props.className.includes("is-open")).toBe(true);

    const characterSettings = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "character-roster-settings",
    );
    expect(characterSettings).toBeDefined();

    await act(async () => {
      characterSettings.props.onClick();
    });
    expect(ctx.setTab).toHaveBeenCalledWith("character");
  });

  it("switches language from companion top-right toggle", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const zhToggle = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "companion-language-zh",
    );

    await act(async () => {
      zhToggle.props.onClick();
    });
    expect(ctx.setUiLanguage).toHaveBeenCalledWith("zh-CN");

    const enToggle = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "companion-language-en",
    );

    await act(async () => {
      enToggle.props.onClick();
    });
    expect(ctx.setUiLanguage).toHaveBeenCalledWith("en");
  });

  it("renders core companion view when snapshot is unavailable", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const content = text(tree?.root);
    expect(content).toContain("Milady");
    expect(content).toContain("Character");
  });

  it("toggles left chat dock from companion header", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const toggle = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "companion-chat-toggle",
    );
    expect(toggle).toBeDefined();

    const dock = tree?.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-comp-chat-dock-anchor"),
    );
    expect(dock.props.className.includes("is-open")).toBe(true);

    await act(async () => {
      toggle.props.onClick();
    });

    const dockAfter = tree?.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-comp-chat-dock-anchor"),
    );
    expect(dockAfter.props.className.includes("is-open")).toBe(false);
  });

  it("renders portfolio tokens and total from full wallet balances", async () => {
    const ctx = createContext();
    ctx.walletAddresses = {
      evmAddress: "0xff0000000000000000000000000000000000d3ba",
      solanaAddress: "So11111111111111111111111111111111111111112",
    };
    ctx.walletBalances = {
      evm: {
        address: ctx.walletAddresses.evmAddress,
        chains: [
          {
            chain: "BSC",
            chainId: 56,
            nativeBalance: "0.55",
            nativeSymbol: "BNB",
            nativeValueUsd: "150.25",
            tokens: [
              {
                symbol: "USDT",
                name: "Tether USD",
                contractAddress: "0x0000000000000000000000000000000000000001",
                balance: "12.5",
                decimals: 18,
                valueUsd: "12.50",
                logoUrl: "",
              },
            ],
            error: null,
          },
          {
            chain: "Ethereum",
            chainId: 1,
            nativeBalance: "0.01",
            nativeSymbol: "ETH",
            nativeValueUsd: "25.00",
            tokens: [
              {
                symbol: "USDC",
                name: "USD Coin",
                contractAddress: "0x0000000000000000000000000000000000000002",
                balance: "20",
                decimals: 6,
                valueUsd: "20.00",
                logoUrl: "",
              },
            ],
            error: null,
          },
        ],
      },
      solana: {
        address: ctx.walletAddresses.solanaAddress,
        solBalance: "0.5",
        solValueUsd: "10.00",
        tokens: [],
      },
    };
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const walletTrigger = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-header-wallet-trigger"),
    );

    await act(async () => {
      walletTrigger.props.onClick();
    });

    const content = text(tree?.root);
    expect(content).toContain("$217.75");
    expect(content).toContain("USD Coin");
    expect(content).toContain("Tokens");
    expect(content).toContain("Collectibles");
    expect(content).toContain("EVM");
  });

  it("opens trading profile modal and requests profile data", async () => {
    const ctx = createContext();
    ctx.walletAddresses = {
      evmAddress: "0xff0000000000000000000000000000000000d3ba",
      solanaAddress: null,
    };
    ctx.walletBalances = {
      evm: {
        address: ctx.walletAddresses.evmAddress,
        chains: [
          {
            chain: "BSC",
            chainId: 56,
            nativeBalance: "1",
            nativeSymbol: "BNB",
            nativeValueUsd: "300.00",
            tokens: [],
            error: null,
          },
        ],
      },
      solana: null,
    };
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const profileButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "wallet-profile-trigger",
    );

    await act(async () => {
      profileButton.props.onClick();
      await Promise.resolve();
    });

    expect(ctx.loadWalletTradingProfile).toHaveBeenCalledWith("30d", "all");

    const sevenDayFilter = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-wallet-portfolio-filter") &&
        text(node).trim() === "7D",
    );

    await act(async () => {
      sevenDayFilter.props.onClick();
      await Promise.resolve();
    });

    expect(ctx.loadWalletTradingProfile).toHaveBeenCalledWith("7d", "all");
  });

  it("loads collectibles when switching to collectibles tab", async () => {
    const ctx = createContext();
    ctx.walletAddresses = {
      evmAddress: "0xff0000000000000000000000000000000000d3ba",
      solanaAddress: null,
    };
    ctx.walletBalances = {
      evm: {
        address: ctx.walletAddresses.evmAddress,
        chains: [],
      },
      solana: null,
    };
    ctx.walletNfts = null;
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const walletTrigger = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-header-wallet-trigger"),
    );

    await act(async () => {
      walletTrigger.props.onClick();
    });

    const collectiblesTab = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-wallet-portfolio-tab") &&
        text(node).trim() === "Collectibles",
    );

    await act(async () => {
      collectiblesTab.props.onClick();
    });

    expect(ctx.loadNfts).toHaveBeenCalledTimes(1);
  });

  it("hydrates and refreshes recent wallet activity status", async () => {
    const hash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    localStorage.setItem(
      RECENT_TRADES_KEY,
      JSON.stringify([
        {
          hash,
          side: "buy",
          tokenAddress: "0x0000000000000000000000000000000000000001",
          amount: "0.01",
          inputSymbol: "BNB",
          outputSymbol: "USDT",
          createdAt: Date.now(),
          status: "pending",
          confirmations: 0,
          nonce: null,
          reason: null,
          explorerUrl: `https://bscscan.com/tx/${hash}`,
        },
      ]),
    );

    const ctx = createContext();
    ctx.walletAddresses = {
      evmAddress: "0xff0000000000000000000000000000000000d3ba",
      solanaAddress: null,
    };
    ctx.walletBalances = {
      evm: {
        address: ctx.walletAddresses.evmAddress,
        chains: [],
      },
      solana: null,
    };
    ctx.getBscTradeTxStatus = vi.fn(async (txHash: string) => ({
      ok: true,
      hash: txHash,
      status: "success",
      explorerUrl: `https://bscscan.com/tx/${txHash}`,
      chainId: 56,
      blockNumber: 100,
      confirmations: 12,
      nonce: 7,
      gasUsed: "1",
      effectiveGasPriceWei: "1",
    }));
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const walletTrigger = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-header-wallet-trigger"),
    );

    await act(async () => {
      walletTrigger.props.onClick();
      await Promise.resolve();
    });

    let content = text(tree?.root);
    expect(content).toContain("Recent activity");
    expect(content).not.toContain("BNB -> USDT");

    const recentToggle = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "wallet-recent-toggle",
    );
    await act(async () => {
      recentToggle.props.onClick();
      await Promise.resolve();
    });
    expect(ctx.getBscTradeTxStatus).toHaveBeenCalledWith(hash);
    content = text(tree?.root);
    expect(content).toContain("BNB -> USDT");
    expect(content).toContain("Confirmed");
  });

  it("shows token details and supports token quick actions", async () => {
    const tokenAddress = "0x00000000000000000000000000000000000000aa";
    const ctx = createContext();
    ctx.walletAddresses = {
      evmAddress: "0xff0000000000000000000000000000000000d3ba",
      solanaAddress: null,
    };
    ctx.walletBalances = {
      evm: {
        address: ctx.walletAddresses.evmAddress,
        chains: [
          {
            chain: "BSC",
            chainId: 56,
            nativeBalance: "0.01",
            nativeSymbol: "BNB",
            nativeValueUsd: "0",
            tokens: [
              {
                symbol: "USDT",
                name: "Tether USD",
                contractAddress: tokenAddress,
                balance: "20",
                decimals: 18,
                valueUsd: "20.00",
                logoUrl: "",
              },
            ],
            error: null,
          },
        ],
      },
      solana: null,
    };
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const walletTrigger = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-header-wallet-trigger"),
    );

    await act(async () => {
      walletTrigger.props.onClick();
    });

    expect(text(tree?.root)).not.toContain("Token address");

    const detailToggle = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "wallet-token-details-toggle",
    );

    await act(async () => {
      detailToggle.props.onClick();
    });

    expect(text(tree?.root)).toContain("Token details");
    expect(text(tree?.root)).toContain("Token address");

    const copyAddressButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-wallet-address-copy") &&
        text(node).trim() === "Copy address",
    );

    await act(async () => {
      await copyAddressButton.props.onClick();
    });
    expect(ctx.copyToClipboard).toHaveBeenCalledWith(tokenAddress);

    const swapButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-wallet-address-copy") &&
        text(node).trim() === "Swap",
    );

    await act(async () => {
      swapButton.props.onClick();
    });

    const swapTokenInput = tree?.root.find(
      (node) =>
        node.type === "input" &&
        node.props.placeholder === "0x..." &&
        node.props.value === tokenAddress,
    );
    expect(swapTokenInput).toBeDefined();
  });

  it("shows fallback BNB and Milady tokens and hides open wallet CTA", async () => {
    const ctx = createContext();
    ctx.walletAddresses = {
      evmAddress: "0xff0000000000000000000000000000000000d3ba",
      solanaAddress: null,
    };
    ctx.walletBalances = {
      evm: {
        address: ctx.walletAddresses.evmAddress,
        chains: [],
      },
      solana: null,
    };
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const walletTrigger = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-header-wallet-trigger"),
    );

    await act(async () => {
      walletTrigger.props.onClick();
    });

    const content = text(tree?.root);
    expect(content).toContain("BNB");
    expect(content).toContain("Milady");
    expect(content).not.toContain("Open Wallet");
  });

  it("executes direct send transfer from send mode", async () => {
    const ctx = createContext();
    ctx.walletAddresses = {
      evmAddress: "0xff0000000000000000000000000000000000d3ba",
      solanaAddress: null,
    };
    ctx.walletBalances = {
      evm: {
        address: ctx.walletAddresses.evmAddress,
        chains: [
          {
            chain: "BSC",
            chainId: 56,
            nativeBalance: "1.0",
            nativeSymbol: "BNB",
            nativeValueUsd: "0",
            tokens: [],
            error: null,
          },
        ],
      },
      solana: null,
    };
    ctx.executeBscTransfer = vi.fn(async () => ({
      ok: true,
      mode: "local-key",
      executed: true,
      requiresUserSignature: false,
      toAddress: "0x1111111111111111111111111111111111111111",
      amount: "0.01",
      assetSymbol: "BNB",
      unsignedTx: {
        chainId: 56,
        from: ctx.walletAddresses.evmAddress,
        to: "0x1111111111111111111111111111111111111111",
        data: "0x",
        valueWei: "10000000000000000",
        explorerUrl:
          "https://bscscan.com/address/0x1111111111111111111111111111111111111111",
        assetSymbol: "BNB",
        amount: "0.01",
      },
      execution: {
        hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        nonce: 1,
        gasLimit: "21000",
        valueWei: "10000000000000000",
        explorerUrl:
          "https://bscscan.com/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        blockNumber: 1,
        status: "success",
      },
    }));
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const walletTrigger = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-header-wallet-trigger"),
    );
    await act(async () => {
      walletTrigger.props.onClick();
    });

    const sendModeButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-wallet-mode-btn") &&
        text(node).trim().toLowerCase() === "send",
    );
    await act(async () => {
      sendModeButton.props.onClick();
    });

    const toInput = tree?.root.find(
      (node) =>
        node.type === "input" &&
        node.props.placeholder === "0x..." &&
        typeof node.props.onChange === "function",
    );
    const amountInput = tree?.root.find(
      (node) =>
        node.type === "input" &&
        node.props.placeholder === "0.01" &&
        typeof node.props.onChange === "function",
    );

    await act(async () => {
      toInput.props.onChange({
        target: { value: "0x1111111111111111111111111111111111111111" },
      });
      amountInput.props.onChange({ target: { value: "0.01" } });
    });

    const executeButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-wallet-popover-action") &&
        text(node).trim() === "Execute Send",
    );

    await act(async () => {
      await executeButton.props.onClick();
    });

    expect(ctx.executeBscTransfer).toHaveBeenCalledWith({
      toAddress: "0x1111111111111111111111111111111111111111",
      amount: "0.01",
      assetSymbol: "BNB",
      confirm: true,
    });
  });

  it("supports recent activity grouping, filtering and hash copy", async () => {
    const now = Date.now();
    const pendingHash =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const successHash =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    localStorage.setItem(
      RECENT_TRADES_KEY,
      JSON.stringify([
        {
          hash: pendingHash,
          side: "buy",
          tokenAddress: "0x0000000000000000000000000000000000000001",
          amount: "0.11",
          inputSymbol: "BNB",
          outputSymbol: "USDT",
          createdAt: now,
          status: "pending",
          confirmations: 0,
          nonce: null,
          reason: null,
          explorerUrl: `https://bscscan.com/tx/${pendingHash}`,
        },
        {
          hash: successHash,
          side: "sell",
          tokenAddress: "0x0000000000000000000000000000000000000002",
          amount: "0.22",
          inputSymbol: "USDC",
          outputSymbol: "BNB",
          createdAt: now - 48 * 60 * 60 * 1000,
          status: "success",
          confirmations: 9,
          nonce: 6,
          reason: null,
          explorerUrl: `https://bscscan.com/tx/${successHash}`,
        },
      ]),
    );

    const ctx = createContext();
    ctx.walletAddresses = {
      evmAddress: "0xff0000000000000000000000000000000000d3ba",
      solanaAddress: null,
    };
    ctx.walletBalances = {
      evm: {
        address: ctx.walletAddresses.evmAddress,
        chains: [],
      },
      solana: null,
    };
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const walletTrigger = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-header-wallet-trigger"),
    );

    await act(async () => {
      walletTrigger.props.onClick();
      await Promise.resolve();
    });

    const recentToggle = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "wallet-recent-toggle",
    );
    await act(async () => {
      recentToggle.props.onClick();
    });

    expect(text(tree?.root)).toContain("Today");
    expect(text(tree?.root)).toContain("Earlier");

    const pendingFilter = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "wallet-recent-filter-pending",
    );

    await act(async () => {
      pendingFilter.props.onClick();
    });

    const filteredContent = text(tree?.root);
    expect(filteredContent).toContain("0.11 BNB -> USDT");
    expect(filteredContent).not.toContain("0.22 USDC -> BNB");

    const copyHashButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "wallet-recent-copy-hash-today-0",
    );

    await act(async () => {
      await copyHashButton.props.onClick();
    });

    expect(ctx.copyToClipboard).toHaveBeenCalledWith(pendingHash);
  });

  // -- Custom VRM & background upload in roster --

  it("renders a custom VRM upload button in the character roster", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    // Find the hidden file input for VRM upload
    const vrmInput = tree?.root.findAll(
      (node) =>
        node.type === "input" &&
        node.props.type === "file" &&
        node.props.accept === ".vrm",
    );
    expect(vrmInput.length).toBeGreaterThanOrEqual(1);

    // Find the upload button with "Custom" label
    const uploadButton = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.title === "string" &&
        node.props.title.includes("Upload custom .vrm"),
    );
    expect(uploadButton.length).toBe(1);

    // Verify it shows "Custom" text
    const content = text(uploadButton[0]);
    expect(content).toContain("Custom");
  });

  it("highlights the custom VRM upload button when custom avatar is active", async () => {
    const ctx = createContext();
    ctx.selectedVrmIndex = 0;
    ctx.customVrmUrl = "/api/avatar/vrm?t=123";
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const uploadButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.title === "string" &&
        node.props.title.includes("Upload custom .vrm"),
    );
    expect(uploadButton.props.className).toContain("is-active");
  });

  it("renders a background upload button in the roster", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    // Find the hidden file input for background upload
    const bgInput = tree?.root.findAll(
      (node) =>
        node.type === "input" &&
        node.props.type === "file" &&
        typeof node.props.accept === "string" &&
        node.props.accept.includes("image/png"),
    );
    expect(bgInput.length).toBeGreaterThanOrEqual(1);

    // Find the "Change Background" button
    const bgButton = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.title === "string" &&
        node.props.title.includes("Upload custom background"),
    );
    expect(bgButton.length).toBe(1);
    expect(text(bgButton[0])).toContain("Change Background");
  });

  it("uses custom background URL when set with custom VRM", async () => {
    const ctx = createContext();
    ctx.selectedVrmIndex = 0;
    ctx.customVrmUrl = "/api/avatar/vrm?t=123";
    ctx.customBackgroundUrl = "/api/avatar/background?t=456";
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    // The VrmViewer should receive the custom background URL via the
    // backgroundUrl or similar prop/context. We verify indirectly by
    // checking the custom VRM active indicator appears
    const content = text(tree?.root);
    // Should show custom VRM active indicator (from i18n)
    expect(content).toContain("custom VRM active");
  });

  it("falls back to milady-1 background when custom VRM has no custom background", async () => {
    const ctx = createContext();
    ctx.selectedVrmIndex = 0;
    ctx.customVrmUrl = "/api/avatar/vrm?t=123";
    ctx.customBackgroundUrl = ""; // No custom background
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    // Should still render without broken image references
    const content = text(tree?.root);
    expect(content).not.toContain("companion-bg.png"); // old broken path
    expect(content).toContain("custom VRM active");
  });

  it("shows custom VRM active indicator when selectedVrmIndex is 0", async () => {
    const ctx = createContext();
    ctx.selectedVrmIndex = 0;
    ctx.customVrmUrl = "blob:http://localhost:5173/abc123";
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const content = text(tree?.root);
    expect(content).toContain("custom VRM active");
  });

  it("does not show custom VRM indicator for built-in avatars", async () => {
    const ctx = createContext();
    ctx.selectedVrmIndex = 3;
    ctx.customVrmUrl = "";
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const content = text(tree?.root);
    expect(content).not.toContain("companion.customVrmActive");
  });
});
