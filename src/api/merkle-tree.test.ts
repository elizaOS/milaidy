/**
 * Unit tests for merkle-tree.ts — Merkle tree whitelist proof generation.
 *
 * Covers:
 * - Leaf hashing (keccak256 of address, checksumming, invalid input)
 * - Tree construction (empty, single, multiple, determinism, odd count)
 * - Proof generation (valid leaf, missing leaf, sibling path correctness)
 * - Proof verification (valid, tampered, wrong root)
 * - High-level API (buildWhitelistTree, generateProof)
 *
 * @see merkle-tree.ts
 */

import { ethers } from "ethers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock twitter-verify's getVerifiedAddresses
const mockAddresses: string[] = [];
vi.mock("./twitter-verify", () => ({
  getVerifiedAddresses: () => mockAddresses,
}));

// ── Import after mocks ──────────────────────────────────────────────────

import {
  buildTree,
  buildWhitelistTree,
  generateProof,
  getProof,
  getRoot,
  hashLeaf,
  verifyProof,
} from "./merkle-tree";

// ── Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockAddresses.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Test Data ────────────────────────────────────────────────────────────

const ADDR_A = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // vitalik.eth
const ADDR_B = "0x5Af0D9827E0c53E4799BB226655A1de152A425a5"; // Milady contract
const ADDR_C = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC
const ADDR_D = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT

// ── Tests ────────────────────────────────────────────────────────────────

describe("merkle-tree", () => {
  // ===================================================================
  //  1. Leaf Hashing
  // ===================================================================

  describe("hashLeaf", () => {
    it("produces a bytes32 hash", () => {
      const hash = hashLeaf(ADDR_A);
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("is deterministic", () => {
      expect(hashLeaf(ADDR_A)).toBe(hashLeaf(ADDR_A));
    });

    it("is case-insensitive (checksums addresses)", () => {
      expect(hashLeaf(ADDR_A.toLowerCase())).toBe(hashLeaf(ADDR_A));
    });

    it("produces different hashes for different addresses", () => {
      expect(hashLeaf(ADDR_A)).not.toBe(hashLeaf(ADDR_B));
    });

    it("matches ethers solidityPackedKeccak256 directly", () => {
      const expected = ethers.solidityPackedKeccak256(
        ["address"],
        [ethers.getAddress(ADDR_A)],
      );
      expect(hashLeaf(ADDR_A)).toBe(expected);
    });

    it("throws for invalid address", () => {
      expect(() => hashLeaf("not-an-address")).toThrow();
    });
  });

  // ===================================================================
  //  2. Tree Construction
  // ===================================================================

  describe("buildTree", () => {
    it("returns zero root for empty input", () => {
      const tree = buildTree([]);
      expect(tree).toHaveLength(1);
      expect(getRoot(tree)).toBe(`0x${"0".repeat(64)}`);
    });

    it("returns single leaf as root", () => {
      const leaf = hashLeaf(ADDR_A);
      const tree = buildTree([leaf]);
      expect(getRoot(tree)).toBe(leaf);
      expect(tree[0]).toEqual([leaf]);
    });

    it("builds correct 2-leaf tree", () => {
      const leafA = hashLeaf(ADDR_A);
      const leafB = hashLeaf(ADDR_B);
      const tree = buildTree([leafA, leafB]);

      // Should have 2 levels: leaves + root
      expect(tree).toHaveLength(2);
      expect(tree[0]).toHaveLength(2);
      expect(tree[1]).toHaveLength(1);
    });

    it("builds correct 4-leaf tree", () => {
      const leaves = [ADDR_A, ADDR_B, ADDR_C, ADDR_D].map(hashLeaf);
      const tree = buildTree(leaves);

      // 4 leaves → 2 levels of internal nodes → root
      // tree[0] = 4 leaves, tree[1] = 2 nodes, tree[2] = 1 root
      expect(tree).toHaveLength(3);
      expect(tree[0]).toHaveLength(4);
      expect(tree[1]).toHaveLength(2);
      expect(tree[2]).toHaveLength(1);
    });

    it("handles odd number of leaves", () => {
      const leaves = [ADDR_A, ADDR_B, ADDR_C].map(hashLeaf);
      const tree = buildTree(leaves);

      // 3 leaves → 2 internal nodes → 1 root
      expect(tree[0]).toHaveLength(3);
      expect(getRoot(tree)).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("is deterministic regardless of input order", () => {
      const leavesABC = [ADDR_A, ADDR_B, ADDR_C].map(hashLeaf);
      const leavesCBA = [ADDR_C, ADDR_B, ADDR_A].map(hashLeaf);

      const treeABC = buildTree(leavesABC);
      const treeCBA = buildTree(leavesCBA);

      // Roots must be identical — leaves are sorted internally
      expect(getRoot(treeABC)).toBe(getRoot(treeCBA));
    });

    it("does not mutate input array", () => {
      const leaves = [hashLeaf(ADDR_C), hashLeaf(ADDR_A), hashLeaf(ADDR_B)];
      const original = [...leaves];
      buildTree(leaves);
      expect(leaves).toEqual(original);
    });
  });

  // ===================================================================
  //  3. Proof Generation
  // ===================================================================

  describe("getProof", () => {
    it("generates empty proof for single-leaf tree", () => {
      const leaf = hashLeaf(ADDR_A);
      const tree = buildTree([leaf]);
      const proof = getProof(tree, leaf);
      expect(proof).toEqual([]);
    });

    it("generates 1-element proof for 2-leaf tree", () => {
      const leafA = hashLeaf(ADDR_A);
      const leafB = hashLeaf(ADDR_B);
      const tree = buildTree([leafA, leafB]);

      const proofA = getProof(tree, leafA);
      expect(proofA).toHaveLength(1);

      const proofB = getProof(tree, leafB);
      expect(proofB).toHaveLength(1);
    });

    it("generates correct-length proof for 4-leaf tree", () => {
      const leaves = [ADDR_A, ADDR_B, ADDR_C, ADDR_D].map(hashLeaf);
      const tree = buildTree(leaves);

      // For a 4-leaf balanced tree, proof length should be 2
      for (const leaf of tree[0]) {
        const proof = getProof(tree, leaf);
        expect(proof).toHaveLength(2);
      }
    });

    it("returns empty proof for non-existent leaf", () => {
      const leaves = [ADDR_A, ADDR_B].map(hashLeaf);
      const tree = buildTree(leaves);
      const fakeLeaf = hashLeaf(ADDR_C);
      expect(getProof(tree, fakeLeaf)).toEqual([]);
    });
  });

  // ===================================================================
  //  4. Proof Verification
  // ===================================================================

  describe("verifyProof", () => {
    it("verifies valid proof for 2-leaf tree", () => {
      const leaves = [ADDR_A, ADDR_B].map(hashLeaf);
      const tree = buildTree(leaves);
      const root = getRoot(tree);

      for (const leaf of tree[0]) {
        const proof = getProof(tree, leaf);
        expect(verifyProof(leaf, proof, root)).toBe(true);
      }
    });

    it("verifies valid proof for 4-leaf tree", () => {
      const leaves = [ADDR_A, ADDR_B, ADDR_C, ADDR_D].map(hashLeaf);
      const tree = buildTree(leaves);
      const root = getRoot(tree);

      for (const leaf of tree[0]) {
        const proof = getProof(tree, leaf);
        expect(verifyProof(leaf, proof, root)).toBe(true);
      }
    });

    it("verifies valid proof for odd-count tree", () => {
      const leaves = [ADDR_A, ADDR_B, ADDR_C].map(hashLeaf);
      const tree = buildTree(leaves);
      const root = getRoot(tree);

      for (const leaf of tree[0]) {
        const proof = getProof(tree, leaf);
        expect(verifyProof(leaf, proof, root)).toBe(true);
      }
    });

    it("verifies single-leaf tree (empty proof)", () => {
      const leaf = hashLeaf(ADDR_A);
      const tree = buildTree([leaf]);
      const root = getRoot(tree);
      expect(verifyProof(leaf, [], root)).toBe(true);
    });

    it("rejects proof with wrong root", () => {
      const leaves = [ADDR_A, ADDR_B].map(hashLeaf);
      const tree = buildTree(leaves);
      const proof = getProof(tree, tree[0][0]);
      const fakeRoot = `0x${"ab".repeat(32)}`;
      expect(verifyProof(tree[0][0], proof, fakeRoot)).toBe(false);
    });

    it("rejects proof for non-member", () => {
      const leaves = [ADDR_A, ADDR_B].map(hashLeaf);
      const tree = buildTree(leaves);
      const root = getRoot(tree);
      const fakeLeaf = hashLeaf(ADDR_C);
      const proof = getProof(tree, tree[0][0]); // use A's proof for C
      expect(verifyProof(fakeLeaf, proof, root)).toBe(false);
    });

    it("rejects tampered proof", () => {
      const leaves = [ADDR_A, ADDR_B, ADDR_C, ADDR_D].map(hashLeaf);
      const tree = buildTree(leaves);
      const root = getRoot(tree);
      const proof = getProof(tree, tree[0][0]);

      // Tamper with a proof element
      const tamperedProof = [...proof];
      tamperedProof[0] = `0x${"ff".repeat(32)}`;
      expect(verifyProof(tree[0][0], tamperedProof, root)).toBe(false);
    });
  });

  // ===================================================================
  //  5. High-level API
  // ===================================================================

  describe("buildWhitelistTree", () => {
    it("builds tree from verified addresses", () => {
      mockAddresses.push(ADDR_A, ADDR_B, ADDR_C);
      const { info } = buildWhitelistTree();
      expect(info.addressCount).toBe(3);
      expect(info.root).toMatch(/^0x[0-9a-f]{64}$/);
      expect(info.leaves).toHaveLength(3);
    });

    it("returns zero root when whitelist is empty", () => {
      const { info } = buildWhitelistTree();
      expect(info.addressCount).toBe(0);
      expect(info.root).toBe(`0x${"0".repeat(64)}`);
    });
  });

  describe("generateProof", () => {
    it("generates valid proof for whitelisted address", () => {
      mockAddresses.push(ADDR_A, ADDR_B, ADDR_C);
      const result = generateProof(ADDR_A);
      expect(result.isWhitelisted).toBe(true);
      expect(result.proof.length).toBeGreaterThan(0);
      expect(result.root).toMatch(/^0x[0-9a-f]{64}$/);
      expect(verifyProof(result.leaf, result.proof, result.root)).toBe(true);
    });

    it("returns isWhitelisted=false for non-member", () => {
      mockAddresses.push(ADDR_A, ADDR_B);
      const result = generateProof(ADDR_C);
      expect(result.isWhitelisted).toBe(false);
      expect(result.proof).toEqual([]);
    });

    it("handles single-address whitelist", () => {
      mockAddresses.push(ADDR_A);
      const result = generateProof(ADDR_A);
      expect(result.isWhitelisted).toBe(true);
      expect(result.proof).toEqual([]); // single leaf = no siblings
      expect(result.leaf).toBe(result.root); // leaf IS the root
    });

    it("handles invalid address gracefully", () => {
      mockAddresses.push(ADDR_A);
      const result = generateProof("not-valid");
      expect(result.isWhitelisted).toBe(false);
      expect(result.proof).toEqual([]);
    });

    it("is case-insensitive for address lookup", () => {
      mockAddresses.push(ADDR_A.toLowerCase());
      const result = generateProof(ADDR_A);
      expect(result.isWhitelisted).toBe(true);
    });
  });
});
