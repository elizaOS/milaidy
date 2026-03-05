import { describe, it, expect } from "bun:test";
import {
  hashLearningLeaf,
  buildLearningTree,
  getLearningRoot,
  getLearningProof,
  verifyLearningProof,
} from "../src/merkle-learning.js";
import type { LearningLeaf } from "../src/types.js";

const mockLeaves: LearningLeaf[] = [
  {
    id: "a1",
    timestamp: "2026-03-05T00:00:00.000Z",
    category: "error",
    summary: "API timeout on retry",
    contentHash: "0x" + "a".repeat(64),
  },
  {
    id: "b2",
    timestamp: "2026-03-05T01:00:00.000Z",
    category: "insight",
    summary: "Users prefer short responses",
    contentHash: "0x" + "b".repeat(64),
  },
  {
    id: "c3",
    timestamp: "2026-03-05T02:00:00.000Z",
    category: "pattern",
    summary: "Retry with backoff works",
    contentHash: "0x" + "c".repeat(64),
  },
];

describe("hashLearningLeaf", () => {
  it("returns a 66-char hex string (0x + 64)", () => {
    const hash = hashLearningLeaf(mockLeaves[0]);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("produces different hashes for different entries", () => {
    const h1 = hashLearningLeaf(mockLeaves[0]);
    const h2 = hashLearningLeaf(mockLeaves[1]);
    expect(h1).not.toBe(h2);
  });

  it("produces deterministic output for the same entry", () => {
    const h1 = hashLearningLeaf(mockLeaves[0]);
    const h2 = hashLearningLeaf(mockLeaves[0]);
    expect(h1).toBe(h2);
  });
});

describe("buildLearningTree", () => {
  it("returns a zero root for empty input", () => {
    const root = getLearningRoot([]);
    expect(root).toBe("0x" + "0".repeat(64));
  });

  it("returns non-zero root for non-empty input", () => {
    const root = getLearningRoot(mockLeaves);
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(root).not.toBe("0x" + "0".repeat(64));
  });

  it("produces deterministic root regardless of input order", () => {
    const root1 = getLearningRoot(mockLeaves);
    const root2 = getLearningRoot([...mockLeaves].reverse());
    expect(root1).toBe(root2);
  });
});

describe("getLearningProof + verifyLearningProof", () => {
  it("generates a valid proof for each leaf", () => {
    const root = getLearningRoot(mockLeaves);
    for (const leaf of mockLeaves) {
      const proof = getLearningProof(mockLeaves, leaf.id);
      expect(proof).not.toBeNull();
      if (proof) {
        expect(proof.root).toBe(root);
        expect(verifyLearningProof(proof)).toBe(true);
      }
    }
  });

  it("returns null for a non-existent leaf ID", () => {
    const proof = getLearningProof(mockLeaves, "nonexistent");
    expect(proof).toBeNull();
  });

  it("fails verification with a tampered root", () => {
    const proof = getLearningProof(mockLeaves, mockLeaves[0].id);
    expect(proof).not.toBeNull();
    if (proof) {
      const tampered = { ...proof, root: "0x" + "f".repeat(64) };
      expect(verifyLearningProof(tampered)).toBe(false);
    }
  });
});
