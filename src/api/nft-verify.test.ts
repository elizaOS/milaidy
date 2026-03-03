/**
 * Unit tests for nft-verify.ts — Milady NFT holder verification.
 *
 * Mock the ethers provider so no real RPC calls are made.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock ethers ──────────────────────────────────────────────────────────

const mockBalanceOf = vi.fn();
const mockDestroy = vi.fn();

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      isAddress: actual.ethers.isAddress,
      JsonRpcProvider: class MockProvider {
        destroy = mockDestroy;
      },
      Contract: class MockContract {
        balanceOf = mockBalanceOf;
      },
    },
  };
});

// ── Mock twitter-verify (whitelist storage) ──────────────────────────────

const mockMarkAddressVerified = vi.fn();
const mockIsAddressWhitelisted = vi.fn().mockReturnValue(false);

vi.mock("./twitter-verify", () => ({
  markAddressVerified: (...args: unknown[]) => mockMarkAddressVerified(...args),
  isAddressWhitelisted: (...args: unknown[]) =>
    mockIsAddressWhitelisted(...args),
}));

// ── Mock @elizaos/core logger ────────────────────────────────────────────

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Import after mocks ──────────────────────────────────────────────────

import { verifyAndWhitelistHolder, verifyMiladyHolder } from "./nft-verify";

// ── Tests ────────────────────────────────────────────────────────────────

describe("nft-verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAddressWhitelisted.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── verifyMiladyHolder ─────────────────────────────────────────────

  describe("verifyMiladyHolder", () => {
    it("returns verified=true when wallet holds ≥1 Milady NFT", async () => {
      mockBalanceOf.mockResolvedValue(BigInt(3));
      const result = await verifyMiladyHolder(
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      );
      expect(result.verified).toBe(true);
      expect(result.balance).toBe(3);
      expect(result.error).toBeNull();
    });

    it("returns verified=false when wallet holds 0 NFTs", async () => {
      mockBalanceOf.mockResolvedValue(BigInt(0));
      const result = await verifyMiladyHolder(
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      );
      expect(result.verified).toBe(false);
      expect(result.balance).toBe(0);
      expect(result.error).toContain("does not hold");
    });

    it("rejects invalid Ethereum address", async () => {
      const result = await verifyMiladyHolder("not-an-address");
      expect(result.verified).toBe(false);
      expect(result.error).toContain("Invalid Ethereum address");
      expect(mockBalanceOf).not.toHaveBeenCalled();
    });

    it("rejects empty address", async () => {
      const result = await verifyMiladyHolder("");
      expect(result.verified).toBe(false);
      expect(result.error).toContain("required");
      expect(mockBalanceOf).not.toHaveBeenCalled();
    });

    it("handles RPC errors gracefully", async () => {
      mockBalanceOf.mockRejectedValue(new Error("network timeout"));
      const result = await verifyMiladyHolder(
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      );
      expect(result.verified).toBe(false);
      expect(result.error).toContain("network timeout");
    });

    it("includes contract address in result", async () => {
      mockBalanceOf.mockResolvedValue(BigInt(1));
      const result = await verifyMiladyHolder(
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      );
      expect(result.contractAddress).toBe(
        "0x5Af0D9827E0c53E4799BB226655A1de152A425a5",
      );
    });

    it("destroys provider after call", async () => {
      mockBalanceOf.mockResolvedValue(BigInt(0));
      await verifyMiladyHolder("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  // ── verifyAndWhitelistHolder ───────────────────────────────────────

  describe("verifyAndWhitelistHolder", () => {
    it("adds verified address to whitelist", async () => {
      mockBalanceOf.mockResolvedValue(BigInt(2));
      const result = await verifyAndWhitelistHolder(
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      );
      expect(result.verified).toBe(true);
      expect(mockMarkAddressVerified).toHaveBeenCalledWith(
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        expect.stringContaining("nft:milady:"),
        expect.stringContaining("milady-holder:2"),
      );
    });

    it("does NOT add non-holder to whitelist", async () => {
      mockBalanceOf.mockResolvedValue(BigInt(0));
      const result = await verifyAndWhitelistHolder(
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      );
      expect(result.verified).toBe(false);
      expect(mockMarkAddressVerified).not.toHaveBeenCalled();
    });

    it("skips RPC call when already whitelisted", async () => {
      mockIsAddressWhitelisted.mockReturnValue(true);
      const result = await verifyAndWhitelistHolder(
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      );
      expect(result.verified).toBe(true);
      expect(result.balance).toBe(-1); // indicates cached result
      expect(mockBalanceOf).not.toHaveBeenCalled();
    });
  });
});
