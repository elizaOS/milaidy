/**
 * Merkle tree utilities for BAP-578 NFA learning provenance.

 *
 * Hashes LEARNINGS.md content into a Merkle tree so the root can be
 * stored on-chain as proof of the agent's learning history.
 */

import { createHash } from "node:crypto";
import type { LearningEntry, LearningsData } from "./types.js";

/** SHA-256 hash of a string, returned as hex. */
export function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** Hash two sibling hashes together for the Merkle tree. */
function hashPair(left: string, right: string): string {
  // Sort to ensure deterministic ordering regardless of insertion order
  const [a, b] = left < right ? [left, right] : [right, left];
  return sha256(a + b);
}

/**
 * Builds a Merkle root from a list of leaf hashes.
 * Returns the zero hash for an empty list.
 */
export function buildMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) {
    return sha256("");
  }
  if (leafHashes.length === 1) {
    return leafHashes[0];
  }

  let level = [...leafHashes];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(hashPair(level[i], level[i + 1]));
      } else {
        // Odd leaf: promote to next level
        next.push(level[i]);
      }
    }
    level = next;
  }

  return level[0];
}

/**
 * Parses LEARNINGS.md content into structured entries.
 *
 * Expected format — each entry starts with a date heading:
 *   ## 2025-01-15
 *   Content of the learning entry...
 *
 * Entries without a date heading are grouped under "undated".
 */
export function parseLearnings(markdown: string): LearningEntry[] {
  const lines = markdown.split("\n");
  const entries: LearningEntry[] = [];
  let currentDate = "undated";
  let currentContent: string[] = [];

  const flushEntry = () => {
    const content = currentContent.join("\n").trim();
    if (content) {
      entries.push({
        date: currentDate,
        content,
        hash: sha256(content),
      });
    }
    currentContent = [];
  };

  for (const line of lines) {
    const dateMatch = line.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      flushEntry();
      currentDate = dateMatch[1];
    } else {
      currentContent.push(line);
    }
  }
  flushEntry();

  return entries;
}

/**
 * Parses LEARNINGS.md and computes the Merkle root of all entries.
 */
export function computeLearningsData(markdown: string): LearningsData {
  const entries = parseLearnings(markdown);
  const leafHashes = entries.map((e) => e.hash);
  const merkleRoot = buildMerkleRoot(leafHashes);

  return {
    entries,
    merkleRoot,
    totalEntries: entries.length,
  };
}