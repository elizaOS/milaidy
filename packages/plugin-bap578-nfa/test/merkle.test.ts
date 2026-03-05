import { describe, expect, it } from "bun:test";
import {
  sha256,
  buildMerkleRoot,
  parseLearnings,
  computeLearningsData,
} from "../src/merkle";

describe("sha256", () => {
  it("hashes empty string deterministically", () => {
    const hash = sha256("");
    expect(hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("hashes content deterministically", () => {
    const a = sha256("hello");
    const b = sha256("hello");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });
});

describe("buildMerkleRoot", () => {
  it("returns zero hash for empty array", () => {
    const root = buildMerkleRoot([]);
    expect(root).toBe(sha256(""));
  });

  it("returns the leaf itself for single element", () => {
    const leaf = sha256("hello");
    expect(buildMerkleRoot([leaf])).toBe(leaf);
  });

  it("produces deterministic root for multiple leaves", () => {
    const leaves = ["a", "b", "c"].map(sha256);
    const root1 = buildMerkleRoot(leaves);
    const root2 = buildMerkleRoot(leaves);
    expect(root1).toBe(root2);
  });

  it("produces different root for different leaves", () => {
    const root1 = buildMerkleRoot(["a", "b"].map(sha256));
    const root2 = buildMerkleRoot(["a", "c"].map(sha256));
    expect(root1).not.toBe(root2);
  });

  it("handles odd number of leaves", () => {
    const leaves = ["a", "b", "c", "d", "e"].map(sha256);
    const root = buildMerkleRoot(leaves);
    expect(root).toBeTruthy();
    expect(root.length).toBe(64); // hex sha256
  });
});

describe("parseLearnings", () => {
  it("parses dated entries", () => {
    const md = `## 2025-01-15
Learned about Merkle trees.

## 2025-01-16
Explored ERC-8004 identity.
`;
    const entries = parseLearnings(md);
    expect(entries).toHaveLength(2);
    expect(entries[0].date).toBe("2025-01-15");
    expect(entries[0].content).toContain("Merkle trees");
    expect(entries[1].date).toBe("2025-01-16");
  });

  it("hashes each entry", () => {
    const md = `## 2025-01-15
Content A
`;
    const entries = parseLearnings(md);
    expect(entries[0].hash).toBe(sha256("Content A"));
  });

  it("returns empty array for empty input", () => {
    expect(parseLearnings("")).toHaveLength(0);
  });

  it("handles undated content", () => {
    const md = "Some content without date headers";
    const entries = parseLearnings(md);
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe("undated");
  });
});

describe("computeLearningsData", () => {
  it("returns aggregated data with merkle root", () => {
    const md = `## 2025-01-15
Entry one

## 2025-01-16
Entry two
`;
    const data = computeLearningsData(md);
    expect(data.totalEntries).toBe(2);
    expect(data.merkleRoot).toBeTruthy();
    expect(data.merkleRoot.length).toBe(64);
    expect(data.entries).toHaveLength(2);
  });

  it("handles empty content", () => {
    const data = computeLearningsData("");
    expect(data.totalEntries).toBe(0);
    expect(data.merkleRoot).toBe(sha256(""));
  });
});
