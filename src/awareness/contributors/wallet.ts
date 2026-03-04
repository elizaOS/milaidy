/**
 * Wallet contributor — reports real wallet addresses, chain readiness,
 * signer mode, and trade permissions. Never exposes private keys.
 */
import type { IAgentRuntime } from "@elizaos/core";
import { getWalletAddresses } from "../../api/wallet.js";
import { loadMiladyConfig } from "../../config/config.js";
import type { AwarenessContributor } from "../../contracts/awareness.js";

// Stub until server.ts exports these (deferred to integration PR)
function resolveTradePermissionMode(_config?: unknown): string {
  return process.env.MILADY_TRADE_PERMISSION_MODE ?? "disabled";
}
function canUseLocalTradeExecution(
  _mode?: string,
  _isAgent?: boolean,
): boolean {
  return resolveTradePermissionMode() !== "disabled";
}

function shorten(address: string | null): string | null {
  if (!address) return null;
  if (address.startsWith("0x") && address.length >= 12) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export const walletContributor: AwarenessContributor = {
  id: "wallet",
  position: 30,
  cacheTtl: 60_000,
  invalidateOn: ["wallet-updated", "config-changed"],
  trusted: true,

  async summary(_runtime: IAgentRuntime): Promise<string> {
    const addrs = getWalletAddresses();
    const hasEvm = Boolean(addrs.evmAddress);
    const hasSol = Boolean(addrs.solanaAddress);

    if (!hasEvm && !hasSol) {
      return "Wallet: not configured";
    }

    const config = loadMiladyConfig();
    const tradeMode = resolveTradePermissionMode(config);
    const localSigner = Boolean(process.env.EVM_PRIVATE_KEY?.trim());
    const bscRpc = Boolean(
      process.env.NODEREAL_BSC_RPC_URL?.trim() ||
        process.env.QUICKNODE_BSC_RPC_URL?.trim() ||
        process.env.BSC_RPC_URL?.trim(),
    );

    const parts: string[] = [];
    if (hasEvm) parts.push(`EVM ${shorten(addrs.evmAddress)}`);
    if (hasSol) parts.push(`SOL ${shorten(addrs.solanaAddress)}`);
    if (bscRpc) parts.push("BSC-RPC ready");
    if (localSigner) parts.push("signer");
    parts.push(tradeMode);

    return `Wallet: ${parts.join(" | ")}`;
  },

  async detail(
    _runtime: IAgentRuntime,
    level: "brief" | "full",
  ): Promise<string> {
    const addrs = getWalletAddresses();
    const config = loadMiladyConfig();
    const tradeMode = resolveTradePermissionMode(config);
    const localSigner = Boolean(process.env.EVM_PRIVATE_KEY?.trim());
    const bscRpc = Boolean(
      process.env.NODEREAL_BSC_RPC_URL?.trim() ||
        process.env.QUICKNODE_BSC_RPC_URL?.trim() ||
        process.env.BSC_RPC_URL?.trim(),
    );
    const canUserTrade = canUseLocalTradeExecution(tradeMode, false);
    const canAgentTrade = canUseLocalTradeExecution(tradeMode, true);

    const lines: string[] = ["## Wallet"];
    lines.push(`EVM address: ${addrs.evmAddress ?? "none"}`);
    lines.push(`Solana address: ${addrs.solanaAddress ?? "none"}`);
    lines.push(`Local signer: ${localSigner ? "available" : "not set"}`);
    lines.push(`Trade permission mode: ${tradeMode}`);
    lines.push(`Can user execute trades: ${canUserTrade}`);
    lines.push(`Can agent auto-trade: ${canAgentTrade}`);

    if (level === "full") {
      lines.push(`BSC RPC configured: ${bscRpc}`);
      lines.push(
        `Alchemy key: ${Boolean(process.env.ALCHEMY_API_KEY?.trim())}`,
      );
      lines.push(`Ankr key: ${Boolean(process.env.ANKR_API_KEY?.trim())}`);
      lines.push(`Helius key: ${Boolean(process.env.HELIUS_API_KEY?.trim())}`);
    }

    return lines.join("\n");
  },
};
