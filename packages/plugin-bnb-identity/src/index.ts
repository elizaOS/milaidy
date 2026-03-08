/**
 * @milady/plugin-bnb-identity
 *
 * BNB Chain on-chain identity plugin for Milady — two complementary facets:
 *
 * ── ERC-8004 Agent Identity ──────────────────────────────────────────────
 * Registers Milady as a verifiable on-chain agent on BNB Chain via the
 * ERC-8004 Identity Registry. Her agentURI advertises her MCP endpoint,
 * capabilities, and connected platforms so other agents can discover
 * and interact with her programmatically.
 *
 * Actions:
 *   - "register milady on bnb chain"  → BNB_IDENTITY_REGISTER
 *   - "confirm"/"yes"                 → BNB_IDENTITY_CONFIRM
 *   - "update bnb identity"           → BNB_IDENTITY_UPDATE
 *   - "what is my agent id"           → BNB_IDENTITY_RESOLVE
 *
 * ── BAP-578 NFA Learning Provenance ─────────────────────────────────────
 * Mints a Non-Fungible Agent (NFA) token anchoring a Merkle root of
 * Milady's LEARNINGS.md on-chain — cryptographic proof of her learning
 * trajectory that other agents can verify.
 *
 * Actions:
 *   - "show nfa status"               → NFA_GET_INFO
 *   - "mint nfa"                      → NFA_MINT
 *   - "update learning root"          → NFA_UPDATE_ROOT
 *
 * NFA facet co-authored by Dexploarer (github.com/Dexploarer) — PR #835
 */

import type { Plugin } from "@elizaos/core";
import {
  confirmAction,
  registerAction,
  resolveIdentityAction,
  updateIdentityAction,
} from "./actions.js";
import {
  getNfaInfoAction,
  mintNfaAction,
  updateLearningRootAction,
} from "./nfa-actions.js";

export {
  buildMerkleRoot,
  computeLearningsData,
  parseLearnings,
  sha256,
} from "./merkle.js";
export {
  buildAgentMetadata,
  metadataToDataUri,
  metadataToHostedUri,
} from "./metadata.js";
export { Bap578NfaService } from "./nfa-service.js";
export {
  clearNfaRecord,
  patchNfaRecord,
  readNfaRecord,
  writeNfaRecord,
} from "./nfa-store.js";
export { BnbIdentityService } from "./service.js";
export { patchIdentity, readIdentity, writeIdentity } from "./store.js";
export type {
  AgentMetadata,
  AgentService,
  Bap578NfaConfig,
  BnbIdentityConfig,
  GetAgentResult,
  GetAgentWalletResult,
  IdentityRecord,
  LearningEntry,
  LearningsData,
  MintNfaResult,
  NfaInfoResult,
  NfaRecord,
  RegisterResult,
  SetUriResult,
} from "./types.js";
export {
  extractAgentIdFromText,
  getInstalledPlugins,
  normalizeBnbNetwork,
} from "./utils.js";

export const bnbIdentityPlugin: Plugin = {
  name: "@milady/plugin-bnb-identity",
  description:
    "BNB Chain on-chain identity for Milady — ERC-8004 agent registry and BAP-578 NFA learning provenance.",
  actions: [
    // ERC-8004 identity
    registerAction,
    confirmAction,
    updateIdentityAction,
    resolveIdentityAction,
    // BAP-578 NFA learning provenance
    getNfaInfoAction,
    mintNfaAction,
    updateLearningRootAction,
  ],
  evaluators: [],
  providers: [],
};

export default bnbIdentityPlugin;
