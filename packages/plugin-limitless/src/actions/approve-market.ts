import type {
  Action,
  ActionExample,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import {
  createPublicClient,
  http,
  getContract,
  parseAbi,
  maxUint256,
} from "viem";
import { base } from "viem/chains";
import { LimitlessClient } from "../core/markets.js";
import { getOrCreateWallet } from "../core/wallet.js";
import { getPluginConfig } from "../config.js";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const CTF_ADDRESS = "0xC9c98965297Bc527861c898329Ee280632B76e18" as const;

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
]);

const CTF_ABI = parseAbi([
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) external view returns (bool)",
]);

export const approveMarketAction: Action = {
  name: "LIMITLESS_APPROVE_MARKET",
  similes: [
    "approve market",
    "approve tokens",
    "approve limitless",
    "token approval",
    "approve trading",
  ],
  description:
    "Approve USDC and conditional token spending for a specific Limitless market venue. Required before placing orders on a new market. This is an on-chain transaction on Base.",

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const config = getPluginConfig(runtime);
    return !!config.apiKey && !!config.privateKey;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback,
  ) => {
    try {
      const config = getPluginConfig(runtime);
      const params = options?.parameters as { marketSlug: string } | undefined;

      if (!params?.marketSlug) {
        if (callback) {
          await callback({
            text: "Please provide the market slug to approve tokens for.",
            actions: [],
          } as Content);
        }
        return { success: false, error: "Missing marketSlug" };
      }

      if (config.dryRun) {
        if (callback) {
          await callback({
            text: `DRY RUN: Would approve tokens for market **${params.marketSlug}**. Set LIMITLESS_DRY_RUN=false for live execution.`,
            actions: [],
          } as Content);
        }
        return { success: true };
      }

      const { client: walletClient, account } = getOrCreateWallet(runtime);
      const limitless = new LimitlessClient(config.apiBaseUrl, config.apiKey);

      const market = await limitless.getMarket(params.marketSlug);
      if (!market.venue?.exchange) {
        throw new Error(`Market ${params.marketSlug} has no venue/exchange data`);
      }

      const exchangeAddress = market.venue.exchange as `0x${string}`;
      const publicClient = createPublicClient({ chain: base, transport: http() });

      // Approve USDC for exchange
      const usdc = getContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        client: { public: publicClient, wallet: walletClient as any },
      });

      const allowance = await (usdc.read as any).allowance([account.address, exchangeAddress]);
      const minAllowance = 1_000_000_000000n;
      const results: string[] = [];

      if (allowance < minAllowance) {
        const hash = await (usdc.write as any).approve([exchangeAddress, maxUint256]);
        await publicClient.waitForTransactionReceipt({ hash });
        results.push(`USDC approved (tx: ${hash})`);
      } else {
        results.push("USDC already approved");
      }

      // Approve CTF for exchange
      const ctf = getContract({
        address: CTF_ADDRESS,
        abi: CTF_ABI,
        client: { public: publicClient, wallet: walletClient as any },
      });

      const isApproved = await (ctf.read as any).isApprovedForAll([account.address, exchangeAddress]);
      if (!isApproved) {
        const hash = await (ctf.write as any).setApprovalForAll([exchangeAddress, true]);
        await publicClient.waitForTransactionReceipt({ hash });
        results.push(`CTF approved (tx: ${hash})`);
      } else {
        results.push("CTF already approved");
      }

      if (callback) {
        await callback({
          text: `Token approvals for **${params.marketSlug}**:\n${results.map((r) => `- ${r}`).join("\n")}`,
          actions: [],
        } as Content);
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({ text: `Failed to approve tokens: ${msg}`, actions: [] } as Content);
      }
      return { success: false, error: msg };
    }
  },

  parameters: [
    {
      name: "marketSlug",
      description: "The market slug to approve tokens for",
      required: true,
      schema: { type: "string" },
    },
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Approve tokens for btc-above-100k" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Token approvals for **btc-above-100k**:\n- USDC approved\n- CTF approved",
          actions: ["LIMITLESS_APPROVE_MARKET"],
        },
      } as ActionExample,
    ],
  ],
};
