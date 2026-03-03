/**
 * Milady plugin for ElizaOS — workspace context, session keys, and agent
 * lifecycle actions (restart).
 *
 * Compaction is handled by core auto-compaction in the recent-messages provider.
 * Memory search/get actions are superseded by plugin-scratchpad.
 */

import type {
  ActionEventPayload,
  AgentRuntime,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { EventType, logger } from "@elizaos/core";
import { emoteAction } from "../actions/emote";
import { restartAction } from "../actions/restart";
import { sendMessageAction } from "../actions/send-message";
import { terminalAction } from "../actions/terminal";
import { EMOTE_CATALOG } from "../emotes/catalog";
import { adminTrustProvider } from "../providers/admin-trust";
import {
  createAutonomousStateProvider,
  ensureAutonomousStateTracking,
} from "../providers/autonomous-state";
import { createSessionKeyProvider } from "../providers/session-bridge";
import {
  getSessionProviders,
  resolveDefaultSessionStorePath,
} from "../providers/session-utils";
import { createChannelProfileProvider } from "../providers/simple-mode";
import { uiCatalogProvider } from "../providers/ui-catalog";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../providers/workspace";
import { createWorkspaceProvider } from "../providers/workspace-provider";
import { createTriggerTaskAction } from "../triggers/action";
import { registerTriggerTaskWorker } from "../triggers/runtime";
import { loadCustomActions, setCustomActionsRuntime } from "./custom-actions";

// ── Action debug logging ──────────────────────────────────────────────────

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

// ── Action description enrichments ────────────────────────────────────────

/**
 * Enriched descriptions for upstream actions whose default descriptions
 * are too terse for reliable BM25 matching. Keyed by action name.
 */
const ACTION_DESCRIPTION_ENRICHMENTS: Record<string, string> = {
  CREATE_TASK:
    "Create a new task, todo item, or reminder to track work that needs to be done.",
  CREATE_TODO:
    "Create a new todo item, task, or reminder to track work that needs to be done.",
  EXECUTE_COMMAND:
    "Execute a shell command, terminal command, or script in the system shell.",
  INSTALL_SKILL:
    "Install or add a skill or plugin by name from the catalog.",
  SEARCH_SKILLS:
    "Search, browse, or list available skills and plugins in the catalog.",
  GET_SKILL_DETAILS:
    "Get information, description, and stats about a specific installed skill by name.",
  GET_SKILL_GUIDANCE:
    "Explain how to use or configure a specific skill, including setup steps and options.",
  TOGGLE_SKILL:
    "Enable or disable an installed skill by name. Turn a skill on or off.",
  UNINSTALL_SKILL:
    "Remove or uninstall a skill or plugin that is currently installed.",
  EDIT_FILE:
    "Edit a file by replacing or modifying specific lines or text content within it.",
  GIT:
    "Run a git operation such as status, diff, log, commit, branch, merge, or checkout.",
  READ_FILE:
    "Read and display the contents of a specific file by path.",
  WRITE_FILE:
    "Create or overwrite a file with new content at a specified path.",
  SEARCH_FILES:
    "Search for files containing specific text, patterns, or keywords across the project.",
  LIST_FILES:
    "List files and directories at a given path to see what exists.",
};

const ACTION_EXAMPLE_INJECTIONS: Record<
  string,
  Array<Array<{ name: string; content: { text: string } }>>
> = {
  CREATE_TASK: [
    [
      { name: "{{name1}}", content: { text: "create a new task called fix the login bug" } },
      { name: "{{name2}}", content: { text: "on it — creating that task now" } },
    ],
    [
      { name: "{{name1}}", content: { text: "add a task to review the PR" } },
      { name: "{{name2}}", content: { text: "creating a task to review the PR" } },
    ],
  ],
  INSTALL_SKILL: [
    [
      { name: "{{name1}}", content: { text: "install the discord plugin" } },
      { name: "{{name2}}", content: { text: "installing the discord plugin now" } },
    ],
    [
      { name: "{{name1}}", content: { text: "add the weather skill" } },
      { name: "{{name2}}", content: { text: "setting up the weather skill for you" } },
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
      { name: "{{name2}}", content: { text: "browsing the available skills for you" } },
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
        (action.examples as Array<unknown>).push(...examples);
      }
    }
  }
  if (enriched > 0) {
    logger.info(`[milady] Enriched descriptions for ${enriched} actions`);
  }
}

// ── Plugin config ─────────────────────────────────────────────────────────

export type MiladyPluginConfig = {
  workspaceDir?: string;
  bootstrapMaxChars?: number;
  sessionStorePath?: string;
  agentId?: string;
};

export function createMiladyPlugin(config?: MiladyPluginConfig): Plugin {
  const workspaceDir = config?.workspaceDir ?? DEFAULT_AGENT_WORKSPACE_DIR;
  const agentId = config?.agentId ?? "main";
  const sessionStorePath =
    config?.sessionStorePath ?? resolveDefaultSessionStorePath(agentId);

  const baseProviders = [
    createChannelProfileProvider(),
    createWorkspaceProvider({
      workspaceDir,
      maxCharsPerFile: config?.bootstrapMaxChars,
    }),
    adminTrustProvider,
    createAutonomousStateProvider(),
    createSessionKeyProvider({ defaultAgentId: agentId }),
    ...getSessionProviders({ storePath: sessionStorePath }),
  ];

  // Emote provider — injects available emotes into agent context so the LLM
  // knows it can trigger animations via the PLAY_EMOTE action.
  // Gated on character.settings — disable for agents without 3D avatars.
  const emoteProvider: Provider = {
    name: "emotes",
    description: "Available avatar emote animations",

    async get(
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      // Skip emote injection for agents without avatars.
      // Set character.settings.DISABLE_EMOTES = true to save ~300 tokens.
      const settings = _runtime.character?.settings;
      if (settings?.DISABLE_EMOTES) {
        return { text: "" };
      }
      const ids = EMOTE_CATALOG.map((e) => e.id).join(", ");
      return {
        text: [
          "## Available Emotes",
          "",
          "You have a 3D VRM avatar that can perform emote animations via the PLAY_EMOTE action.",
          "When viewers ask you to dance, wave, do tricks, or express emotions — ALWAYS use PLAY_EMOTE alongside REPLY.",
          'Include both actions: actions: ["REPLY", "PLAY_EMOTE"] with the emote parameter set to the emote ID.',
          "",
          `Available emote IDs: ${ids}`,
          "",
          "Common mappings: dance/vibe → dance-happy, wave/greet → wave, flip/backflip → flip, cry/sad → crying, fight/punch → punching, fish → fishing",
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
        // Don't waste tokens telling the LLM there are no custom actions.
        return { text: "" };
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

      uiCatalogProvider,
      emoteProvider,
      customActionsProvider,
    ],

    actions: [
      restartAction,
      sendMessageAction,
      terminalAction,
      createTriggerTaskAction,
      emoteAction,
      ...loadCustomActions(),
    ],
  };
}
