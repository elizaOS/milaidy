/**
 * TRANSFER_TOKEN action — transfers tokens or native BNB to another address.
 *
 * When triggered the action:
 *   1. Validates parameters (toAddress 0x format, amount > 0, assetSymbol non-empty)
 *   2. POSTs to the local transfer execution API with agent automation header
 *   3. Returns structured result: execution status, txHash, explorer URL,
 *      or unsigned TX info if user-sign mode
 *
 * All business logic (permissions, safety caps, signing) is handled
 * server-side — this action is a thin wrapper.
 *
 * @module actions/transfer-token
 */

import type { Action, HandlerOptions } from "@elizaos/core";

/** API port for posting transfer requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

/** Matches a 0x-prefixed 40-hex-char EVM address. */
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const transferTokenAction: Action = {
  name: "TRANSFER_TOKEN",

  similes: [
    "SEND_TOKEN",
    "TRANSFER",
    "SEND",
    "SEND_BNB",
    "SEND_CRYPTO",
    "PAY",
  ],

  description:
    "Transfer tokens or native BNB to another address. Use this when a user " +
    "asks to send, transfer, or pay tokens to a recipient address on BSC.",

  validate: async () => true,

  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;

      // ── Validate toAddress ─────────────────────────────────────────────
      const toAddress =
        typeof params?.toAddress === "string"
          ? params.toAddress.trim()
          : undefined;

      if (!toAddress || !EVM_ADDRESS_RE.test(toAddress)) {
        return {
          text: "I need a valid recipient address (0x-prefixed, 40 hex chars).",
          success: false,
        };
      }

      // ── Validate amount ────────────────────────────────────────────────
      const amountRaw =
        typeof params?.amount === "string"
          ? params.amount.trim()
          : typeof params?.amount === "number"
            ? String(params.amount)
            : undefined;

      if (!amountRaw || Number.isNaN(Number(amountRaw)) || Number(amountRaw) <= 0) {
        return {
          text: "I need a positive numeric amount for the transfer.",
          success: false,
        };
      }

      // ── Validate assetSymbol ───────────────────────────────────────────
      const assetSymbol =
        typeof params?.assetSymbol === "string"
          ? params.assetSymbol.trim()
          : undefined;

      if (!assetSymbol) {
        return {
          text: "I need an asset symbol (e.g. BNB, USDT, USDC) for the transfer.",
          success: false,
        };
      }

      // ── Optional tokenAddress ──────────────────────────────────────────
      const tokenAddress =
        typeof params?.tokenAddress === "string" && params.tokenAddress.trim() !== ""
          ? params.tokenAddress.trim()
          : undefined;

      // ── POST to transfer execution API ─────────────────────────────────
      const body: Record<string, unknown> = {
        toAddress,
        amount: amountRaw,
        assetSymbol,
        confirm: true,
      };

      if (tokenAddress) {
        body.tokenAddress = tokenAddress;
      }

      const response = await fetch(
        `http://127.0.0.1:${API_PORT}/api/wallet/transfer/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Milady-Agent-Action": "1",
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as Record<
          string,
          string
        >;
        return {
          text: `Transfer failed: ${errBody.error ?? `HTTP ${response.status}`}`,
          success: false,
        };
      }

      const result = (await response.json()) as {
        ok: boolean;
        mode: string;
        executed: boolean;
        requiresUserSignature: boolean;
        toAddress: string;
        amount: string;
        assetSymbol: string;
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
          text: `Transfer failed: ${result.error ?? "unknown error"}`,
          success: false,
        };
      }

      // ── Build human-readable response ──────────────────────────────────
      if (result.executed && result.execution) {
        return {
          text:
            `Transfer executed successfully! Sent ${amountRaw} ${assetSymbol} to ${toAddress} via ${result.mode} mode.\n` +
            `TX: ${result.execution.explorerUrl}\n` +
            `Status: ${result.execution.status}`,
          success: true,
          data: {
            toAddress,
            amount: amountRaw,
            assetSymbol,
            mode: result.mode,
            txHash: result.execution.hash,
            explorerUrl: result.execution.explorerUrl,
            executed: true,
          },
        };
      }

      // user-sign mode — transfer was prepared but not executed on-chain
      return {
        text:
          `Transfer prepared in ${result.mode} mode. ` +
          `A user signature is required to send ${amountRaw} ${assetSymbol} to ${toAddress}.`,
        success: true,
        data: {
          toAddress,
          amount: amountRaw,
          assetSymbol,
          mode: result.mode,
          requiresUserSignature: true,
          executed: false,
          unsignedTx: result.unsignedTx,
        },
      };
    } catch (err) {
      return {
        text: `Transfer failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "toAddress",
      description:
        "Recipient EVM address (0x-prefixed, 40 hex characters)",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "amount",
      description:
        'Human-readable transfer amount (e.g. "1.5" BNB, "100" USDT)',
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "assetSymbol",
      description:
        'Token symbol to transfer (e.g. "BNB", "USDT", "USDC")',
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "tokenAddress",
      description:
        "Token contract address for custom tokens (optional, not needed for native BNB)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
