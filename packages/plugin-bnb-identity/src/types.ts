/**
 * Shared types for @milady/plugin-bnb-identity.
 */

/** Agent Metadata Profile — the JSON that agentURI must point to. */
export interface AgentMetadata {
  name: string;
  description: string;
  image?: string;
  version: string;
  created: string; // ISO 8601
  services: AgentService[];
  capabilities: string[];
  platforms: string[];
  /** ERC-8004 agentId once registered. Populated post-registration. */
  agentId?: string;
  network?: string;
}

export interface AgentService {
  /** Service type identifier, e.g. "mcp", "websocket", "http" */
  type: string;
  /** Human-readable name */
  name: string;
  /** Endpoint URL */
  url: string;
  /** Optional: MCP-specific protocol version */
  protocol?: string;
}

/** What we persist to disk after a successful registration. */
export interface IdentityRecord {
  agentId: string;
  network: string;
  txHash: string;
  ownerAddress: string;
  agentURI: string;
  registeredAt: string; // ISO 8601
  lastUpdatedAt: string; // ISO 8601
}

/** Runtime config derived from env + milady.json pluginParameters. */
export interface BnbIdentityConfig {
  privateKey?: string; // undefined = read-only mode
  network: string;
  agentUriBase?: string;
  gatewayPort: number;
  rpcUrl?: string;
  nfaContractAddress?: string;
}

/** MCP tool call result shapes — matches bnbchain-mcp response format. */
export interface RegisterResult {
  agentId: string;
  txHash: string;
  network: string;
}

export interface SetUriResult {
  success: boolean;
  txHash: string;
  agentId: string;
  network: string;
}

export interface GetAgentResult {
  agentId: string;
  owner: string;
  tokenURI: string;
  network: string;
}

export interface GetAgentWalletResult {
  agentId: string;
  agentWallet: string;
  network: string;
}

export interface AddressResult {
  address?: string;
  result?: string;
}

// ── BAP-578 Non-Fungible Agent types ────────────────────────────────────

export interface NfaContractMetadata {
  persona: string;
  experience: string;
  voiceHash: string;
  animationURI: string;
  vaultURI: string;
  vaultHash: string;
}

/** On-chain NFA state returned by MCP query. */
export interface NfaInfo {
  tokenId: string;
  owner: string;
  balance: string;
  active: boolean;
  logicContract: string | null;
  createdAt: number | string;
  metadata: NfaContractMetadata | null;
  metadataURI: string;
  freeMint: boolean;
}

/** Local persistence for NFA state. */
export interface NfaRecord {
  tokenId: string;
  network: string;
  owner: string;
  learningRoot: string;
  learningCount: number;
  lastAnchoredAt: string;
  logicContract?: string;
  paused: boolean;
  freeMint?: boolean;
  mintTxHash: string;
}

/** A single learning entry used to build the Merkle tree. */
export interface LearningLeaf {
  id: string;
  timestamp: string;
  category: "error" | "correction" | "insight" | "pattern";
  summary: string;
  contentHash: string;
}

/** Merkle proof for a single learning entry. */
export interface NfaLearningProof {
  leaf: string;
  proof: string[];
  root: string;
  index: number;
}

/** MCP result shapes for BAP-578 operations. */
export interface NfaMintResult {
  tokenId: string;
  txHash: string;
  owner: string;
  network: string;
  freeMint?: boolean;
}

export interface NfaUpdateLearningResult {
  txHash: string;
  previousRoot: string;
  newRoot: string;
  network: string;
}

export interface NfaTransferResult {
  txHash: string;
  network: string;
}

export interface NfaUpgradeResult {
  txHash: string;
  previousLogic: string;
  newLogic: string;
  network: string;
}

export interface NfaPauseResult {
  txHash: string;
  paused: boolean;
  network: string;
}

export const SUPPORTED_BNB_NETWORKS = ["bsc", "bsc-testnet"] as const;
export type SupportedBnbNetwork = (typeof SUPPORTED_BNB_NETWORKS)[number];

// ── Legacy Merkle-backed BAP-578 helpers ───────────────────────────────────

/** Persisted NFA state written to ~/.milady/bap578-nfa.json. */
export interface LegacyNfaRecord {
  tokenId: string;
  contractAddress: string;
  network: string;
  ownerAddress: string;
  mintTxHash: string;
  merkleRoot: string;
  mintedAt: string; // ISO 8601
  lastUpdatedAt: string; // ISO 8601
}

/** Runtime config for BAP-578 NFA, derived from env + pluginParameters. */
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
