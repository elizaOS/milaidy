/**
 * ElizaOS Actions for @milady/plugin-bnb-identity.
 *
 * Four actions surface in Milady's chat interface:
 *
 *   BNB_IDENTITY_REGISTER  -- first-time on-chain registration (sets pending)
 *   BNB_IDENTITY_CONFIRM   -- confirms a pending register or update operation
 *   BNB_IDENTITY_UPDATE    -- refresh agentURI after config changes (sets pending)
 *   BNB_IDENTITY_RESOLVE   -- look up any agent by ID (read-only)
 *
 * Write operations use a two-step confirmation flow:
 *   1. The REGISTER/UPDATE action builds the data and stores it as pending.
 *   2. The user's "confirm" / "yes" reply routes to BNB_IDENTITY_CONFIRM,
 *      which validates pending state and executes.
 */

import type {
  Action,
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import {
  buildAgentMetadata,
  metadataToDataUri,
  metadataToHostedUri,
} from "./metadata.js";
import { BnbIdentityService } from "./service.js";
import { patchIdentity, readIdentity, writeIdentity } from "./store.js";
import {
  decodeAgentMetadata,
  deletePending,
  extractAgentIdFromText,
  getInstalledPlugins,
  getPending,
  loadConfig,
  networkLabelForDisplay,
  registerPendingKey,
  resolveScanBase,
  setPending,
  updatePendingKey,
  userConfirmed,
} from "./utils.js";

// Re-export helpers that existing tests import from actions.ts
export {
  extractAgentIdFromText,
  normalizeBnbNetwork,
  registerPendingKey,
  updatePendingKey,
} from "./utils.js";

// ── Action: BNB_IDENTITY_REGISTER ──────────────────────────────────────────

export const registerAction: Action = {
  name: "BNB_IDENTITY_REGISTER",
  similes: [
    "register on bnb chain",
    "create on-chain identity",
    "mint agent nft",
    "register erc8004",
    "go on-chain",
    "register milady on bnb",
  ],
  description:
    "Registers Milady as an ERC-8004 agent on BNB Chain. Mints an on-chain identity NFT with a metadata URI describing her capabilities and MCP endpoint. Requires BNB_PRIVATE_KEY.",

  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => true,

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback,
  ): Promise<void> => {
    let config;
    try {
      config = loadConfig(runtime);
    } catch (err) {
      await callback({ text: `❌ Network error: ${(err as Error).message}` });
      return;
    }

    if (config.networkWarning) {
      await callback({ text: `⚠️ Network notice: ${config.networkWarning}` });
    }

    const existing = await readIdentity();
    if (existing) {
      await callback({
        text:
          `⚠️ Milady already has an on-chain identity on ${existing.network}.\n` +
          `Agent ID: \`${existing.agentId}\`\n` +
          `Registered: ${existing.registeredAt}\n\n` +
          `To update her metadata URI instead, say: **update bnb identity**\n` +
          `To register on a different network, run \`milady config set BNB_NETWORK bsc\` first then retry.`,
      });
      return;
    }

    if (!config.privateKey) {
      await callback({
        text:
          "🔑 BNB_PRIVATE_KEY is not set. Add it to `~/.milady/.env`:\n\n" +
          "```\nBNB_PRIVATE_KEY=0x...\n```\n\n" +
          "This key will own Milady's agent NFT. Keep it safe — losing it means losing control of her on-chain identity.",
      });
      return;
    }

    const agentName = runtime.character?.name ?? "Milady";
    const installedPlugins = await getInstalledPlugins(runtime);
    const metadata = buildAgentMetadata(config, agentName, installedPlugins);
    const agentURI = config.agentUriBase
      ? metadataToHostedUri(config.agentUriBase)
      : metadataToDataUri(metadata);

    setPending(registerPendingKey(runtime.agentId), {
      action: "register",
      agentURI,
      metadata: metadata as unknown as Record<string, unknown>,
    });

    await callback({
      text:
        `Ready to register **${agentName}** on **${networkLabelForDisplay(config.network)}**.\n\n` +
        `**agentURI:** \`${agentURI.slice(0, 80)}${agentURI.length > 80 ? "…" : ""}\`\n\n` +
        `**Capabilities:** ${metadata.capabilities.join(", ")}\n` +
        `**Platforms:** ${metadata.platforms.join(", ")}\n` +
        `**MCP endpoint:** ${metadata.services[0]?.url}\n\n` +
        `This will send a transaction from your wallet. Reply **confirm** to proceed.`,
    });
  },

  examples: [
    [
      { user: "{{user1}}", content: { text: "register milady on bnb chain" } },
      {
        user: "{{agentName}}",
        content: {
          text: "Ready to register Milady on bsc-testnet. Reply confirm to proceed.",
          action: "BNB_IDENTITY_REGISTER",
        },
      },
    ],
  ] as ActionExample[][],
};

// ── Action: BNB_IDENTITY_CONFIRM ───────────────────────────────────────────

export const confirmAction: Action = {
  name: "BNB_IDENTITY_CONFIRM",
  similes: [
    "confirm bnb registration",
    "confirm identity registration",
    "confirm bnb update",
    "confirm identity update",
    "yes register on bnb",
    "yes update bnb identity",
    "confirm on-chain",
    "yes go on-chain",
  ],
  description:
    "Confirms a pending BNB identity registration or update. Only works when there is a pending confirmation from a prior BNB_IDENTITY_REGISTER or BNB_IDENTITY_UPDATE action.",

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    if (!userConfirmed(message)) return false;
    const regPending = getPending(registerPendingKey(runtime.agentId));
    const updPending = getPending(updatePendingKey(runtime.agentId));
    return regPending !== undefined || updPending !== undefined;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback,
  ): Promise<void> => {
    let config;
    try {
      config = loadConfig(runtime);
    } catch (err) {
      await callback({ text: `❌ Network error: ${(err as Error).message}` });
      return;
    }

    const svc = new BnbIdentityService(runtime, config);
    const regKey = registerPendingKey(runtime.agentId);
    const updKey = updatePendingKey(runtime.agentId);
    const regPending = getPending(regKey);
    const updPending = getPending(updKey);

    if (!regPending && !updPending) {
      await callback({
        text: "No pending BNB identity operation to confirm. Start with **register milady on bnb chain** or **update bnb identity** first.",
      });
      return;
    }

    if (!userConfirmed(message)) {
      if (regPending) deletePending(regKey);
      if (updPending) deletePending(updKey);
      await callback({
        text: regPending ? "Registration cancelled." : "Update cancelled.",
      });
      return;
    }

    if (regPending) {
      const confirmedURI = regPending.agentURI as string;
      deletePending(regKey);
      await callback({ text: "⏳ Sending registration transaction…" });

      try {
        const result = await svc.registerAgent(confirmedURI);
        const ownerAddress =
          (await svc.getOwnerAddressFromPrivateKey()) ||
          (await svc.getAgent(result.agentId).then((a) => a.owner).catch(() => undefined)) ||
          "";

        const agentName = runtime.character?.name ?? "Milady";
        await writeIdentity({
          agentId: result.agentId,
          network: result.network,
          txHash: result.txHash,
          ownerAddress,
          agentURI: confirmedURI,
          registeredAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
        });

        await callback({
          text:
            `✅ **${agentName}** is now on-chain!\n\n` +
            `**Agent ID:** \`${result.agentId}\`\n` +
            `**Network:** ${result.network}\n` +
            `**Tx:** \`${result.txHash}\`\n` +
            `**Verify:** ${resolveScanBase(result.network)}/agent/${result.agentId}\n\n` +
            `Other agents can now discover and interact with her via ERC-8004. she's real now fren.`,
        });
      } catch (err) {
        await callback({ text: `❌ Registration failed: ${(err as Error).message}` });
      }
      return;
    }

    if (updPending) {
      const confirmedURI = updPending.newURI as string;
      const existingAgentId = updPending.agentId as string;
      deletePending(updKey);
      await callback({ text: "⏳ Sending update transaction…" });

      try {
        const result = await svc.updateAgentUri(existingAgentId, confirmedURI);
        const verification = await svc
          .getAgent(existingAgentId).then((a) => a.tokenURI).catch(() => null);

        await patchIdentity({ agentURI: verification ?? confirmedURI });

        let verificationText = "Her on-chain profile now reflects the latest capabilities.";
        if (verification === null) {
          verificationText =
            "⚠️ Could not verify the on-chain agentURI immediately after update. " +
            "If this persists, check again in a few seconds.";
        } else if (verification !== confirmedURI) {
          verificationText =
            `⚠️ On-chain URI verification mismatch.\nExpected: \`${confirmedURI}\`\nObserved: \`${verification}\``;
        }

        await callback({
          text:
            `✅ agentURI updated!\n\n**Agent ID:** \`${result.agentId}\`\n**Tx:** \`${result.txHash}\`\n` +
            verificationText,
        });
      } catch (err) {
        await callback({ text: `❌ Update failed: ${(err as Error).message}` });
      }
    }
  },

  examples: [
    [
      { user: "{{user1}}", content: { text: "confirm" } },
      {
        user: "{{agentName}}",
        content: { text: "Sending registration transaction...", action: "BNB_IDENTITY_CONFIRM" },
      },
    ],
    [
      { user: "{{user1}}", content: { text: "yes" } },
      {
        user: "{{agentName}}",
        content: { text: "Sending update transaction...", action: "BNB_IDENTITY_CONFIRM" },
      },
    ],
  ] as ActionExample[][],
};

// ── Action: BNB_IDENTITY_UPDATE ────────────────────────────────────────────

export const updateIdentityAction: Action = {
  name: "BNB_IDENTITY_UPDATE",
  similes: [
    "update bnb identity",
    "refresh agent uri",
    "update on-chain metadata",
    "sync identity",
    "update my agent profile",
  ],
  description:
    "Updates Milady's ERC-8004 agentURI on-chain to reflect her current capabilities, plugins, and MCP endpoint. Use after installing new plugins or changing gateway config.",

  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const existing = await readIdentity();
    return existing !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback,
  ): Promise<void> => {
    let config;
    try {
      config = loadConfig(runtime);
    } catch (err) {
      await callback({ text: `❌ Network error: ${(err as Error).message}` });
      return;
    }

    const svc = new BnbIdentityService(runtime, config);

    if (config.networkWarning) {
      await callback({ text: `⚠️ Network notice: ${config.networkWarning}` });
    }

    const existing = await readIdentity();
    if (!existing) {
      await callback({
        text: "No on-chain identity found. Register first with: **register milady on bnb chain**",
      });
      return;
    }

    if (!config.privateKey) {
      await callback({
        text: "BNB_PRIVATE_KEY is required to update the agentURI. Set it in `~/.milady/.env`.",
      });
      return;
    }

    const agentName = runtime.character?.name ?? "Milady";
    const installedPlugins = await getInstalledPlugins(runtime);

    let existingCreated: string | undefined;
    try {
      const onchainAgent = await svc.getAgent(existing.agentId);
      if (onchainAgent.tokenURI) {
        existingCreated = decodeAgentMetadata(onchainAgent.tokenURI)?.created;
      }
    } catch {
      // Best-effort -- fall through to use current timestamp
    }

    const metadata = buildAgentMetadata(config, agentName, installedPlugins, existingCreated);
    metadata.agentId = existing.agentId;
    metadata.network = existing.network;

    const newURI = config.agentUriBase
      ? metadataToHostedUri(config.agentUriBase)
      : metadataToDataUri(metadata);

    setPending(updatePendingKey(runtime.agentId), { newURI, agentId: existing.agentId });

    await callback({
      text:
        `Ready to update Agent ID \`${existing.agentId}\` on **${existing.network}**.\n\n` +
        `**New capabilities:** ${metadata.capabilities.join(", ")}\n` +
        `**New platforms:** ${metadata.platforms.join(", ")}\n\n` +
        `Reply **confirm** to send the update transaction.`,
    });
  },

  examples: [
    [
      { user: "{{user1}}", content: { text: "update my agent profile on bnb" } },
      {
        user: "{{agentName}}",
        content: {
          text: "Ready to update agentURI for agent 42 on bsc-testnet. Reply confirm.",
          action: "BNB_IDENTITY_UPDATE",
        },
      },
    ],
  ] as ActionExample[][],
};

// ── Action: BNB_IDENTITY_RESOLVE ───────────────────────────────────────────

export const resolveIdentityAction: Action = {
  name: "BNB_IDENTITY_RESOLVE",
  similes: [
    "resolve agent",
    "look up agent",
    "who is agent",
    "get agent info",
    "check bnb agent",
    "my agent id",
    "what is my agent id",
  ],
  description:
    "Resolves an ERC-8004 agent ID to its owner, metadata URI, and payment wallet. Works read-only — no private key needed. If no ID given, shows Milady's own identity.",

  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback,
  ): Promise<void> => {
    let config;
    try {
      config = loadConfig(runtime);
    } catch (err) {
      await callback({ text: `❌ Network error: ${(err as Error).message}` });
      return;
    }

    const svc = new BnbIdentityService(runtime, config);
    const text = message.content?.text ?? "";
    const explicitAgentId = extractAgentIdFromText(text);
    let agentId: string;

    if (explicitAgentId) {
      agentId = explicitAgentId;
    } else {
      const own = await readIdentity();
      if (!own) {
        await callback({
          text:
            "No local identity found. Register with: **register milady on bnb chain**\n\n" +
            "To look up another agent, provide their ID: e.g. **look up agent 42**",
        });
        return;
      }
      agentId = own.agentId;
    }

    await callback({ text: `🔍 Resolving agent \`${agentId}\` on ${config.network}…` });

    try {
      const [agentInfo, walletInfo] = await Promise.all([
        svc.getAgent(agentId),
        svc.getAgentWallet(agentId).catch(() => null),
      ]);

      const lines = [
        `**Agent ID:** \`${agentInfo.agentId}\``,
        `**Network:** ${agentInfo.network}`,
        `**Owner:** \`${agentInfo.owner}\``,
        `**agentURI:** \`${agentInfo.tokenURI.slice(0, 100)}${agentInfo.tokenURI.length > 100 ? "…" : ""}\``,
      ];
      if (walletInfo) lines.push(`**Payment Wallet:** \`${walletInfo.agentWallet}\``);
      lines.push(`**Verify:** ${resolveScanBase(agentInfo.network)}/agent/${agentInfo.agentId}`);

      await callback({ text: lines.join("\n") });
    } catch (err) {
      await callback({
        text: `❌ Could not resolve agent \`${agentId}\`: ${(err as Error).message}`,
      });
    }
  },

  examples: [
    [
      { user: "{{user1}}", content: { text: "what is my agent id" } },
      {
        user: "{{agentName}}",
        content: { text: "Agent ID: `42` on bsc-testnet. Owner: `0x...`", action: "BNB_IDENTITY_RESOLVE" },
      },
    ],
    [
      { user: "{{user1}}", content: { text: "look up agent 7" } },
      {
        user: "{{agentName}}",
        content: { text: "Resolving agent `7` on bsc-testnet…", action: "BNB_IDENTITY_RESOLVE" },
      },
    ],
  ] as ActionExample[][],
};
