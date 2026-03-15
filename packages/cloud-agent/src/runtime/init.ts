/**
 * ElizaOS Runtime Initialization
 *
 * Bootstraps the ElizaOS AgentRuntime with dynamic imports so the package
 * works even when @elizaos/core is not installed (echo-mode fallback).
 *
 * All @elizaos/* imports are dynamic to enable graceful degradation:
 *   - @elizaos/core → required for real agent
 *   - @elizaos/plugin-elizacloud → optional (cloud inference)
 *   - @elizaos/plugin-sql → optional (database persistence)
 */

import * as crypto from "node:crypto";
import type { ChatMode, CloudAgentRuntime } from "../types.js";
import type { SnapshotManager } from "../snapshot/manager.js";

// ─── Runtime Initialization ─────────────────────────────────────────────

/**
 * Initialize the agent runtime.
 *
 * If @elizaos/core is available, creates a real AgentRuntime with character,
 * plugins, and message handling. If not, returns an echo-mode fallback that
 * echoes back input with "[echo]" prefix.
 *
 * @param snapshot - The snapshot manager for recording memories
 * @returns The initialized CloudAgentRuntime
 */
export async function initRuntime(
  snapshot: SnapshotManager,
): Promise<CloudAgentRuntime> {
  const elizaAvailable = await import("@elizaos/core")
    .then(() => true)
    .catch(() => false);

  if (elizaAvailable) {
    return initElizaRuntime(snapshot);
  }

  return initEchoRuntime(snapshot);
}

// ─── Real ElizaOS Runtime ───────────────────────────────────────────────

async function initElizaRuntime(
  snapshot: SnapshotManager,
): Promise<CloudAgentRuntime> {
  const {
    AgentRuntime,
    createCharacter,
    createMessageMemory,
    stringToUuid,
    ChannelType,
  } = (await import("@elizaos/core")) as any;

  // Build character from environment variables
  const character = createCharacter({
    name: process.env.AGENT_NAME ?? "CloudAgent",
    bio: "An ElizaOS agent running in the cloud.",
    settings: {
      ...(process.env.DATABASE_URL
        ? {
            POSTGRES_URL: process.env.DATABASE_URL,
            DATABASE_URL: process.env.DATABASE_URL,
          }
        : {}),
    },
    secrets: buildSecretsFromEnv(),
  });

  // Load optional plugins
  const plugins = [];

  const cloudPlugin = await import("@elizaos/plugin-elizacloud")
    .then((m: any) => m.default ?? m.elizaOSCloudPlugin)
    .catch(() => null);
  if (cloudPlugin) plugins.push(cloudPlugin);

  const sqlPlugin = await import("@elizaos/plugin-sql")
    .then((m: any) => m.default ?? m.sqlPlugin)
    .catch(() => null);
  if (sqlPlugin) plugins.push(sqlPlugin);

  // Create and initialize runtime
  const runtime = new AgentRuntime({ character, plugins });
  await runtime.initialize();

  // Set up bridge room
  const userId = crypto.randomUUID() as ReturnType<typeof stringToUuid>;
  const roomId = stringToUuid("cloud-agent-bridge-room");
  const worldId = stringToUuid("cloud-agent-world");

  await runtime.ensureConnection({
    entityId: userId,
    roomId,
    worldId,
    userName: "BridgeUser",
    source: "cloud-bridge",
    channelId: "cloud-bridge",
    type: ChannelType.DM,
  });

  console.log("[cloud-agent] ElizaOS runtime initialized with real agent");

  return {
    processMessage: async (
      text: string,
      _roomId: string,
      mode: ChatMode,
    ): Promise<string> => {
      const message = createMessageMemory({
        id: crypto.randomUUID() as ReturnType<typeof stringToUuid>,
        entityId: userId,
        roomId,
        content: {
          text,
          mode,
          simple: mode === "simple",
          source: "cloud-bridge",
          channelType: ChannelType.DM,
        },
      });

      let responseText = "";
      await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: any) => {
          if (content?.text) responseText += content.text;
          return [];
        },
      );

      snapshot.addExchange(text, responseText || "(no response)");
      return responseText || "(no response)";
    },

    processMessageStream: async (
      text: string,
      _roomId: string,
      mode: ChatMode,
      onChunk: (chunk: string) => void,
    ): Promise<string> => {
      const message = createMessageMemory({
        id: crypto.randomUUID() as ReturnType<typeof stringToUuid>,
        entityId: userId,
        roomId,
        content: {
          text,
          mode,
          simple: mode === "simple",
          source: "cloud-bridge",
          channelType: ChannelType.DM,
        },
      });

      let responseText = "";
      await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: any) => {
          if (content?.text) {
            responseText += content.text;
            onChunk(content.text);
          }
          return [];
        },
      );

      snapshot.addExchange(text, responseText || "(no response)");
      return responseText || "(no response)";
    },

    getMemories: () => snapshot.memories,
    getConfig: () => snapshot.config,
  };
}

// ─── Echo Mode Fallback ─────────────────────────────────────────────────

function initEchoRuntime(snapshot: SnapshotManager): CloudAgentRuntime {
  console.warn(
    "[cloud-agent] @elizaos/core not available, running in echo mode",
  );

  return {
    processMessage: async (
      text: string,
      _roomId: string,
      _mode: ChatMode,
    ): Promise<string> => {
      const reply = `[echo] ${text}`;
      snapshot.addExchange(text, reply);
      return reply;
    },

    processMessageStream: async (
      text: string,
      _roomId: string,
      _mode: ChatMode,
      onChunk: (chunk: string) => void,
    ): Promise<string> => {
      const reply = `[echo] ${text}`;
      onChunk(reply);
      snapshot.addExchange(text, reply);
      return reply;
    },

    getMemories: () => snapshot.memories,
    getConfig: () => snapshot.config,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Build the secrets object from environment variables.
 * Only includes keys that are actually set.
 */
function buildSecretsFromEnv(): Record<string, string> {
  const secrets: Record<string, string> = {};

  const envKeys = [
    "ELIZAOS_CLOUD_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "XAI_API_KEY",
    "GROQ_API_KEY",
  ];

  for (const key of envKeys) {
    const value = process.env[key];
    if (value) {
      secrets[key] = value;
    }
  }

  return secrets;
}
