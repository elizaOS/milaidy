/**
 * ElizaOS Actions for @milady/plugin-bnb-identity.
 *
 * Three actions surface in Milady's chat interface:
 *
 *   BNB_IDENTITY_REGISTER  — first-time on-chain registration
 *   BNB_IDENTITY_UPDATE    — refresh agentURI after config changes
 *   BNB_IDENTITY_RESOLVE   — look up any agent by ID (read-only)
 *
 * All write operations surface a confirmation message before calling
 * the MCP tool. The user must reply "yes" / "confirm" to proceed.
 */

import type {
  Action,
  ActionExample,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  JsonValue,
  Memory,
  State,
} from "@elizaos/core";
import {
  loadBnbIdentityConfig,
  type ResolvedBnbIdentityConfig,
} from "./config.js";
import {
  buildAgentMetadata,
  metadataToDataUri,
  metadataToHostedUri,
} from "./metadata.js";
import { BnbIdentityService } from "./service.js";
import { patchIdentity, readIdentity, writeIdentity } from "./store.js";

export { normalizeBnbNetwork } from "./config.js";

function resolveScanBase(network: string): string {
  return network === "bsc"
    ? "https://www.8004scan.io"
    : "https://testnet.8004scan.io";
}

function networkLabelForDisplay(network: string): string {
  return network === "bsc"
    ? "BSC Mainnet 🔴 REAL MONEY"
    : `${network} (testnet)`;
}

function userConfirmed(message: Memory): boolean {
  const userText = message.content?.text?.toLowerCase() ?? "";
  return userText.includes("confirm") || userText.includes("yes");
}

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

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    // Valid if not already registered, or user explicitly wants to re-register.
    // We allow re-registration so the action is always callable — the handler
    // will warn if an identity already exists.
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options?: HandlerOptions | Record<string, JsonValue | undefined>,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    let config: ResolvedBnbIdentityConfig;
    try {
      config = loadBnbIdentityConfig(runtime);
    } catch (err) {
      await callback?.({
        text: `❌ Network error: ${(err as Error).message}`,
      });
      return;
    }

    const svc = new BnbIdentityService(runtime, config);

    if (config.networkWarning) {
      await callback?.({
        text: `⚠️ Network notice: ${config.networkWarning}`,
      });
    }

    // Check for existing identity
    const existing = await readIdentity();
    if (existing) {
      await callback?.({
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
      await callback?.({
        text:
          "🔑 BNB_PRIVATE_KEY is not set. Add it to `~/.milady/.env`:\n\n" +
          "```\nBNB_PRIVATE_KEY=0x...\n```\n\n" +
          "This key will own Milady's agent NFT. Keep it safe — losing it means losing control of her on-chain identity.",
      });
      return;
    }

    // Build the metadata + URI
    const agentName = runtime.character?.name ?? "Milady";
    const installedPlugins = await getInstalledPlugins(runtime);
    const metadata = buildAgentMetadata(config, agentName, installedPlugins);

    const agentURI = config.agentUriBase
      ? metadataToHostedUri(metadata, config.agentUriBase)
      : metadataToDataUri(metadata);

    await callback?.({
      text:
        `Ready to register **${agentName}** on **${networkLabelForDisplay(config.network)}**.\n\n` +
        `**agentURI:** \`${agentURI.slice(0, 80)}${agentURI.length > 80 ? "…" : ""}\`\n\n` +
        `**Capabilities:** ${metadata.capabilities.join(", ")}\n` +
        `**Platforms:** ${metadata.platforms.join(", ")}\n` +
        `**MCP endpoint:** ${metadata.services[0]?.url}\n\n` +
        `This will send a transaction from your wallet. Reply **confirm** to proceed.`,
    });

    // Wait for confirmation — ElizaOS will call handler again with user reply.
    // We detect the confirmation via state flag set below on retry.
    const pendingKey = "bnb_identity_register_pending";
    if (!state?.[pendingKey]) {
      // First call: set pending flag and return — wait for user confirmation.
      if (state) state[pendingKey] = { agentURI, metadata };
      return;
    }

    // Second call after user confirmed: check message text
    if (!userConfirmed(message)) {
      await callback?.({ text: "Registration cancelled." });
      if (state) delete state[pendingKey];
      return;
    }

    // Execute registration
    await callback?.({ text: "⏳ Sending registration transaction…" });

    try {
      const result = await svc.registerAgent(agentURI);
      const ownerAddress =
        (await svc.getOwnerAddressFromPrivateKey()) ||
        (await svc
          .getAgent(result.agentId)
          .then((agent) => agent.owner)
          .catch(() => undefined)) ||
        "";

      const record = {
        agentId: result.agentId,
        network: result.network,
        txHash: result.txHash,
        ownerAddress,
        agentURI,
        registeredAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      };
      await writeIdentity(record);

      await callback?.({
        text:
          `✅ **${agentName}** is now on-chain!\n\n` +
          `**Agent ID:** \`${result.agentId}\`\n` +
          `**Network:** ${result.network}\n` +
          `**Tx:** \`${result.txHash}\`\n` +
          `**Verify:** ${resolveScanBase(result.network)}/agent/${result.agentId}\n\n` +
          `Other agents can now discover and interact with her via ERC-8004. she's real now fren.`,
      });
    } catch (err) {
      await callback?.({
        text: `❌ Registration failed: ${(err as Error).message}`,
      });
    }

    if (state) delete state[pendingKey];
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "register milady on bnb chain" },
      } as ActionExample,
      {
        name: "{{agentName}}",
        content: {
          text: "Ready to register Milady on bsc-testnet. Reply confirm to proceed.",
          action: "BNB_IDENTITY_REGISTER",
        },
      } as ActionExample,
    ],
  ],
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

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    const existing = await readIdentity();
    return existing !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options?: HandlerOptions | Record<string, JsonValue | undefined>,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    let config: ResolvedBnbIdentityConfig;
    try {
      config = loadBnbIdentityConfig(runtime);
    } catch (err) {
      await callback?.({
        text: `❌ Network error: ${(err as Error).message}`,
      });
      return;
    }

    const svc = new BnbIdentityService(runtime, config);

    if (config.networkWarning) {
      await callback?.({
        text: `⚠️ Network notice: ${config.networkWarning}`,
      });
    }

    const existing = await readIdentity();
    if (!existing) {
      await callback?.({
        text: "No on-chain identity found. Register first with: **register milady on bnb chain**",
      });
      return;
    }

    if (!config.privateKey) {
      await callback?.({
        text: "BNB_PRIVATE_KEY is required to update the agentURI. Set it in `~/.milady/.env`.",
      });
      return;
    }

    const agentName = runtime.character?.name ?? "Milady";
    const installedPlugins = await getInstalledPlugins(runtime);
    const metadata = buildAgentMetadata(config, agentName, installedPlugins);
    // Carry forward the existing agentId in the metadata
    metadata.agentId = existing.agentId;
    metadata.network = existing.network;

    const newURI = config.agentUriBase
      ? metadataToHostedUri(metadata, config.agentUriBase)
      : metadataToDataUri(metadata);

    await callback?.({
      text:
        `Ready to update Agent ID \`${existing.agentId}\` on **${existing.network}**.\n\n` +
        `**New capabilities:** ${metadata.capabilities.join(", ")}\n` +
        `**New platforms:** ${metadata.platforms.join(", ")}\n\n` +
        `Reply **confirm** to send the update transaction.`,
    });

    const pendingKey = "bnb_identity_update_pending";
    if (!state?.[pendingKey]) {
      if (state) state[pendingKey] = { newURI };
      return;
    }

    if (!userConfirmed(message)) {
      await callback?.({ text: "Update cancelled." });
      if (state) delete state[pendingKey];
      return;
    }

    await callback?.({ text: "⏳ Sending update transaction…" });

    try {
      const result = await svc.updateAgentUri(existing.agentId, newURI);
      const verification = await svc
        .getAgent(existing.agentId)
        .then((agent) => agent.tokenURI)
        .catch(() => null);

      const onchainURI = verification ?? newURI;
      await patchIdentity({ agentURI: onchainURI });

      let verificationText =
        "Her on-chain profile now reflects the latest capabilities.";
      if (verification === null) {
        verificationText =
          "⚠️ Could not verify the on-chain agentURI immediately after update. " +
          "If this persists, check again in a few seconds.";
      } else if (verification !== newURI) {
        verificationText =
          `⚠️ On-chain URI verification mismatch.\n` +
          `Expected: \`${newURI}\`\n` +
          `Observed: \`${verification}\``;
      }

      await callback?.({
        text:
          `✅ agentURI updated!\n\n` +
          `**Agent ID:** \`${result.agentId}\`\n` +
          `**Tx:** \`${result.txHash}\`\n` +
          verificationText,
      });
    } catch (err) {
      await callback?.({
        text: `❌ Update failed: ${(err as Error).message}`,
      });
    }

    if (state) delete state[pendingKey];
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "update my agent profile on bnb" },
      } as ActionExample,
      {
        name: "{{agentName}}",
        content: {
          text: "Ready to update agentURI for agent 42 on bsc-testnet. Reply confirm.",
          action: "BNB_IDENTITY_UPDATE",
        },
      } as ActionExample,
    ],
  ],
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

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options?: HandlerOptions | Record<string, JsonValue | undefined>,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    let config: ResolvedBnbIdentityConfig;
    try {
      config = loadBnbIdentityConfig(runtime);
    } catch (err) {
      await callback?.({
        text: `❌ Network error: ${(err as Error).message}`,
      });
      return;
    }

    const svc = new BnbIdentityService(runtime, config);

    // Try to extract an agentId from the message text
    const text = message.content?.text ?? "";
    const explicitAgentId = extractAgentIdFromText(text);

    let agentId: string;

    if (explicitAgentId) {
      agentId = explicitAgentId;
    } else {
      // Default to Milady's own identity
      const own = await readIdentity();
      if (!own) {
        await callback?.({
          text:
            "No local identity found. Register with: **register milady on bnb chain**\n\n" +
            "To look up another agent, provide their ID: e.g. **look up agent 42**",
        });
        return;
      }
      agentId = own.agentId;
    }

    await callback?.({
      text: `🔍 Resolving agent \`${agentId}\` on ${config.network}…`,
    });

    try {
      const [agentInfo, walletInfo] = await Promise.all([
        svc.getAgent(agentId),
        svc.getAgentWallet(agentId).catch(() => null), // wallet lookup is best-effort
      ]);

      const lines = [
        `**Agent ID:** \`${agentInfo.agentId}\``,
        `**Network:** ${agentInfo.network}`,
        `**Owner:** \`${agentInfo.owner}\``,
        `**agentURI:** \`${agentInfo.tokenURI.slice(0, 100)}${agentInfo.tokenURI.length > 100 ? "…" : ""}\``,
      ];

      if (walletInfo) {
        lines.push(`**Payment Wallet:** \`${walletInfo.agentWallet}\``);
      }

      lines.push(
        `**Verify:** ${resolveScanBase(agentInfo.network)}/agent/${agentInfo.agentId}`,
      );

      await callback?.({ text: lines.join("\n") });
    } catch (err) {
      await callback?.({
        text: `❌ Could not resolve agent \`${agentId}\`: ${(err as Error).message}`,
      });
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "what is my agent id" },
      } as ActionExample,
      {
        name: "{{agentName}}",
        content: {
          text: "Agent ID: `42` on bsc-testnet. Owner: `0x...`",
          action: "BNB_IDENTITY_RESOLVE",
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "look up agent 7" },
      } as ActionExample,
      {
        name: "{{agentName}}",
        content: {
          text: "Resolving agent `7` on bsc-testnet…",
          action: "BNB_IDENTITY_RESOLVE",
        },
      } as ActionExample,
    ],
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Reads installed plugin names from the runtime or falls back to plugins.json.
 */
async function getInstalledPlugins(runtime: IAgentRuntime): Promise<string[]> {
  // ElizaOS runtime exposes plugins on the character config
  const character = runtime.character as { plugins?: string[] } | undefined;
  const characterPlugins = character?.plugins ?? [];
  if (characterPlugins.length > 0) return characterPlugins;

  // Fallback: read plugins.json from the Milady root
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    const pluginsPath = join(homedir(), ".milady", "plugins.json");
    const raw = await readFile(pluginsPath, "utf8");
    const data = JSON.parse(raw) as { plugins?: string[] };
    return data.plugins ?? [];
  } catch {
    return [];
  }
}

/**
 * Extracts agentId when the message contains a resolvable agent reference.
 */
export function extractAgentIdFromText(text: string): string | undefined {
  const patterns = [
    /\b(?:agent\s*id|agentid)\s*(?:[:#]|is|=)?\s*(\d+)\b/i,
    /\blook\s*up\s*agent\s*(?:id\s*)?(\d+)\b/i,
    /\bresolve\s+agent\s*(?:id\s*)?(\d+)\b/i,
    /\bagent\s+(?:id\s*)?(?:is\s*)?#?(\d+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}
