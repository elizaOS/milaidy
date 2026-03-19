/**
 * Jeju plugin actions — status and swap.
 * All actions log to the terminal via runtime.logger for visibility.
 */

import type {
  Action,
  ActionResult,
  Content,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { getJejuClient, getJejuBalances, executeJejuSwap } from "./client";
import { parseJejuSwapFromUserText } from "./swap-parse.js";

function log(runtime: IAgentRuntime, msg: string): void {
  runtime.logger?.info?.(`[jeju] ${msg}`) ?? console.info(`[jeju] ${msg}`);
}

/**
 * Push action output into the visible chat reply. Eliza runtimes pass this when
 * streaming; returning `text` on ActionResult alone is often not shown to the user.
 */
async function surfaceToChat(
  callback: HandlerCallback | undefined,
  text: string,
  actionName: string,
): Promise<void> {
  if (!callback || !text) return;
  await callback({
    text,
    action: actionName,
    actions: [],
  } as Content);
}

async function finishJeju(
  callback: HandlerCallback | undefined,
  actionName: string,
  result: ActionResult,
): Promise<ActionResult> {
  if (result.text) {
    await surfaceToChat(callback, result.text, actionName);
  }
  return result;
}

export const jejuStatusAction: Action = {
  name: "JEJU_STATUS",
  similes: ["JEJU_WALLET", "JEJU_BALANCE", "BAZAAR_STATUS", "JEJU_INFO"],
  description:
    "Report the agent's Jeju/Bazaar wallet address and balances (ETH, WETH, USDC) on the connected Jeju network. Use when the user asks for wallet address, balance, or Jeju status.",

  validate: async () => true,

  handler: async (runtime, _message, _state, _options, callback) => {
    log(runtime, "JEJU_STATUS triggered");
    try {
      const client = getJejuClient();
      log(runtime, `Wallet: ${client.address}`);
      const balances = await getJejuBalances(client);
      if (balances.error) {
        log(runtime, `Balance error: ${balances.error}`);
        return finishJeju(callback, "JEJU_STATUS", {
          text: `Jeju wallet: \`${client.address}\`. Could not fetch balances: ${balances.error}`,
          success: false,
          data: { address: client.address, error: balances.error },
        });
      }
      const summary = `ETH: ${balances.eth}, WETH: ${balances.weth}, USDC: ${balances.usdc}`;
      log(runtime, summary);
      return finishJeju(callback, "JEJU_STATUS", {
        text: `Jeju wallet: \`${client.address}\`. Balances — ${summary}`,
        success: true,
        data: {
          address: client.address,
          eth: balances.eth,
          weth: balances.weth,
          usdc: balances.usdc,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(runtime, `JEJU_STATUS failed: ${msg}`);
      return finishJeju(callback, "JEJU_STATUS", {
        text: `Jeju status failed: ${msg}`,
        success: false,
        data: { error: msg },
      });
    }
  },
};

export const jejuSwapAction: Action = {
  name: "JEJU_SWAP",
  similes: ["JEJU_TRADE", "BAZAAR_SWAP", "SWAP_ETH_USDC", "SWAP_USDC_ETH"],
  description:
    "Swap on Jeju/Bazaar: ETH→USDC or USDC→ETH. Parameters: direction (eth_to_usdc or usdc_to_eth), amount (human-readable, e.g. 0.1 or 100). Use when the user asks to swap ETH for USDC or USDC for ETH.",

  validate: async () => true,

  handler: async (runtime, message, _state, options, callback) => {
    const params = (options as HandlerOptions | undefined)?.parameters as
      | { direction?: string; amount?: string | number }
      | undefined;

    let direction = params?.direction?.toLowerCase?.();
    let amount =
      typeof params?.amount === "number"
        ? String(params.amount)
        : params?.amount?.trim?.();

    const userText = message.content?.text ?? "";
    const parsed = parseJejuSwapFromUserText(userText);
    if (direction !== "eth_to_usdc" && direction !== "usdc_to_eth") {
      if (parsed.direction) {
        direction = parsed.direction;
        log(runtime, `JEJU_SWAP: direction from message text → ${direction}`);
      }
    }
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      if (parsed.amount) {
        amount = parsed.amount;
        log(runtime, `JEJU_SWAP: amount from message text → ${amount}`);
      }
    }

    if (direction !== "eth_to_usdc" && direction !== "usdc_to_eth") {
      log(runtime, `JEJU_SWAP rejected: invalid direction '${direction}'`);
      return finishJeju(callback, "JEJU_SWAP", {
        text: "Invalid direction. Say e.g. swap ETH for USDC, or USDC for ETH.",
        success: false,
      });
    }
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      log(runtime, `JEJU_SWAP rejected: invalid amount '${amount}'`);
      return finishJeju(callback, "JEJU_SWAP", {
        text: "Invalid amount. Provide a positive number (e.g. 0.1 ETH or 100 USDC).",
        success: false,
      });
    }

    log(runtime, `JEJU_SWAP: ${direction} amount=${amount}`);
    try {
      const client = getJejuClient();
      const result = await executeJejuSwap(
        client,
        direction,
        amount,
        100, // 1% slippage placeholder
        (msg) => log(runtime, msg),
      );
      return finishJeju(callback, "JEJU_SWAP", {
        text: result.message,
        success: result.success,
        data: result.txHash ? { txHash: result.txHash } : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(runtime, `JEJU_SWAP failed: ${msg}`);
      return finishJeju(callback, "JEJU_SWAP", {
        text: `Swap failed: ${msg}`,
        success: false,
        data: { error: msg },
      });
    }
  },

  parameters: [
    {
      name: "direction",
      description: "eth_to_usdc or usdc_to_eth",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "amount",
      description: "Amount to swap (e.g. 0.1 for ETH, 100 for USDC)",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};
