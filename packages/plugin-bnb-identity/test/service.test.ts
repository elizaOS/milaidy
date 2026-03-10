import { describe, expect, it, mock } from "bun:test";
import {
  assertMcpToolSuccess,
  BnbIdentityService,
  DEFAULT_BNB_MAINNET_RPC_URL,
  DEFAULT_BNB_TESTNET_RPC_URL,
  extractMcpPayload,
  extractMcpTextPayload,
  type McpToolResponse,
  parseMcpResult,
  resolveBnbRpcUrl,
} from "../src/service.js";

const toolName = "some_mcp_tool";

describe("extractMcpPayload", () => {
  it("uses result when present", () => {
    const payload = { agentId: "42" };
    const result: McpToolResponse = { result: payload };
    expect(extractMcpPayload(result)).toEqual(payload);
  });

  it("parses content text as raw payload", () => {
    const result: McpToolResponse = { content: '{"agentId":"42"}' };
    expect(extractMcpPayload(result)).toEqual('{"agentId":"42"}');
  });

  it("parses content array as first text entry", () => {
    const result: McpToolResponse = {
      content: [{ text: '{"agentId":"42"}' }],
    };
    expect(extractMcpPayload(result)).toEqual('{"agentId":"42"}');
  });

  it("uses content.text when content is object", () => {
    const result: McpToolResponse = { content: { text: '{"agentId":"42"}' } };
    expect(extractMcpPayload(result)).toEqual('{"agentId":"42"}');
  });
});

describe("extractMcpTextPayload", () => {
  it("returns content string directly", () => {
    const result: McpToolResponse = { content: '{"ok":true}' };
    expect(extractMcpTextPayload(result)).toBe('{"ok":true}');
  });

  it("extracts first text entry from content array", () => {
    const result: McpToolResponse = {
      content: [{ text: "hello" }, { text: "ignored" }],
    };
    expect(extractMcpTextPayload(result)).toBe("hello");
  });

  it("extracts content.text from object shape", () => {
    const result: McpToolResponse = { content: { text: "hello" } };
    expect(extractMcpTextPayload(result)).toBe("hello");
  });
});

describe("parseMcpResult", () => {
  it("parses result object payload", () => {
    const input: McpToolResponse = {
      result: { value: 1, network: "bsc-testnet" },
    };
    const value = parseMcpResult<{ value: number; network: string }>(
      input,
      toolName,
    );
    expect(value).toEqual({ value: 1, network: "bsc-testnet" });
  });

  it("parses JSON from content text", () => {
    const input: McpToolResponse = {
      content: '{"value":2,"agentId":"42"}',
    };
    const value = parseMcpResult<{ value: number; agentId: string }>(
      input,
      toolName,
    );
    expect(value).toEqual({ value: 2, agentId: "42" });
  });

  it("parses JSON from content array text entries", () => {
    const input: McpToolResponse = {
      content: [{ text: '{"agentId":"42","network":"bsc"}' }],
    };
    const value = parseMcpResult<{ agentId: string; network: string }>(
      input,
      toolName,
    );
    expect(value).toEqual({ agentId: "42", network: "bsc" });
  });

  it("parses JSON from content.text object shape", () => {
    const input: McpToolResponse = {
      content: { text: '{"done":true}' },
    };
    const value = parseMcpResult<{ done: boolean }>(input, toolName);
    expect(value).toEqual({ done: true });
  });

  it("throws on non-JSON content text", () => {
    const input: McpToolResponse = { content: "not-json" };
    expect(() => parseMcpResult<unknown>(input, toolName)).toThrow(
      "returned non-JSON text response: not-json",
    );
  });
});

describe("assertMcpToolSuccess", () => {
  it("prefers content text for error message", () => {
    const input: McpToolResponse = {
      isError: true,
      content: { text: "failure from tool" },
      error: "ignored",
      message: "also ignored",
    };
    expect(() => assertMcpToolSuccess(toolName, input)).toThrow(
      "MCP tool some_mcp_tool error: failure from tool",
    );
  });

  it("falls back to explicit error field", () => {
    const input: McpToolResponse = {
      isError: true,
      error: "explicit error",
    };
    expect(() => assertMcpToolSuccess(toolName, input)).toThrow(
      "MCP tool some_mcp_tool error: explicit error",
    );
  });

  it("falls back to message when content and error are missing", () => {
    const input: McpToolResponse = {
      isError: true,
      message: "message error",
    };
    expect(() => assertMcpToolSuccess(toolName, input)).toThrow(
      "MCP tool some_mcp_tool error: message error",
    );
  });

  it("falls back to generic message when no detail exists", () => {
    const input: McpToolResponse = {
      isError: true,
    };
    expect(() => assertMcpToolSuccess(toolName, input)).toThrow(
      "MCP tool some_mcp_tool error: Unknown MCP tool failure.",
    );
  });
});

describe("resolveBnbRpcUrl", () => {
  it("prefers explicit rpcUrl when provided", () => {
    expect(
      resolveBnbRpcUrl({
        network: "bsc",
        rpcUrl: "https://custom-rpc.example",
      }),
    ).toBe("https://custom-rpc.example");
  });

  it("defaults bsc mainnet to Public Node", () => {
    expect(resolveBnbRpcUrl({ network: "bsc" })).toBe(
      DEFAULT_BNB_MAINNET_RPC_URL,
    );
  });

  it("keeps the existing testnet fallback when no rpcUrl is configured", () => {
    expect(resolveBnbRpcUrl({ network: "bsc-testnet" })).toBe(
      DEFAULT_BNB_TESTNET_RPC_URL,
    );
  });

  it("propagates the fallback RPC into NFA MCP calls when no custom RPC is configured", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async (_input: unknown, _init?: RequestInit) => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          result: {
            tokenId: "42",
            owner: "0x123",
            balance: "1",
            active: true,
            logicContract: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            metadata: null,
            metadataURI: "",
            freeMint: false,
          },
        }),
    }));
    globalThis.fetch = fetchMock as typeof fetch;
    process.env.BNB_MCP_URL = "http://localhost:3001";

    try {
      const service = new BnbIdentityService(null, {
        network: "bsc",
        gatewayPort: 0,
      });

      await service.getNfaInfo("42");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(String(init.body));
      expect(body.rpcUrl).toBe(DEFAULT_BNB_MAINNET_RPC_URL);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.BNB_MCP_URL;
    }
  });
});

import type {
  NfaMintResult,
  NfaPauseResult,
  NfaUpdateLearningResult,
} from "../src/types.js";

describe("parseMcpResult with NFA types", () => {
  it("parses NfaMintResult from content text", () => {
    const input: McpToolResponse = {
      content:
        '{"tokenId":"1","txHash":"0xabc","owner":"0x123","network":"bsc-testnet"}',
    };
    const value = parseMcpResult<NfaMintResult>(input, "mint_bap578_nfa");
    expect(value.tokenId).toBe("1");
    expect(value.owner).toBe("0x123");
  });

  it("parses NfaUpdateLearningResult", () => {
    const input: McpToolResponse = {
      content: `{"txHash":"0xabc","previousRoot":"0x${"0".repeat(64)}","newRoot":"0x${"a".repeat(64)}","network":"bsc-testnet"}`,
    };
    const value = parseMcpResult<NfaUpdateLearningResult>(
      input,
      "update_bap578_learning",
    );
    expect(value.newRoot).toBe(`0x${"a".repeat(64)}`);
  });

  it("parses NfaPauseResult", () => {
    const input: McpToolResponse = {
      content: '{"txHash":"0xabc","paused":true,"network":"bsc-testnet"}',
    };
    const value = parseMcpResult<NfaPauseResult>(input, "pause_bap578_nfa");
    expect(value.paused).toBe(true);
  });
});
