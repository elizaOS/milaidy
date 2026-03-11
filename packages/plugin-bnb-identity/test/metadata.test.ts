import { describe, expect, it } from "bun:test";
import {
  buildAgentMetadata,
  metadataToDataUri,
  metadataToHostedUri,
} from "../src/metadata.js";
import type { BnbIdentityConfig } from "../src/types.js";

const baseConfig: BnbIdentityConfig = {
  network: "bsc-testnet",
  gatewayPort: 18789,
};

describe("buildAgentMetadata", () => {
  it("includes required Agent Metadata Profile fields", () => {
    const meta = buildAgentMetadata(baseConfig, "mila", []);
    expect(meta.name).toBe("mila");
    expect(meta.description).toBeTruthy();
    expect(Array.isArray(meta.services)).toBe(true);
    expect(meta.services.length).toBeGreaterThan(0);
    expect(meta.version).toBeTruthy();
    expect(meta.created).toBeTruthy();
  });

  it("advertises MCP service with correct gateway port", () => {
    const meta = buildAgentMetadata(baseConfig, "mila", []);
    const mcp = meta.services.find((s) => s.type === "mcp");
    expect(mcp).toBeDefined();
    expect(mcp?.url).toContain("18789");
  });

  it("advertises WebSocket gateway", () => {
    const meta = buildAgentMetadata(baseConfig, "mila", []);
    const ws = meta.services.find((s) => s.type === "websocket");
    expect(ws).toBeDefined();
    expect(ws?.url).toContain("ws://");
  });

  it("includes dashboard service when agentUriBase is set", () => {
    const config: BnbIdentityConfig = {
      ...baseConfig,
      agentUriBase: "https://milady-ai.github.io/milady",
    };
    const meta = buildAgentMetadata(config, "mila", []);
    const dashboard = meta.services.find((s) => s.type === "http");
    expect(dashboard).toBeDefined();
    expect(dashboard?.url).toContain("milady-ai.github.io");
  });

  it("adds bnb-chain capability when bnb-identity plugin is listed", () => {
    const meta = buildAgentMetadata(baseConfig, "mila", [
      "@milady/plugin-bnb-identity",
    ]);
    expect(meta.capabilities).toContain("bnb-chain");
    expect(meta.capabilities).toContain("erc8004-identity");
    expect(meta.capabilities).toContain("on-chain-agent");
  });

  it("adds twitch platform and streaming capability from plugin list", () => {
    const meta = buildAgentMetadata(baseConfig, "mila", [
      "@milady/plugin-twitch-streaming",
    ]);
    expect(meta.platforms).toContain("twitch");
    expect(meta.capabilities).toContain("live-streaming");
  });

  it("always includes base capabilities", () => {
    const meta = buildAgentMetadata(baseConfig, "mila", []);
    expect(meta.capabilities).toContain("local-execution");
    expect(meta.capabilities).toContain("privacy-preserving");
    expect(meta.capabilities).toContain("multi-session");
  });

  it("deduplicates capabilities", () => {
    const meta = buildAgentMetadata(baseConfig, "mila", [
      "@milady/plugin-bnb-identity",
      "@milady/plugin-bnb-identity", // duplicate
    ]);
    const count = meta.capabilities.filter((c) => c === "bnb-chain").length;
    expect(count).toBe(1);
  });
});

describe("metadataToDataUri", () => {
  it("produces a valid base64 data URI", () => {
    const meta = buildAgentMetadata(baseConfig, "mila", []);
    const uri = metadataToDataUri(meta);
    expect(uri.startsWith("data:application/json;base64,")).toBe(true);
  });

  it("round-trips cleanly through JSON", () => {
    const meta = buildAgentMetadata(baseConfig, "mila", []);
    const uri = metadataToDataUri(meta);
    const b64 = uri.replace("data:application/json;base64,", "");
    const decoded = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    expect(decoded.name).toBe("mila");
    expect(Array.isArray(decoded.services)).toBe(true);
  });
});

describe("metadataToHostedUri", () => {
  it("appends /agent-metadata.json to the base URL", () => {
    const uri = metadataToHostedUri("https://milady-ai.github.io/milady");
    expect(uri).toBe("https://milady-ai.github.io/milady/agent-metadata.json");
  });

  it("strips trailing slash before appending", () => {
    const uri = metadataToHostedUri("https://milady-ai.github.io/milady/");
    expect(uri).toBe("https://milady-ai.github.io/milady/agent-metadata.json");
  });
});
