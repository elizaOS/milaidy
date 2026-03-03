/**
 * @milady/plugin-bnb-identity
 *
 * ERC-8004 on-chain agent identity plugin for Milady.
 *
 * Registers Milady as a verifiable on-chain agent on BNB Chain via the
 * ERC-8004 Identity Registry. Her agentURI advertises her MCP endpoint,
 * capabilities, and connected platforms so other agents can discover
 * and interact with her programmatically.
 *
 * Actions exposed in chat:
 *   - "register milady on bnb chain"  → BNB_IDENTITY_REGISTER
 *   - "update bnb identity"           → BNB_IDENTITY_UPDATE
 *   - "what is my agent id"           → BNB_IDENTITY_RESOLVE
 *   - "look up agent <id>"            → BNB_IDENTITY_RESOLVE
 */

import type { Plugin } from "@elizaos/core";
import {
  registerAction,
  updateIdentityAction,
  resolveIdentityAction,
} from "./actions.js";

export { BnbIdentityService } from "./service.js";
export {
  buildAgentMetadata,
  metadataToDataUri,
  metadataToHostedUri,
} from "./metadata.js";
export { readIdentity, writeIdentity, patchIdentity } from "./store.js";
export type {
  AgentMetadata,
  AgentService,
  IdentityRecord,
  BnbIdentityConfig,
  RegisterResult,
  SetUriResult,
  GetAgentResult,
  GetAgentWalletResult,
} from "./types.js";

export const bnbIdentityPlugin: Plugin = {
  name: "@milady/plugin-bnb-identity",
  description:
    "ERC-8004 on-chain agent identity for Milady — registers her on BNB Chain and keeps her agentURI in sync with her current capabilities and MCP endpoint.",
  actions: [
    registerAction,
    updateIdentityAction,
    resolveIdentityAction,
  ],
  evaluators: [],
  providers: [],
};

export default bnbIdentityPlugin;
