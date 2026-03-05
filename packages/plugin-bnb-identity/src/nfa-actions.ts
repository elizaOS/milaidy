/**
 * ElizaOS Actions for BAP-578 NFA (merged into @milady/plugin-bnb-identity).

 *
 * Actions:
 *   NFA_GET_INFO   — read-only: display current NFA status
 *   NFA_MINT       — write: mint a new NFA token (requires confirmation)
 *   NFA_UPDATE_ROOT — write: update learning Merkle root (requires confirmation)
 */

import type {
  Action,
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { computeLearningsData } from "./merkle.js";
import { Bap578NfaService } from "./nfa-service.js";
import { patchNfaRecord, readNfaRecord, writeNfaRecord } from "./nfa-store.js";
import type { Bap578NfaConfig } from "./types.js";
import {
  bscscanTxUrl,
  deletePending,
  getPending,
  normalizeBnbNetwork,
  setPending,
  userConfirmed,
} from "./utils.js";

function loadConfig(runtime: IAgentRuntime): Bap578NfaConfig {
  const contractAddress = String(
    runtime.getSetting("BAP578_CONTRACT_ADDRESS") ?? "",
  );
  if (!contractAddress) {
    throw new Error(
      "BAP578_CONTRACT_ADDRESS is required. Set it in your environment or milady.json plugin parameters.",
    );
  }

  const { network } = normalizeBnbNetwork(
    String(runtime.getSetting("BNB_NETWORK") ?? "bsc-testnet"),
  );

  return {
    contractAddress,
    privateKey:
      runtime.getSetting("BNB_PRIVATE_KEY") != null
        ? String(runtime.getSetting("BNB_PRIVATE_KEY"))
        : undefined,
    network,
  };
}

function networkLabel(network: string): string {
  return network === "bsc" ? "BSC Mainnet" : `${network} (testnet)`;
}

async function loadLearningsMarkdown(): Promise<string | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    // Check common locations for LEARNINGS.md
    const paths = [
      join(homedir(), ".milady", "LEARNINGS.md"),
      join(process.cwd(), "LEARNINGS.md"),
    ];
    for (const p of paths) {
      try {
        return await readFile(p, "utf8");
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}

// ── Action: NFA_GET_INFO ──────────────────────────────────────────────────

export function nfaMintPendingKey(agentId: string): string {
  return `nfa-mint:${agentId}`;
}

export function nfaUpdatePendingKey(agentId: string): string {
  return `nfa-update:${agentId}`;
}

export const getNfaInfoAction: Action = {
  name: "NFA_GET_INFO",
  similes: [
    "nfa status",
    "nfa info",
    "show nfa",
    "my nfa",
    "check nfa",
    "nfa details",
  ],
  description:
    "Displays the current BAP-578 NFA status — token ID, owner, Merkle root, and contract details. Read-only, no private key needed.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => true,

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback,
  ): Promise<void> => {
    const record = await readNfaRecord();
    if (!record) {
      await callback({
        text:
          "No NFA record found. Mint one with: **mint nfa**\n\n" +
          "This will create a BAP-578 Non-Fungible Agent token representing Milady's on-chain identity and learning history.",
      });
      return;
    }

    let config: Bap578NfaConfig;
    try {
      config = loadConfig(runtime);
    } catch (err) {
      // Show local record even if config is missing
      await callback({
        text:
          `**NFA Token ID:** \`${record.tokenId}\`\n` +
          `**Network:** ${record.network}\n` +
          `**Contract:** \`${record.contractAddress}\`\n` +
          `**Owner:** \`${record.ownerAddress}\`\n` +
          `**Merkle Root:** \`${record.merkleRoot}\`\n` +
          `**Minted:** ${record.mintedAt}\n\n` +
          `_Could not verify on-chain: ${(err as Error).message}_`,
      });
      return;
    }

    // Try to fetch fresh on-chain data
    const svc = new Bap578NfaService(config);
    try {
      const info = await svc.getNfaInfo(record.tokenId);
      await callback({
        text:
          `**NFA Token ID:** \`${info.tokenId}\`\n` +
          `**Network:** ${networkLabel(info.network)}\n` +
          `**Contract:** \`${config.contractAddress}\`\n` +
          `**Owner:** \`${info.owner}\`\n` +
          `**Merkle Root:** \`${info.merkleRoot}\`\n` +
          `**Paused:** ${info.paused ? "Yes" : "No"}\n` +
          `**Minted:** ${record.mintedAt}\n` +
          `**BscScan:** ${bscscanTxUrl(info.network, record.mintTxHash)}`,
      });
    } catch {
      // Fall back to local record
      await callback({
        text:
          `**NFA Token ID:** \`${record.tokenId}\`\n` +
          `**Network:** ${record.network}\n` +
          `**Contract:** \`${record.contractAddress}\`\n` +
          `**Owner:** \`${record.ownerAddress}\`\n` +
          `**Merkle Root:** \`${record.merkleRoot}\`\n` +
          `**Minted:** ${record.mintedAt}\n\n` +
          `_Showing cached data — could not reach the contract._`,
      });
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "show my nfa status" },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "NFA Token ID: `1` on bsc-testnet. Merkle Root: `0xabc...`",
          action: "NFA_GET_INFO",
        },
      },
    ],
  ] as ActionExample[][],
};

// ── Action: NFA_MINT ──────────────────────────────────────────────────────

export const mintNfaAction: Action = {
  name: "NFA_MINT",
  similes: [
    "mint nfa",
    "create nfa",
    "mint agent token",
    "create non-fungible agent",
  ],
  description:
    "Mints a new BAP-578 Non-Fungible Agent token on BNB Chain. The Merkle root of Milady's LEARNINGS.md is embedded on-chain. Requires BNB_PRIVATE_KEY and explicit user confirmation.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback,
  ): Promise<void> => {
    let config: Bap578NfaConfig;
    try {
      config = loadConfig(runtime);
    } catch (err) {
      await callback({
        text: `Configuration error: ${(err as Error).message}`,
      });
      return;
    }

    // Check for existing NFA
    const existing = await readNfaRecord();
    if (existing) {
      await callback({
        text:
          `Milady already has an NFA token (ID: \`${existing.tokenId}\`) on ${existing.network}.\n\n` +
          `To update the learning root instead, say: **update nfa learning root**`,
      });
      return;
    }

    if (!config.privateKey) {
      await callback({
        text:
          "BNB_PRIVATE_KEY is not set. Add it to `~/.milady/.env`:\n\n" +
          "```\nBNB_PRIVATE_KEY=0x...\n```\n\n" +
          "This key will own the NFA token. Keep it safe.",
      });
      return;
    }

    // Compute Merkle root from LEARNINGS.md
    const markdown = await loadLearningsMarkdown();
    const learnings = computeLearningsData(markdown ?? "");

    const pendingKey = nfaMintPendingKey(runtime.agentId);
    if (!getPending(pendingKey)) {
      await callback({
        text:
          `Ready to mint NFA on **${networkLabel(config.network)}**.\n\n` +
          `**Contract:** \`${config.contractAddress}\`\n` +
          `**Learning entries:** ${learnings.totalEntries}\n` +
          `**Merkle root:** \`${learnings.merkleRoot.slice(0, 16)}...\`\n\n` +
          `This will send a transaction from your wallet. Reply **confirm** to proceed.`,
      });
      setPending(pendingKey, { merkleRoot: learnings.merkleRoot });
      return;
    }

    if (!userConfirmed(message)) {
      await callback({ text: "Minting cancelled." });
      deletePending(pendingKey);
      return;
    }

    await callback({ text: "Sending mint transaction..." });

    const svc = new Bap578NfaService(config);
    try {
      const result = await svc.mintNfa(learnings.merkleRoot);

      // Derive owner address locally from the private key — no RPC needed.
      const ownerAddress = svc.getOwnerAddress() ?? "";

      const record = {
        tokenId: result.tokenId,
        contractAddress: config.contractAddress,
        network: result.network,
        ownerAddress,
        mintTxHash: result.txHash,
        merkleRoot: learnings.merkleRoot,
        mintedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      };

      await writeNfaRecord(record);

      await callback({
        text:
          `NFA minted successfully!\n\n` +
          `**Token ID:** \`${result.tokenId}\`\n` +
          `**Network:** ${networkLabel(result.network)}\n` +
          `**Tx:** ${bscscanTxUrl(result.network, result.txHash)}\n` +
          `**Merkle Root:** \`${learnings.merkleRoot.slice(0, 16)}...\`\n\n` +
          `Milady's learning history is now provably anchored on-chain.`,
      });
    } catch (err) {
      await callback({
        text: `Minting failed: ${(err as Error).message}`,
      });
    }

    deletePending(pendingKey);
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "mint nfa" },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Ready to mint NFA on bsc-testnet. Reply confirm to proceed.",
          action: "NFA_MINT",
        },
      },
    ],
  ] as ActionExample[][],
};

// ── Action: NFA_UPDATE_ROOT ───────────────────────────────────────────────

export const updateLearningRootAction: Action = {
  name: "NFA_UPDATE_ROOT",
  similes: [
    "update nfa",
    "update learning root",
    "sync nfa learnings",
    "update merkle root",
    "refresh nfa",
  ],
  description:
    "Updates the on-chain Merkle root for Milady's NFA token to reflect her latest LEARNINGS.md. Requires BNB_PRIVATE_KEY and explicit user confirmation.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    const record = await readNfaRecord();
    return record !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback,
  ): Promise<void> => {
    let config: Bap578NfaConfig;
    try {
      config = loadConfig(runtime);
    } catch (err) {
      await callback({
        text: `Configuration error: ${(err as Error).message}`,
      });
      return;
    }

    const existing = await readNfaRecord();
    if (!existing) {
      await callback({
        text: "No NFA found. Mint one first with: **mint nfa**",
      });
      return;
    }

    if (!config.privateKey) {
      await callback({
        text: "BNB_PRIVATE_KEY is required to update the learning root. Set it in `~/.milady/.env`.",
      });
      return;
    }

    const markdown = await loadLearningsMarkdown();
    if (!markdown) {
      await callback({
        text: "No LEARNINGS.md found. Expected at `~/.milady/LEARNINGS.md` or in the current directory.",
      });
      return;
    }

    const learnings = computeLearningsData(markdown);

    if (learnings.merkleRoot === existing.merkleRoot) {
      await callback({
        text:
          `Learning root is already up to date.\n\n` +
          `**Current root:** \`${existing.merkleRoot.slice(0, 16)}...\`\n` +
          `**Entries:** ${learnings.totalEntries}`,
      });
      return;
    }

    const pendingKey = nfaUpdatePendingKey(runtime.agentId);
    if (!getPending(pendingKey)) {
      await callback({
        text:
          `Ready to update NFA learning root on **${networkLabel(existing.network)}**.\n\n` +
          `**Token ID:** \`${existing.tokenId}\`\n` +
          `**Old root:** \`${existing.merkleRoot.slice(0, 16)}...\`\n` +
          `**New root:** \`${learnings.merkleRoot.slice(0, 16)}...\`\n` +
          `**Entries:** ${learnings.totalEntries}\n\n` +
          `This will send a transaction. Reply **confirm** to proceed.`,
      });
      setPending(pendingKey, { merkleRoot: learnings.merkleRoot });
      return;
    }

    if (!userConfirmed(message)) {
      await callback({ text: "Update cancelled." });
      deletePending(pendingKey);
      return;
    }

    await callback({ text: "Sending update transaction..." });

    const svc = new Bap578NfaService(config);
    try {
      const result = await svc.updateLearningRoot(
        existing.tokenId,
        learnings.merkleRoot,
      );

      await patchNfaRecord({ merkleRoot: learnings.merkleRoot });

      await callback({
        text:
          `Learning root updated!\n\n` +
          `**Token ID:** \`${existing.tokenId}\`\n` +
          `**Tx:** ${bscscanTxUrl(existing.network, result.txHash)}\n` +
          `**New root:** \`${learnings.merkleRoot.slice(0, 16)}...\`\n` +
          `**Entries:** ${learnings.totalEntries}`,
      });
    } catch (err) {
      await callback({
        text: `Update failed: ${(err as Error).message}`,
      });
    }

    deletePending(pendingKey);
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "update nfa learning root" },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Ready to update learning root. Reply confirm to proceed.",
          action: "NFA_UPDATE_ROOT",
        },
      },
    ],
  ] as ActionExample[][],
};
