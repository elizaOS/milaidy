/**
 * Shared types for @milady/plugin-bap578-nfa.
 */

/** Persisted NFA state written to ~/.milady/bap578-nfa.json. */
export interface NfaRecord {
  tokenId: string;
  contractAddress: string;
  network: string;
  ownerAddress: string;
  mintTxHash: string;
  merkleRoot: string;
  mintedAt: string; // ISO 8601
  lastUpdatedAt: string; // ISO 8601
}

/** Runtime config derived from env + pluginParameters. */
export interface Bap578NfaConfig {
  contractAddress: string;
  privateKey?: string; // undefined = read-only mode
  network: string;
}

/** Result from minting an NFA token. */
export interface MintNfaResult {
  tokenId: string;
  txHash: string;
  network: string;
}

/** Result from querying NFA on-chain state. */
export interface NfaInfoResult {
  tokenId: string;
  owner: string;
  merkleRoot: string;
  paused: boolean;
  network: string;
}

/** A parsed learning entry from LEARNINGS.md. */
export interface LearningEntry {
  date: string;
  content: string;
  hash: string;
}

/** Aggregated learnings response. */
export interface LearningsData {
  entries: LearningEntry[];
  merkleRoot: string;
  totalEntries: number;
}

export const SUPPORTED_BNB_NETWORKS = ["bsc", "bsc-testnet"] as const;
export type SupportedBnbNetwork = (typeof SUPPORTED_BNB_NETWORKS)[number];
