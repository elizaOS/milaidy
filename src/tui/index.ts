import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { type AgentRuntime, stringToUuid, type UUID } from "@elizaos/core";
import {
  createPiCredentialProvider,
  getPiModel,
  parseModelSpec,
  registerPiAiModelHandler,
} from "@elizaos/plugin-pi-ai";
import type { Api, Model } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { loadMiladyConfig, saveMiladyConfig } from "../config/config.js";
import {
  DEFAULT_MODELS_DIR,
  ensureModel,
  MiladyEmbeddingManager,
} from "../runtime/embedding-manager.js";
import {
  EMBEDDING_PRESETS,
  type EmbeddingTier,
} from "../runtime/embedding-presets.js";
import { getEmbeddingState } from "../runtime/embedding-state.js";
import { ElizaTUIBridge } from "./eliza-tui-bridge.js";
import { resolveTuiModelSpec } from "./model-spec.js";
import { MiladyTUI } from "./tui-app.js";

export { registerPiAiModelHandler } from "@elizaos/plugin-pi-ai";
export { ElizaTUIBridge } from "./eliza-tui-bridge.js";
export { MiladyTUI } from "./tui-app.js";

export interface LaunchTUIOptions {
  /** Override model, format: provider/modelId (e.g. anthropic/claude-sonnet-4-20250514) */
  modelOverride?: string;
  /** API base URL for chat transport (e.g. http://127.0.0.1:2138). */
  apiBaseUrl?: string;
  /**
   * Optional API auth token override for API mode.
   * - undefined: use MILADY_API_TOKEN from environment
   * - null/empty: suppress auth header forwarding
   */
  apiToken?: string | null;
}

// ---------------------------------------------------------------------------
// /embeddings helper
// ---------------------------------------------------------------------------

function formatDownloadSize(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)}GB` : `${mb}MB`;
}

function isModelDownloaded(filename: string): boolean {
  return fs.existsSync(path.join(DEFAULT_MODELS_DIR, filename));
}

const VALID_TIERS = new Set<string>(["fallback", "standard", "performance"]);

function getEmbeddingOptions() {
  const state = getEmbeddingState();
  if (!state) return [];

  return (["fallback", "standard", "performance"] as const).map((tier) => {
    const preset = EMBEDDING_PRESETS[tier];
    return {
      tier,
      label: preset.label,
      dimensions: preset.dimensions,
      downloaded: isModelDownloaded(preset.model),
      active: state.preset?.tier === tier,
    };
  });
}

async function switchEmbeddingTier(tier: EmbeddingTier, tui: MiladyTUI) {
  const state = getEmbeddingState();

  if (!state) {
    tui.addToChatContainer(new Text("Embedding manager not available.", 1, 0));
    return;
  }

  const preset = EMBEDDING_PRESETS[tier];

  if (state.preset?.tier === tier) {
    tui.addToChatContainer(
      new Text(`Already using ${preset.label} (${preset.model})`, 1, 0),
    );
    return;
  }

  if (preset.dimensions !== state.dimensions) {
    tui.addToChatContainer(
      new Text(
        `⚠ Dimensions changing (${state.dimensions} → ${preset.dimensions}). ` +
          "Existing memory embeddings will be re-indexed on next access.",
        1,
        0,
      ),
    );
  }

  if (!isModelDownloaded(preset.model)) {
    tui.addToChatContainer(
      new Text(
        `Downloading ${preset.model} (${formatDownloadSize(preset.downloadSizeMB)})…`,
        1,
        0,
      ),
    );
    try {
      await ensureModel(DEFAULT_MODELS_DIR, preset.modelRepo, preset.model);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tui.addToChatContainer(new Text(`Download failed: ${msg}`, 1, 0));
      return;
    }
  }

  try {
    await state.manager.dispose();
  } catch {
    // best-effort cleanup
  }

  const newManager = new MiladyEmbeddingManager({
    model: preset.model,
    modelRepo: preset.modelRepo,
    dimensions: preset.dimensions,
    contextSize: preset.contextSize,
    gpuLayers: preset.gpuLayers,
  });

  state.manager = newManager;
  state.preset = preset;
  state.dimensions = preset.dimensions;

  try {
    const cfg = loadMiladyConfig();
    cfg.embedding = {
      ...cfg.embedding,
      model: preset.model,
      modelRepo: preset.modelRepo,
      dimensions: preset.dimensions,
      gpuLayers: preset.gpuLayers,
    };
    saveMiladyConfig(cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    tui.addToChatContainer(
      new Text(`Warning: could not save config: ${msg}`, 1, 0),
    );
  }

  tui.addToChatContainer(
    new Text(
      `Switched embedding model to ${preset.label} (${preset.model}, ${preset.dimensions} dims)`,
      1,
      0,
    ),
  );
}

function createApiModeRuntimeStub(agentName: string): AgentRuntime {
  const noopAsync = async () => {};

  return {
    agentId: stringToUuid(`milady-tui-api:${agentName}`) as UUID,
    character: { name: agentName },
    getSetting: () => undefined,
    setSetting: () => {},
    registerEvent: () => {},
    ensureWorldExists: noopAsync,
    ensureRoomExists: noopAsync,
    ensureConnection: noopAsync,
    stop: noopAsync,
  } as unknown as AgentRuntime;
}

export async function launchTUI(
  runtime: AgentRuntime | null,
  options: LaunchTUIOptions = {},
): Promise<void> {
  const apiMode = Boolean(options.apiBaseUrl);

  const piCreds = await createPiCredentialProvider();
  const miladyConfig = loadMiladyConfig();
  const fallbackAgentName = miladyConfig.agents?.list?.[0]?.name ?? "milady";

  if (!runtime && !apiMode) {
    throw new Error("Runtime is required when API mode is not configured");
  }

  const runtimeRef = runtime ?? createApiModeRuntimeStub(fallbackAgentName);

  const configPrimaryModel = miladyConfig.agents?.defaults?.model?.primary;
  const configEnv = miladyConfig.env as
    | (Record<string, unknown> & { vars?: Record<string, unknown> })
    | undefined;
  const configPiAiModelSpec =
    (configEnv?.vars?.PI_AI_MODEL_SPEC as string | undefined) ??
    (typeof configEnv?.PI_AI_MODEL_SPEC === "string"
      ? configEnv.PI_AI_MODEL_SPEC
      : undefined);

  const runtimeModelProvider = runtimeRef.getSetting("MODEL_PROVIDER") as
    | string
    | undefined;

  const modelSpec = resolveTuiModelSpec({
    modelOverride: options.modelOverride,
    configPrimaryModelSpec: configPrimaryModel,
    configPiAiModelSpec,
    runtimeModelSpec: runtimeModelProvider,
    piDefaultModelSpec: await piCreds.getDefaultModelSpec(),
    hasCredentials: (provider) => piCreds.hasCredentials(provider),
  });

  const { provider, id } = parseModelSpec(modelSpec);

  const largeModel = getPiModel(provider, id);
  const smallModel = largeModel;

  const tui = new MiladyTUI({
    runtime: runtimeRef,
    apiBaseUrl: options.apiBaseUrl,
    modelRegistry: {
      authStorage: {
        getApiKey: (provider: string) => piCreds.getApiKey(provider),
        get: async (_provider: string) => undefined,
      },
    },
  });
  const bridge = new ElizaTUIBridge(runtimeRef, tui, {
    apiBaseUrl: options.apiBaseUrl,
    apiToken: options.apiToken,
  });

  const controller = apiMode
    ? null
    : registerPiAiModelHandler(runtimeRef, {
        largeModel,
        smallModel,
        // biome-ignore lint/suspicious/noExplicitAny: pi-ai callback type
        onStreamEvent: (event: any) => bridge.onStreamEvent(event),
        getAbortSignal: () => bridge.getAbortSignal(),
        // Keep TUI model switching authoritative even when the runtime also loaded
        // the pi-ai provider plugin.
        priority: 20000,
        // biome-ignore lint/suspicious/noExplicitAny: pi-ai callback type
        getApiKey: (p: any) => piCreds.getApiKey(p),
      });

  if (controller) {
    tui.getStatusBar().update({
      modelId: controller.getLargeModel().id,
      modelProvider: controller.getLargeModel().provider,
    });
  } else {
    tui.getStatusBar().update({
      modelId: "backend",
      modelProvider: "api",
    });
  }

  const switchModel = (model: Model<Api>): void => {
    if (!controller) {
      tui.addToChatContainer(
        new Text(
          "Model switching is managed by the connected API runtime in API mode.",
          1,
          0,
        ),
      );
      return;
    }

    controller.setLargeModel(model);
    controller.setSmallModel(model);

    runtimeRef.setSetting("MODEL_PROVIDER", `${model.provider}/${model.id}`);

    tui.getStatusBar().update({
      modelId: model.id,
      modelProvider: model.provider,
    });

    if (!piCreds.hasCredentials(model.provider)) {
      tui.addToChatContainer(
        new Text(
          `Warning: no credentials found for provider "${model.provider}" (neither Milady env nor pi auth). ` +
            "Model calls may fail.",
          1,
          0,
        ),
      );
    }

    tui.addToChatContainer(
      new Text(`Switched model to ${model.provider}/${model.id}`, 1, 0),
    );
  };

  tui.setOnSubmit(async (text) => {
    if (text.startsWith("/")) {
      const [cmdRaw, ...args] = text.slice(1).trim().split(/\s+/);
      const cmd = (cmdRaw ?? "").toLowerCase();
      const argText = args.join(" ").trim();

      try {
        if (cmd === "model" || cmd === "models") {
          if (apiMode) {
            tui.addToChatContainer(
              new Text(
                "Model selection is managed by the connected API runtime in API mode.",
                1,
                0,
              ),
            );
            return;
          }

          if (!argText) {
            tui.openModelSelector();
            return;
          }

          const { provider: p, id: m } = parseModelSpec(argText);
          const model = getPiModel(p, m);
          switchModel(model);
          return;
        }

        if (cmd === "embeddings") {
          if (apiMode) {
            tui.addToChatContainer(
              new Text(
                "Embedding controls are only available in local runtime mode.",
                1,
                0,
              ),
            );
            return;
          }

          if (!argText) {
            tui.openEmbeddings();
            return;
          }

          const tier = argText.toLowerCase();
          if (!VALID_TIERS.has(tier)) {
            tui.addToChatContainer(
              new Text(
                `Unknown tier "${argText}". Use: fallback, standard, or performance`,
                1,
                0,
              ),
            );
            return;
          }

          await switchEmbeddingTier(tier as EmbeddingTier, tui);
          return;
        }

        if (cmd === "knowledge" || cmd === "ctx") {
          if (apiMode) {
            tui.addToChatContainer(
              new Text(
                "Knowledge enrichment settings are managed by the connected API runtime in API mode.",
                1,
                0,
              ),
            );
            return;
          }
          const cfg = loadMiladyConfig();
          const ctxEnabled = cfg.knowledge?.contextualEnrichment === true;

          if (!argText) {
            // Display current knowledge enrichment status
            const embState = getEmbeddingState();
            const embModel = embState?.preset
              ? `${embState.preset.model} (local, ${embState.preset.dimensions}d)`
              : "unknown";

            if (ctxEnabled) {
              const lm = controller?.getLargeModel();
              const cloudModel = lm
                ? `${lm.provider}/${lm.id} (via pi-ai)`
                : "unknown (controller unavailable)";
              tui.addToChatContainer(
                new Text(
                  [
                    "Knowledge Enrichment: ON",
                    `  Cloud model: ${cloudModel}`,
                    `  Embedding model: ${embModel}`,
                    `  Docs path: ${cfg.knowledge?.docsPath ?? "./docs"}`,
                  ].join("\n"),
                  1,
                  0,
                ),
              );
            } else {
              tui.addToChatContainer(
                new Text(
                  [
                    "Knowledge Enrichment: OFF",
                    `  Embedding model: ${embModel}`,
                    "  Enable with: /knowledge on",
                  ].join("\n"),
                  1,
                  0,
                ),
              );
            }
            return;
          }

          const action = argText.toLowerCase();
          if (action === "on") {
            if (ctxEnabled) {
              tui.addToChatContainer(
                new Text("Knowledge enrichment is already enabled.", 1, 0),
              );
              return;
            }
            cfg.knowledge = { ...cfg.knowledge, contextualEnrichment: true };
            try {
              saveMiladyConfig(cfg);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              tui.addToChatContainer(
                new Text(`Could not save config: ${msg}`, 1, 0),
              );
              return;
            }
            // Update the live runtime setting only after config is persisted
            // so runtime and config stay in sync on save failure.
            runtimeRef.setSetting("CTX_KNOWLEDGE_ENABLED", "true");
            tui.addToChatContainer(
              new Text(
                "Knowledge enrichment enabled. Takes effect on next document ingestion.\n" +
                  "Document text will be sent to your cloud provider for enrichment; embeddings stay local.",
                1,
                0,
              ),
            );
            return;
          }

          if (action === "off") {
            if (!ctxEnabled) {
              tui.addToChatContainer(
                new Text("Knowledge enrichment is already disabled.", 1, 0),
              );
              return;
            }
            cfg.knowledge = { ...cfg.knowledge, contextualEnrichment: false };
            try {
              saveMiladyConfig(cfg);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              tui.addToChatContainer(
                new Text(`Could not save config: ${msg}`, 1, 0),
              );
              return;
            }
            // Remove the setting entirely (same as startup behavior where
            // the key is simply omitted when CTX is off).
            runtimeRef.setSetting("CTX_KNOWLEDGE_ENABLED", null);
            tui.addToChatContainer(
              new Text(
                "Knowledge enrichment disabled. Existing enriched chunks are not affected.",
                1,
                0,
              ),
            );
            return;
          }

          tui.addToChatContainer(
            new Text(
              "Usage: /knowledge [on|off] — toggle contextual enrichment",
              1,
              0,
            ),
          );
          return;
        }

        if (cmd === "help") {
          tui.addToChatContainer(
            new Text(
              [
                "Commands:",
                "  /model            open model selector",
                "  /model <p/id>     switch model (e.g. anthropic/claude-sonnet-4-20250514)",
                "  /embeddings       open embedding model popup",
                "  /embeddings <t>   switch embedding (fallback|standard|performance)",
                "  /knowledge       show knowledge enrichment status",
                "  /knowledge on    enable contextual enrichment (cloud LLM + local embeddings)",
                "  /knowledge off   disable contextual enrichment",
                "  /clear            clear chat",
                "  /settings         open settings panel",
                "  /plugins          open plugin manager",
                "  /exit             quit",
              ].join("\n"),
              1,
              0,
            ),
          );
          return;
        }

        if (cmd === "clear") {
          tui.clearChat();
          return;
        }

        if (cmd === "settings") {
          tui.openSettings();
          return;
        }

        if (cmd === "plugins") {
          tui.openPlugins();
          return;
        }

        if (cmd === "exit" || cmd === "quit") {
          bridge.dispose();
          await tui.stop();
          await runtimeRef.stop();
          process.exit(0);
        }

        // Unknown command
        tui.addToChatContainer(
          new Text(`Unknown command: /${cmd}. Try /help`, 1, 0),
        );
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tui.addToChatContainer(new Text(`Command error: ${msg}`, 1, 0));
        return;
      }
    }

    await bridge.handleUserInput(text);
  });
  tui.setOnToggleToolExpand((expanded) =>
    bridge.setToolOutputExpanded(expanded),
  );
  tui.setOnToggleThinking((enabled) => bridge.setShowThinking(enabled));

  tui.setOnCtrlC(() => {
    if (bridge.getIsProcessing()) {
      bridge.abortInFlight();
      return;
    }

    void (async () => {
      try {
        bridge.dispose();
        await tui.stop();
      } finally {
        await runtimeRef.stop();
        process.exit(0);
      }
    })();
  });

  if (!apiMode && controller) {
    tui.setModelSelectorHandlers({
      getCurrentModel: () => controller.getLargeModel(),
      hasCredentials: (provider) => piCreds.hasCredentials(provider),
      onSelectModel: (model) => {
        try {
          switchModel(model);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          tui.addToChatContainer(new Text(`Model switch error: ${msg}`, 1, 0));
        }
      },
    });

    tui.setEmbeddingHandlers({
      getOptions: () => getEmbeddingOptions(),
      onSelectTier: async (tier) => {
        await switchEmbeddingTier(tier, tui);
      },
    });
  }

  await bridge.initialize();
  try {
    await tui.start();
  } finally {
    bridge.dispose();
  }
}
