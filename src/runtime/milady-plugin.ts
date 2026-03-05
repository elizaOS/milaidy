/**
 * Milady plugin for ElizaOS — workspace context, session keys, and agent
 * lifecycle actions (restart).
 *
 * Compaction is handled by core auto-compaction in the recent-messages provider.
 * Memory search/get actions are superseded by plugin-scratchpad.
 */

import crypto from "node:crypto";
import type {
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { activateTrainedModelAction } from "../actions/activate-trained-model";
import { analyzePatternsAction } from "../actions/analyze-patterns";
import { canIAction } from "../actions/can-i";
import { checkBalanceAction } from "../actions/check-balance";
import { configurePluginAction } from "../actions/configure-plugin";
import { createActionAction } from "../actions/create-action";
import { createSkillAction } from "../actions/create-skill";
import { emoteAction } from "../actions/emote";
import { evaluateTrajectoriesAction } from "../actions/evaluate-trajectories";
import { executeTradeAction } from "../actions/execute-trade";
import { getSelfStatusAction } from "../actions/get-self-status";
import { recordLearningAction } from "../actions/record-learning";
import { restartAction } from "../actions/restart";
import { sendMessageAction } from "../actions/send-message";
import { terminalAction } from "../actions/terminal";
import { testCreationAction } from "../actions/test-creation";
import { transferTokenAction } from "../actions/transfer-token";
import { triggerSelfTrainingAction } from "../actions/trigger-self-training";
import { builtinContributors } from "../awareness/contributors/index";
import {
  AwarenessRegistry,
  setGlobalAwarenessRegistry,
} from "../awareness/registry";
import { EMOTE_CATALOG } from "../emotes/catalog";
import { adminTrustProvider } from "../providers/admin-trust";
import {
  createAutonomousStateProvider,
  ensureAutonomousStateTracking,
} from "../providers/autonomous-state";
import { createSelfStatusProvider } from "../providers/self-status";
import { createSessionKeyProvider } from "../providers/session-bridge";
import {
  getSessionProviders,
  resolveDefaultSessionStorePath,
} from "../providers/session-utils";
import { createChannelProfileProvider } from "../providers/simple-mode";
import { uiCatalogProvider } from "../providers/ui-catalog";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../providers/workspace";
import { createWorkspaceProvider } from "../providers/workspace-provider";
import {
  initLearningStore,
  isSelfEvolutionEnabled,
  startAutoAnalysis,
} from "../services/learning-store";
import { createTriggerTaskAction } from "../triggers/action";
import {
  listTriggerTasks,
  readTriggerConfig,
  registerTriggerTaskWorker,
  TRIGGER_TASK_NAME,
  TRIGGER_TASK_TAGS,
} from "../triggers/runtime";
import { buildTriggerMetadata } from "../triggers/scheduling";
import type { TriggerConfig } from "../triggers/types";
import { TRIGGER_SCHEMA_VERSION } from "../triggers/types";
import { loadCustomActions, setCustomActionsRuntime } from "./custom-actions";

export type MiladyPluginConfig = {
  workspaceDir?: string;
  bootstrapMaxChars?: number;
  sessionStorePath?: string;
  agentId?: string;
};

const AUTO_ANALYSIS_DEDUPE_KEY = "milady:auto-analysis";
const AUTO_ANALYSIS_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Register a built-in trigger for auto-analysis. This makes it visible in
 * the TriggersView so users can see/disable/reschedule it, instead of
 * being a hidden setInterval.
 */
async function registerAutoAnalysisTrigger(
  runtime: IAgentRuntime,
): Promise<void> {
  // Check if already registered (survives restart via DB persistence)
  const existingTasks = await listTriggerTasks(runtime);
  const alreadyRegistered = existingTasks.some((task) => {
    const trigger = readTriggerConfig(task);
    return trigger?.dedupeKey === AUTO_ANALYSIS_DEDUPE_KEY;
  });
  if (alreadyRegistered) return;

  const triggerId = crypto.randomUUID() as import("@elizaos/core").UUID;
  const triggerConfig: TriggerConfig = {
    version: TRIGGER_SCHEMA_VERSION,
    triggerId,
    displayName: "Self-Evolution: Auto-Analysis",
    instructions:
      "Analyze recent trajectories for recurring error patterns and record learnings. This is an automatic background task — scan trajectory history, extract error signatures, and update the learning store. No user interaction needed.",
    triggerType: "interval",
    enabled: true,
    wakeMode: "inject_now",
    createdBy: "system:self-evolution",
    intervalMs: AUTO_ANALYSIS_INTERVAL_MS,
    runCount: 0,
  };

  const metadata = buildTriggerMetadata({
    trigger: triggerConfig,
    nowMs: Date.now(),
  });
  if (!metadata) {
    throw new Error("Failed to build trigger metadata");
  }

  await runtime.createTask({
    name: TRIGGER_TASK_NAME,
    description: triggerConfig.displayName,
    roomId: runtime.agentId,
    tags: [...TRIGGER_TASK_TAGS],
    metadata,
  });
}

export function createMiladyPlugin(config?: MiladyPluginConfig): Plugin {
  const workspaceDir = config?.workspaceDir ?? DEFAULT_AGENT_WORKSPACE_DIR;
  const agentId = config?.agentId ?? "main";
  const sessionStorePath =
    config?.sessionStorePath ?? resolveDefaultSessionStorePath(agentId);

  // Self-awareness registry — gives the agent perception of its own state.
  const awarenessRegistry = new AwarenessRegistry();
  for (const contributor of builtinContributors) {
    awarenessRegistry.register(contributor);
  }
  const selfStatusProvider = createSelfStatusProvider(awarenessRegistry);

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

  // Self-evolution provider — tells the LLM about its self-improvement capabilities.
  // Only injected when ENABLE_SELF_EVOLUTION is not explicitly disabled (default: on).
  const selfEvolutionProvider: Provider = {
    name: "selfEvolution",
    description: "Agent self-evolution capabilities",

    async get(
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      const settings = _runtime.character?.settings as
        | Record<string, unknown>
        | undefined;
      if (!isSelfEvolutionEnabled(settings)) {
        return { text: "" };
      }
      return {
        text: [
          "## Self-Evolution",
          "",
          "You have self-improvement capabilities. Use them when appropriate:",
          "- **RECORD_LEARNING**: Record errors, corrections, insights, or patterns you discover. Say 'learn', 'remember', or 'note' to trigger.",
          "- **ANALYZE_PATTERNS**: Scan your trajectory history for recurring errors. Say 'analyze patterns' to trigger.",
          "- **CREATE_SKILL**: Create new SKILL.md to extend your capabilities. Say 'create skill' to trigger.",
          "- **CREATE_ACTION**: Create new runtime actions (http/shell/code). Say 'create action' to trigger.",
          "",
          "Your learnings are stored in MEMORY.md and persist across conversations.",
          "When you make mistakes repeatedly, record them. When you see a gap in your abilities, create a skill or action to fill it.",
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
      // Make awareness registry accessible to GET_SELF_STATUS action
      setGlobalAwarenessRegistry(awarenessRegistry);
      // Initialize learning store for self-evolution system
      initLearningStore(workspaceDir);
      // Register self-evolution auto-analysis as a proper trigger (visible in TriggersView).
      // Falls back to timer-based analysis if the trigger system is unavailable.
      await registerAutoAnalysisTrigger(runtime).catch(() => {
        startAutoAnalysis(runtime, 6);
      });
    },

    providers: [
      ...baseProviders,

      uiCatalogProvider,
      emoteProvider,
      selfEvolutionProvider,
      customActionsProvider,
      selfStatusProvider,
    ],

    actions: [
      restartAction,
      sendMessageAction,
      terminalAction,
      createTriggerTaskAction,
      emoteAction,
      configurePluginAction,
      canIAction,
      getSelfStatusAction,
      executeTradeAction,
      checkBalanceAction,
      transferTokenAction,
      recordLearningAction,
      analyzePatternsAction,
      createSkillAction,
      createActionAction,
      testCreationAction,
      evaluateTrajectoriesAction,
      triggerSelfTrainingAction,
      activateTrainedModelAction,
      ...loadCustomActions(),
    ],
  };
}
