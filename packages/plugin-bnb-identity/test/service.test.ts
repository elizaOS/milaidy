import { describe, expect, it } from "bun:test";
import {
  assertMcpToolSuccess,
  extractMcpPayload,
  extractMcpTextPayload,
  parseMcpResult,
  type McpToolResponse,
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
    const input: McpToolResponse = { result: { value: 1, network: "bsc-testnet" } };
    const value = parseMcpResult<{ value: number; network: string }>(input, toolName);
    expect(value).toEqual({ value: 1, network: "bsc-testnet" });
  });

  it("parses JSON from content text", () => {
    const input: McpToolResponse = {
      content: '{"value":2,"agentId":"42"}',
    };
    const value = parseMcpResult<{ value: number; agentId: string }>(input, toolName);
    expect(value).toEqual({ value: 2, agentId: "42" });
  });

  it("parses JSON from content array text entries", () => {
    const input: McpToolResponse = {
      content: [{ text: '{"agentId":"42","network":"bsc"}' }],
    };
    const value = parseMcpResult<{ agentId: string; network: string }>(input, toolName);
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
      "returned non-JSON text response: not-json"
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
      "MCP tool some_mcp_tool error: failure from tool"
    );
  });

  it("falls back to explicit error field", () => {
    const input: McpToolResponse = {
      isError: true,
      error: "explicit error",
    };
    expect(() => assertMcpToolSuccess(toolName, input)).toThrow(
      "MCP tool some_mcp_tool error: explicit error"
    );
  });

  it("falls back to message when content and error are missing", () => {
    const input: McpToolResponse = {
      isError: true,
      message: "message error",
    };
    expect(() => assertMcpToolSuccess(toolName, input)).toThrow(
      "MCP tool some_mcp_tool error: message error"
    );
  });

  it("falls back to generic message when no detail exists", () => {
    const input: McpToolResponse = {
      isError: true,
    };
    expect(() => assertMcpToolSuccess(toolName, input)).toThrow(
      "MCP tool some_mcp_tool error: Unknown MCP tool failure."
    );
  });
});
