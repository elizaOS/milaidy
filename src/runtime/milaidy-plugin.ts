/**
 * Milaidy plugin for ElizaOS — workspace context, session keys, and agent
 * lifecycle actions (restart).
 *
 * Compaction is now a built-in runtime action (COMPACT_SESSION in basic-capabilities).
 * Memory search/get actions are superseded by plugin-scratchpad.
 */

import fs from "node:fs";
import path from "node:path";
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
import { createAdminTrustProvider } from "../providers/admin-trust.js";
import {
  createAutonomousStateProvider,
  ensureAutonomousStateTracking,
} from "../providers/autonomous-state.js";
import {
  createSessionKeyProvider,
  resolveSessionKeyFromRoom,
} from "../providers/session-bridge.js";
import { createSimpleModeProvider } from "../providers/simple-mode.js";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../providers/workspace.js";
import { createWorkspaceProvider } from "../providers/workspace-provider.js";
import { generateCatalogPrompt } from "../shared/ui-catalog-prompt.js";
import { createTriggerTaskAction } from "../triggers/action.js";
import { registerTriggerTaskWorker } from "../triggers/runtime.js";

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

/**
 * Read the bundled plugins.json manifest and return a list of
 * { shortId, name, description, category } for every known plugin.
 * Returns an empty array if the manifest isn't found (dev/CI).
 */
function readPluginManifest(): Array<{
  shortId: string;
  name: string;
  description: string;
  category: string;
}> {
  try {
    const thisDir =
      import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
    // Walk up to find the project root (package.json with name "milaidy")
    let dir = thisDir;
    for (let i = 0; i < 10; i++) {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
            string,
            unknown
          >;
          if (pkg.name === "milaidy") break;
        } catch {
          /* keep searching */
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) return [];
      dir = parent;
    }
    const manifestPath = path.join(dir, "plugins.json");
    if (!fs.existsSync(manifestPath)) return [];
    const index = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      plugins: Array<{
        id: string;
        name: string;
        description: string;
        category?: string;
      }>;
    };
    return index.plugins.map((p) => ({
      shortId: p.id.replace(/^@elizaos\/plugin-/, "").replace(/^plugin-/, ""),
      name: p.name,
      description: p.description || "",
      category: p.category || "",
    }));
  } catch {
    return [];
  }
}

export function createMilaidyPlugin(config?: MilaidyPluginConfig): Plugin {
  const workspaceDir = config?.workspaceDir ?? DEFAULT_AGENT_WORKSPACE_DIR;
  const agentId = config?.agentId ?? "main";
  const sessionStorePath =
    config?.sessionStorePath ?? resolveDefaultSessionStorePath(agentId);
  const enableBootstrap = config?.enableBootstrapProviders ?? true;

  const baseProviders = [
    createSimpleModeProvider(),
    createWorkspaceProvider({
      workspaceDir,
      maxCharsPerFile: config?.bootstrapMaxChars,
    }),
    createAdminTrustProvider(),
    createAutonomousStateProvider(),
    createSessionKeyProvider({ defaultAgentId: agentId }),
    ...getSessionProviders({ storePath: sessionStorePath }),
  ];

  // Optionally add bootstrap providers (can be heavy for small context windows)
  const bootstrapProviders = enableBootstrap
    ? [attachmentsProvider, entitiesProvider, factsProvider]
    : [];

  // UI catalog provider — injects component knowledge so the agent can
  // generate UiSpec JSON and [CONFIG:pluginId] markers in responses.
  let catalogCache: string | null = null;
  const allManifestPlugins = readPluginManifest();
  const uiCatalogProvider: Provider = {
    name: "uiCatalog",
    description: "UI component catalog for rich chat responses",

    async get(
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      if (!catalogCache) {
        catalogCache = generateCatalogPrompt({ includeExamples: true });
      }

      // Build a set of currently-loaded plugin short IDs
      const loadedIds = new Set(
        (runtime.plugins ?? []).map((p) =>
          (p.name ?? "")
            .replace(/^@elizaos\/plugin-/, "")
            .replace(/^plugin-/, ""),
        ),
      );

      // Use the full manifest if available, marking loaded vs available
      let pluginLines: string[];
      if (allManifestPlugins.length > 0) {
        pluginLines = allManifestPlugins.map((p) => {
          const status = loadedIds.has(p.shortId) ? "active" : "available";
          const desc = p.description ? ` — ${p.description}` : "";
          return `- ${p.shortId} [${status}]${desc}`;
        });
      } else {
        // Fallback: only loaded plugins (no manifest found)
        pluginLines = (runtime.plugins ?? []).map((p) => {
          const name = p.name ?? "";
          const short = name
            .replace(/^@elizaos\/plugin-/, "")
            .replace(/^plugin-/, "");
          return `- ${short} [active]`;
        });
      }

      return {
        text: [
          catalogCache,
          "",
          "## UI Response Instructions",
          "",
          "### Plugin configuration forms",
          "When a user asks to configure, set up, enable, or install a plugin, include a `[CONFIG:pluginId]` marker in your response.",
          "The pluginId is the SHORT id from the list below (e.g. `telegram`, `knowledge`, `openai`).",
          "You can use [CONFIG:pluginId] for ANY plugin in the list — both [active] and [available] ones.",
          'Example: "Let me pull up the configuration for the knowledge plugin. [CONFIG:knowledge]"',
          "The marker will be replaced with an interactive config form in the UI.",
          "",
          "### Rich interactive UI",
          "When showing dashboards, analytics, status overviews, or interactive UI, output UiSpec JSON in fenced ```json blocks.",
          "",
          "### Normal replies",
          "For normal conversational replies, respond with plain text only — do not output JSON or markers.",
          "",
          "### All available plugins (use the short id for CONFIG markers):",
          "Plugins marked [active] are currently loaded. Plugins marked [available] can be enabled via CONFIG.",
          ...pluginLines,
        ].join("\n"),
      };
    },
  };

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

    init: async (_pluginConfig, runtime) => {
      registerTriggerTaskWorker(runtime);
      ensureAutonomousStateTracking(runtime);
    },

    providers: [
      ...baseProviders,
      ...bootstrapProviders,
      uiCatalogProvider,
      emoteProvider,
    ],

    actions: [restartAction, createTriggerTaskAction, emoteAction],

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
