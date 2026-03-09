/**
 * ElizaOS Actions for BAP-578 Non-Fungible Agent (NFA) operations.
 *
 * Five actions surface in Milady's chat interface:
 *
 *   BNB_NFA_MINT              — mint a new NFA NFT for this agent
 *   BNB_NFA_ANCHOR_LEARNINGS  — anchor learning Merkle root on-chain
 *   BNB_NFA_TRANSFER          — transfer NFA ownership to another address
 *   BNB_NFA_UPGRADE_LOGIC     — upgrade the NFA logic contract
 *   BNB_NFA_PAUSE             — pause or unpause the NFA
 *
 * Write operations (except anchoring) use a two-turn confirmation flow:
 * first call shows a summary and sets a pending flag in state; the user
 * must reply "yes" / "confirm" to proceed on the second call.
 */

import type {
  Action,
  Handler,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";

import { BnbIdentityService } from "./service.js";
import {
  buildAgentMetadata,
  metadataToDataUri,
  metadataToHostedUri,
} from "./metadata.js";
import { readNfa, writeNfa, patchNfa } from "./store.js";
import { getLearningRoot } from "./merkle-learning.js";
import { normalizeBnbNetwork } from "./actions.js";
import type {
  BnbIdentityConfig,
  LearningLeaf,
  NfaRecord,
} from "./types.js";
import { parseLearningsMd } from "./learnings.js";

// ── Shared helpers ──────────────────────────────────────────────────────────

type ResolvedBnbIdentityConfig = BnbIdentityConfig & {
  networkWarning?: string;
};

function loadConfig(runtime: IAgentRuntime): ResolvedBnbIdentityConfig {
  const { network, warning } = normalizeBnbNetwork(
    String(runtime.getSetting("BNB_NETWORK") ?? "bsc-testnet"),
  );

  return {
    privateKey: String(runtime.getSetting("BNB_PRIVATE_KEY") ?? "") || undefined,
    network,
    agentUriBase:
      String(runtime.getSetting("BNB_AGENT_URI_BASE") ?? "") || undefined,
    gatewayPort: parseInt(
      String(runtime.getSetting("MILADY_GATEWAY_PORT") ?? "18789"),
      10,
    ),
    nfaContractAddress:
      String(runtime.getSetting("BAP578_CONTRACT_ADDRESS") ?? "") || undefined,
    rpcUrl:
      String(
        runtime.getSetting("BSC_RPC_URL") ??
          runtime.getSetting("BNB_RPC_URL") ??
          "",
      ) || undefined,
    ...(warning ? { networkWarning: warning } : {}),
  };
}

function userConfirmed(message: Memory): boolean {
  const userText = message.content?.text?.toLowerCase() ?? "";
  return userText.includes("confirm") || userText.includes("yes");
}

function networkLabelForDisplay(network: string): string {
  return network === "bsc"
    ? "BSC Mainnet (REAL MONEY)"
    : `${network} (testnet)`;
}

/**
 * Extracts a 0x-prefixed Ethereum address from message text.
 */
function extractAddress(text: string): string | undefined {
  const match = text.match(/\b(0x[0-9a-fA-F]{40})\b/);
  return match?.[1];
}

async function readLearningEntries(
  runtime: IAgentRuntime,
): Promise<LearningLeaf[]> {
  const workspaceDir = String(
    runtime.getSetting("MILADY_WORKSPACE_DIR") ??
    runtime.getSetting("WORKSPACE_DIR") ??
    ".milady/workspace",
  );

  const { readFile } = await import("node:fs/promises");
  const { join, isAbsolute } = await import("node:path");
  const { homedir } = await import("node:os");

  const resolvedDir = isAbsolute(workspaceDir)
    ? workspaceDir
    : join(homedir(), workspaceDir);

  const learningsPath = join(resolvedDir, "LEARNINGS.md");

  let content: string;
  try {
    content = await readFile(learningsPath, "utf8");
  } catch {
    return [];
  }

  return parseLearningsMd(content);
}

// ── Action: BNB_NFA_MINT ────────────────────────────────────────────────────

export const nfaMintAction: Action = {
  name: "BNB_NFA_MINT",
  similes: [
    "mint nfa",
    "mint agent nft",
    "create nfa",
    "mint bap578",
  ],
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
      config = loadConfig(runtime);
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

    // Check for existing NFA
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

    // Build the metadata + URI
    const agentName = runtime.character?.name ?? "Milady";
    const installedPlugins: string[] =
      ((runtime.character as Record<string, unknown>)?.plugins as string[]) ?? [];
    const metadata = buildAgentMetadata(config, agentName, installedPlugins);

    const agentURI = config.agentUriBase
      ? metadataToHostedUri(metadata, config.agentUriBase)
      : metadataToDataUri(metadata);

    // Two-turn confirmation
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

    // Second call: check confirmation
    if (!userConfirmed(message)) {
      await callback({ text: "NFA minting cancelled." });
      if (state) delete state[pendingKey];
      return;
    }

    // Execute mint
    await callback({ text: "Sending NFA mint transaction..." });

    try {
      const result = await svc.mintNfa(agentURI);

      const record: NfaRecord = {
        tokenId: result.tokenId,
        network: result.network,
        owner: result.owner,
        learningRoot: "0x" + "0".repeat(64),
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

// ── Action: BNB_NFA_ANCHOR_LEARNINGS ────────────────────────────────────────

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
      config = loadConfig(runtime);
    } catch (err) {
      await callback({
        text: `Network error: ${(err as Error).message}`,
      });
      return;
    }

    const svc = new BnbIdentityService(runtime, config);

    // Check NFA exists
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

    // Read learning entries from LEARNINGS.md
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

    // Build Merkle tree and compute root
    const newRoot = getLearningRoot(entries);

    // Compare with current on-chain root
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

    // No two-turn confirm needed -- anchoring is non-destructive
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

// ── Action: BNB_NFA_TRANSFER ────────────────────────────────────────────────

export const nfaTransferAction: Action = {
  name: "BNB_NFA_TRANSFER",
  similes: [
    "transfer nfa",
    "send nfa",
    "transfer agent nft",
  ],
  description:
    "Transfers the NFA NFT to a new owner address. This is an irreversible " +
    "operation that changes who controls the agent's on-chain identity. " +
    "Requires explicit confirmation.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    const nfa = await readNfa();
    return nfa !== null;
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
      config = loadConfig(runtime);
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
        text: "BNB_PRIVATE_KEY is required to transfer the NFA. Set it in `~/.milady/.env`.",
      });
      return;
    }

    // Extract target address from message
    const text = message.content?.text ?? "";
    const toAddress = extractAddress(text);

    if (!toAddress) {
      await callback({
        text:
          "Please provide a valid 0x address to transfer the NFA to.\n\n" +
          "Example: **transfer nfa to 0x1234...abcd**",
      });
      return;
    }

    // Two-turn confirmation with warning
    const pendingKey = "bnb_nfa_transfer_pending";
    if (!state?.[pendingKey]) {
      await callback({
        text:
          `WARNING: You are about to transfer NFA ownership.\n\n` +
          `**Token ID:** \`${nfa.tokenId}\`\n` +
          `**Current owner:** \`${nfa.owner}\`\n` +
          `**New owner:** \`${toAddress}\`\n` +
          `**Network:** ${networkLabelForDisplay(nfa.network)}\n\n` +
          `This operation is IRREVERSIBLE. The new owner will have full control ` +
          `of the agent's on-chain identity.\n\n` +
          `Reply **confirm** to proceed or anything else to cancel.`,
      });
      if (state) state[pendingKey] = { toAddress };
      return;
    }

    // Second call: check confirmation
    if (!userConfirmed(message)) {
      await callback({ text: "NFA transfer cancelled." });
      if (state) delete state[pendingKey];
      return;
    }

    const pending = state[pendingKey] as { toAddress: string };

    await callback({ text: "Sending NFA transfer transaction..." });

    try {
      const result = await svc.transferNfa(nfa.tokenId, pending.toAddress);

      await patchNfa({ owner: pending.toAddress });

      await callback({
        text:
          `NFA transferred successfully!\n\n` +
          `**Token ID:** \`${nfa.tokenId}\`\n` +
          `**New owner:** \`${pending.toAddress}\`\n` +
          `**Tx:** \`${result.txHash}\`\n\n` +
          `The local record has been updated. The new owner now controls this NFA.`,
      });
    } catch (err) {
      await callback({
        text: `NFA transfer failed: ${(err as Error).message}`,
      });
    }

    if (state) delete state[pendingKey];
  }) as Handler,

  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "transfer nfa to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "WARNING: You are about to transfer NFA ownership. Reply confirm to proceed.",
          action: "BNB_NFA_TRANSFER",
        },
      },
    ],
  ],
};

// ── Action: BNB_NFA_UPGRADE_LOGIC ───────────────────────────────────────────

export const nfaUpgradeLogicAction: Action = {
  name: "BNB_NFA_UPGRADE_LOGIC",
  similes: [
    "upgrade nfa logic",
    "upgrade agent logic",
    "change logic contract",
  ],
  description:
    "Upgrades the NFA's logic contract to a new implementation address. " +
    "This allows the agent's on-chain behavior to evolve without changing " +
    "its identity token. Requires confirmation.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    const nfa = await readNfa();
    return nfa !== null;
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
      config = loadConfig(runtime);
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
        text: "BNB_PRIVATE_KEY is required to upgrade NFA logic. Set it in `~/.milady/.env`.",
      });
      return;
    }

    // Extract new logic contract address from message
    const text = message.content?.text ?? "";
    const newLogicAddress = extractAddress(text);

    if (!newLogicAddress) {
      await callback({
        text:
          "Please provide the new logic contract address.\n\n" +
          "Example: **upgrade nfa logic to 0x1234...abcd**",
      });
      return;
    }

    // Two-turn confirmation
    const pendingKey = "bnb_nfa_upgrade_logic_pending";
    if (!state?.[pendingKey]) {
      await callback({
        text:
          `Ready to upgrade NFA logic contract.\n\n` +
          `**Token ID:** \`${nfa.tokenId}\`\n` +
          `**Current logic:** \`${nfa.logicContract ?? "none"}\`\n` +
          `**New logic:** \`${newLogicAddress}\`\n` +
          `**Network:** ${networkLabelForDisplay(nfa.network)}\n\n` +
          `This will change how the agent's NFA behaves on-chain.\n\n` +
          `Reply **confirm** to proceed or anything else to cancel.`,
      });
      if (state) state[pendingKey] = { newLogicAddress };
      return;
    }

    // Second call: check confirmation
    if (!userConfirmed(message)) {
      await callback({ text: "NFA logic upgrade cancelled." });
      if (state) delete state[pendingKey];
      return;
    }

    const pending = state[pendingKey] as { newLogicAddress: string };

    await callback({ text: "Sending NFA logic upgrade transaction..." });

    try {
      const result = await svc.upgradeLogic(
        nfa.tokenId,
        pending.newLogicAddress,
      );

      await patchNfa({ logicContract: result.newLogic });

      await callback({
        text:
          `NFA logic upgraded successfully!\n\n` +
          `**Token ID:** \`${nfa.tokenId}\`\n` +
          `**Previous logic:** \`${result.previousLogic}\`\n` +
          `**New logic:** \`${result.newLogic}\`\n` +
          `**Tx:** \`${result.txHash}\``,
      });
    } catch (err) {
      await callback({
        text: `NFA logic upgrade failed: ${(err as Error).message}`,
      });
    }

    if (state) delete state[pendingKey];
  }) as Handler,

  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "upgrade nfa logic to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Ready to upgrade NFA logic contract. Reply confirm to proceed.",
          action: "BNB_NFA_UPGRADE_LOGIC",
        },
      },
    ],
  ],
};

// ── Action: BNB_NFA_PAUSE ───────────────────────────────────────────────────

export const nfaPauseAction: Action = {
  name: "BNB_NFA_PAUSE",
  similes: [
    "pause nfa",
    "pause agent",
    "emergency pause",
    "unpause nfa",
    "resume nfa",
  ],
  description:
    "Pauses or unpauses the NFA. A paused NFA signals that the agent is " +
    "temporarily inactive or under maintenance. This is an emergency circuit " +
    "breaker for the on-chain identity.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    const nfa = await readNfa();
    return nfa !== null;
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
      config = loadConfig(runtime);
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
        text: "BNB_PRIVATE_KEY is required to pause/unpause the NFA. Set it in `~/.milady/.env`.",
      });
      return;
    }

    // Detect pause vs unpause from message text
    const text = (message.content?.text ?? "").toLowerCase();
    const wantsUnpause =
      text.includes("unpause") ||
      text.includes("resume") ||
      text.includes("reactivate");
    const wantsPause = !wantsUnpause;

    // Check if the operation is a no-op
    if (wantsPause && nfa.paused) {
      await callback({
        text: `NFA \`${nfa.tokenId}\` is already paused.`,
      });
      return;
    }
    if (wantsUnpause && !nfa.paused) {
      await callback({
        text: `NFA \`${nfa.tokenId}\` is already active (not paused).`,
      });
      return;
    }

    const actionLabel = wantsPause ? "pause" : "unpause";

    // Two-turn confirmation
    const pendingKey = "bnb_nfa_pause_pending";
    if (!state?.[pendingKey]) {
      await callback({
        text:
          `Ready to **${actionLabel}** the NFA.\n\n` +
          `**Token ID:** \`${nfa.tokenId}\`\n` +
          `**Current state:** ${nfa.paused ? "paused" : "active"}\n` +
          `**Network:** ${networkLabelForDisplay(nfa.network)}\n\n` +
          (wantsPause
            ? "Pausing will signal to other agents that this NFA is temporarily inactive.\n\n"
            : "Unpausing will restore the NFA to active status.\n\n") +
          `Reply **confirm** to proceed or anything else to cancel.`,
      });
      if (state) state[pendingKey] = { wantsPause };
      return;
    }

    // Second call: check confirmation
    if (!userConfirmed(message)) {
      await callback({ text: `NFA ${actionLabel} cancelled.` });
      if (state) delete state[pendingKey];
      return;
    }

    const pending = state[pendingKey] as { wantsPause: boolean };

    await callback({
      text: `Sending NFA ${pending.wantsPause ? "pause" : "unpause"} transaction...`,
    });

    try {
      const result = pending.wantsPause
        ? await svc.pauseNfa(nfa.tokenId)
        : await svc.unpauseNfa(nfa.tokenId);

      await patchNfa({ paused: result.paused });

      await callback({
        text:
          `NFA ${result.paused ? "paused" : "unpaused"} successfully!\n\n` +
          `**Token ID:** \`${nfa.tokenId}\`\n` +
          `**State:** ${result.paused ? "paused" : "active"}\n` +
          `**Tx:** \`${result.txHash}\``,
      });
    } catch (err) {
      await callback({
        text: `NFA ${pending.wantsPause ? "pause" : "unpause"} failed: ${(err as Error).message}`,
      });
    }

    if (state) delete state[pendingKey];
  }) as Handler,

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "pause nfa" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Ready to pause the NFA. Reply confirm to proceed.",
          action: "BNB_NFA_PAUSE",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "unpause nfa" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Ready to unpause the NFA. Reply confirm to proceed.",
          action: "BNB_NFA_PAUSE",
        },
      },
    ],
  ],
};
