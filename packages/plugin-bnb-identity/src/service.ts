/**
 * BnbIdentityService — wraps the BNB Chain MCP tool calls.
 *
 * The bnbchain-mcp server runs as a child MCP process (started separately
 * by the user via `npx @bnb-chain/mcp@latest`). We call it here through
 * the ElizaOS IAgentRuntime's MCP client, which routes tool calls to any
 * registered MCP server by tool name.
 *
 * If no MCP client is available (e.g. tests), we fall back to direct
 * HTTP calls against a locally running bnbchain-mcp SSE server at
 * BNB_MCP_URL (default http://localhost:3001).
 */

import type { IAgentRuntime } from "@elizaos/core";
import type {
  AddressResult,
  BnbIdentityConfig,
  GetAgentResult,
  GetAgentWalletResult,
  NfaInfo,
  NfaMintResult,
  NfaPauseResult,
  NfaTransferResult,
  NfaUpdateLearningResult,
  NfaUpgradeResult,
  RegisterResult,
  SetUriResult,
} from "./types.js";

export type McpToolResponse = {
  isError?: boolean;
  content?: string | { text?: string } | Array<{ text?: string }>;
  result?: unknown;
  error?: string;
  message?: string;
};

const MCP_TOOL_GENERIC_ERROR_MESSAGE = "Unknown MCP tool failure.";
export const DEFAULT_BNB_MAINNET_RPC_URL = "https://bsc-rpc.publicnode.com";
export const DEFAULT_BNB_TESTNET_RPC_URL =
  "https://data-seed-prebsc-1-s1.binance.org:8545/";

type NfaMintOptions = {
  persona?: string;
  experience?: string;
  voiceHash?: string;
  animationURI?: string;
  vaultURI?: string;
  vaultHash?: string;
};

export function resolveBnbRpcUrl(
  config: Pick<BnbIdentityConfig, "network" | "rpcUrl">,
): string {
  const configuredRpcUrl = config.rpcUrl?.trim();
  if (configuredRpcUrl) {
    return configuredRpcUrl;
  }
  return config.network === "bsc"
    ? DEFAULT_BNB_MAINNET_RPC_URL
    : DEFAULT_BNB_TESTNET_RPC_URL;
}

export function extractMcpPayload(result: McpToolResponse): unknown {
  if (result.result !== undefined) {
    return result.result;
  }

  if (result.content === undefined || result.content === null) {
    return null;
  }

  if (typeof result.content === "string") {
    return result.content;
  }

  if (Array.isArray(result.content)) {
    if (result.content.length === 0) {
      return null;
    }
    const first = result.content[0];
    if (typeof first === "string") {
      return first;
    }
    if (first && typeof first === "object" && "text" in first) {
      return first.text ?? null;
    }
    return first;
  }

  if (
    typeof result.content === "object" &&
    result.content !== null &&
    "text" in result.content
  ) {
    return result.content.text ?? null;
  }

  return null;
}

export function extractMcpTextPayload(result: McpToolResponse): string {
  if (typeof result.content === "string") {
    return result.content;
  }

  if (Array.isArray(result.content)) {
    const first = result.content[0];
    if (typeof first === "string") {
      return first;
    }
    if (first && typeof first === "object" && "text" in first) {
      return String(first.text ?? "");
    }
    return "";
  }

  if (
    typeof result.content === "object" &&
    result.content !== null &&
    "text" in result.content
  ) {
    return String(result.content.text ?? "");
  }

  return "";
}

export function parseMcpTextPayload<T>(text: string, toolName: string): T {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`MCP tool ${toolName} returned empty text response.`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `MCP tool ${toolName} returned non-JSON text response: ${trimmed.slice(0, 180)}`,
    );
  }
}

export function parseMcpResult<T>(
  result: McpToolResponse,
  toolName: string,
): T {
  const payload = extractMcpPayload(result);
  if (payload === null || payload === undefined) {
    throw new Error(`MCP tool ${toolName} returned empty payload.`);
  }
  if (typeof payload === "string") {
    return parseMcpTextPayload<T>(payload, toolName);
  }
  if (
    typeof payload === "object" ||
    typeof payload === "number" ||
    typeof payload === "boolean"
  ) {
    return payload as T;
  }
  throw new Error(
    `Unexpected MCP payload type from ${toolName}: ${typeof payload}`,
  );
}

export function assertMcpToolSuccess(
  toolName: string,
  result: McpToolResponse,
): void {
  if (!result) {
    throw new Error(`MCP tool ${toolName} returned an empty response.`);
  }
  if (result.isError) {
    const text = extractMcpTextPayload(result);
    const message = text || result.error || result.message;
    throw new Error(
      `MCP tool ${toolName} error: ${message || MCP_TOOL_GENERIC_ERROR_MESSAGE}`,
    );
  }
}

export class BnbIdentityService {
  private runtime: IAgentRuntime;
  private config: BnbIdentityConfig;

  constructor(runtime: IAgentRuntime, config: BnbIdentityConfig) {
    this.runtime = runtime;
    this.config = config;
  }

  // ── Write tools (require PRIVATE_KEY) ──────────────────────────────────────

  /**
   * Calls register_erc8004_agent on the BNB Chain MCP server.
   * Returns the new agentId and txHash.
   *
   * Safety: confirms before writing. The caller (action handler) is
   * responsible for obtaining user consent first — this method just calls.
   */
  async registerAgent(agentURI: string): Promise<RegisterResult> {
    this.assertPrivateKey();
    return this.callMcpTool<RegisterResult>("register_erc8004_agent", {
      privateKey: this.config.privateKey,
      agentURI,
      network: this.config.network,
    });
  }

  /**
   * Calls set_erc8004_agent_uri to update the metadata URI on-chain.
   * Caller must own the agent NFT (same private key used at registration).
   */
  async updateAgentUri(agentId: string, newURI: string): Promise<SetUriResult> {
    this.assertPrivateKey();
    return this.callMcpTool<SetUriResult>("set_erc8004_agent_uri", {
      privateKey: this.config.privateKey,
      agentId,
      newURI,
      network: this.config.network,
    });
  }

  /**
   * Best-effort address resolution from configured private key. Not all MCP
   * versions expose this tool name; callers should treat null as non-fatal.
   */
  async getOwnerAddressFromPrivateKey(): Promise<string | null> {
    this.assertPrivateKey();
    try {
      const result = await this.callMcpTool<AddressResult>(
        "get_address_from_private_key",
        {
          privateKey: this.config.privateKey,
          network: this.config.network,
        },
      );
      return this.normalizeAddress(result.address ?? result.result);
    } catch {
      return null;
    }
  }

  // ── Read-only tools ────────────────────────────────────────────────────────

  /** Resolves an agentId to its owner address and current tokenURI. */
  async getAgent(agentId: string): Promise<GetAgentResult> {
    return this.callMcpTool<GetAgentResult>("get_erc8004_agent", {
      agentId,
      network: this.config.network,
    });
  }

  /** Gets the verified payment wallet for an agent (x402 / agent payments). */
  async getAgentWallet(agentId: string): Promise<GetAgentWalletResult> {
    return this.callMcpTool<GetAgentWalletResult>("get_erc8004_agent_wallet", {
      agentId,
      network: this.config.network,
    });
  }

  // ── BAP-578 NFA write tools ─────────────────────────────────────────────

  /** Mint a new NFA NFT for this agent. */
  async mintNfa(
    agentURI: string,
    options: NfaMintOptions = {},
  ): Promise<NfaMintResult> {
    this.assertPrivateKey();
    return this.callMcpTool<NfaMintResult>("mint_bap578_nfa", {
      privateKey: this.config.privateKey,
      agentURI,
      network: this.config.network,
      ...this.getNfaToolConfig(),
      ...options,
    });
  }

  /** Update the on-chain learning Merkle root. */
  async updateLearningRoot(
    tokenId: string,
    newRoot: string,
  ): Promise<NfaUpdateLearningResult> {
    this.assertPrivateKey();
    return this.callMcpTool<NfaUpdateLearningResult>("update_bap578_learning", {
      privateKey: this.config.privateKey,
      tokenId,
      newRoot,
      network: this.config.network,
      ...this.getNfaToolConfig(),
    });
  }

  /** Transfer NFA ownership to a new address. */
  async transferNfa(tokenId: string, to: string): Promise<NfaTransferResult> {
    this.assertPrivateKey();
    return this.callMcpTool<NfaTransferResult>("transfer_bap578_nfa", {
      privateKey: this.config.privateKey,
      tokenId,
      to,
      network: this.config.network,
      ...this.getNfaToolConfig(),
    });
  }

  /** Upgrade the NFA logic contract. */
  async upgradeLogic(
    tokenId: string,
    newLogic: string,
  ): Promise<NfaUpgradeResult> {
    this.assertPrivateKey();
    return this.callMcpTool<NfaUpgradeResult>("upgrade_bap578_logic", {
      privateKey: this.config.privateKey,
      tokenId,
      newLogic,
      network: this.config.network,
      ...this.getNfaToolConfig(),
    });
  }

  /** Pause the NFA (emergency circuit breaker). */
  async pauseNfa(tokenId: string): Promise<NfaPauseResult> {
    this.assertPrivateKey();
    return this.callMcpTool<NfaPauseResult>("pause_bap578_nfa", {
      privateKey: this.config.privateKey,
      tokenId,
      network: this.config.network,
      ...this.getNfaToolConfig(),
    });
  }

  /** Unpause the NFA. */
  async unpauseNfa(tokenId: string): Promise<NfaPauseResult> {
    this.assertPrivateKey();
    return this.callMcpTool<NfaPauseResult>("unpause_bap578_nfa", {
      privateKey: this.config.privateKey,
      tokenId,
      network: this.config.network,
      ...this.getNfaToolConfig(),
    });
  }

  // ── BAP-578 NFA read-only tools ─────────────────────────────────────────

  /** Query on-chain NFA info. */
  async getNfaInfo(tokenId: string): Promise<NfaInfo> {
    return this.callMcpTool<NfaInfo>("get_bap578_nfa", {
      tokenId,
      network: this.config.network,
      ...this.getNfaToolConfig(),
    });
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private assertPrivateKey(): void {
    if (!this.config.privateKey) {
      throw new Error(
        "BNB_PRIVATE_KEY is required for write operations. " +
          "Add it to ~/.milady/.env or milady.json plugin parameters.",
      );
    }
  }

  /**
   * Routes a tool call through the ElizaOS runtime's MCP client.
   * The runtime discovers bnbchain-mcp via the user's MCP config
   * (claude_desktop_config.json or ~/.cursor/mcp.json).
   *
   * Falls back to direct HTTP if runtime has no MCP client registered,
   * which covers test environments and headless setups.
   */
  private async callMcpTool<T>(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    // Try runtime MCP client first
    const mcpClient = (
      this.runtime as unknown as {
        mcpClient?: {
          callTool: (request: {
            name: string;
            arguments: Record<string, unknown>;
          }) => Promise<unknown>;
        };
      }
    ).mcpClient;
    if (mcpClient?.callTool) {
      const result = (await mcpClient.callTool({
        name: toolName,
        arguments: params,
      })) as McpToolResponse;
      assertMcpToolSuccess(toolName, result);
      return parseMcpResult<T>(result, toolName);
    }

    // Fallback: direct SSE HTTP call to local bnbchain-mcp dev server.
    // SECURITY: The HTTP fallback transmits the private key in the request
    // body, so we restrict to localhost to prevent accidental exfiltration.
    const baseUrl = process.env.BNB_MCP_URL ?? "http://localhost:3001";
    const parsedUrl = new URL(baseUrl);
    if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
      throw new Error(
        `BNB_MCP_URL must be localhost when transmitting private keys. Got: ${parsedUrl.hostname}`,
      );
    }
    const res = await fetch(`${baseUrl}/tools/${toolName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`bnbchain-mcp HTTP ${res.status}: ${body}`);
    }

    const bodyText = await res.text();
    let raw: unknown;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      raw = {
        content: bodyText,
      } as McpToolResponse;
    }

    const httpResult = raw as McpToolResponse;
    assertMcpToolSuccess(toolName, httpResult);
    return parseMcpResult<T>(httpResult, toolName);
  }

  private normalizeAddress(value: string | undefined | null): string | null {
    if (!value || typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    return /^0x[0-9a-fA-F]{40}$/.test(normalized) ? normalized : null;
  }

  private getNfaToolConfig(): Record<string, string> {
    const config: Record<string, string> = {};
    if (this.config.nfaContractAddress) {
      config.contractAddress = this.config.nfaContractAddress;
    }
    if (this.config.rpcUrl) {
      config.rpcUrl = resolveBnbRpcUrl(this.config);
    }
    return config;
  }
}
