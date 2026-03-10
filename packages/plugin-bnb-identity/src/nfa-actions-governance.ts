import type {
  Action,
  Handler,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import {
  extractAddress,
  loadBnbIdentityConfig,
  networkLabelForDisplay,
  type ResolvedBnbIdentityConfig,
  userConfirmed,
} from "./nfa-actions-shared.js";
import { BnbIdentityService } from "./service.js";
import { patchNfa, readNfa } from "./store.js";

export const nfaTransferAction: Action = {
  name: "BNB_NFA_TRANSFER",
  similes: ["transfer nfa", "send nfa", "transfer agent nft"],
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
        text: "BNB_PRIVATE_KEY is required to transfer the NFA. Set it in `~/.milady/.env`.",
      });
      return;
    }

    const pendingKey = "bnb_nfa_transfer_pending";
    const pending = state?.[pendingKey] as { toAddress: string } | undefined;
    if (!pending) {
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

    if (!userConfirmed(message)) {
      await callback({ text: "NFA transfer cancelled." });
      if (state) delete state[pendingKey];
      return;
    }
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
        text: "BNB_PRIVATE_KEY is required to upgrade NFA logic. Set it in `~/.milady/.env`.",
      });
      return;
    }

    const pendingKey = "bnb_nfa_upgrade_logic_pending";
    const pending = state?.[pendingKey] as
      | { newLogicAddress: string }
      | undefined;
    if (!pending) {
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

    if (!userConfirmed(message)) {
      await callback({ text: "NFA logic upgrade cancelled." });
      if (state) delete state[pendingKey];
      return;
    }
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
        text: "BNB_PRIVATE_KEY is required to pause/unpause the NFA. Set it in `~/.milady/.env`.",
      });
      return;
    }

    const text = (message.content?.text ?? "").toLowerCase();
    const wantsUnpause =
      text.includes("unpause") ||
      text.includes("resume") ||
      text.includes("reactivate");
    const wantsPause = !wantsUnpause;

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
