# Codebase Quality Fixes — Comprehensive Spec

**Date:** 2026-03-20
**Branch:** `fix/codebase-quality-audit`
**Scope:** 27 issues across 20+ files, organized into 4 tiered PRs
**Base:** `develop` @ `944a2e0e`

---

## Overview

A systematic code review identified 27 actionable issues spanning security vulnerabilities, resource leaks, error handling gaps, and maintainability problems. This spec defines the fix for every issue, organized into four priority tiers that ship as independent PRs.

### Tier Summary

| Tier | Focus | Issues | Files | Risk |
|------|-------|--------|-------|------|
| T1 | Security | 6 | 5 | High-impact, low-risk fixes |
| T2 | Resource Leaks & Memory | 6 | 4 | Medium-risk (lifecycle changes) |
| T3 | Error Handling & Correctness | 8 | 7 | Medium-risk (control flow changes) |
| T4 | Maintainability & DRY | 7 | 8 | Low-risk refactoring |

---

## T1 — Security Fixes

### ~~S1. Timing-safe auth — NO FIX NEEDED~~

**File:** `src/benchmark/server.ts:75`
**Status:** Removed from scope. The `&& false` is intentional and correct. When token lengths differ, the code pads `b` to `a`'s length, runs `timingSafeEqual` to burn constant time (preventing a timing oracle), then returns `false` because mismatched-length tokens must always fail. Removing `&& false` would introduce a prefix-attack vulnerability.

### S2. API keys in URL query params

**File:** `src/providers/media-provider.ts:634,687,762`
**Problem:** Google and xAI providers embed API keys as `?key=` in URLs. These leak into server logs, proxies, and browser history.
**Fix:** Move to `x-goog-api-key` header for Google (their documented approach) and `Authorization: Bearer` header for xAI. Remove key from URL string.

### S3. Path traversal via HuggingFace filenames

**File:** `src/providers/local-models.ts:327`
**Problem:** Filenames from HuggingFace API are interpolated into `path.join()` without sanitization. A malicious repo could use `../../` in filenames to write outside the cache directory.
**Fix:** Add a `validateFilename()` guard that rejects any filename containing `..`, `\`, or starting with `/`. Apply before both URL construction and directory creation.

### S4. Empty API key fallback

**File:** `src/providers/media-provider.ts:330,382,438,495,552,625,678,750,809,861,1096,1170`
**Problem:** 12 provider constructors use `config.apiKey ?? ""`, silently sending requests with empty auth headers instead of failing fast.
**Fix:** Throw `Error("<Provider> API key is required")` in each constructor when `apiKey` is falsy. Factory functions already check config existence — this is defense-in-depth.

### S5. Plugin path traversal from config

**File:** `src/cli/plugins-cli.ts:477,601,625,670,917,918,920`
**Problem:** `resolveUserPath(p)` is called on paths from `milady.json` at multiple call sites without validating the result stays within expected boundaries.
**Fix:** Create a `validatePluginPath(resolved: string): void` helper that checks: (1) the path is absolute, (2) it starts with `os.homedir()` or `process.cwd()`. Call this helper after every `resolveUserPath()` invocation that operates on user-supplied config paths (lines 477, 601, 625, 670). The interactive CLI paths (lines 917-920) where the user types a path directly do not need guarding — only paths loaded from `milady.json` config. Throw with message: `"Plugin path ${resolved} is outside allowed boundaries"`.

### S6. Weak phone number validation

**File:** `src/plugins/whatsapp/service.ts:312-313`
**Problem:** Line 312 strips non-digits via `replace(/[^0-9]/g, "")`, line 313 checks `length >= 8`. This accepts garbage inputs that happen to contain 8+ digits.
**Fix:** Before stripping, validate the raw input against E.164 format (`/^\+?[1-9]\d{1,14}$/`). Reject non-conforming numbers with error: `"Invalid phone number format, expected E.164"`.

### S7. Path components not validated in subdirectory creation

**File:** `src/providers/local-models.ts:332`
**Problem:** `filename.split("/")` path components used in `path.join()` without validation.
**Fix:** Same `validateFilename()` guard from S3 covers this. Reject components containing `..`, `\`, or empty segments.

---

## T2 — Resource Leaks & Memory

### R1. WhatsApp event listener leak

**File:** `src/plugins/whatsapp/service.ts:165,167,233`
**Problem:** Three `ev.on()` listeners (`creds.update`, `connection.update`, `messages.upsert`) are registered on socket creation but never removed. Each reconnect adds new listeners.
**Fix:** Store handler references as class properties. In `stop()`, call `this.sock.ev.off()` for each before closing the socket:

```typescript
private connectionHandler?: (...args: unknown[]) => void;
// In connect(): this.connectionHandler = (update) => { ... };
// In stop():   this.sock?.ev.off("connection.update", this.connectionHandler);
```

### R2. TUI bridge event listener leak

**File:** `src/tui/eliza-tui-bridge.ts:275,317`
**Problem:** `registerEvent()` callbacks are never cleaned up in `dispose()`.
**Fix:** Add `private eventRegistrations: Array<() => void>` to accumulate unregister handles returned by `registerEvent()`. In `dispose()`, iterate and call each, then clear the array.

### R3. Stream reader not released on exception

**File:** `src/tui/eliza-tui-bridge.ts:695-756`
**Problem:** `res.body.getReader()` is acquired but never cancelled if `parsePayload()` throws or the loop breaks early.
**Fix:** Wrap the streaming loop in `try { ... } finally { reader.cancel(); }`.

### R4. Unbounded session maps

**File:** `src/benchmark/server.ts:784-787`
**Problem:** `sessions`, `roomToSession`, `entityToSession`, `trajectoriesBySession`, `outboxBySession` grow forever with no cleanup.
**Fix:** Add a `sessionCreatedAt` map tracking creation timestamps. Define `SESSION_TTL_MS = 24 * 60 * 60 * 1000` and `SESSION_SWEEP_INTERVAL_MS = 60_000` as module-level constants (overridable in tests). Add a `setInterval` at `SESSION_SWEEP_INTERVAL_MS` that evicts entries older than `SESSION_TTL_MS` across all five maps. Clear the interval on server close. Tests can override the constants to use short TTLs (e.g., 100ms) without mocking timers.

### R5. Unbounded streamed text accumulation

**File:** `src/tui/eliza-tui-bridge.ts:714,737`
**Problem:** `mergeStreamingText()` accumulates with no bound. A malicious or buggy server could exhaust memory.
**Fix:** Add `MAX_STREAMED_LENGTH = 1_000_000` (1MB) constant. Check length after each merge; if exceeded, truncate and emit a warning via the TUI.

### R6. No fetch timeout on media providers

**File:** `src/providers/media-provider.ts` (all fetch calls)
**Problem:** ~20 fetch calls have no timeout. Hung servers block indefinitely.
**Fix:** Introduce a shared helper at the top of the file:

```typescript
function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}
```

Replace all bare `fetch()` calls with `fetchWithTimeout()`.

---

## T3 — Error Handling & Correctness

### C1. No try-catch on fetch calls

**File:** `src/providers/media-provider.ts` (20+ locations)
**Problem:** Every `generate()` and `analyze()` method calls `fetch()` without wrapping. Network failures throw uncaught.
**Fix:** Wrap fetch + response parsing in each method with try-catch, returning `{ success: false, error: \`[${this.name}] Network error: ${msg}\` }`. Standardize error format across all providers.

### C2. JSON.parse crashes server on malformed input

**File:** `src/benchmark/server.ts:1092`
**Problem:** `JSON.parse(body)` is inside a broad try-catch. Parse errors and logic errors produce the same 500 response.
**Fix:** Separate the parse step with its own try-catch returning 400 with `"Invalid JSON in request body"` before entering the logic block.

### C3. Missing re-export for `resolvePackageEntry`

**File:** `src/cli/plugins-cli.ts:457,534`
**Problem:** `resolvePackageEntry` is dynamically imported from `../runtime/eliza` (line 457) and called at line 534, but `src/runtime/eliza.ts` re-exports from `@elizaos/autonomous/runtime/eliza` which does not expose this function. This causes a runtime error when the "test" command is used.
**Fix:** Verify whether `resolvePackageEntry` exists in `@elizaos/autonomous`. If it does but isn't exported, add the export. If it was removed upstream, the "test" command code path (lines 530-560) is dead code — remove it and the corresponding import destructuring at line 457.

### C4. Duplicate condition (dead code)

**File:** `src/benchmark/server.ts:696-697`
**Problem:** `process.env.MILADY_BENCH_MOCK === "true"` duplicated on consecutive lines.
**Fix:** Remove the duplicate line.

### C5. Silent partial download marks model as complete

**File:** `src/providers/local-models.ts:340-345`
**Problem:** Failed file downloads are `continue`'d past with `console.warn`. Model is marked downloaded even if critical files are missing.
**Fix:** Define two file categories: **weight files** (`*.safetensors`, `*.bin`, `*.gguf`) and **config files** (`config.json`, `tokenizer.json`). After the download loop completes, validate: (1) at least one weight file was successfully downloaded, and (2) `config.json` was successfully downloaded. If either condition fails, throw `Error("Model download incomplete: missing required files")` and clean up the partial directory. Individual optional files (README, LICENSE, etc.) can still warn-and-skip during the loop.

### C6. Concurrent downloadModel() races on manifest writes

**File:** `src/providers/local-models.ts:275+`
**Problem:** Two concurrent calls for the same model can both proceed and race on `saveManifest()`.
**Fix:** Add early return if `isModelDownloaded()`, plus a `downloadLocks` map of `Promise` per modelId so the second caller awaits the first:

```typescript
private downloadLocks = new Map<string, Promise<string>>();

async downloadModel(modelId: string, ...): Promise<string> {
  if (this.isModelDownloaded(modelId)) return this.manifest[modelId].path;
  const existing = this.downloadLocks.get(modelId);
  if (existing) return existing;
  const promise = this._doDownload(modelId, ...);
  this.downloadLocks.set(modelId, promise);
  try { return await promise; } finally { this.downloadLocks.delete(modelId); }
}
```

### C7. activeSession mutated by concurrent requests

**File:** `src/benchmark/server.ts:837-862,888-898`
**Problem:** Global `activeSession` is mutated by every request. Two concurrent requests clobber each other's session state.
**Fix:** Replace `let activeSession` with a `lastSessionKey: string | null` that tracks only the key (not the object reference). Update it in `resolveSession()` when a session is created or accessed. The `/diagnostics` endpoint (line 888-898) currently reads `activeSession` for its response payload — replace with a lookup: `const active = lastSessionKey ? sessions.get(lastSessionKey) : null`. The `/outbox` and `/trajectory` endpoints use `resolveSession(taskId, benchmark, false)` only, falling back to `resolveSession("default-task", "unknown", false)` as last resort, returning 404 if no session matches. This removes the shared mutable object reference while preserving the diagnostics "most recently used session" behavior.

### C8. Reconnect callback runs after stop()

**File:** `src/plugins/whatsapp/service.ts:220-227`
**Problem:** The `setTimeout` reconnect callback can fire after `stop()` clears the timer reference.
**Fix:** Add `private stopped = false` flag. Set it in `stop()`. Check at the top of the reconnect callback — if stopped, return immediately.

### C9. Silent build failure copies broken output

**File:** `src/services/plugin-installer.ts:682-688`
**Problem:** Build errors are `.catch()`'d with a warning, then broken output is copied to target.
**Fix:** Change from `.catch()` to `try/await/catch`. Set a `buildFailed` flag. If build failed, skip copy from `tsDir` and fall back to copying the raw source directory. Log: `"TypeScript build failed, installing raw source"`.

---

## T4 — Maintainability & DRY

### M1. Duplicated `serialise()` function (3 copies)

**Files:** `src/services/core-eject.ts:28-36` + `src/services/plugin-eject.ts:27-34` + `src/services/plugin-installer.ts:77-84`
**Problem:** Three identical copies of the promise-chain serialization function, each with its own module-level lock variable (`ejectLock`, `ejectLock`, `installLock`).
**Fix:** Extract to `src/services/serialise.ts` exporting a **factory function** `createSerialiser()` that returns a lock-scoped `serialise<T>` function. Each consumer creates its own independent serialiser, preserving the current behavior where eject, plugin-eject, and install operations do not block each other:

```typescript
export function createSerialiser() {
  let lock: Promise<void> = Promise.resolve();
  return function serialise<T>(fn: () => Promise<T>): Promise<T> {
    let resolve: (() => void) | undefined;
    const prev = lock;
    lock = new Promise<void>((r) => { resolve = r; });
    return prev.then(fn).finally(() => resolve?.());
  };
}
```

All three files import `createSerialiser` and call it at module scope to create their own lock instance.

### M2. Copy-paste ElizaCloud providers

**File:** `src/providers/media-provider.ts:127-317`
**Problem:** Four ElizaCloud classes share identical structure — only endpoint path and type parameters differ.
**Fix:** Create a generic `ElizaCloudProvider<TOptions, TResult>` base class with configurable endpoint. Each concrete provider becomes a thin subclass:

```typescript
class ElizaCloudImageProvider extends ElizaCloudProvider<
  ImageGenerationOptions,
  ImageGenerationResult
> {
  name = "eliza-cloud";
  constructor(baseUrl: string, apiKey?: string) {
    super(baseUrl, "/media/image/generate", apiKey);
  }
}
```

Reduces ~190 lines to ~40.

### M3. Duplicate action handler pattern

**File:** `src/actions/media.ts`
**Problem:** All four handlers follow identical steps: extract params, validate, load config, create provider, call, handle result.
**Fix:** Extract a `mediaActionHandler<T>()` higher-order function parameterized by provider factory and validation rules. Each action's `handler` becomes a one-liner.

### M4. Giant WhatsApp incoming message handler

**File:** `src/plugins/whatsapp/service.ts:342-485`
**Problem:** 143-line function with 5+ nesting levels.
**Fix:** Extract three private methods:
- `buildMessageMemory(msg, jid, ...)` — constructs memory object
- `routeIncomingMessage(memory, roomId, ...)` — routing/callback logic
- `resolveMessageCallbacks(entityId, text)` — processes pending callbacks

Parent method becomes orchestrator, each extracted method under 50 lines.

### M5. Giant benchmark message handler

**File:** `src/benchmark/server.ts:1078-1237`
**Problem:** 150-line handler nested in `req.on('data')` / `req.on('end')` callbacks.
**Fix:** Extract `collectBody(req, maxBytes): Promise<string>` utility (reusable for `/reset` and `/message`). Extract `handleBenchmarkMessage(req, res, body, runtime, resolveSession)`. Route handler becomes a 5-line dispatcher.

### M6. Giant TUI submit handler

**File:** `src/tui/index.ts:305-549`
**Problem:** 245-line callback handling all slash commands.
**Fix:** Create a `Map<string, CommandHandler>` registry. Each command becomes a named async function (20-40 lines). The `setOnSubmit` callback becomes a dispatcher that looks up the command and delegates.

---

## Testing Strategy

### T1 (Security)
- Test Google/xAI providers send keys in headers, not URLs
- Test `validateFilename()` rejects `..`, `\`, and absolute paths
- Test phone validation rejects invalid formats, accepts valid E.164
- Test plugin path validation rejects traversal attempts

### T2 (Resource Leaks)
- Test `dispose()` / `stop()` calls `ev.off()` for each registered listener
- Test stream reader is cancelled on error (mock readable stream)
- Test session eviction fires after TTL
- Test `fetchWithTimeout` fires `AbortError` after timeout

### T3 (Correctness)
- Test fetch network error returns `{ success: false }`, does not throw
- Test malformed JSON to `/api/benchmark/message` returns 400, not 500
- Test concurrent `downloadModel()` calls resolve to same path without duplicate downloads
- Test reconnect callback is no-op after `stop()`
- Test build failure in plugin-installer falls back to raw source copy

### T4 (Maintainability)
- Existing tests must continue passing — pure refactors
- Run full test suite to verify no regressions

## Success Criteria

- All 27 issues addressed (S1 removed from scope — not a bug)
- All existing tests pass (`bun test`)
- Biome lint passes (`bun run lint`)
- Build succeeds (`bun run build`)
- No new `any` types introduced
- Each tier's PR is independently reviewable and mergeable

## PR Structure

| PR | Branch | Base | Scope |
|----|--------|------|-------|
| 1 | `fix/t1-security` | `develop` | S2-S7 (S1 removed — not a bug) |
| 2 | `fix/t2-resource-leaks` | `develop` | R1-R6 |
| 3 | `fix/t3-error-handling` | T2 merged | C1-C9 (rebases on T2 for media-provider.ts) |
| 4 | `fix/t4-maintainability` | `develop` | M1-M6 |

PRs ship in order T1 → T2 → T3 → T4. T1 is fully independent. **T2 and T3 have a merge dependency:** R6 (fetch timeout) and C1 (fetch try-catch) both modify the same ~20 fetch call sites in `media-provider.ts`. T2 must land first (introducing `fetchWithTimeout`), then T3 rebases and wraps those calls in try-catch. If merged out of order, the second PR will have conflicts at every fetch site.

T4 is independent of T1-T3 and can merge in any order relative to them.
