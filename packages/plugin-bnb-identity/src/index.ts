/**
 * @milady/plugin-bnb-identity
 *
 * ERC-8004 on-chain agent identity + BAP-578 Non-Fungible Agent plugin.
 *
 * ERC-8004 actions:
 *   - "register milady on bnb chain"  → BNB_IDENTITY_REGISTER
 *   - "confirm"/"yes"                 → BNB_IDENTITY_CONFIRM
 *   - "update bnb identity"           → BNB_IDENTITY_UPDATE
 *   - "what is my agent id"           → BNB_IDENTITY_RESOLVE
 *
 * BAP-578 actions:
 *   - "mint nfa"                      → BNB_NFA_MINT
 *   - "anchor learnings"              → BNB_NFA_ANCHOR_LEARNINGS
 *   - "transfer nfa to 0x..."         → BNB_NFA_TRANSFER
 *   - "upgrade nfa logic to 0x..."    → BNB_NFA_UPGRADE_LOGIC
 *   - "pause nfa" / "unpause nfa"     → BNB_NFA_PAUSE
 */

import type { Plugin } from "@elizaos/core";
import {
  confirmAction,
  registerAction,
  resolveIdentityAction,
  updateIdentityAction,
} from "./actions.js";
import {
  nfaAnchorLearningsAction,
  nfaMintAction,
  nfaPauseAction,
  nfaTransferAction,
  nfaUpgradeLogicAction,
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
export {
  clearIdentity,
  clearNfa,
  patchIdentity,
  patchNfa,
  readIdentity,
  readNfa,
  writeIdentity,
  writeNfa,
} from "./store.js";
export {
  buildLearningTree,
  getLearningProof,
  getLearningRoot,
  hashLearningLeaf,
  verifyLearningProof,
} from "./merkle-learning.js";
export { parseLearningsMd } from "./learnings.js";
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
  NfaInfo,
  NfaInfoResult,
  NfaLearningProof,
  NfaMintResult,
  NfaRecord,
  NfaPauseResult,
  NfaTransferResult,
  NfaUpgradeResult,
  NfaUpdateLearningResult,
  LearningLeaf,
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
    "ERC-8004 agent identity + BAP-578 Non-Fungible Agent on BNB Chain — on-chain identity, learning proofs, ownership transfer, logic upgrades, and emergency pause.",
  actions: [
    // ERC-8004 identity
    registerAction,
    confirmAction,
    updateIdentityAction,
    resolveIdentityAction,
    // BAP-578 NFA
    nfaMintAction,
    nfaAnchorLearningsAction,
    nfaTransferAction,
    nfaUpgradeLogicAction,
    nfaPauseAction,
  ],
  evaluators: [],
  providers: [],
};

export default bnbIdentityPlugin;
