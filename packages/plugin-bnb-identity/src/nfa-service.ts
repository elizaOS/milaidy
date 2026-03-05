/**
 * Bap578NfaService — wraps BAP-578 NFA contract interactions.

 *
 * Read-only operations (getNfaInfo) work without a private key.
 * Write operations (mintNfa, updateLearningRoot) require a private key
 * and explicit user confirmation at the action layer.
 */

import type { IAgentRuntime } from "@elizaos/core";
import type {
  Bap578NfaConfig,
  MintNfaResult,
  NfaInfoResult,
} from "./types.js";
import {
  type McpToolResponse,
  assertMcpToolSuccess,
  parseMcpResult,
} from "./service.js";

export class Bap578NfaService {
  private runtime: IAgentRuntime;
  private config: Bap578NfaConfig;

  constructor(runtime: IAgentRuntime, config: Bap578NfaConfig) {
    this.runtime = runtime;
    this.config = config;
  }

  /**
   * Reads NFA info from the contract. Read-only — no key needed.
   */
  async getNfaInfo(tokenId: string): Promise<NfaInfoResult> {
    return this.callMcpTool<NfaInfoResult>("get_bap578_nfa_info", {
      contractAddress: this.config.contractAddress,
      tokenId,
      network: this.config.network,
    });
  }

  /**
   * Mints a new NFA token. Requires private key.
   * Caller (action handler) must obtain user confirmation first.
   */
  async mintNfa(merkleRoot: string): Promise<MintNfaResult> {
    this.assertPrivateKey();
    return this.callMcpTool<MintNfaResult>("mint_bap578_nfa", {
      privateKey: this.config.privateKey,
      contractAddress: this.config.contractAddress,
      merkleRoot,
      network: this.config.network,
    });
  }

  /**
   * Updates the on-chain Merkle root for an existing NFA token.
   * Caller must own the token. Requires private key + user confirmation.
   */
  async updateLearningRoot(
    tokenId: string,
    merkleRoot: string
  ): Promise<{ txHash: string }> {
    this.assertPrivateKey();
    return this.callMcpTool<{ txHash: string }>("update_bap578_learning_root", {
      privateKey: this.config.privateKey,
      contractAddress: this.config.contractAddress,
      tokenId,
      merkleRoot,
      network: this.config.network,
    });
  }

  private assertPrivateKey(): void {
    if (!this.config.privateKey) {
      throw new Error(
        "BNB_PRIVATE_KEY is required for write operations. " +
          "Add it to ~/.milady/.env or milady.json plugin parameters."
      );
    }
  }

  private async callMcpTool<T>(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const mcpClient = (this.runtime as any).mcpClient;
    if (mcpClient?.callTool) {
      const result = (await mcpClient.callTool({
        name: toolName,
        arguments: params,
      })) as McpToolResponse;
      assertMcpToolSuccess(toolName, result);
      return parseMcpResult<T>(result, toolName);
    }

    // Fallback: direct HTTP call to local MCP dev server
    const baseUrl = process.env.BNB_MCP_URL ?? "http://localhost:3001";
    const res = await fetch(`${baseUrl}/tools/${toolName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`bap578-mcp HTTP ${res.status}: ${body}`);
    }

    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      raw = { content: await res.text() } as McpToolResponse;
    }

    const httpResult = raw as McpToolResponse;
    assertMcpToolSuccess(toolName, httpResult);
    return parseMcpResult<T>(httpResult, toolName);
  }
}