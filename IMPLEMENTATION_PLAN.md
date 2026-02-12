# Implementation Plan: Hardware-Adaptive Embedding Model Selection in Onboarding

## Background

Milaidy now has a `MilaidyEmbeddingManager` (`src/runtime/embedding-manager.ts`) that wraps `node-llama-cpp` with Metal GPU support, idle unloading, and configurable model selection. It's wired into the ElizaOS runtime at priority 100, superseding the upstream `@elizaos/plugin-local-embedding`'s hardcoded `bge-small-en-v1.5` (384 dims, CPU-only, 512 ctx).

Currently the manager defaults to `nomic-embed-text-v1.5` Q5_K_M (768 dims). This plan adds **auto-detection of hardware capabilities** during onboarding so the best embedding model is selected for each machine, with a user confirmation step.

### Current Architecture

- **`src/runtime/embedding-manager.ts`** — `MilaidyEmbeddingManager` class. Accepts `EmbeddingManagerConfig` with `model`, `modelRepo`, `dimensions`, `gpuLayers`, `idleTimeoutMs`, `modelsDir`. Handles lazy init, idle unload, dimension migration detection.
- **`src/config/types.milaidy.ts`** — `MilaidyConfig.embedding` section with `model`, `modelRepo`, `dimensions`, `gpuLayers`, `idleTimeoutMinutes`.
- **`src/config/zod-schema.ts`** — Zod validation for the embedding config section.
- **`src/config/schema.ts`** — UI labels and help text for embedding config fields.
- **`src/runtime/eliza.ts`** — Onboarding at `runFirstTimeSetup()` (line ~1137), embedding manager wired at step 7e (line ~2005), reads from `config.embedding.*`.

### What Needs to Change

1. **New module**: Hardware detection utility
2. **New module**: Embedding model presets (tier definitions)
3. **Extend onboarding**: Add an "Embedding Model" step that auto-detects hardware and confirms with the user
4. **Persist selection**: Write the chosen model to `config.embedding` during onboarding
5. **Update embedding-manager defaults**: Fall back to hardware-detected tier when no config is set
6. **Tests**

---

## Hardware Tiers

| Tier | Detection | GPU | Model | Dims | GGUF Size | Context | Repo |
|------|-----------|-----|-------|------|-----------|---------|------|
| **Fallback** | Intel Mac (`x64` + `darwin`) or ≤8GB RAM | CPU (`gpuLayers: 0`) | `nomic-embed-text-v1.5.Q4_K_S.gguf` | 768 | 74MB | 8192 | `nomic-ai/nomic-embed-text-v1.5-GGUF` |
| **Standard** | Apple Silicon + 16–64GB RAM | Metal (`gpuLayers: "auto"`) | `nomic-embed-text-v1.5.Q5_K_M.gguf` | 768 | 95MB | 8192 | `nomic-ai/nomic-embed-text-v1.5-GGUF` |
| **Performance** | Apple Silicon + 128GB+ RAM | Metal (`gpuLayers: "auto"`) | `e5-mistral-7b-instruct-Q5_K_M.gguf` | 4096 | 4.8GB | 32768 | `dranger003/e5-mistral-7b-instruct-GGUF` |

### Detection Logic

```typescript
import os from "node:os";

type EmbeddingTier = "fallback" | "standard" | "performance";

function detectEmbeddingTier(): EmbeddingTier {
  const totalRamGB = Math.round(os.totalmem() / (1024 ** 3));
  const isMac = process.platform === "darwin";
  const isAppleSilicon = isMac && process.arch === "arm64";

  if (!isAppleSilicon || totalRamGB <= 8) return "fallback";
  if (totalRamGB >= 128) return "performance";
  return "standard";
}
```

### Design Notes

- **Fallback and Standard share 768 dimensions** — embeddings are portable between these tiers, and upgrading from an Intel Mac to a Silicon Mac requires no re-indexing.
- **Performance tier uses 4096 dimensions** — switching to/from this tier triggers a dimension migration warning (already implemented in `checkDimensionMigration()` in `embedding-manager.ts`). ElizaOS core handles re-embedding on mismatch.
- **`e5-mistral-7b-instruct`** is a full Mistral-7B model fine-tuned for embeddings — SOTA retrieval quality, 32K token context. At Q5_K_M it's ~4.8GB, trivial for 128GB+ machines.
- The GGUF file for e5-mistral is at: `https://huggingface.co/dranger003/e5-mistral-7b-instruct-GGUF/resolve/main/ggml-e5-mistral-7b-instruct-q5_k_m.gguf` (note: filename uses `ggml-` prefix and lowercase, verify on download).

---

## Tasks

### Task 1: Create hardware detection + embedding presets module
- [x] **File**: `src/runtime/embedding-presets.ts` (NEW)
- **What**: Export the tier detection function and preset definitions.
- **API**:
  ```typescript
  export type EmbeddingTier = "fallback" | "standard" | "performance";

  export interface EmbeddingPreset {
    tier: EmbeddingTier;
    label: string;           // Human-readable label for onboarding UI
    description: string;     // One-line description shown in onboarding
    model: string;           // GGUF filename
    modelRepo: string;       // HuggingFace repo
    dimensions: number;
    gpuLayers: "auto" | 0;
    contextSize: number;     // For display purposes
    downloadSizeMB: number;  // Approximate, for display
  }

  /** All available presets, indexed by tier. */
  export const EMBEDDING_PRESETS: Record<EmbeddingTier, EmbeddingPreset>;

  /** Detect the best embedding tier for the current hardware. */
  export function detectEmbeddingTier(): EmbeddingTier;

  /** Get the preset for the current hardware. */
  export function detectEmbeddingPreset(): EmbeddingPreset;
  ```
- **Preset values** — use the table above. Label examples:
  - Fallback: `"Efficient (CPU)"` — `"768-dim, 74MB download — best for Intel Macs and low-RAM machines"`
  - Standard: `"Balanced (Metal GPU)"` — `"768-dim, 95MB download — great quality with Metal acceleration"`
  - Performance: `"Maximum (7B model)"` — `"4096-dim, 4.8GB download — SOTA retrieval quality, 32K context"`

### Task 2: Add onboarding step for embedding model selection
- [x] **File**: `src/runtime/eliza.ts` — inside `runFirstTimeSetup()`
- **What**: Add a new **Step 4b** (after Step 4: Model provider, before Step 5: Wallet setup) that:
  1. Calls `detectEmbeddingTier()` to determine the recommended preset
  2. Shows the user what was detected with `clack.log.message()`:
     ```
     ${name}: I detected your hardware — [Apple Silicon M2 Ultra, 48GB RAM]
     Recommended embedding model: Balanced (Metal GPU)
       → nomic-embed-text-v1.5 Q5_K_M (768 dims, 95MB, 8192 token context)
     ```
  3. Asks to confirm or override via `clack.select()`:
     ```
     options: [
       { value: detected.tier, label: `${detected.label} (recommended)`, hint: detected.description },
       ...otherPresets.map(p => ({ value: p.tier, label: p.label, hint: p.description })),
     ]
     ```
  4. Only show tiers the hardware can actually run (don't show Performance on a 16GB machine, don't show Metal tiers on Intel).
  5. Store the chosen tier as a variable (`chosenEmbeddingPreset`) for Step 7.
- **Skip conditions**: Skip this step in cloud mode (`runMode === "cloud"`) — cloud handles its own embeddings.
- **Key insertion point**: After the provider API key collection (line ~1417) and before wallet setup (line ~1419). The hardware info for display can use:
  ```typescript
  const cpuModel = os.cpus()[0]?.model ?? "Unknown CPU";
  const ramGB = Math.round(os.totalmem() / (1024 ** 3));
  ```

### Task 3: Persist embedding selection to config
- [x] **File**: `src/runtime/eliza.ts` — inside `runFirstTimeSetup()`, Step 7
- **What**: In the config persistence section (line ~1533), write the chosen embedding preset to `config.embedding`:
  ```typescript
  if (chosenEmbeddingPreset) {
    updated.embedding = {
      model: chosenEmbeddingPreset.model,
      modelRepo: chosenEmbeddingPreset.modelRepo,
      dimensions: chosenEmbeddingPreset.dimensions,
      gpuLayers: chosenEmbeddingPreset.gpuLayers,
    };
  }
  ```
- This gets persisted to `~/.milaidy/milaidy.json` via `saveMilaidyConfig(updated)` (already called at line ~1590).
- On next startup, the embedding manager reads from `config.embedding.*` (step 7e, line ~2010).

### Task 4: Update embedding-manager to use tier detection as fallback
- [x] **File**: `src/runtime/embedding-manager.ts`
- **What**: When no explicit config is provided (first run before onboarding persists), use `detectEmbeddingPreset()` to pick intelligent defaults instead of hardcoding nomic Q5_K_M:
  ```typescript
  import { detectEmbeddingPreset } from "./embedding-presets.js";

  // In constructor, replace hardcoded defaults:
  const detected = detectEmbeddingPreset();
  this.model = config.model ?? detected.model;
  this.modelRepo = config.modelRepo ?? detected.modelRepo;
  this.dimensions = config.dimensions ?? detected.dimensions;
  this.gpuLayers = config.gpuLayers ?? detected.gpuLayers;
  ```
- Also update the `DEFAULT_MODEL`, `DEFAULT_REPO`, `DEFAULT_DIMENSIONS` constants to be derived from `detectEmbeddingPreset()` or remove them in favor of the function.

### Task 5: Write tests
- [x] **File**: `src/runtime/embedding-presets.test.ts` (NEW)
- **What**:
  1. **Tier detection — Apple Silicon high RAM**: Mock `process.arch = "arm64"`, `process.platform = "darwin"`, `os.totalmem() = 128GB` → `"performance"`
  2. **Tier detection — Apple Silicon 16GB**: → `"standard"`
  3. **Tier detection — Apple Silicon 8GB**: → `"fallback"`
  4. **Tier detection — Intel Mac**: Mock `process.arch = "x64"`, `process.platform = "darwin"` → `"fallback"`
  5. **Tier detection — Linux**: Mock `process.platform = "linux"` → `"fallback"`
  6. **Preset fields**: Each preset has required fields (model, modelRepo, dimensions, gpuLayers)
  7. **Performance preset has 4096 dims**: Verify the high-tier preset uses e5-mistral dimensions
  8. **Fallback and Standard share 768 dims**: Verify dimension portability
- [x] **File**: `src/runtime/embedding-manager.test.ts` (extend)
  9. **Verify constructor uses detected defaults**: When no config provided, the model/dims/gpu should match the detected tier for the current platform.
- **Mocking**: Use `Object.defineProperty(process, "platform", ...)` and `vi.spyOn(os, "totalmem")` patterns (already used in existing embedding-manager tests).

### Task 6: Update existing embedding-manager tests for new defaults
- [x] **File**: `src/runtime/embedding-manager.test.ts`
- **What**: Some existing tests hardcode `"nomic-embed-text-v1.5.Q5_K_M.gguf"` as the expected default model. After Task 4, defaults are tier-dependent. Update tests to either:
  - Pass explicit config (so they don't depend on detected defaults), OR
  - Assert against the detected preset for the test environment

---

## Files Summary

| File | Change |
|------|--------|
| `src/runtime/embedding-presets.ts` | **NEW** — Tier definitions, hardware detection |
| `src/runtime/embedding-presets.test.ts` | **NEW** — Unit tests for tier detection |
| `src/runtime/eliza.ts` | Add Step 4b to `runFirstTimeSetup()`, persist in Step 7 |
| `src/runtime/embedding-manager.ts` | Use `detectEmbeddingPreset()` as default fallback |
| `src/runtime/embedding-manager.test.ts` | Update for tier-based defaults |

## Existing Files for Reference (read these first)

| File | Why |
|------|-----|
| `src/runtime/embedding-manager.ts` | The manager class you'll be configuring — understand `EmbeddingManagerConfig` |
| `src/runtime/eliza.ts` lines 1137–1600 | The `runFirstTimeSetup()` onboarding flow — match the existing step pattern |
| `src/config/types.milaidy.ts` | `MilaidyConfig.embedding` type definition |
| `src/config/zod-schema.ts` | Zod schema for embedding config validation |
| `src/runtime/embedding-manager.test.ts` | Existing tests — understand mocking patterns |
| `src/onboarding-presets.ts` | Style presets pattern — similar data structure approach |
| `AGENTS.md` | Build/test/lint commands |

## Non-Goals

- Changing the upstream `@elizaos/plugin-local-embedding` package
- Adding Linux/Windows GPU support (CUDA/Vulkan) — macOS-first, others get CPU fallback
- GUI onboarding for embedding selection (CLI only for now; GUI can read persisted config)
- Downloading models during onboarding (just persist the choice; download happens lazily on first embedding call)

## Verification

After implementation:
```bash
bun run test          # All tests pass (currently 1135)
npx tsc --noEmit      # No type errors
bun run check         # Biome lint clean
bun run build         # tsdown builds without errors
```
