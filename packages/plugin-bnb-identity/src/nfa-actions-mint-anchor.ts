import type {
  Action,
  Handler,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { getLearningRoot } from "./merkle-learning.js";
import {
  buildAgentMetadata,
  metadataToDataUri,
  metadataToHostedUri,
} from "./metadata.js";
import {
  loadBnbIdentityConfig,
  networkLabelForDisplay,
  type ResolvedBnbIdentityConfig,
  readLearningEntries,
  userConfirmed,
} from "./nfa-actions-shared.js";
import { BnbIdentityService } from "./service.js";
import { patchNfa, readNfa, writeNfa } from "./store.js";
import type { LearningLeaf, NfaRecord } from "./types.js";

export const nfaMintAction: Action = {
  name: "BNB_NFA_MINT",
  similes: ["mint nfa", "mint agent nft", "create nfa", "mint bap578"],
  description:
    "Mints a new BAP-578 Non-Fungible Agent (NFA) NFT on BNB Chain. " +
    "The NFA represents this agent's on-chain identity with upgradeable logic " +
    "and a Merkle-anchored learning history. Requires BNB_PRIVATE_KEY.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    return true;
  },

  handler: (async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    if (!callback) return;

    let config: ResolvedBnbIdentityConfig;
    try {
      config = loadBnbIdentityConfig(runtime, { includeNfaSettings: true });
    } catch (err) {
      await callback({
        text: `Network error: ${(err as Error).message}`,
      });
      return;
    }

    const svc = new BnbIdentityService(runtime, config);

    if (config.networkWarning) {
      await callback({
        text: `Network notice: ${config.networkWarning}`,
      });
    }

    const existing = await readNfa();
    if (existing) {
      await callback({
        text:
          `This agent already has an NFA on ${existing.network}.\n` +
          `Token ID: \`${existing.tokenId}\`\n` +
          `Owner: \`${existing.owner}\`\n\n` +
          `To manage the existing NFA, try: **anchor learnings**, **transfer nfa**, or **pause nfa**.`,
      });
      return;
    }

    if (!config.privateKey) {
      await callback({
        text:
          "BNB_PRIVATE_KEY is not set. Add it to `~/.milady/.env`:\n\n" +
          "```\nBNB_PRIVATE_KEY=0x...\n```\n\n" +
          "This key will own the agent's NFA. Keep it safe.",
      });
      return;
    }

    const agentName = runtime.character?.name ?? "Milady";
    const installedPlugins: string[] =
      ((runtime.character as Record<string, unknown>)?.plugins as string[]) ??
      [];
    const metadata = buildAgentMetadata(config, agentName, installedPlugins);

    const agentURI = config.agentUriBase
      ? metadataToHostedUri(config.agentUriBase)
      : metadataToDataUri(metadata);

    const pendingKey = "bnb_nfa_mint_pending";
    if (!state?.[pendingKey]) {
      await callback({
        text:
          `Ready to mint NFA for **${agentName}** on **${networkLabelForDisplay(config.network)}**.\n\n` +
          `**agentURI:** \`${agentURI.slice(0, 80)}${agentURI.length > 80 ? "..." : ""}\`\n\n` +
          `This will send a transaction from your wallet. Reply **confirm** to proceed.`,
      });
      if (state) state[pendingKey] = { agentURI };
      return;
    }

    if (!userConfirmed(message)) {
      await callback({ text: "NFA minting cancelled." });
      if (state) delete state[pendingKey];
      return;
    }

    await callback({ text: "Sending NFA mint transaction..." });

    try {
      const result = await svc.mintNfa(agentURI);

      const record: NfaRecord = {
        tokenId: result.tokenId,
        network: result.network,
        owner: result.owner,
        learningRoot: `0x${"0".repeat(64)}`,
        learningCount: 0,
        lastAnchoredAt: "",
        paused: false,
        mintTxHash: result.txHash,
      };
      await writeNfa(record);

      await callback({
        text:
          `NFA minted successfully!\n\n` +
          `**Token ID:** \`${result.tokenId}\`\n` +
          `**Owner:** \`${result.owner}\`\n` +
          `**Network:** ${result.network}\n` +
          `**Tx:** \`${result.txHash}\`\n\n` +
          `The agent now has a Non-Fungible Agent identity on-chain. ` +
          `Use **anchor learnings** to commit learning history to the NFA.`,
      });
    } catch (err) {
      await callback({
        text: `NFA minting failed: ${(err as Error).message}`,
      });
    }

    if (state) delete state[pendingKey];
  }) as Handler,

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "mint an nfa for this agent" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Ready to mint NFA for Milady on bsc-testnet. Reply confirm to proceed.",
          action: "BNB_NFA_MINT",
        },
      },
    ],
  ],
};

export const nfaAnchorLearningsAction: Action = {
  name: "BNB_NFA_ANCHOR_LEARNINGS",
  similes: [
    "anchor learnings",
    "update learning root",
    "commit learnings on chain",
  ],
  description:
    "Reads the agent's LEARNINGS.md, builds a Merkle tree from entries, " +
    "and anchors the root hash on-chain in the NFA contract. This is a " +
    "non-destructive operation that proves the agent's learning history.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    const nfa = await readNfa();
    return nfa !== null;
  },

  handler: (async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    if (!callback) return;

    let config: ResolvedBnbIdentityConfig;
    try {
      config = loadBnbIdentityConfig(runtime, { includeNfaSettings: true });
    } catch (err) {
      await callback({
        text: `Network error: ${(err as Error).message}`,
      });
      return;
    }

    const svc = new BnbIdentityService(runtime, config);

    const nfa = await readNfa();
    if (!nfa) {
      await callback({
        text: "No NFA found. Mint one first with: **mint nfa**",
      });
      return;
    }

    if (!config.privateKey) {
      await callback({
        text: "BNB_PRIVATE_KEY is required to anchor learnings. Set it in `~/.milady/.env`.",
      });
      return;
    }

    let entries: LearningLeaf[];
    try {
      entries = await readLearningEntries(runtime);
    } catch (err) {
      await callback({
        text: `Failed to read LEARNINGS.md: ${(err as Error).message}`,
      });
      return;
    }

    if (entries.length === 0) {
      await callback({
        text:
          "No learning entries found in LEARNINGS.md. " +
          "The agent needs to accumulate learnings before anchoring.",
      });
      return;
    }

    const newRoot = getLearningRoot(entries);

    if (newRoot.toLowerCase() === nfa.learningRoot.toLowerCase()) {
      await callback({
        text:
          `Learning root is already up to date on-chain.\n\n` +
          `**Current root:** \`${nfa.learningRoot}\`\n` +
          `**Entries:** ${entries.length}\n` +
          `**Last anchored:** ${nfa.lastAnchoredAt || "never"}`,
      });
      return;
    }

    await callback({
      text:
        `Anchoring ${entries.length} learning entries on-chain...\n\n` +
        `**Previous root:** \`${nfa.learningRoot}\`\n` +
        `**New root:** \`${newRoot}\``,
    });

    try {
      const result = await svc.updateLearningRoot(nfa.tokenId, newRoot);

      await patchNfa({
        learningRoot: result.newRoot,
        learningCount: entries.length,
        lastAnchoredAt: new Date().toISOString(),
      });

      await callback({
        text:
          `Learning root anchored successfully!\n\n` +
          `**Token ID:** \`${nfa.tokenId}\`\n` +
          `**Previous root:** \`${result.previousRoot}\`\n` +
          `**New root:** \`${result.newRoot}\`\n` +
          `**Entries:** ${entries.length}\n` +
          `**Tx:** \`${result.txHash}\`\n\n` +
          `Anyone can now verify individual learnings against this on-chain root.`,
      });
    } catch (err) {
      await callback({
        text: `Failed to anchor learnings: ${(err as Error).message}`,
      });
    }
  }) as Handler,

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "anchor learnings on chain" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Anchoring 12 learning entries on-chain. Previous root: 0x00...00. New root: 0xab...cd.",
          action: "BNB_NFA_ANCHOR_LEARNINGS",
        },
      },
    ],
  ],
};
