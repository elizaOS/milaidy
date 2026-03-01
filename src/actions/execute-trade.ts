/**
 * EXECUTE_TRADE action — executes a BSC token trade (buy or sell).
 *
 * When triggered the action:
 *   1. Validates parameters (side, tokenAddress format, amount > 0)
 *   2. POSTs to the local trade execution API with agent automation header
 *   3. Returns structured result: quote details, execution status, txHash
 *      if executed, or unsigned TX info if user-sign mode
 *
 * All business logic (permissions, safety caps, signing) is handled
 * server-side — this action is a thin wrapper.
 *
 * @module actions/execute-trade
 */

import type { Action, HandlerOptions } from "@elizaos/core";

/** API port for posting trade requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

/** Timeout for the trade API call (includes on-chain confirmation). */
const TRADE_TIMEOUT_MS = 60_000;

/** Matches a 0x-prefixed 40-hex-char BSC address. */
const BSC_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const executeTradeAction: Action = {
  name: "EXECUTE_TRADE",

  similes: [
    "BUY_TOKEN",
    "SELL_TOKEN",
    "SWAP",
    "TRADE",
    "BUY",
    "SELL",
  ],

  description:
    "Execute a BSC token trade (buy or sell). Use this when a user asks to " +
    "buy or sell a token on BSC/BNB Chain. The trade is routed through " +
    "PancakeSwap and respects the current trade permission mode.",

  validate: async () => true,

  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;

      // ── Validate side ──────────────────────────────────────────────
      const side =
        typeof params?.side === "string"
          ? params.side.trim().toLowerCase()
          : undefined;

      if (side !== "buy" && side !== "sell") {
        return {
          text: 'I need a valid trade side ("buy" or "sell").',
          success: false,
        };
      }

      // ── Validate tokenAddress ──────────────────────────────────────
      const tokenAddress =
        typeof params?.tokenAddress === "string"
          ? params.tokenAddress.trim()
          : undefined;

      if (!tokenAddress || !BSC_ADDRESS_RE.test(tokenAddress)) {
        return {
          text: "I need a valid BSC token contract address (0x-prefixed, 40 hex chars).",
          success: false,
        };
      }

      // ── Validate amount ────────────────────────────────────────────
      const amountRaw =
        typeof params?.amount === "string"
          ? params.amount.trim()
          : typeof params?.amount === "number"
            ? String(params.amount)
            : undefined;

      if (!amountRaw || Number.isNaN(Number(amountRaw)) || Number(amountRaw) <= 0) {
        return {
          text: "I need a positive numeric amount for the trade.",
          success: false,
        };
      }

      // ── Optional slippageBps (default 300 = 3%) ────────────────────
      const slippageBps =
        typeof params?.slippageBps === "number"
          ? params.slippageBps
          : typeof params?.slippageBps === "string" && params.slippageBps.trim() !== ""
            ? Number(params.slippageBps)
            : 300;

      if (Number.isNaN(slippageBps) || slippageBps < 0) {
        return {
          text: "slippageBps must be a non-negative number.",
          success: false,
        };
      }

      // ── POST to trade execution API ────────────────────────────────
      const response = await fetch(
        `http://127.0.0.1:${API_PORT}/api/wallet/trade/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Milady-Agent-Action": "1",
          },
          body: JSON.stringify({
            side,
            tokenAddress,
            amount: amountRaw,
            slippageBps,
            confirm: true,
          }),
          signal: AbortSignal.timeout(TRADE_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<
          string,
          string
        >;
        return {
          text: `Trade failed: ${body.error ?? `HTTP ${response.status}`}`,
          success: false,
        };
      }

      const result = (await response.json()) as {
        ok: boolean;
        side: string;
        mode: string;
        quote?: Record<string, unknown>;
        executed: boolean;
        requiresUserSignature: boolean;
        unsignedTx?: Record<string, unknown>;
        execution?: {
          hash: string;
          explorerUrl: string;
          status: string;
          blockNumber: number | null;
        };
        error?: string;
      };

      if (!result.ok) {
        return {
          text: `Trade failed: ${result.error ?? "unknown error"}`,
          success: false,
        };
      }

      // ── Build human-readable response ──────────────────────────────
      if (result.executed && result.execution) {
        return {
          text:
            `Trade executed successfully! ${side.toUpperCase()} via ${result.mode} mode.\n` +
            `TX: ${result.execution.explorerUrl}\n` +
            `Status: ${result.execution.status}`,
          success: true,
          data: {
            side,
            tokenAddress,
            amount: amountRaw,
            mode: result.mode,
            txHash: result.execution.hash,
            explorerUrl: result.execution.explorerUrl,
            executed: true,
          },
        };
      }

      // user-sign mode — trade was quoted but not executed on-chain
      return {
        text:
          `Trade prepared in ${result.mode} mode. ` +
          `A user signature is required to complete the ${side}.`,
        success: true,
        data: {
          side,
          tokenAddress,
          amount: amountRaw,
          mode: result.mode,
          requiresUserSignature: true,
          executed: false,
          unsignedTx: result.unsignedTx,
        },
      };
    } catch (err) {
      return {
        text: `Trade failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "side",
      description: 'Trade direction: "buy" or "sell"',
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "tokenAddress",
      description:
        "BSC token contract address (0x-prefixed, 40 hex characters)",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "amount",
      description:
        'Human-readable trade amount (e.g. "0.5" BNB for buys, or token amount for sells)',
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "slippageBps",
      description:
        "Slippage tolerance in basis points (default 300 = 3%)",
      required: false,
      schema: { type: "number" as const },
    },
  ],
};
