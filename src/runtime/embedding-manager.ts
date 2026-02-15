/**
 * MilaidyEmbeddingManager — wraps node-llama-cpp to provide:
 *   • Metal GPU acceleration on Apple Silicon (gpuLayers: "auto")
 *   • Configurable embedding model with hardware-adaptive defaults
 *   • Idle timeout unloading (default: 30 min) with transparent lazy re-init
 *   • Dimension migration detection with warning logging
 */
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { detectEmbeddingPreset } from "./embedding-presets.js";

// Lazy-imported to keep the module lightweight at parse time.
// node-llama-cpp pulls in native binaries — importing at the top would slow
// down every CLI invocation even when embeddings aren't needed.
type LlamaInstance = Awaited<
  ReturnType<typeof import("node-llama-cpp")["getLlama"]>
>;
type LlamaModelInstance = Awaited<ReturnType<LlamaInstance["loadModel"]>>;
type LlamaEmbeddingContextInstance = Awaited<
  ReturnType<LlamaModelInstance["createEmbeddingContext"]>
>;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface EmbeddingManagerConfig {
  /** GGUF model filename (default: detected hardware preset) */
  model?: string;
  /** HuggingFace repo for auto-download (default: detected hardware preset repo) */
  modelRepo?: string;
  /** Embedding dimensions (default: detected hardware preset dimensions) */
  dimensions?: number;
  /** GPU layers: "auto" | "max" | number (default: detected hardware preset gpuLayers) */
  gpuLayers?: "auto" | "max" | number;
  /** Idle timeout in ms before unloading model (default: 1800000 = 30 min, 0 = never unload) */
  idleTimeoutMs?: number;
  /** Models directory (default: ~/.eliza/models) */
  modelsDir?: string;
}

export interface EmbeddingManagerStats {
  lastUsedAt: number | null;
  isLoaded: boolean;
  model: string;
  gpuLayers: string | number;
  dimensions: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MODELS_DIR = path.join(os.homedir(), ".eliza", "models");

// Dimension-migration metadata path
const EMBEDDING_META_DIR =
  process.env.MILAIDY_EMBEDDING_META_DIR ??
  path.join(os.homedir(), ".milaidy", "state");
const EMBEDDING_META_PATH =
  process.env.MILAIDY_EMBEDDING_META_PATH ??
  path.join(EMBEDDING_META_DIR, "embedding-meta.json");

// ---------------------------------------------------------------------------
// Logger helper (uses @elizaos/core when available, falls back to console)
// ---------------------------------------------------------------------------

let _logger:
  | {
      info: (...a: unknown[]) => void;
      warn: (...a: unknown[]) => void;
      error: (...a: unknown[]) => void;
      debug: (...a: unknown[]) => void;
    }
  | undefined;

function getLogger() {
  if (_logger) return _logger;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require("@elizaos/core");
    if (core?.logger) {
      _logger = core.logger;
      return _logger as NonNullable<typeof _logger>;
    }
  } catch {
    // Fallback below
  }
  _logger = console;
  return _logger;
}

// ---------------------------------------------------------------------------
// Dimension migration metadata
// ---------------------------------------------------------------------------

interface EmbeddingMeta {
  model: string;
  dimensions: number;
  lastChanged: string;
}

function readEmbeddingMeta(): EmbeddingMeta | null {
  try {
    if (!fs.existsSync(EMBEDDING_META_PATH)) return null;
    return JSON.parse(
      fs.readFileSync(EMBEDDING_META_PATH, "utf-8"),
    ) as EmbeddingMeta;
  } catch {
    return null;
  }
}

function writeEmbeddingMeta(meta: EmbeddingMeta): void {
  try {
    fs.mkdirSync(EMBEDDING_META_DIR, { recursive: true });
    fs.writeFileSync(EMBEDDING_META_PATH, JSON.stringify(meta, null, 2));
  } catch (err) {
    getLogger().warn(`[milaidy] Failed to write embedding metadata: ${err}`);
  }
}

/**
 * Check if dimensions have changed and log a warning if so.
 * Updates the stored metadata to current values.
 */
function checkDimensionMigration(model: string, dimensions: number): void {
  const log = getLogger();
  const stored = readEmbeddingMeta();

  if (stored && stored.dimensions !== dimensions) {
    log.warn(
      `[milaidy] Embedding dimensions changed (${stored.dimensions} → ${dimensions}). ` +
        "Existing memory embeddings will be re-indexed on next access.",
    );
  }

  // Always update metadata (even on first run or no change)
  writeEmbeddingMeta({
    model,
    dimensions,
    lastChanged: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Model downloader (simplified from upstream DownloadManager)
// ---------------------------------------------------------------------------

function safeUnlink(filepath: string): void {
  try {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch {
    // best-effort cleanup
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (
    error != null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

function isCorruptedModelLoadError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to load model") ||
    message.includes("data is not within the file bounds") ||
    (message.includes("tensor") && message.includes("is corrupted")) ||
    message.includes("model is corrupted")
  );
}

function parseContentLength(
  contentLength: string | string[] | undefined,
): number | null {
  if (!contentLength || Array.isArray(contentLength)) return null;
  const parsed = Number.parseInt(contentLength, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function downloadFile(
  url: string,
  dest: string,
  maxRedirects = 5,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let redirectCount = 0;

    const request = (reqUrl: string) => {
      // Open a fresh write stream for each attempt
      const file = fs.createWriteStream(dest);
      let bytesReceived = 0;
      let expectedBytes: number | null = null;

      const settleError = (err: Error) => {
        if (settled) return;
        settled = true;
        file.close();
        safeUnlink(dest);
        reject(err);
      };

      const settleSuccess = () => {
        if (settled) return;
        if (expectedBytes != null && bytesReceived !== expectedBytes) {
          settleError(
            new Error(
              `[milaidy] Download failed: bytes received (${bytesReceived}) ` +
                `does not match Content-Length (${expectedBytes})`,
            ),
          );
          return;
        }
        settled = true;
        file.close();
        resolve();
      };

      https
        .get(reqUrl, { headers: { "User-Agent": "milaidy" } }, (res) => {
          expectedBytes = parseContentLength(res.headers["content-length"]);
          // Follow redirects (open new stream each time)
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume(); // drain the response
            file.close();
            safeUnlink(dest);
            redirectCount += 1;
            if (redirectCount > maxRedirects) {
              settleError(
                new Error(
                  `Download failed: too many redirects (>${maxRedirects})`,
                ),
              );
              return;
            }
            // Resolve relative redirect URLs (guard against malformed headers)
            let next: string;
            try {
              next = new URL(res.headers.location, reqUrl).toString();
            } catch {
              settleError(
                new Error(
                  `Download failed: malformed redirect URL "${res.headers.location}"`,
                ),
              );
              return;
            }
            request(next);
            return;
          }
          if (res.statusCode !== 200) {
            settleError(
              new Error(
                `Download failed: HTTP ${res.statusCode} for ${reqUrl}`,
              ),
            );
            return;
          }
          res.on("data", (chunk: Buffer) => {
            bytesReceived += chunk.length;
          });
          res.pipe(file);
          file.on("finish", settleSuccess);
          file.on("error", settleError);
        })
        .on("error", settleError);
    };
    request(url);
  });
}

async function ensureModel(
  modelsDir: string,
  repo: string,
  filename: string,
  force = false,
): Promise<string> {
  const modelPath = path.join(modelsDir, filename);
  if (force) safeUnlink(modelPath);
  if (fs.existsSync(modelPath)) return modelPath;

  const log = getLogger();
  fs.mkdirSync(modelsDir, { recursive: true });

  const url = `https://huggingface.co/${repo}/resolve/main/${filename}`;
  log.info(
    `[milaidy] Downloading embedding model: ${filename} from ${repo}...`,
  );

  await downloadFile(url, modelPath);
  log.info(`[milaidy] Embedding model downloaded: ${modelPath}`);
  return modelPath;
}

// ---------------------------------------------------------------------------
// MilaidyEmbeddingManager
// ---------------------------------------------------------------------------

export class MilaidyEmbeddingManager {
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

  // ── Public API ──────────────────────────────────────────────────────────

  async generateEmbedding(text: string): Promise<number[]> {
    if (this.disposed) {
      throw new Error("[milaidy] EmbeddingManager has been disposed");
    }

    // If an idle unload is in progress, wait for it to finish before
    // re-initializing — prevents using resources mid-dispose.
    if (this.unloading) await this.unloading;

    await this.ensureInitialized();

    // Guard against idle unload racing with an active embedding call.
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
      // Return zero vector as fallback (correct dimensions)
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

  // ── Initialization ──────────────────────────────────────────────────────

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.embeddingModel && this.embeddingContext)
      return;

    // Prevent concurrent init attempts
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

    // Only check dimension migration on the very first init, not idle re-inits
    if (!this.dimensionCheckDone) {
      checkDimensionMigration(this.model, this.dimensions);
      this.dimensionCheckDone = true;
    }

    // Download model if needed
    const modelPath = await ensureModel(
      this.modelsDir,
      this.modelRepo,
      this.model,
    );

    // Import node-llama-cpp lazily
    const { getLlama, LlamaLogLevel } = await import("node-llama-cpp");

    log.info(
      `[milaidy] Initializing embedding model: ${this.model} ` +
        `(dims=${this.dimensions}, gpuLayers=${this.gpuLayers})`,
    );

    if (!this.llama) {
      // Keep startup output quiet by default (npx milaidy should not print
      // tokenizer/model warnings unless they are actual errors).
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

    // Load model + create context with cleanup guard: if context creation
    // fails after model loads, dispose the model to avoid leaking native
    // allocations.
    const loadOpts = {
      modelPath,
      // node-llama-cpp accepts gpuLayers as number | "auto" | "max"
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
      // Clean up the successfully loaded model before rethrowing
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

    // Start idle timer
    this.startIdleTimer();
  }

  // ── Idle timeout management ─────────────────────────────────────────────

  private startIdleTimer(): void {
    this.stopIdleTimer();
    if (this.idleTimeoutMs <= 0) return;

    // Check every minute if idle timeout has been exceeded
    const checkIntervalMs = Math.min(this.idleTimeoutMs, 60_000);
    this.idleTimer = setInterval(() => {
      // Don't unload while embedding calls are in-flight
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

    // unref() so the timer doesn't prevent the process from exiting
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
    // Publish the unload promise so concurrent generateEmbedding() calls
    // can await it instead of racing with resource disposal.
    const unloadWork = this.releaseModelResources().then(() => {
      // Mark as not initialized so next call triggers lazy re-init
      this.initialized = false;
      this.unloading = null;
    });
    this.unloading = unloadWork;
    await unloadWork;
  }

  // ── Resource cleanup ────────────────────────────────────────────────────

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

// Re-export for convenience
export { EMBEDDING_META_PATH, readEmbeddingMeta, checkDimensionMigration };
