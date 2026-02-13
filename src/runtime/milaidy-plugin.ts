/**
 * Milaidy plugin for ElizaOS — workspace context, session keys, and agent
 * lifecycle actions (restart).
 *
 * Compaction is now a built-in runtime action (COMPACT_SESSION in basic-capabilities).
 * Memory search/get actions are superseded by plugin-scratchpad.
 */

import type {
  ActionEventPayload,
  AgentRuntime,
  MessagePayload,
  Plugin,
} from "@elizaos/core";
import {
  attachmentsProvider,
  EventType,
  entitiesProvider,
  factsProvider,
  getSessionProviders,
  logger,
  resolveDefaultSessionStorePath,
} from "@elizaos/core";
import { restartAction } from "../actions/restart.js";
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

export type ActionLogEntry = {
  action: string;
  status: string;
  roomId: string;
  timestamp: number;
  messageId?: string;
};

/** In-memory action log, only populated when MILAIDY_DEBUG_ACTIONS=1 */
export const actionLog: ActionLogEntry[] = [];

export function clearActionLog(): void {
  actionLog.length = 0;
}

/**
 * Enriched descriptions for upstream actions whose default descriptions
 * are too terse for reliable BM25 matching.  Keyed by action name.
 *
 * These are merged onto the action objects at plugin init time so the
 * ActionFilterService indexes richer vocabulary and the LLM sees clearer
 * guidance in the prompt.
 */
const ACTION_DESCRIPTION_ENRICHMENTS: Record<string, string> = {
  CREATE_TASK:
    "Create, add, or make a new task, todo, or reminder. " +
    "Use when the user asks to create a task, add a todo, make a reminder, " +
    "or track something that needs to be done.",
  CREATE_TODO:
    "Create, add, or make a new todo item, task, or reminder. " +
    "Use when the user asks to create a todo, add a task, make a reminder, " +
    "or track something that needs to be done.",
  EXECUTE_COMMAND:
    "Run, execute, or invoke a shell command, terminal command, or script. " +
    "Use when the user asks to run a command, execute code, install via npm/brew/apt, " +
    "list files, or perform any shell operation.",
  INSTALL_SKILL:
    "Install, add, set up, download, or enable a new skill, plugin, or extension. " +
    "Use when the user asks to install, add, get, or set up any plugin or skill.",
  SEARCH_SKILLS:
    "Search, find, browse, list, or discover available skills and plugins. " +
    "Use when the user asks to search for, find, list, show, or browse plugins or skills. " +
    "This is the correct action for 'list skills', 'list available plugins', 'show skills', " +
    "or any request about discovering/browsing the skill catalog. " +
    "Do NOT use EXECUTE_COMMAND for listing skills — use SEARCH_SKILLS instead.",
};

/**
 * Conversation examples injected into actions that lack them.
 * These appear in the "Action Examples" section of the LLM prompt via
 * the ACTIONS provider's `composeActionExamples()`.
 *
 * Format: array of conversation pairs (same as ElizaOS action.examples).
 */
const ACTION_EXAMPLE_INJECTIONS: Record<
  string,
  Array<Array<{ name: string; content: { text: string } }>>
> = {
  CREATE_TASK: [
    [
      {
        name: "{{name1}}",
        content: { text: "create a new task called fix the login bug" },
      },
      {
        name: "{{name2}}",
        content: { text: "on it — creating that task now" },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "add a task to review the PR" },
      },
      {
        name: "{{name2}}",
        content: { text: "creating a task to review the PR" },
      },
    ],
  ],
  INSTALL_SKILL: [
    [
      { name: "{{name1}}", content: { text: "install the discord plugin" } },
      {
        name: "{{name2}}",
        content: { text: "installing the discord plugin now" },
      },
    ],
    [
      { name: "{{name1}}", content: { text: "add the weather skill" } },
      {
        name: "{{name2}}",
        content: { text: "setting up the weather skill for you" },
      },
    ],
  ],
  EXECUTE_COMMAND: [
    [
      { name: "{{name1}}", content: { text: "run ls -la" } },
      { name: "{{name2}}", content: { text: "running that command now" } },
    ],
    [
      { name: "{{name1}}", content: { text: "execute echo hello world" } },
      { name: "{{name2}}", content: { text: "executing the command" } },
    ],
  ],
  SEARCH_SKILLS: [
    [
      { name: "{{name1}}", content: { text: "search for a twitter plugin" } },
      { name: "{{name2}}", content: { text: "searching for twitter plugins" } },
    ],
    [
      { name: "{{name1}}", content: { text: "list all available skills" } },
      {
        name: "{{name2}}",
        content: { text: "browsing the available skills for you" },
      },
    ],
  ],
};

/**
 * Enrich action descriptions and examples on the runtime.
 * Called from eliza.ts after runtime.initialize() so all plugin actions
 * are registered.
 */
export function enrichActionDescriptions(runtime: AgentRuntime): void {
  let enriched = 0;
  for (const action of runtime.actions) {
    const descReplacement = ACTION_DESCRIPTION_ENRICHMENTS[action.name];
    if (descReplacement) {
      action.description = descReplacement;
      enriched++;
    }
    const examples = ACTION_EXAMPLE_INJECTIONS[action.name];
    if (examples && examples.length > 0) {
      if (!action.examples || action.examples.length === 0) {
        (action as unknown as Record<string, unknown>).examples = examples;
      } else {
        // Append to existing upstream examples
        (action.examples as Array<unknown>).push(...examples);
      }
    }
  }
  if (enriched > 0) {
    logger.info(`[milaidy] Enriched descriptions for ${enriched} actions`);
  }
}

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

  return {
    name: "milaidy",
    description:
      "Milaidy workspace context, session keys, and lifecycle actions",

    // Note: enrichActionDescriptions() is called from eliza.ts after
    // runtime.initialize() so all plugin actions are registered.

    providers: [...baseProviders, ...bootstrapProviders],

    actions: [restartAction],

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
      ...(process.env.MILAIDY_DEBUG_ACTIONS === "1"
        ? {
            [EventType.ACTION_COMPLETED]: [
              async (payload: ActionEventPayload) => {
                const actionName = payload.content?.actions?.[0] ?? "UNKNOWN";
                const status =
                  ((payload.content as Record<string, unknown>)
                    ?.actionStatus as string) ?? "unknown";
                const entry: ActionLogEntry = {
                  action: actionName,
                  status,
                  roomId: payload.roomId as string,
                  timestamp: Date.now(),
                  messageId: payload.messageId as string | undefined,
                };
                actionLog.push(entry);
                logger.info(
                  `[action-selection] ${actionName} | ${status} | room=${payload.roomId}`,
                );
              },
            ],
          }
        : {}),
    },
  };
}
