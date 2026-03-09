/**
 * Tests for NFA route handlers.
 *
 * We mock BnbIdentityService methods, store helpers, and fs to isolate
 * the route logic from on-chain calls.
 */

import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NfaRouteContext } from "./nfa-routes";

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock the plugin store
const mockReadNfa = vi.fn();
const mockWriteNfa = vi.fn();
const mockPatchNfa = vi.fn();
const mockReadIdentity = vi.fn();

// Service instance mock
const mockServiceInstance = {
  mintNfa: vi.fn(),
  updateLearningRoot: vi.fn(),
  transferNfa: vi.fn(),
  upgradeLogic: vi.fn(),
  pauseNfa: vi.fn(),
  unpauseNfa: vi.fn(),
  getNfaInfo: vi.fn(),
};

const MockBnbIdentityService = vi.fn(
  class MockBnbIdentityService {
    mintNfa = mockServiceInstance.mintNfa;
    updateLearningRoot = mockServiceInstance.updateLearningRoot;
    transferNfa = mockServiceInstance.transferNfa;
    upgradeLogic = mockServiceInstance.upgradeLogic;
    pauseNfa = mockServiceInstance.pauseNfa;
    unpauseNfa = mockServiceInstance.unpauseNfa;
    getNfaInfo = mockServiceInstance.getNfaInfo;
  },
);

vi.mock("../../packages/plugin-bnb-identity/src/index", async () => {
  const actual = await vi.importActual<
    typeof import("../../packages/plugin-bnb-identity/src/index")
  >("../../packages/plugin-bnb-identity/src/index");
  return {
    ...actual,
    readIdentity: (...args: unknown[]) => mockReadIdentity(...args),
    readNfa: (...args: unknown[]) => mockReadNfa(...args),
    writeNfa: (...args: unknown[]) => mockWriteNfa(...args),
    patchNfa: (...args: unknown[]) => mockPatchNfa(...args),
    BnbIdentityService: MockBnbIdentityService,
  };
});

// Mock merkle-learning
const mockGetLearningRoot = vi.fn();
vi.mock("../../packages/plugin-bnb-identity/src/merkle-learning", () => ({
  getLearningRoot: (...args: unknown[]) => mockGetLearningRoot(...args),
}));

// Mock fs
const mockReadFile = vi.fn().mockResolvedValue("");
vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

// Mock logger
vi.mock("@elizaos/core", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Import after mocks are set up
const { handleNfaRoutes } = await import("./nfa-routes");

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCtx(
  method: string,
  pathname: string,
  body: Record<string, unknown> = {},
): NfaRouteContext {
  const jsonFn = vi.fn();
  const errorFn = vi.fn();
  return {
    req: {} as http.IncomingMessage,
    res: {} as http.ServerResponse,
    method,
    pathname,
    json: jsonFn,
    error: errorFn,
    readJsonBody: vi.fn().mockResolvedValue(body),
    nfaContractAddress: "0x1234567890abcdef1234567890abcdef12345678",
    workspaceDir: "/tmp/test-workspace",
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EVM_PRIVATE_KEY;
  delete process.env.BNB_PRIVATE_KEY;
  delete process.env.BSC_RPC_URL;
  delete process.env.BNB_RPC_URL;
  mockReadFile.mockResolvedValue("");
});

describe("GET /api/nfa/status", () => {
  it("returns identity, cached NFA, and on-chain details", async () => {
    const identity = { agentId: "agent-42" };
    const nfa = {
      tokenId: "42",
      network: "bsc" as const,
      learningRoot: "0xroot",
    };
    const onChain = {
      tokenId: "42",
      owner: "0x123",
      balance: "1",
      active: true,
      logicContract: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      metadata: null,
      metadataURI: "",
      freeMint: false,
    };
    mockReadIdentity.mockResolvedValue(identity);
    mockReadNfa.mockResolvedValue(nfa);
    mockServiceInstance.getNfaInfo.mockResolvedValue(onChain);
    const ctx = makeCtx("GET", "/api/nfa/status");

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(mockServiceInstance.getNfaInfo).toHaveBeenCalledWith("42");
    expect(ctx.json).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({
        identity,
        nfa,
        onChain,
        contractAddress: ctx.nfaContractAddress,
      }),
    );
  });
});

describe("GET /api/nfa/learnings", () => {
  it("returns parsed learnings with the stored root", async () => {
    mockReadFile.mockResolvedValue(
      [
        "id: learn-1",
        "timestamp: 2026-01-01T00:00:00.000Z",
        "category: insight",
        "summary: First learning",
        "detail: First learning",
        "---",
        "id: learn-2",
        "timestamp: 2026-01-02T00:00:00.000Z",
        "category: pattern",
        "summary: Second learning",
        "detail: Second learning",
      ].join("\n"),
    );
    mockReadNfa.mockResolvedValue({
      learningRoot: "0xlearn",
    });
    const ctx = makeCtx("GET", "/api/nfa/learnings");

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(mockReadFile).toHaveBeenCalledWith(
      "/tmp/test-workspace/LEARNINGS.md",
      "utf8",
    );
    expect(ctx.json).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({
        root: "0xlearn",
        count: 2,
        entries: expect.arrayContaining([
          expect.objectContaining({ summary: "First learning" }),
          expect.objectContaining({ summary: "Second learning" }),
        ]),
      }),
    );
  });
});

describe("POST /api/nfa/mint", () => {
  it("returns 400 when BAP578 contract address is missing", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc123";
    const ctx = makeCtx("POST", "/api/nfa/mint", {});
    ctx.nfaContractAddress = undefined;

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      expect.stringContaining("BAP578_CONTRACT_ADDRESS"),
      400,
    );
    expect(mockServiceInstance.mintNfa).not.toHaveBeenCalled();
  });

  it("builds a fallback data URI if agentURI is missing", async () => {
    const ctx = makeCtx("POST", "/api/nfa/mint", {});
    process.env.BNB_PRIVATE_KEY = "0xabc123";
    mockServiceInstance.mintNfa.mockResolvedValue({
      tokenId: "42",
      txHash: "0xtx",
      owner: "0xowner",
      network: "bsc",
      freeMint: true,
    });

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(mockServiceInstance.mintNfa).toHaveBeenCalledWith(
      expect.stringMatching(/^data:application\/json;base64,/),
      expect.objectContaining({
        vaultHash: `0x${"0".repeat(64)}`,
      }),
    );
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it("calls mintNfa and returns success", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc123";
    const ctx = makeCtx("POST", "/api/nfa/mint", {
      agentURI: "https://example.com/meta.json",
      persona: "test",
      experience: "none",
    });

    mockServiceInstance.mintNfa.mockResolvedValue({
      tokenId: "42",
      txHash: "0xtx",
      owner: "0xowner",
      network: "bsc",
      freeMint: true,
    });

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(mockServiceInstance.mintNfa).toHaveBeenCalled();
    expect(ctx.json).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({ success: true, txHash: "0xtx" }),
    );
    expect(mockWriteNfa).toHaveBeenCalled();
  });

  it("returns 400 when mint metadata fields are not strings", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc123";
    const ctx = makeCtx("POST", "/api/nfa/mint", {
      agentURI: "https://example.com/meta.json",
      persona: { invalid: true },
    });

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      "persona must be a string.",
      400,
    );
    expect(mockServiceInstance.mintNfa).not.toHaveBeenCalled();
  });

  it("returns 400 when mint metadata fields exceed the allowed length", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc123";
    const ctx = makeCtx("POST", "/api/nfa/mint", {
      agentURI: "https://example.com/meta.json",
      experience: "x".repeat(501),
    });

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      "experience must be at most 500 characters.",
      400,
    );
    expect(mockServiceInstance.mintNfa).not.toHaveBeenCalled();
  });

  it("uses EVM_PRIVATE_KEY when useWalletKey is true", async () => {
    process.env.EVM_PRIVATE_KEY = "0xevm_key";
    process.env.BNB_PRIVATE_KEY = "0xbnb_key";
    const ctx = makeCtx("POST", "/api/nfa/mint", {
      agentURI: "https://example.com/meta.json",
      useWalletKey: true,
    });

    mockServiceInstance.mintNfa.mockResolvedValue({
      tokenId: "1",
      txHash: "0xtx",
      owner: "0xowner",
      network: "bsc",
      freeMint: false,
    });

    await handleNfaRoutes(ctx);

    // The service should have been constructed — we verify the key indirectly
    // by checking it didn't error about missing key
    expect(ctx.json).toHaveBeenCalled();
  });

  it("passes BSC_RPC_URL into the NFA service", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc123";
    process.env.BSC_RPC_URL = "https://bsc-rpc.publicnode.com";
    const ctx = makeCtx("POST", "/api/nfa/mint", {
      agentURI: "https://example.com/meta.json",
    });

    mockServiceInstance.mintNfa.mockResolvedValue({
      tokenId: "1",
      txHash: "0xtx",
      owner: "0xowner",
      network: "bsc",
      freeMint: false,
    });

    await handleNfaRoutes(ctx);

    expect(MockBnbIdentityService).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        rpcUrl: "https://bsc-rpc.publicnode.com",
      }),
    );
  });
});

describe("POST /api/nfa/anchor", () => {
  it("returns 400 when no NFA record exists", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc";
    mockReadNfa.mockResolvedValue(null);
    const ctx = makeCtx("POST", "/api/nfa/anchor", {});

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      expect.stringContaining("No NFA"),
      400,
    );
  });

  it("anchors learning root and updates store", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc";
    mockReadNfa.mockResolvedValue({
      tokenId: "42",
      network: "bsc",
      owner: "0xowner",
      learningRoot: "0x0000",
      learningCount: 0,
      lastAnchoredAt: "",
      paused: false,
      freeMint: false,
      mintTxHash: "0x",
    });

    mockReadFile.mockResolvedValue(
      [
        "id: learn-1",
        "timestamp: 2026-01-01T00:00:00.000Z",
        "category: insight",
        "summary: test",
        "detail: anchored through the legacy chat workflow",
      ].join("\n"),
    );

    mockGetLearningRoot.mockReturnValue("0xnewroot");
    mockServiceInstance.updateLearningRoot.mockResolvedValue({
      txHash: "0xtx",
      previousRoot: "0x0000",
      newRoot: "0xnewroot",
      network: "bsc",
    });

    const ctx = makeCtx("POST", "/api/nfa/anchor", {});

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(mockServiceInstance.updateLearningRoot).toHaveBeenCalledWith(
      "42",
      "0xnewroot",
    );
    expect(ctx.json).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({ success: true, txHash: "0xtx" }),
    );
    expect(mockPatchNfa).toHaveBeenCalled();
  });
});

describe("POST /api/nfa/transfer", () => {
  it("returns 400 if to address is missing", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc";
    const ctx = makeCtx("POST", "/api/nfa/transfer", {});

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      expect.stringContaining("to"),
      400,
    );
  });

  it("blocks transfer of free mint NFAs", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc";
    mockReadNfa.mockResolvedValue({
      tokenId: "42",
      freeMint: true,
      paused: false,
      network: "bsc",
    });

    const ctx = makeCtx("POST", "/api/nfa/transfer", {
      to: "0x1111111111111111111111111111111111111112",
    });

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      expect.stringContaining("non-transferable"),
      400,
    );
  });

  it("transfers NFA and updates store", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc";
    mockReadNfa.mockResolvedValue({
      tokenId: "42",
      freeMint: false,
      paused: false,
      network: "bsc",
      owner: "0xoldowner",
    });
    mockServiceInstance.transferNfa.mockResolvedValue({
      txHash: "0xtx",
      network: "bsc",
    });

    const ctx = makeCtx("POST", "/api/nfa/transfer", {
      to: "0x1111111111111111111111111111111111111113",
    });

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.json).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({ success: true, txHash: "0xtx" }),
    );
    expect(mockPatchNfa).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "0x1111111111111111111111111111111111111113",
      }),
    );
  });

  it("returns 400 when to is not a valid address", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc";
    const ctx = makeCtx("POST", "/api/nfa/transfer", {
      to: "not-an-address",
    });

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      "to must be a 0x-prefixed 40-byte hex address.",
      400,
    );
    expect(mockServiceInstance.transferNfa).not.toHaveBeenCalled();
  });
});

describe("POST /api/nfa/upgrade-logic", () => {
  it("returns 400 if newLogicAddress is missing", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc";
    const ctx = makeCtx("POST", "/api/nfa/upgrade-logic", {});

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      expect.stringContaining("newLogicAddress"),
      400,
    );
  });

  it("upgrades logic and updates store", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc";
    mockReadNfa.mockResolvedValue({
      tokenId: "42",
      network: "bsc",
      logicContract: "0xold",
    });
    mockServiceInstance.upgradeLogic.mockResolvedValue({
      txHash: "0xtx",
      previousLogic: "0xold",
      newLogic: "0xnew",
      network: "bsc",
    });

    const ctx = makeCtx("POST", "/api/nfa/upgrade-logic", {
      newLogicAddress: "0x1111111111111111111111111111111111111114",
    });

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.json).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({ success: true, txHash: "0xtx" }),
    );
    expect(mockPatchNfa).toHaveBeenCalledWith(
      expect.objectContaining({
        logicContract: "0x1111111111111111111111111111111111111114",
      }),
    );
  });

  it("returns 400 when newLogicAddress is not a valid address", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc";
    const ctx = makeCtx("POST", "/api/nfa/upgrade-logic", {
      newLogicAddress: "0xnew",
    });

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      "newLogicAddress must be a 0x-prefixed 40-byte hex address.",
      400,
    );
    expect(mockServiceInstance.upgradeLogic).not.toHaveBeenCalled();
  });
});

describe("POST /api/nfa/pause", () => {
  it("pauses when currently unpaused", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc";
    mockReadNfa.mockResolvedValue({
      tokenId: "42",
      network: "bsc",
      paused: false,
    });
    mockServiceInstance.pauseNfa.mockResolvedValue({
      txHash: "0xtx",
      paused: true,
      network: "bsc",
    });

    const ctx = makeCtx("POST", "/api/nfa/pause", {});

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(mockServiceInstance.pauseNfa).toHaveBeenCalledWith("42");
    expect(ctx.json).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({ success: true, paused: true }),
    );
    expect(mockPatchNfa).toHaveBeenCalledWith(
      expect.objectContaining({ paused: true }),
    );
  });

  it("unpauses when currently paused", async () => {
    process.env.BNB_PRIVATE_KEY = "0xabc";
    mockReadNfa.mockResolvedValue({
      tokenId: "42",
      network: "bsc",
      paused: true,
    });
    mockServiceInstance.unpauseNfa.mockResolvedValue({
      txHash: "0xtx",
      paused: false,
      network: "bsc",
    });

    const ctx = makeCtx("POST", "/api/nfa/pause", {});

    const handled = await handleNfaRoutes(ctx);

    expect(handled).toBe(true);
    expect(mockServiceInstance.unpauseNfa).toHaveBeenCalledWith("42");
    expect(ctx.json).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({ success: true, paused: false }),
    );
    expect(mockPatchNfa).toHaveBeenCalledWith(
      expect.objectContaining({ paused: false }),
    );
  });
});

describe("unmatched routes", () => {
  it("returns false for unknown POST routes", async () => {
    const ctx = makeCtx("POST", "/api/nfa/unknown", {});
    const handled = await handleNfaRoutes(ctx);
    expect(handled).toBe(false);
  });
});
