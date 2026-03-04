/**
 * Builds the Agent Metadata Profile JSON that ERC-8004 agentURI points to.
 *
 * The spec requires: name, description, image, services[].
 * We extend it with capabilities and platforms so OpenClaw and other
 * discovery agents can understand what Milady can actually do.
 */

import { logger } from "@elizaos/core";
import type {
  AgentMetadata,
  AgentService,
  BnbIdentityConfig,
} from "./types.js";

const MILADY_VERSION = "0.1.0";
const MILADY_IMAGE =
  "https://raw.githubusercontent.com/milady-ai/milady/main/assets/milady-avatar.png";

/**
 * Builds a full AgentMetadata object that describes this Milady instance.
 * The services array advertises her Gateway MCP endpoint so other agents
 * can connect to her programmatically.
 */
export function buildAgentMetadata(
  config: BnbIdentityConfig,
  agentName: string,
  installedPlugins: string[] = [],
  existingCreated?: string,
): AgentMetadata {
  if (!config.agentUriBase) {
    logger.warn(
      "BNB Identity: No BNB_AGENT_URI_BASE configured — on-chain metadata will contain localhost URLs, unusable for external agent discovery",
    );
  }

  const gatewayUrl = `ws://localhost:${config.gatewayPort}/ws`;
  const mcpUrl = `http://localhost:${config.gatewayPort}/mcp`;

  const services: AgentService[] = [
    {
      type: "mcp",
      name: "Milady Gateway MCP",
      url: mcpUrl,
      protocol: "model-context-protocol/1.0",
    },
    {
      type: "websocket",
      name: "Milady Gateway WebSocket",
      url: gatewayUrl,
    },
  ];

  // If the agent URI base is a public URL, also advertise the dashboard.
  if (config.agentUriBase) {
    services.push({
      type: "http",
      name: "Milady Dashboard",
      url: `${config.agentUriBase.replace(/\/$/, "")}`,
    });
  }

  const capabilities = buildCapabilities(installedPlugins);

  return {
    name: agentName,
    description: `${agentName} is a privacy-first local AI agent built on ElizaOS and Milady. Runs on the owner's machine. Connects to Telegram, Discord, and WebChat. Powered by Claude/GPT/Ollama. On-chain identity registered via ERC-8004 on BNB Chain.`,
    image: MILADY_IMAGE,
    version: MILADY_VERSION,
    created: existingCreated ?? new Date().toISOString(),
    services,
    capabilities,
    platforms: detectPlatforms(installedPlugins),
  };
}

/**
 * Converts metadata to an inline data: URI so registration works
 * even without a public hosting URL.
 */
export function metadataToDataUri(metadata: AgentMetadata): string {
  const json = JSON.stringify(metadata);
  const encoded = Buffer.from(json).toString("base64");
  return `data:application/json;base64,${encoded}`;
}

/**
 * Converts a base URL to a hosted agentURI — caller is responsible for
 * uploading the metadata JSON to agentUriBase first.
 */
export function metadataToHostedUri(base: string): string {
  return `${base.replace(/\/$/, "")}/agent-metadata.json`;
}

/** Derives a human-readable capabilities list from installed plugins. */
function buildCapabilities(plugins: string[]): string[] {
  const base = [
    "natural-language-conversation",
    "multi-session",
    "context-compression",
    "model-switching",
    "local-execution",
    "privacy-preserving",
  ];

  const pluginCapabilities: Record<string, string[]> = {
    "plugin-bnb-identity": ["erc8004-identity", "bnb-chain", "on-chain-agent"],
    "plugin-twitch-streaming": ["live-streaming", "twitch", "rtmp"],
    "plugin-youtube": ["live-streaming", "youtube", "rtmp"],
    "plugin-retake": ["video-production", "retake-studio"],
  };

  const extras = plugins.flatMap((p) => {
    // Normalise e.g. "@milady/plugin-twitch-streaming" → "plugin-twitch-streaming"
    const short = p.replace(/^@[^/]+\//, "");
    return pluginCapabilities[short] ?? [];
  });

  return [...new Set([...base, ...extras])];
}

function detectPlatforms(plugins: string[]): string[] {
  const platforms = ["webchat"];
  // elizaOS core connectors surface as plugins too
  if (plugins.some((p) => p.includes("telegram"))) platforms.push("telegram");
  if (plugins.some((p) => p.includes("discord"))) platforms.push("discord");
  if (plugins.some((p) => p.includes("twitch"))) platforms.push("twitch");
  if (plugins.some((p) => p.includes("youtube"))) platforms.push("youtube");
  return platforms;
}
