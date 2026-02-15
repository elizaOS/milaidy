# Implementation Plan: Optimize Local Embeddings for macOS

## Background

`@elizaos/plugin-local-embedding` is always loaded as a CORE_PLUGIN because the pi-ai provider (and all other remote providers) only handle `TEXT_LARGE`/`TEXT_SMALL`/`TEXT_REASONING_*` — none of them register a `TEXT_EMBEDDING` handler. The local embedding plugin is the sole provider of `TEXT_EMBEDDING`, which is required by ElizaOS's memory/knowledge/RAG system.

### Current Problems
1. **CPU-only execution**: The plugin hardcodes `gpuLayers: 0`, ignoring Apple Silicon Metal GPU entirely
2. **Outdated model**: Uses `bge-small-en-v1.5` (384 dims, ~28MB) — there are significantly better models now
3. **No idle unloading**: The model stays resident in memory forever, even when not used
4. **No Milaidy-level config**: Embedding model/dimensions aren't configurable through `milaidy.json`

### Architecture

Since `@elizaos/plugin-local-embedding` is an upstream ElizaOS npm package we don't control, all changes must be applied at the **Milaidy wrapper layer** — intercepting, wrapping, or replacing the plugin's behavior in `src/runtime/eliza.ts` and new Milaidy-owned modules.

The upstream plugin uses `node-llama-cpp` which supports:
- `gpuLayers: "auto" | "max" | number` — Metal acceleration on Apple Silicon
- `LlamaModel.dispose()` / `LlamaEmbeddingContext.dispose()` — clean resource release
- Any GGUF embedding model from HuggingFace

---

## Tasks

### Task 1: Create embedding wrapper module
- [x] **File**: `src/runtime/embedding-manager.ts` (new)
- **What**: Create a `MilaidyEmbeddingManager` class that wraps the upstream `LocalAIManager` singleton and adds:
  - **Metal GPU support**: Load models with `gpuLayers: "auto"` instead of `0` when on Apple Silicon (detect via `process.platform === "darwin"` + `node-llama-cpp`'s Metal backend from `@node-llama-cpp/mac-arm64-metal`)
  - **Idle timeout unloading**: Track `lastUsedAt` timestamp on every `generateEmbedding()` call. Start a 30-minute interval timer. When the timer fires and `Date.now() - lastUsedAt > 30 * 60 * 1000`, call `embeddingContext.dispose()` and `embeddingModel.dispose()` to release memory. Set `embeddingInitialized = false` so next call triggers lazy re-init.
  - **Configurable model**: Accept model name, dimensions, and GPU layer settings from Milaidy config (passed in at construction)
  - **Warm restart**: When `generateEmbedding()` is called after idle unload, transparently re-initialize (the existing lazy init pattern in `LocalAIManager.lazyInitEmbedding()` already supports this — we just need to reset the flags)
- **API**:
  ```typescript
  interface EmbeddingManagerConfig {
    /** GGUF model filename (default: "nomic-embed-text-v1.5.Q5_K_M.gguf") */
    model?: string;
    /** HuggingFace repo for auto-download (default: "nomic-ai/nomic-embed-text-v1.5-GGUF") */
    modelRepo?: string;
    /** Embedding dimensions (default: 768) */
    dimensions?: number;
    /** GPU layers: "auto" | "max" | number (default: "auto" on macOS, 0 elsewhere) */
    gpuLayers?: "auto" | "max" | number;
    /** Idle timeout in ms before unloading model (default: 1800000 = 30 min, 0 = never unload) */
    idleTimeoutMs?: number;
    /** Models directory (default: ~/.eliza/models) */
    modelsDir?: string;
  }

  class MilaidyEmbeddingManager {
    constructor(config: EmbeddingManagerConfig);
    generateEmbedding(text: string): Promise<number[]>;
    dispose(): Promise<void>;
    isLoaded(): boolean;
    getStats(): { lastUsedAt: number | null; isLoaded: boolean; model: string; gpuLayers: string | number };
  }
  ```
- **Implementation notes**:
  - Import `getLlama` from `node-llama-cpp` directly (it's already a dependency)
  - Use `DownloadManager` pattern from the upstream plugin for model downloads (HTTPS from HuggingFace)
  - Default model: **`nomic-embed-text-v1.5.Q5_K_M.gguf`** from `nomic-ai/nomic-embed-text-v1.5-GGUF` — 768 dimensions, excellent retrieval quality, Metal-optimized, widely benchmarked
  - The idle timer should use `setInterval` with `unref()` so it doesn't keep the process alive
  - On dispose, also clear the interval timer

### Task 2: Add embedding config types and schema
- [x] **Files**: `src/config/types.milaidy.ts`, `src/config/schema.ts`, `src/config/zod-schema.ts`
- **What**: Add an `embedding` section to `MilaidyConfig`:
  ```typescript
  // In types.milaidy.ts — add to MilaidyConfig interface:
  /** Local embedding model configuration. */
  embedding?: {
    /** GGUF model filename (e.g. "nomic-embed-text-v1.5.Q5_K_M.gguf") */
    model?: string;
    /** HuggingFace repo for auto-download */
    modelRepo?: string;
    /** Embedding vector dimensions */
    dimensions?: number;
    /** GPU layers for model loading: "auto", "max", or a number */
    gpuLayers?: "auto" | "max" | number;
    /** Minutes of inactivity before unloading model from memory (default: 30, 0 = never) */
    idleTimeoutMinutes?: number;
  };
  ```
- Also add corresponding entries in `schema.ts` (description strings for the config UI) and `zod-schema.ts` (validation)

### Task 3: Wire embedding manager into eliza.ts runtime startup
- [x] **File**: `src/runtime/eliza.ts`
- **What**: Replace the upstream `plugin-local-embedding`'s `TEXT_EMBEDDING` handler with our optimized `MilaidyEmbeddingManager`:
  1. After pre-registering `plugin-local-embedding` (existing step 7d), create a `MilaidyEmbeddingManager` instance with config from `config.embedding`
  2. Register a **higher-priority** `TEXT_EMBEDDING` model handler on the runtime that delegates to `MilaidyEmbeddingManager.generateEmbedding()`. Use priority `100` (upstream plugin uses priority `10` via the plugin models mechanism)
  3. The upstream plugin still loads (it also provides `TEXT_TOKENIZER_ENCODE`/`TEXT_TOKENIZER_DECODE` which we need), but our handler wins for `TEXT_EMBEDDING` due to higher priority
  4. Store the manager reference so it can be disposed on shutdown
  5. In the shutdown handler, call `manager.dispose()` to clean up
  6. In the hot-reload `onRestart` callback, dispose the old manager and create a new one from fresh config
- **Key code location**: Around line ~1990 in `eliza.ts`, after the `localEmbeddingPlugin` pre-registration block
- **Registration pattern**:
  ```typescript
  import { ModelType } from "@elizaos/core";
  // After local-embedding pre-registration:
  const embeddingManager = new MilaidyEmbeddingManager({
    model: config.embedding?.model,
    modelRepo: config.embedding?.modelRepo,
    dimensions: config.embedding?.dimensions,
    gpuLayers: config.embedding?.gpuLayers ?? (process.platform === "darwin" ? "auto" : 0),
    idleTimeoutMs: (config.embedding?.idleTimeoutMinutes ?? 30) * 60 * 1000,
  });
  runtime.registerModel(
    ModelType.TEXT_EMBEDDING,
    async (_runtime, params) => {
      const text = typeof params === "string" ? params : params?.text;
      if (!text) return new Array(config.embedding?.dimensions ?? 768).fill(0);
      return embeddingManager.generateEmbedding(text);
    },
    "milaidy", // provider name (required by runtime.registerModel signature)
    100,       // higher priority than upstream plugin's 10
  );
  ```

### Task 4: Handle dimension migration / compatibility
- [x] **File**: `src/runtime/embedding-manager.ts` (extend)
- **What**: The upstream plugin uses 384-dimension embeddings. Switching to 768-dimension `nomic-embed-text-v1.5` means existing embeddings in the database become incompatible (cosine similarity between different-dimension vectors is undefined).
  - Add a startup log warning when dimensions change: `"[milaidy] Embedding dimensions changed (384 → 768). Existing memory embeddings will be re-indexed on next access."`
  - Store the active dimensions in a small metadata file at `~/.milaidy/state/embedding-meta.json` (`{ model, dimensions, lastChanged }`)
  - On startup, compare current config dimensions vs stored. If different, log the warning and update the file.
  - The actual re-indexing is handled by ElizaOS core (it re-embeds on mismatch) — we just need to not crash on dimension mismatch and log clearly.
  - Ensure the zero-vector fallback uses the correct dimension count from config (not hardcoded 384).

### Task 5: Write tests
- [x] **File**: `src/runtime/embedding-manager.test.ts` (new)
- **What**: Unit tests for the `MilaidyEmbeddingManager`:
  1. **Config defaults**: Verify default model, dimensions, GPU layers per platform
  2. **macOS GPU detection**: When `process.platform === "darwin"`, default `gpuLayers` should be `"auto"`
  3. **Non-macOS default**: When not darwin, default `gpuLayers` should be `0`
  4. **Idle timeout**: Mock timer advancement to verify `dispose()` is called after 30 min of inactivity
  5. **Idle reset on use**: Verify `lastUsedAt` updates on `generateEmbedding()` calls, preventing premature unload
  6. **Re-initialization after unload**: After idle dispose, next `generateEmbedding()` should re-init successfully
  7. **Explicit dispose**: `dispose()` clears timer and releases model
  8. **Stats reporting**: `getStats()` returns correct state
  9. **Dimension mismatch logging**: Verify warning logged when dimensions change from stored value
- **Mocking**: Mock `node-llama-cpp`'s `getLlama()`, `loadModel()`, `createEmbeddingContext()`, and `getEmbeddingFor()` — don't download/load real models in unit tests
- Also update `src/runtime/eliza.test.ts`:
  10. Verify the existing `"should keep @elizaos/plugin-local-embedding"` tests still pass
  11. Add a test that the Milaidy embedding handler is registered at priority 100

### Task 6: Update existing test assertions
- [x] **File**: `src/runtime/eliza.test.ts`
- **What**: The existing tests reference `@elizaos/plugin-local-embedding` — make sure they still pass after our changes. The plugin is still loaded (for tokenizer), just its `TEXT_EMBEDDING` handler is superseded. No test changes should be needed unless we modify `CORE_PLUGINS` or `collectPluginNames` (we don't).

---

## Model Choice Rationale

**`nomic-embed-text-v1.5`** was selected because:
- **Quality**: Top-tier on MTEB retrieval benchmarks, significantly better than bge-small
- **768 dimensions**: Good balance of quality vs. storage/compute (vs. 384 for bge-small or 1024 for larger models)
- **GGUF available**: Official GGUF quantizations on HuggingFace (`nomic-ai/nomic-embed-text-v1.5-GGUF`)
- **Metal optimized**: Works well with node-llama-cpp's Metal backend on Apple Silicon
- **Context size**: 8192 tokens (vs 512 for bge-small) — handles longer documents
- **~67MB Q5_K_M**: Reasonable size, fast to download

The Q5_K_M quantization preserves nearly all embedding quality while keeping the file small.

## Files Modified Summary

| File | Change |
|------|--------|
| `src/runtime/embedding-manager.ts` | **NEW** — Core embedding manager with Metal GPU, idle unload, configurable model |
| `src/runtime/embedding-manager.test.ts` | **NEW** — Unit tests |
| `src/config/types.milaidy.ts` | Add `embedding` section to `MilaidyConfig` |
| `src/config/schema.ts` | Add description strings for embedding config keys |
| `src/config/zod-schema.ts` | Add zod validation for embedding config |
| `src/runtime/eliza.ts` | Wire embedding manager, register high-priority handler, dispose on shutdown/hot-reload |
| `src/runtime/eliza.test.ts` | Verify existing tests pass, add priority registration test |

## Non-Goals (Out of Scope)
- Modifying the upstream `@elizaos/plugin-local-embedding` package
- Adding remote/API-based embedding providers (keep it local-only)
- Changing the database schema for embeddings (ElizaOS core handles dimension changes)
- GUI config UI for embedding settings (config file only for now)
