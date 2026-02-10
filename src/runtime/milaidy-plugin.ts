/**
 * Milaidy plugin for ElizaOS — workspace context, session keys, and agent
 * lifecycle actions (restart).
 *
 * Compaction is now a built-in runtime action (COMPACT_SESSION in basic-capabilities).
 * Memory search/get actions are superseded by plugin-scratchpad.
 */

import type {
  IAgentRuntime,
  Memory,
  MessagePayload,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import {
  attachmentsProvider,
  entitiesProvider,
  factsProvider,
  getSessionProviders,
  resolveDefaultSessionStorePath,
} from "@elizaos/core";
import { emoteAction } from "../actions/emote.js";
import { restartAction } from "../actions/restart.js";
import { EMOTE_CATALOG } from "../emotes/catalog.js";
import {
  createSessionKeyProvider,
  resolveSessionKeyFromRoom,
} from "../providers/session-bridge.js";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../providers/workspace.js";
import { createWorkspaceProvider } from "../providers/workspace-provider.js";

export type MilaidyPluginConfig = {
  workspaceDir?: string;
  bootstrapMaxChars?: number;
  sessionStorePath?: string;
  agentId?: string;
  /**
   * Enable bootstrap providers (attachments, entities, facts).
   * These add context but can consume significant tokens.
   * @default true
   */
  enableBootstrapProviders?: boolean;
};

export function createMilaidyPlugin(config?: MilaidyPluginConfig): Plugin {
  const workspaceDir = config?.workspaceDir ?? DEFAULT_AGENT_WORKSPACE_DIR;
  const agentId = config?.agentId ?? "main";
  const sessionStorePath =
    config?.sessionStorePath ?? resolveDefaultSessionStorePath(agentId);
  const enableBootstrap = config?.enableBootstrapProviders ?? true;

  const baseProviders = [
    createWorkspaceProvider({
      workspaceDir,
      maxCharsPerFile: config?.bootstrapMaxChars,
    }),
    createSessionKeyProvider({ defaultAgentId: agentId }),
    ...getSessionProviders({ storePath: sessionStorePath }),
  ];

  // Optionally add bootstrap providers (can be heavy for small context windows)
  const bootstrapProviders = enableBootstrap
    ? [attachmentsProvider, entitiesProvider, factsProvider]
    : [];

  // Emote provider — injects available emotes into agent context so the LLM
  // knows it can trigger animations via the PLAY_EMOTE action.
  const emoteProvider: Provider = {
    name: "emotes",
    description: "Available avatar emote animations",

    async get(
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      const ids = EMOTE_CATALOG.map((e) => e.id).join(", ");
      return {
        text: [
          "## Available Emotes",
          "",
          "You can play emote animations on your 3D avatar using the PLAY_EMOTE action.",
          "Use emotes sparingly and naturally during conversation to express yourself.",
          "",
          `Available emote IDs: ${ids}`,
        ].join("\n"),
      };
    },
  };

  return {
    name: "milaidy",
    description:
      "Milaidy workspace context, session keys, and lifecycle actions",

    providers: [...baseProviders, ...bootstrapProviders, emoteProvider],

    actions: [restartAction, emoteAction],

    events: {
      // Inject Milaidy session keys into inbound messages before processing
      MESSAGE_RECEIVED: [
        async (payload: MessagePayload) => {
          const { runtime, message } = payload;
          if (!message || !runtime) return;

          // Ensure metadata is initialized so we can read and write to it.
          if (!message.metadata) {
            message.metadata = {
              type: "message",
            } as unknown as typeof message.metadata;
          }
          const meta = message.metadata as Record<string, unknown>;
          if (meta.sessionKey) return;

          const room = await runtime.getRoom(message.roomId);
          if (!room) return;

          const key = resolveSessionKeyFromRoom(agentId, room, {
            threadId: meta.threadId as string | undefined,
            groupId: meta.groupId as string | undefined,
            channel: (meta.channel as string | undefined) ?? room.source,
          });
          meta.sessionKey = key;
        },
      ],
    },
  };
}
