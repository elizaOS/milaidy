import {
  type AgentRuntime,
  AutonomyService,
  ChannelType,
  type Content,
  logger,
  type MessageExampleGroup,
  stringToUuid,
} from "@elizaos/core";

export * from "@elizaos/autonomous/runtime/eliza";

import {
  type BootElizaRuntimeOptions,
  type StartElizaOptions,
  applyCloudConfigToEnv as upstreamApplyCloudConfigToEnv,
  bootElizaRuntime as upstreamBootElizaRuntime,
  buildCharacterFromConfig as upstreamBuildCharacterFromConfig,
  collectPluginNames as upstreamCollectPluginNames,
  shutdownRuntime as upstreamShutdownRuntime,
  startEliza as upstreamStartEliza,
} from "@elizaos/autonomous/runtime/eliza";
import { CHARACTER_PRESET_META, STYLE_PRESETS } from "../onboarding-presets.js";
import { ensureRuntimeSqlCompatibility } from "../utils/sql-compat";
import type { EmbeddingProgressCallback } from "./embedding-manager-support.js";
import {
  DEFAULT_MODELS_DIR,
  ensureModel,
} from "./embedding-manager-support.js";
import { detectEmbeddingPreset } from "./embedding-presets.js";

const BRAND_ENV_ALIASES = [
  ["MILADY_USE_PI_AI", "ELIZA_USE_PI_AI"],
  ["MILADY_CLOUD_TTS_DISABLED", "ELIZA_CLOUD_TTS_DISABLED"],
  ["MILADY_CLOUD_MEDIA_DISABLED", "ELIZA_CLOUD_MEDIA_DISABLED"],
  ["MILADY_CLOUD_EMBEDDINGS_DISABLED", "ELIZA_CLOUD_EMBEDDINGS_DISABLED"],
  ["MILADY_CLOUD_RPC_DISABLED", "ELIZA_CLOUD_RPC_DISABLED"],
  ["MILADY_DISABLE_LOCAL_EMBEDDINGS", "ELIZA_DISABLE_LOCAL_EMBEDDINGS"],
] as const;

const miladyMirroredEnvKeys = new Set<string>();
const elizaMirroredEnvKeys = new Set<string>();
const AUTONOMY_WORLD_ID = stringToUuid("00000000-0000-0000-0000-000000000001");
const AUTONOMY_ENTITY_ID = stringToUuid("00000000-0000-0000-0000-000000000002");
const AUTONOMY_MESSAGE_SERVER_ID = stringToUuid(
  "00000000-0000-0000-0000-000000000000",
);
const _HISTORY_KNOWLEDGE = "docs/guides/knowledge.md";

interface EntityLike {
  id: string;
  agentId?: string;
  names?: string[];
  metadata?: Record<string, unknown>;
}

interface RuntimeAutonomyCompat {
  getEntityById?: (id: string) => Promise<EntityLike | null>;
  createEntity?: (entity: {
    id: string;
    names: string[];
    agentId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<boolean>;
  updateEntity?: (entity: EntityLike & { agentId: string }) => Promise<boolean>;
  ensureWorldExists?: (world: {
    id: string;
    name: string;
    agentId: string;
    messageServerId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
  ensureRoomExists?: (room: {
    id: string;
    name: string;
    worldId: string;
    source: string;
    type: ChannelType;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
  ensureParticipantInRoom?: (
    entityId: string,
    roomId: string,
  ) => Promise<unknown>;
  addParticipant?: (entityId: string, roomId: string) => Promise<unknown>;
}

interface RuntimeAdapterAutonomyCompat {
  upsertEntities?: (
    entities: Array<{
      id: string;
      names: string[];
      agentId: string;
      metadata?: Record<string, unknown>;
    }>,
  ) => Promise<unknown>;
}

function syncMiladyEnvToEliza(): void {
  for (const [miladyKey, elizaKey] of BRAND_ENV_ALIASES) {
    const value = process.env[miladyKey];
    if (typeof value === "string") {
      if (typeof process.env[elizaKey] !== "string") {
        process.env[elizaKey] = value;
        elizaMirroredEnvKeys.add(elizaKey);
      }
    } else if (elizaMirroredEnvKeys.has(elizaKey)) {
      delete process.env[elizaKey];
      elizaMirroredEnvKeys.delete(elizaKey);
    }
  }
}

function syncElizaEnvToMilady(): void {
  for (const [miladyKey, elizaKey] of BRAND_ENV_ALIASES) {
    const value = process.env[elizaKey];
    if (typeof value === "string") {
      if (typeof process.env[miladyKey] !== "string") {
        process.env[miladyKey] = value;
        miladyMirroredEnvKeys.add(miladyKey);
      }
    } else if (miladyMirroredEnvKeys.has(miladyKey)) {
      delete process.env[miladyKey];
      miladyMirroredEnvKeys.delete(miladyKey);
    }
  }
}

function syncBrandEnvAliases(): void {
  syncElizaEnvToMilady();
  syncMiladyEnvToEliza();
}

function resolveMiladyPresetByName(name: string | undefined) {
  if (!name) return undefined;
  const presetMeta = Object.values(CHARACTER_PRESET_META).find(
    (meta) => meta.name === name,
  );
  if (!presetMeta) return undefined;

  return STYLE_PRESETS.find(
    (preset) => preset.catchphrase === presetMeta.catchphrase,
  );
}

type PresetMessageExample =
  | MessageExampleGroup
  | Array<{ name?: string; user?: string; content: Content }>;

function normalizePresetMessageExamples(
  messageExamples: PresetMessageExample[],
): MessageExampleGroup[] {
  return messageExamples.map((item) => {
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      "examples" in item
    ) {
      return item;
    }

    return {
      examples: item.map((message) => ({
        name: message.name ?? message.user ?? "",
        content: message.content,
      })),
    };
  });
}

export function collectPluginNames(
  ...args: Parameters<typeof upstreamCollectPluginNames>
): ReturnType<typeof upstreamCollectPluginNames> {
  syncBrandEnvAliases();
  const result = upstreamCollectPluginNames(...args);
  syncBrandEnvAliases();
  return result;
}

export function applyCloudConfigToEnv(
  ...args: Parameters<typeof upstreamApplyCloudConfigToEnv>
): ReturnType<typeof upstreamApplyCloudConfigToEnv> {
  syncBrandEnvAliases();
  const result = upstreamApplyCloudConfigToEnv(...args);
  syncBrandEnvAliases();
  return result;
}

export function buildCharacterFromConfig(
  ...args: Parameters<typeof upstreamBuildCharacterFromConfig>
): ReturnType<typeof upstreamBuildCharacterFromConfig> {
  syncBrandEnvAliases();
  const [config] = args;
  const character = upstreamBuildCharacterFromConfig(...args);
  syncBrandEnvAliases();

  const agentEntry = config.agents?.list?.[0];
  const bundledPreset = resolveMiladyPresetByName(character.name);
  if (bundledPreset) {
    if (
      !agentEntry?.postExamples &&
      (character.postExamples?.length ?? 0) === 0
    ) {
      character.postExamples = [...bundledPreset.postExamples];
    }
    if (
      !agentEntry?.messageExamples &&
      (character.messageExamples?.length ?? 0) === 0
    ) {
      character.messageExamples = normalizePresetMessageExamples(
        bundledPreset.messageExamples as PresetMessageExample[],
      );
    }
  }

  return character;
}

async function ensureAutonomyBootstrapContext(
  runtime: AgentRuntime,
): Promise<void> {
  const runtimeWithCompat = runtime as AgentRuntime & RuntimeAutonomyCompat;
  const adapter = runtime.adapter as RuntimeAdapterAutonomyCompat | undefined;
  const autonomousRoomId = stringToUuid(`autonomy-room-${runtime.agentId}`);

  await runtimeWithCompat.ensureWorldExists?.({
    id: AUTONOMY_WORLD_ID,
    name: "Autonomy World",
    agentId: runtime.agentId,
    messageServerId: AUTONOMY_MESSAGE_SERVER_ID,
    metadata: {
      type: "autonomy",
      description: "World for autonomous agent thinking",
    },
  });

  await runtimeWithCompat.ensureRoomExists?.({
    id: autonomousRoomId,
    name: "Autonomous Thoughts",
    worldId: AUTONOMY_WORLD_ID,
    source: "autonomy-service",
    type: ChannelType.SELF,
    metadata: {
      source: "autonomy-service",
      description: "Room for autonomous agent thinking",
    },
  });

  const autonomyEntity = {
    id: AUTONOMY_ENTITY_ID,
    names: ["Autonomy"],
    agentId: runtime.agentId,
    metadata: {
      type: "autonomy",
      description: "Dedicated entity for autonomy service prompts",
    },
  };
  const existingEntity =
    (await runtimeWithCompat.getEntityById?.(AUTONOMY_ENTITY_ID)) ?? null;

  if (!existingEntity) {
    const created = await runtimeWithCompat.createEntity?.(autonomyEntity);
    if (!created && adapter?.upsertEntities) {
      await adapter.upsertEntities([autonomyEntity]);
    }
  } else if (existingEntity.agentId !== runtime.agentId) {
    if (runtimeWithCompat.updateEntity) {
      await runtimeWithCompat.updateEntity({
        ...existingEntity,
        agentId: runtime.agentId,
      });
    } else if (adapter?.upsertEntities) {
      await adapter.upsertEntities([
        {
          id: existingEntity.id ?? AUTONOMY_ENTITY_ID,
          names:
            existingEntity.names && existingEntity.names.length > 0
              ? existingEntity.names
              : autonomyEntity.names,
          agentId: runtime.agentId,
          metadata: {
            ...autonomyEntity.metadata,
            ...(existingEntity.metadata ?? {}),
          },
        },
      ]);
    }
  }

  if (runtimeWithCompat.ensureParticipantInRoom) {
    await runtimeWithCompat.ensureParticipantInRoom(
      runtime.agentId,
      autonomousRoomId,
    );
    await runtimeWithCompat.ensureParticipantInRoom(
      AUTONOMY_ENTITY_ID,
      autonomousRoomId,
    );
  } else if (runtimeWithCompat.addParticipant) {
    await runtimeWithCompat.addParticipant(runtime.agentId, autonomousRoomId);
    await runtimeWithCompat.addParticipant(
      AUTONOMY_ENTITY_ID,
      autonomousRoomId,
    );
  }
}

async function repairRuntimeAfterBoot(
  runtime: AgentRuntime,
): Promise<AgentRuntime> {
  await ensureRuntimeSqlCompatibility(runtime);
  await ensureAutonomyBootstrapContext(runtime);

  if (!runtime.getService("AUTONOMY")) {
    try {
      await AutonomyService.start(runtime);
      logger.info(
        "[milady] AutonomyService started after SQL compatibility repair",
      );
    } catch (error) {
      logger.warn(
        `[milady] AutonomyService restart after SQL compatibility repair failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return runtime;
}

/**
 * Eagerly download the embedding model file if not already present.
 * This ensures the GGUF is on disk before the runtime's first
 * generateEmbedding() call, avoiding a silent stall on first use.
 */
async function warmupEmbeddingModel(
  onProgress?: EmbeddingProgressCallback,
): Promise<void> {
  // Skip if cloud embeddings are disabled (no local model needed)
  if (
    process.env.MILADY_CLOUD_EMBEDDINGS_DISABLED === "1" ||
    process.env.ELIZA_CLOUD_EMBEDDINGS_DISABLED === "1"
  ) {
    logger.info(
      "[milady] Cloud embeddings disabled — skipping embedding model warmup",
    );
    return;
  }

  const preset = detectEmbeddingPreset();
  const modelsDir = process.env.MODELS_DIR ?? DEFAULT_MODELS_DIR;

  const progressCb: EmbeddingProgressCallback = (phase, detail) => {
    // Always log to stdout for server/container monitoring
    if (phase === "downloading") {
      logger.info(`[milady] Embedding model: ${detail ?? "downloading..."}`);
    } else if (phase === "loading") {
      logger.info(`[milady] Embedding model: loading ${detail ?? ""}`);
    } else if (phase === "ready") {
      logger.info(`[milady] Embedding model: ready (${detail ?? ""})`);
    }
    // Forward to caller's callback (e.g. for TUI loading screen)
    onProgress?.(phase, detail);
  };

  try {
    await ensureModel(
      modelsDir,
      preset.modelRepo,
      preset.model,
      false,
      progressCb,
    );
  } catch (err) {
    // Non-fatal: the plugin will attempt its own download on first use
    logger.warn(
      `[milady] Embedding model warmup failed (will retry on first use): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export interface BootElizaRuntimeOptionsExt extends BootElizaRuntimeOptions {
  /** Optional callback for embedding model download/init progress. */
  onEmbeddingProgress?: EmbeddingProgressCallback;
}

export async function bootElizaRuntime(
  opts: BootElizaRuntimeOptionsExt = {},
): Promise<Awaited<ReturnType<typeof upstreamBootElizaRuntime>>> {
  syncMiladyEnvToEliza();

  try {
    // Eagerly download the embedding model before the full runtime boot.
    // This way the TUI loading screen (or server logs) can show download
    // progress instead of the app silently stalling on first embedding call.
    await warmupEmbeddingModel(opts.onEmbeddingProgress);

    const runtime = await upstreamBootElizaRuntime(opts);
    return runtime ? await repairRuntimeAfterBoot(runtime) : runtime;
  } finally {
    syncElizaEnvToMilady();
  }
}

export interface StartElizaOptionsExt extends StartElizaOptions {
  /** Optional callback for embedding model download/init progress. */
  onEmbeddingProgress?: EmbeddingProgressCallback;
}

export async function startEliza(
  options?: StartElizaOptionsExt,
): Promise<Awaited<ReturnType<typeof upstreamStartEliza>>> {
  syncMiladyEnvToEliza();

  try {
    // Eagerly download the embedding model with progress reporting
    await warmupEmbeddingModel(options?.onEmbeddingProgress);

    if (options?.serverOnly) {
      let currentRuntime =
        (await upstreamStartEliza({
          ...options,
          headless: true,
          serverOnly: false,
        })) ?? undefined;

      currentRuntime = currentRuntime
        ? await repairRuntimeAfterBoot(currentRuntime)
        : currentRuntime;

      if (!currentRuntime) {
        return currentRuntime;
      }

      const { startApiServer } = await import("../api/server");
      const apiPort = Number(process.env.ELIZA_PORT) || 2138;
      const { port: actualApiPort } = await startApiServer({
        port: apiPort,
        runtime: currentRuntime,
        onRestart: async () => {
          if (!currentRuntime) {
            return null;
          }

          await upstreamShutdownRuntime(
            currentRuntime,
            "milady server-only restart",
          );

          const restarted =
            (await upstreamStartEliza({
              ...options,
              headless: true,
              serverOnly: false,
            })) ?? undefined;

          currentRuntime = restarted
            ? await repairRuntimeAfterBoot(restarted)
            : undefined;

          return currentRuntime ?? null;
        },
      });

      logger.info(
        `[milady] API server listening on http://localhost:${actualApiPort}`,
      );
      console.log(`[milady] Control UI: http://localhost:${actualApiPort}`);
      console.log("[milady] Server running. Press Ctrl+C to stop.");

      const keepAlive = setInterval(() => {}, 1 << 30);
      const cleanup = async () => {
        clearInterval(keepAlive);
        if (currentRuntime) {
          await upstreamShutdownRuntime(currentRuntime, "server-only shutdown");
        }
        process.exit(0);
      };

      process.on("SIGINT", () => void cleanup());
      process.on("SIGTERM", () => void cleanup());
      return currentRuntime;
    }

    const runtime = await upstreamStartEliza(options);
    return runtime ? await repairRuntimeAfterBoot(runtime) : runtime;
  } finally {
    syncElizaEnvToMilady();
  }
}
