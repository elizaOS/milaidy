/**
 * Milady plugin for ElizaOS — workspace context, session keys, and agent
 * lifecycle actions (restart).
 *
 * Compaction is now a built-in runtime action (COMPACT_SESSION in basic-capabilities).
 * Memory search/get actions are superseded by plugin-scratchpad.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  createUniqueUuid,
  entitiesProvider,
  factsProvider,
  getSessionProviders,
  resolveDefaultSessionStorePath,
} from "@elizaos/core";
import { coreStatusAction } from "../actions/core-status";
import { ejectCoreAction } from "../actions/eject-core";
import { ejectPluginAction } from "../actions/eject-plugin";
import { emoteAction } from "../actions/emote";
import { installPluginAction } from "../actions/install-plugin";
import { listEjectedAction } from "../actions/list-ejected";
import { logLevelAction } from "../actions/log-level";
import { mediaActions } from "../actions/media";
import { reinjectCoreAction } from "../actions/reinject-core";
import { reinjectPluginAction } from "../actions/reinject-plugin";
import { restartAction } from "../actions/restart";
import { syncCoreAction } from "../actions/sync-core";
import { syncPluginAction } from "../actions/sync-plugin";
import { terminalAction } from "../actions/terminal";
import { EMOTE_CATALOG } from "../emotes/catalog";
import { createAdminTrustProvider } from "../providers/admin-trust";
import {
  createAutonomousStateProvider,
  ensureAutonomousStateTracking,
} from "../providers/autonomous-state";
import {
  createSessionKeyProvider,
  resolveSessionKeyFromRoom,
} from "../providers/session-bridge";
import { createSimpleModeProvider } from "../providers/simple-mode";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../providers/workspace";
import { createWorkspaceProvider } from "../providers/workspace-provider";
import { loadCustomActions, setCustomActionsRuntime } from "./custom-actions";
import {
  completeTrajectoryStepInDatabase,
  startTrajectoryStepInDatabase,
} from "./trajectory-persistence";

// TrajectoryLoggerService is provided by @elizaos/plugin-trajectory-logger
// We just need a type interface to call startTrajectory/endTrajectory
interface TrajectoryLoggerLike {
  isEnabled?: () => boolean;
  setEnabled?: (enabled: boolean) => void;
  startTrajectory?: (
    stepIdOrAgentId: string,
    options?: Record<string, unknown>,
  ) => Promise<string> | string;
  startStep?: (
    trajectoryId: string,
    envState: {
      timestamp: number;
      agentBalance: number;
      agentPoints: number;
      agentPnL: number;
      openPositions: number;
    },
  ) => string;
  endTrajectory?: (
    stepIdOrTrajectoryId: string,
    status?: string,
  ) => Promise<void> | void;
  logLlmCall?: (params: Record<string, unknown>) => void;
}

function resolveTrajectoryLogger(
  runtime: IAgentRuntime,
): TrajectoryLoggerLike | null {
  const runtimeLike = runtime as unknown as {
    getServicesByType?: (serviceType: string) => unknown;
    getService?: (serviceType: string) => unknown;
  };
  const candidates: TrajectoryLoggerLike[] = [];

  if (typeof runtimeLike.getServicesByType === "function") {
    const byType = runtimeLike.getServicesByType("trajectory_logger");
    if (Array.isArray(byType) && byType.length > 0) {
      for (const service of byType) {
        if (service) candidates.push(service as TrajectoryLoggerLike);
      }
    }
    if (byType && !Array.isArray(byType)) {
      candidates.push(byType as TrajectoryLoggerLike);
    }
  }

  if (typeof runtimeLike.getService === "function") {
    const single = runtimeLike.getService("trajectory_logger");
    if (single) candidates.push(single as TrajectoryLoggerLike);
  }

  let best: TrajectoryLoggerLike | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const candidateWithRuntime = candidate as TrajectoryLoggerLike & {
      runtime?: { adapter?: unknown };
      initialized?: boolean;
    };
    let score = 0;
    if (typeof candidate.startTrajectory === "function") score += 3;
    if (typeof candidate.endTrajectory === "function") score += 3;
    if (typeof candidate.logLlmCall === "function") score += 2;
    if (candidateWithRuntime.initialized === true) score += 3;
    if (candidateWithRuntime.runtime?.adapter) score += 3;
    const enabled =
      typeof candidate.isEnabled === "function" ? candidate.isEnabled() : true;
    if (enabled) score += 1;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function isTrajectoryLoggerEnabled(
  logger: TrajectoryLoggerLike | null,
): boolean {
  if (!logger) return false;
  if (typeof logger.isEnabled === "function") {
    if (logger.isEnabled()) return true;
    if (typeof logger.setEnabled === "function") {
      try {
        logger.setEnabled(true);
        return logger.isEnabled();
      } catch {
        return false;
      }
    }
    return false;
  }
  return true;
}

async function startTrajectoryForMessage(params: {
  logger: TrajectoryLoggerLike;
  runtime: IAgentRuntime;
  stepId: string;
  roomId?: string;
  entityId?: string;
  source: string;
  metadata: Record<string, unknown>;
}): Promise<{ stepId: string; endTargetId: string | null }> {
  const { logger, runtime, stepId, roomId, entityId, source, metadata } =
    params;

  if (typeof logger.startTrajectory !== "function") {
    return { stepId, endTargetId: null };
  }

  if (typeof logger.startStep === "function") {
    const trajectoryId = await logger.startTrajectory(runtime.agentId, {
      source,
      metadata: {
        ...metadata,
        roomId,
        entityId,
      },
    });
    const normalizedTrajectoryId =
      typeof trajectoryId === "string" && trajectoryId.trim().length > 0
        ? trajectoryId
        : null;
    if (!normalizedTrajectoryId) {
      return { stepId, endTargetId: null };
    }
    const runtimeStepId = logger.startStep(normalizedTrajectoryId, {
      timestamp: Date.now(),
      agentBalance: 0,
      agentPoints: 0,
      agentPnL: 0,
      openPositions: 0,
    });
    const normalizedStepId =
      typeof runtimeStepId === "string" && runtimeStepId.trim().length > 0
        ? runtimeStepId
        : stepId;
    return {
      stepId: normalizedStepId,
      endTargetId: normalizedTrajectoryId,
    };
  }

  const startedId = await logger.startTrajectory(stepId, {
    agentId: runtime.agentId,
    roomId,
    entityId,
    source,
    metadata,
  });
  const normalizedStartedId =
    typeof startedId === "string" && startedId.trim().length > 0
      ? startedId
      : stepId;
  return {
    stepId,
    endTargetId: normalizedStartedId,
  };
}

import { generateCatalogPrompt } from "../shared/ui-catalog-prompt";
import { createTriggerTaskAction } from "../triggers/action";
import { registerTriggerTaskWorker } from "../triggers/runtime";

export type MiladyPluginConfig = {
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
      import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
    // Walk up to find the project root (package.json with name "milady")
    let dir = thisDir;
    for (let i = 0; i < 10; i++) {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
            string,
            unknown
          >;
          if (pkg.name === "milady") break;
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

export function createMiladyPlugin(config?: MiladyPluginConfig): Plugin {
  const workspaceDir = config?.workspaceDir ?? DEFAULT_AGENT_WORKSPACE_DIR;
  const agentId = config?.agentId ?? "main";
  const sessionStorePath =
    config?.sessionStorePath ?? resolveDefaultSessionStorePath(agentId);
  const enableBootstrap = config?.enableBootstrapProviders ?? true;
  const pendingTrajectoryStepByReplyId = new Map<string, string>();
  const pendingTrajectoryEndTargetByStepId = new Map<string, string>();

  const trimPendingTrajectories = () => {
    const maxPending = 1000;
    if (pendingTrajectoryStepByReplyId.size <= maxPending) return;
    const overflow = pendingTrajectoryStepByReplyId.size - maxPending;
    const keys = pendingTrajectoryStepByReplyId.keys();
    for (let i = 0; i < overflow; i++) {
      const next = keys.next();
      if (next.done) break;
      const stepId = pendingTrajectoryStepByReplyId.get(next.value);
      pendingTrajectoryStepByReplyId.delete(next.value);
      if (stepId) pendingTrajectoryEndTargetByStepId.delete(stepId);
    }
  };

  const clearPendingTrajectoryStep = (trajectoryStepId: string) => {
    for (const [replyId, stepId] of pendingTrajectoryStepByReplyId.entries()) {
      if (stepId === trajectoryStepId) {
        pendingTrajectoryStepByReplyId.delete(replyId);
      }
    }
    pendingTrajectoryEndTargetByStepId.delete(trajectoryStepId);
  };

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
    ? [attachmentsProvider, entitiesProvider, factsProvider].filter(
        (provider): provider is Provider => Boolean(provider),
      )
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
          "### Installing plugins",
          "Plugins marked [available] are NOT installed yet. When a user wants to use an [available] plugin,",
          "use the INSTALL_PLUGIN action with the plugin's short ID to install it automatically.",
          "After installation the agent restarts and the plugin becomes [active].",
          "You can also include [CONFIG:pluginId] in your response to show the configuration form.",
          "",
          "### All available plugins (use the short id for CONFIG markers and INSTALL_PLUGIN):",
          "Plugins marked [active] are currently loaded. Plugins marked [available] need to be installed first via INSTALL_PLUGIN.",
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

  // Custom actions provider — tells the LLM about available custom actions.
  const customActionsProvider: Provider = {
    name: "customActions",
    description: "User-defined custom actions",

    async get(): Promise<ProviderResult> {
      const customActions = loadCustomActions();
      if (customActions.length === 0) {
        return {
          text: [
            "## Custom Actions",
            "",
            "No custom actions are currently defined.",
            "Users can create custom actions from the Custom Actions panel in the UI.",
          ].join("\n"),
        };
      }

      const lines = customActions.map((a) => {
        const params =
          a.parameters
            ?.map(
              (p) =>
                `${p.name}${(p as { required?: boolean }).required ? " (required)" : ""}`,
            )
            .join(", ") || "none";
        return `- **${a.name}**: ${a.description} [params: ${params}]`;
      });

      return {
        text: [
          "## Custom Actions",
          "",
          "The following custom actions are available:",
          ...lines,
        ].join("\n"),
      };
    },
  };

  // Terminal provider — tells the LLM it can run shell commands.
  const terminalProvider: Provider = {
    name: "terminal",
    description: "Embedded terminal for running shell commands",

    async get(): Promise<ProviderResult> {
      return {
        text: [
          "## Terminal",
          "",
          "You can run shell commands in the user's embedded terminal using the RUN_IN_TERMINAL action.",
          "Use this when the user asks you to run a command, execute a script, install packages, etc.",
          "The terminal auto-opens and shows the command output in real time.",
        ].join("\n"),
      };
    },
  };

  // Media provider — injects media generation capabilities into agent context
  // so the LLM knows it can generate images, videos, audio, and analyze images.
  const mediaProvider: Provider = {
    name: "media",
    description: "Media generation and analysis capabilities",

    async get(
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      return {
        text: [
          "## Media Generation Capabilities",
          "",
          "You have access to the following media generation actions:",
          "",
          "### GENERATE_IMAGE",
          "Create images from text descriptions. Parameters:",
          "- prompt (required): Text description of the image",
          "- size: Image dimensions (e.g., '1024x1024')",
          "- quality: 'standard' or 'hd'",
          "- style: 'natural' or 'vivid'",
          "",
          "### GENERATE_VIDEO",
          "Create videos from text descriptions. Parameters:",
          "- prompt (required): Text description of the video",
          "- duration: Video length in seconds",
          "- aspectRatio: e.g., '16:9', '9:16'",
          "- imageUrl: Starting frame image (for image-to-video)",
          "",
          "### GENERATE_AUDIO",
          "Create music or sound effects. Parameters:",
          "- prompt (required): Description of the audio (lyrics, mood, style)",
          "- duration: Length in seconds",
          "- instrumental: true for no vocals",
          "- genre: e.g., 'pop', 'rock', 'electronic'",
          "",
          "### ANALYZE_IMAGE",
          "Analyze images using AI vision. Parameters:",
          "- imageUrl or imageBase64 (required): The image to analyze",
          "- prompt: Specific question about the image",
          "",
          "Use these actions when users request media creation or image analysis.",
        ].join("\n"),
      };
    },
  };

  return {
    name: "milady",
    description:
      "Milady workspace context, session keys, and lifecycle actions",

    init: async (_pluginConfig, runtime) => {
      registerTriggerTaskWorker(runtime);
      ensureAutonomousStateTracking(runtime);
      setCustomActionsRuntime(runtime);
    },

    providers: [
      ...baseProviders,
      ...bootstrapProviders,
      uiCatalogProvider,
      emoteProvider,
      mediaProvider,
      terminalProvider,
      customActionsProvider,
    ],

    actions: [
      restartAction,
      createTriggerTaskAction,
      emoteAction,
      terminalAction,
      installPluginAction,
      logLevelAction,
      ejectPluginAction,
      syncPluginAction,
      reinjectPluginAction,
      listEjectedAction,
      ejectCoreAction,
      syncCoreAction,
      reinjectCoreAction,
      coreStatusAction,
      ...mediaActions,
      ...loadCustomActions(),
    ],

    // TrajectoryLoggerService is provided by @elizaos/plugin-trajectory-logger (in CORE_PLUGINS)

    events: {
      // Inject Milady session keys and trajectory context into inbound messages
      MESSAGE_RECEIVED: [
        async (payload: MessagePayload) => {
          const { runtime, message, source } = payload;
          if (!message || !runtime) return;

          // Ensure metadata is initialized so we can read and write to it.
          if (!message.metadata) {
            message.metadata = {
              type: "message",
            } as unknown as typeof message.metadata;
          }
          const meta = message.metadata as Record<string, unknown>;

          // Inject session key if not already set
          if (!meta.sessionKey) {
            const room = await runtime.getRoom(message.roomId);
            if (room) {
              const key = resolveSessionKeyFromRoom(agentId, room, {
                threadId: meta.threadId as string | undefined,
                groupId: meta.groupId as string | undefined,
                channel: (meta.channel as string | undefined) ?? room.source,
              });
              meta.sessionKey = key;
            }
          }

          // Create a trajectory for this message if logging is enabled
          // TrajectoryLoggerService is provided by @elizaos/plugin-trajectory-logger
          const trajectoryLogger = resolveTrajectoryLogger(runtime);

          if (trajectoryLogger && isTrajectoryLoggerEnabled(trajectoryLogger)) {
            let trajectoryStepId: string = crypto.randomUUID();
            meta.trajectoryStepId = trajectoryStepId;
            try {
              const startResult = await startTrajectoryForMessage({
                logger: trajectoryLogger,
                runtime,
                stepId: trajectoryStepId,
                roomId: message.roomId,
                entityId: message.entityId,
                source: source ?? (meta.source as string) ?? "chat",
                metadata: {
                  messageId: message.id,
                  channelType: meta.channelType ?? message.content?.channelType,
                  conversationId: meta.sessionKey,
                },
              });
              trajectoryStepId = startResult.stepId;
              meta.trajectoryStepId = trajectoryStepId;
              const trajectorySource =
                source ?? (meta.source as string) ?? "chat";
              await startTrajectoryStepInDatabase({
                runtime,
                stepId: trajectoryStepId,
                source: trajectorySource,
                metadata: {
                  messageId: message.id,
                  channelType: meta.channelType ?? message.content?.channelType,
                  conversationId: toOptionalString(meta.sessionKey),
                  roomId: message.roomId,
                  entityId: message.entityId,
                },
              });
              if (startResult.endTargetId) {
                pendingTrajectoryEndTargetByStepId.set(
                  trajectoryStepId,
                  startResult.endTargetId,
                );
              }

              if (message.id) {
                const replyId = createUniqueUuid(runtime, message.id);
                pendingTrajectoryStepByReplyId.set(replyId, trajectoryStepId);
                trimPendingTrajectories();
              }
            } catch (err) {
              runtime.logger?.warn(
                {
                  err,
                  src: "milady",
                  roomId: message.roomId,
                },
                "Failed to start trajectory logging",
              );
            }
          }
        },
      ],

      // Complete the trajectory when message processing is done
      MESSAGE_SENT: [
        async (payload: MessagePayload) => {
          const { runtime, message, source } = payload;
          if (!message || !runtime) return;

          const meta = message.metadata as Record<string, unknown> | undefined;
          const inReplyTo =
            typeof message.content === "object" &&
            message.content !== null &&
            "inReplyTo" in message.content &&
            typeof (message.content as { inReplyTo?: unknown }).inReplyTo ===
              "string"
              ? (message.content as { inReplyTo: string }).inReplyTo
              : undefined;
          let trajectoryStepId = meta?.trajectoryStepId as string | undefined;
          if (!trajectoryStepId && inReplyTo) {
            trajectoryStepId = pendingTrajectoryStepByReplyId.get(inReplyTo);
          }
          if (!trajectoryStepId) return;

          // TrajectoryLoggerService is provided by @elizaos/plugin-trajectory-logger
          const trajectoryLogger = resolveTrajectoryLogger(runtime);

          if (
            trajectoryLogger &&
            typeof trajectoryLogger.endTrajectory === "function"
          ) {
            try {
              const endTarget =
                pendingTrajectoryEndTargetByStepId.get(trajectoryStepId) ??
                trajectoryStepId;
              await trajectoryLogger.endTrajectory(endTarget, "completed");
            } catch (err) {
              runtime.logger?.warn(
                {
                  err,
                  src: "milady",
                  trajectoryStepId,
                },
                "Failed to end trajectory logging",
              );
            }
          }

          await completeTrajectoryStepInDatabase({
            runtime,
            stepId: trajectoryStepId,
            source: source ?? toOptionalString(meta?.source) ?? "chat",
            status: "completed",
            metadata: {
              roomId: message.roomId,
              entityId: message.entityId,
              conversationId: toOptionalString(meta?.sessionKey),
            },
          });
          if (inReplyTo) {
            pendingTrajectoryStepByReplyId.delete(inReplyTo);
          }
          clearPendingTrajectoryStep(trajectoryStepId);
        },
      ],
    },
  };
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
