/**
 * MiladyEmbeddingManager — wraps node-llama-cpp to provide:
 *   • Metal GPU acceleration on Apple Silicon (gpuLayers: "auto")
 *   • Configurable embedding model with hardware-adaptive defaults
 *   • Idle timeout unloading (default: 30 min) with transparent lazy re-init
 *   • Dimension migration detection with warning logging
 */

import {
  checkDimensionMigration,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MODELS_DIR,
  type EmbeddingManagerConfig,
  type EmbeddingManagerStats,
  ensureModel,
  getErrorMessage,
  getLogger,
  isCorruptedModelLoadError,
  safeUnlink,
} from "./embedding-manager-support.js";
import { detectEmbeddingPreset } from "./embedding-presets.js";

// Lazy-imported to keep the module lightweight at parse time.
// node-llama-cpp pulls in native binaries — importing at the top would slow
// down every CLI invocation even when embeddings aren't needed.
//
// IMPORTANT: We use `unknown` types here instead of `typeof import("node-llama-cpp")`
// to prevent bundlers from hoisting the dynamic import to a static one.
// The native module must remain a runtime-only import for Electron packaging.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LlamaInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LlamaModelInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LlamaEmbeddingContextInstance = any;

/**
 * Dynamically import node-llama-cpp at runtime.
 * Uses indirection to prevent bundlers from converting to static import.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importNodeLlamaCpp(): Promise<any> {
  // The string concatenation prevents static analysis by bundlers
  const moduleName = ["node", "llama", "cpp"].join("-");
  return import(moduleName);
}

export class MiladyEmbeddingManager {
  private readonly model: string;
  private readonly modelRepo: string;
  private readonly dimensions: number;
  private readonly gpuLayers: "auto" | "max" | number;
  private readonly idleTimeoutMs: number;
  private readonly modelsDir: string;

  // Runtime state
  private llama: LlamaInstance | null = null;
  private embeddingModel: LlamaModelInstance | null = null;
  private embeddingContext: LlamaEmbeddingContextInstance | null = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private lastUsedAt: number | null = null;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  /** Track in-flight generateEmbedding calls to prevent idle unload during use. */
  private inFlightCount = 0;
  /** Serialized unload promise — prevents generateEmbedding from using resources being disposed. */
  private unloading: Promise<void> | null = null;
  /** Only write dimension metadata on the very first init (not idle re-inits). */
  private dimensionCheckDone = false;

  constructor(config: EmbeddingManagerConfig = {}) {
    const detected = detectEmbeddingPreset();

    this.model = config.model ?? detected.model;
    this.modelRepo = config.modelRepo ?? detected.modelRepo;
    this.dimensions = config.dimensions ?? detected.dimensions;
    this.gpuLayers = config.gpuLayers ?? detected.gpuLayers;
    this.idleTimeoutMs = config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.modelsDir = config.modelsDir ?? DEFAULT_MODELS_DIR;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (this.disposed) {
      throw new Error("[milaidy] EmbeddingManager has been disposed");
    }

    if (this.unloading) await this.unloading;

    await this.ensureInitialized();

    this.inFlightCount += 1;
    this.lastUsedAt = Date.now();

    try {
      if (!this.embeddingContext) {
        throw new Error("[milaidy] Embedding context not available after init");
      }

      const result = await this.embeddingContext.getEmbeddingFor(text);
      return Array.from(result.vector);
    } catch (err) {
      getLogger().error(`[milaidy] Embedding generation failed: ${err}`);
      return new Array(this.dimensions).fill(0);
    } finally {
      this.inFlightCount -= 1;
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.releaseResources();
  }

  isLoaded(): boolean {
    return this.initialized && this.embeddingModel !== null;
  }

  getStats(): EmbeddingManagerStats {
    return {
      lastUsedAt: this.lastUsedAt,
      isLoaded: this.isLoaded(),
      model: this.model,
      gpuLayers: this.gpuLayers,
      dimensions: this.dimensions,
    };
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.embeddingModel && this.embeddingContext)
      return;

    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this.doInit();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async doInit(): Promise<void> {
    const log = getLogger();

    if (!this.dimensionCheckDone) {
      checkDimensionMigration(this.model, this.dimensions);
      this.dimensionCheckDone = true;
    }

    const modelPath = await ensureModel(
      this.modelsDir,
      this.modelRepo,
      this.model,
    );

    const { getLlama, LlamaLogLevel } = await importNodeLlamaCpp();

    log.info(
      `[milaidy] Initializing embedding model: ${this.model} ` +
        `(dims=${this.dimensions}, gpuLayers=${this.gpuLayers})`,
    );

    if (!this.llama) {
      this.llama = await getLlama({
        logLevel: LlamaLogLevel.error,
        logger: (level, message) => {
          if (level === "error" || level === "fatal") {
            const text = message.trim();
            if (text) {
              log.error(`[node-llama-cpp] ${text}`);
            }
          }
        },
      });
    }

    const loadOpts = {
      modelPath,
      gpuLayers: this.gpuLayers as number,
    };

    let model: LlamaModelInstance;
    try {
      model = await this.llama.loadModel(loadOpts);
    } catch (err) {
      if (!isCorruptedModelLoadError(err)) {
        throw err;
      }

      const failureMessage = getErrorMessage(err);
      safeUnlink(modelPath);
      log.warn(
        `[milaidy] Embedding model load failed due to a likely corrupted/incomplete ` +
          `file (${failureMessage}) at ${modelPath}. Deleting file and ` +
          `re-downloading, then retrying once.`,
      );

      try {
        const recoveredPath = await ensureModel(
          this.modelsDir,
          this.modelRepo,
          this.model,
          true,
        );
        model = await this.llama.loadModel({
          ...loadOpts,
          modelPath: recoveredPath,
        });
      } catch (retryErr) {
        safeUnlink(modelPath);
        throw retryErr;
      }
    }

    let context: LlamaEmbeddingContextInstance;
    try {
      context = await model.createEmbeddingContext();
    } catch (err) {
      if (isCorruptedModelLoadError(err)) {
        safeUnlink(modelPath);
      }
      try {
        await model.dispose();
      } catch {
        // best-effort
      }
      throw err;
    }

    this.embeddingModel = model;
    this.embeddingContext = context;
    this.initialized = true;
    log.info(`[milaidy] Embedding model loaded: ${this.model}`);

    this.startIdleTimer();
  }

  private startIdleTimer(): void {
    this.stopIdleTimer();
    if (this.idleTimeoutMs <= 0) return;

    const checkIntervalMs = Math.min(this.idleTimeoutMs, 60_000);
    this.idleTimer = setInterval(() => {
      if (this.inFlightCount > 0) return;
      if (
        this.lastUsedAt &&
        Date.now() - this.lastUsedAt > this.idleTimeoutMs
      ) {
        getLogger().info(
          `[milaidy] Embedding model idle for >${Math.round(this.idleTimeoutMs / 60_000)} min — unloading to free memory`,
        );
        void this.idleUnload();
      }
    }, checkIntervalMs);

    if (
      this.idleTimer &&
      typeof this.idleTimer === "object" &&
      "unref" in this.idleTimer
    ) {
      (this.idleTimer as NodeJS.Timeout).unref();
    }
  }

  private stopIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private async idleUnload(): Promise<void> {
    this.stopIdleTimer();
    const unloadWork = this.releaseModelResources().then(() => {
      this.initialized = false;
      this.unloading = null;
    });
    this.unloading = unloadWork;
    await unloadWork;
  }

  private async releaseModelResources(): Promise<void> {
    const log = getLogger();

    if (this.embeddingContext) {
      try {
        await this.embeddingContext.dispose();
      } catch (err) {
        log.warn(`[milaidy] Error disposing embedding context: ${err}`);
      }
      this.embeddingContext = null;
    }

    if (this.embeddingModel) {
      try {
        await this.embeddingModel.dispose();
      } catch (err) {
        log.warn(`[milaidy] Error disposing embedding model: ${err}`);
      }
      this.embeddingModel = null;
    }
  }

  private async releaseResources(): Promise<void> {
    this.stopIdleTimer();
    await this.releaseModelResources();
    this.llama = null;
    this.initialized = false;
  }
}

export type {
  EmbeddingManagerConfig,
  EmbeddingManagerStats,
} from "./embedding-manager-support.js";
export {
  checkDimensionMigration,
  DEFAULT_MODELS_DIR,
  EMBEDDING_META_PATH,
  ensureModel,
  readEmbeddingMeta,
} from "./embedding-manager-support.js";
