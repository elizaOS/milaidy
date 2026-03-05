/**
 * @milady/plugin-bap578-nfa
 *
 * BAP-578 Non-Fungible Agent (NFA) plugin for Milady.
 *
 * Creates an on-chain NFA token on BNB Chain that anchors a Merkle root
 * of Milady's learning history (LEARNINGS.md). Other agents can verify
 * her provenance and learning trajectory on-chain.
 *
 * Actions exposed in chat:
 *   - "nfa status"              → NFA_GET_INFO
 *   - "mint nfa"                → NFA_MINT       (requires confirmation)
 *   - "update nfa learning root" → NFA_UPDATE_ROOT (requires confirmation)
 */

import type { Plugin } from "@elizaos/core";
import {
  getNfaInfoAction,
  mintNfaAction,
  updateLearningRootAction,
} from "./actions.js";

export { Bap578NfaService } from "./service.js";
export {
  sha256,
  buildMerkleRoot,
  parseLearnings,
  computeLearningsData,
} from "./merkle.js";
export { readNfaRecord, writeNfaRecord, patchNfaRecord } from "./store.js";
export type {
  NfaRecord,
  Bap578NfaConfig,
  MintNfaResult,
  NfaInfoResult,
  LearningEntry,
  LearningsData,
} from "./types.js";

export const bap578NfaPlugin: Plugin = {
  name: "@milady/plugin-bap578-nfa",
  description:
    "BAP-578 Non-Fungible Agent (NFA) for Milady — on-chain agent identity with Merkle-rooted learning provenance on BNB Chain.",
  actions: [getNfaInfoAction, mintNfaAction, updateLearningRootAction],
  evaluators: [],
  providers: [],
};

export default bap578NfaPlugin;
