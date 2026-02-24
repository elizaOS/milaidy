/**
 * Milady plugin for ElizaOS — workspace context, session keys, and agent
 * lifecycle actions (restart).
 *
 * Compaction is handled by core auto-compaction in the recent-messages provider.
 * Memory search/get actions are superseded by plugin-scratchpad.
 */

import type {
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
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
