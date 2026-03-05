/**
 * @milady/plugin-bnb-identity
 *
 * ERC-8004 on-chain agent identity + BAP-578 Non-Fungible Agent plugin.
 *
 * ERC-8004 actions (identity registration):
 *   - "register milady on bnb chain"  → BNB_IDENTITY_REGISTER
 *   - "update bnb identity"           → BNB_IDENTITY_UPDATE
 *   - "what is my agent id"           → BNB_IDENTITY_RESOLVE
 *
 * BAP-578 actions (NFA management):
 *   - "mint nfa"                      → BNB_NFA_MINT
 *   - "anchor learnings"              → BNB_NFA_ANCHOR_LEARNINGS
 *   - "transfer nfa to 0x..."         → BNB_NFA_TRANSFER
 *   - "upgrade nfa logic to 0x..."    → BNB_NFA_UPGRADE_LOGIC
 *   - "pause nfa" / "unpause nfa"     → BNB_NFA_PAUSE
 */

import type { Plugin } from "@elizaos/core";
import {
  registerAction,
  updateIdentityAction,
  resolveIdentityAction,
} from "./actions.js";
import {
  nfaMintAction,
  nfaAnchorLearningsAction,
  nfaTransferAction,
  nfaUpgradeLogicAction,
  nfaPauseAction,
} from "./nfa-actions.js";

export { BnbIdentityService } from "./service.js";
export {
  buildAgentMetadata,
  metadataToDataUri,
  metadataToHostedUri,
} from "./metadata.js";
export { readIdentity, writeIdentity, patchIdentity } from "./store.js";
export { readNfa, writeNfa, patchNfa } from "./store.js";
export {
  hashLearningLeaf,
  buildLearningTree,
  getLearningRoot,
  getLearningProof,
  verifyLearningProof,
} from "./merkle-learning.js";
export type {
  AgentMetadata,
  AgentService,
  IdentityRecord,
  BnbIdentityConfig,
  RegisterResult,
  SetUriResult,
  GetAgentResult,
  GetAgentWalletResult,
  NfaInfo,
  NfaRecord,
  NfaMintResult,
  NfaUpdateLearningResult,
  NfaTransferResult,
  NfaUpgradeResult,
  NfaPauseResult,
  LearningLeaf,
  NfaLearningProof,
} from "./types.js";

export const bnbIdentityPlugin: Plugin = {
  name: "@milady/plugin-bnb-identity",
  description:
    "ERC-8004 agent identity + BAP-578 Non-Fungible Agent on BNB Chain — on-chain identity, learning proofs, ownership transfer, logic upgrades, and emergency pause.",
  actions: [
    // ERC-8004 identity
    registerAction,
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
