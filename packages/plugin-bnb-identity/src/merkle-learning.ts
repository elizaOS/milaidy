/**
 * Merkle tree construction for agent learning entries.
 *
 * Builds an OpenZeppelin-compatible Merkle tree from LearningLeaf entries.
 * Only the 32-byte root is stored on-chain; full entries stay off-chain.
 * Anyone can verify a specific learning by requesting the proof and
 * checking it against the on-chain root.
 *
 * Uses the same sorted-pair pattern as src/api/merkle-tree.ts in the
 * main Milady codebase, but operates on learning entries instead of
 * wallet addresses.
 */

import { ethers } from "ethers";
import type { LearningLeaf, NfaLearningProof } from "./types.js";

const ZERO_ROOT = "0x" + "0".repeat(64);

/** Hash a learning entry into a Merkle leaf. */
export function hashLearningLeaf(entry: LearningLeaf): string {
  return ethers.solidityPackedKeccak256(
    ["string", "string", "string", "bytes32"],
    [entry.id, entry.timestamp, entry.category, entry.contentHash],
  );
}

/** Sort a pair of hashes for deterministic tree construction. */
function sortPair(a: string, b: string): [string, string] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

/** Hash two internal nodes together. */
function hashPair(a: string, b: string): string {
  const [left, right] = sortPair(a, b);
  return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [left, right]);
}

/** Build a Merkle tree from leaf hashes. Returns 2D array (tree[0] = sorted leaves, last = [root]). */
function buildTree(leaves: string[]): string[][] {
  if (leaves.length === 0) {
    return [[ZERO_ROOT]];
  }

  const sorted = [...leaves].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );

  const tree: string[][] = [sorted];
  let currentLevel = sorted;

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        nextLevel.push(hashPair(currentLevel[i], currentLevel[i + 1]));
      } else {
        nextLevel.push(currentLevel[i]);
      }
    }
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }

  return tree;
}

/** Get the root of a tree. */
function getRoot(tree: string[][]): string {
  return tree[tree.length - 1][0];
}

/** Get the sibling-path proof for a leaf in the tree. */
function getProof(tree: string[][], leaf: string): string[] {
  const proof: string[] = [];
  let index = tree[0].indexOf(leaf);
  if (index === -1) return [];

  for (let level = 0; level < tree.length - 1; level++) {
    const currentLevel = tree[level];
    const siblingIndex = index % 2 === 1 ? index - 1 : index + 1;
    if (siblingIndex < currentLevel.length) {
      proof.push(currentLevel[siblingIndex]);
    }
    index = Math.floor(index / 2);
  }

  return proof;
}

/** Verify a proof against a root. */
function verifyProofInternal(
  leaf: string,
  proof: string[],
  expectedRoot: string,
): boolean {
  let computed = leaf;
  for (const sibling of proof) {
    computed = hashPair(computed, sibling);
  }
  return computed.toLowerCase() === expectedRoot.toLowerCase();
}

// ── Public API ──────────────────────────────────────────────────────────

/** Build a Merkle tree from learning entries and return the tree structure. */
export function buildLearningTree(entries: LearningLeaf[]): string[][] {
  const leaves = entries.map((e) => hashLearningLeaf(e));
  return buildTree(leaves);
}

/** Compute the Merkle root for a set of learning entries. */
export function getLearningRoot(entries: LearningLeaf[]): string {
  if (entries.length === 0) return ZERO_ROOT;
  const tree = buildLearningTree(entries);
  return getRoot(tree);
}

/** Generate a proof for a specific learning entry by ID. */
export function getLearningProof(
  entries: LearningLeaf[],
  targetId: string,
): NfaLearningProof | null {
  const target = entries.find((e) => e.id === targetId);
  if (!target) return null;

  const tree = buildLearningTree(entries);
  const leaf = hashLearningLeaf(target);
  const leafIndex = tree[0].indexOf(leaf);
  if (leafIndex === -1) return null;

  const proof = getProof(tree, leaf);
  const root = getRoot(tree);

  return { leaf, proof, root, index: leafIndex };
}

/** Verify a learning proof against the stored root. */
export function verifyLearningProof(proof: NfaLearningProof): boolean {
  return verifyProofInternal(proof.leaf, proof.proof, proof.root);
}
