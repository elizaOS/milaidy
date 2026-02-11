/**
 * use-ui-stream.ts — React hook for JSONL-based progressive spec rendering.
 *
 * Consumes a streaming JSONL endpoint where each line is an RFC 6902
 * JSON Patch operation. Patches are applied incrementally to build up
 * a UiSpec that can be rendered by the ui-renderer.
 *
 * Exports:
 *   applyPatch()              — apply a single RFC 6902 patch op to an object
 *   createSpecStreamCompiler() — stateful JSONL → UiSpec compiler
 *   useUIStream()             — React hook for streaming spec construction
 *
 * @module use-ui-stream
 */

import { useState, useCallback, useRef } from "react";
import type { UiSpec, PatchOp, UIStreamConfig } from "./ui-spec";

// ── RFC 6901 JSON Pointer helpers ──────────────────────────────────────

/**
 * Parse an RFC 6901 JSON Pointer into an array of unescaped path segments.
 *
 * - Empty string `""` → empty array (references the whole document)
 * - `"/foo/bar"` → `["foo", "bar"]`
 * - `"/a~1b"` → `["a/b"]` (tilde escaping: `~1` → `/`)
 * - `"/m~0n"` → `["m~n"]` (tilde escaping: `~0` → `~`)
 */
function parsePointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) {
    throw new Error(`Invalid JSON Pointer: "${pointer}" (must start with "/" or be empty)`);
  }
  return pointer
    .slice(1)
    .split("/")
    .map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/**
 * Traverse an object along the given segments and return the value at the pointer.
 * Returns `undefined` if the path does not exist.
 */
function pointerGet(target: unknown, segments: string[]): unknown {
  let current: unknown = target;
  for (const seg of segments) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const idx = seg === "-" ? current.length : parseInt(seg, 10);
      if (isNaN(idx)) return undefined;
      current = current[idx];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Navigate to the parent of the target location, returning
 * `{ parent, key }` where `parent[key]` is the target location.
 *
 * Throws if the parent path does not exist.
 */
function pointerParent(
  target: Record<string, unknown>,
  segments: string[],
): { parent: Record<string, unknown> | unknown[]; key: string } {
  if (segments.length === 0) {
    throw new Error("Cannot get parent of root pointer");
  }
  const parentSegments = segments.slice(0, -1);
  const key = segments[segments.length - 1];
  let current: unknown = target;

  for (let i = 0; i < parentSegments.length; i++) {
    const seg = parentSegments[i];
    if (current == null || typeof current !== "object") {
      throw new Error(`Path segment "${seg}" does not exist on target`);
    }
    if (Array.isArray(current)) {
      const idx = parseInt(seg, 10);
      if (isNaN(idx)) throw new Error(`Invalid array index: "${seg}"`);
      current = current[idx];
    } else {
      const nextSeg = parentSegments[i + 1] ?? key;
      // Create intermediary objects/arrays if they don't exist
      if (!(seg in (current as Record<string, unknown>))) {
        (current as Record<string, unknown>)[seg] = /^\d+$/.test(nextSeg) || nextSeg === "-" ? [] : {};
      }
      current = (current as Record<string, unknown>)[seg];
    }
  }

  if (current == null || typeof current !== "object") {
    throw new Error("Parent of target location is not an object or array");
  }

  return { parent: current as Record<string, unknown> | unknown[], key };
}

// ── applyPatch ─────────────────────────────────────────────────────────

/**
 * Apply a single RFC 6902 JSON Patch operation to a target object (mutates in place).
 *
 * Supported operations: add, remove, replace, move, copy, test.
 * Uses RFC 6901 JSON Pointer path parsing with ~0/~1 escaping.
 *
 * @throws On "test" failure or invalid paths.
 */
export function applyPatch(target: Record<string, unknown>, patch: PatchOp): void {
  const segments = parsePointer(patch.path);

  switch (patch.op) {
    case "add": {
      if (segments.length === 0) {
        // Replace the whole document — copy all properties from value
        const val = patch.value as Record<string, unknown>;
        for (const k of Object.keys(target)) delete target[k];
        Object.assign(target, val);
        return;
      }
      const { parent, key } = pointerParent(target, segments);
      if (Array.isArray(parent)) {
        const idx = key === "-" ? parent.length : parseInt(key, 10);
        parent.splice(idx, 0, patch.value);
      } else {
        parent[key] = patch.value;
      }
      break;
    }

    case "remove": {
      if (segments.length === 0) {
        for (const k of Object.keys(target)) delete target[k];
        return;
      }
      const { parent, key } = pointerParent(target, segments);
      if (Array.isArray(parent)) {
        const idx = parseInt(key, 10);
        parent.splice(idx, 1);
      } else {
        delete parent[key];
      }
      break;
    }

    case "replace": {
      if (segments.length === 0) {
        const val = patch.value as Record<string, unknown>;
        for (const k of Object.keys(target)) delete target[k];
        Object.assign(target, val);
        return;
      }
      const { parent, key } = pointerParent(target, segments);
      if (Array.isArray(parent)) {
        const idx = parseInt(key, 10);
        parent[idx] = patch.value;
      } else {
        if (!(key in parent)) {
          throw new Error(`Replace target "${patch.path}" does not exist`);
        }
        parent[key] = patch.value;
      }
      break;
    }

    case "move": {
      const fromSegments = parsePointer(patch.from);
      const value = pointerGet(target, fromSegments);

      // Remove from source
      if (fromSegments.length === 0) {
        for (const k of Object.keys(target)) delete target[k];
      } else {
        const { parent: srcParent, key: srcKey } = pointerParent(target, fromSegments);
        if (Array.isArray(srcParent)) {
          srcParent.splice(parseInt(srcKey, 10), 1);
        } else {
          delete srcParent[srcKey];
        }
      }

      // Add at destination
      if (segments.length === 0) {
        const val = value as Record<string, unknown>;
        Object.assign(target, val);
      } else {
        const { parent: dstParent, key: dstKey } = pointerParent(target, segments);
        if (Array.isArray(dstParent)) {
          const idx = dstKey === "-" ? dstParent.length : parseInt(dstKey, 10);
          dstParent.splice(idx, 0, value);
        } else {
          dstParent[dstKey] = value;
        }
      }
      break;
    }

    case "copy": {
      const fromSegments = parsePointer(patch.from);
      // Deep clone the value to avoid shared references
      const value = structuredClone(pointerGet(target, fromSegments));

      if (segments.length === 0) {
        const val = value as Record<string, unknown>;
        for (const k of Object.keys(target)) delete target[k];
        Object.assign(target, val);
      } else {
        const { parent: dstParent, key: dstKey } = pointerParent(target, segments);
        if (Array.isArray(dstParent)) {
          const idx = dstKey === "-" ? dstParent.length : parseInt(dstKey, 10);
          dstParent.splice(idx, 0, value);
        } else {
          dstParent[dstKey] = value;
        }
      }
      break;
    }

    case "test": {
      const actual = pointerGet(target, segments);
      if (JSON.stringify(actual) !== JSON.stringify(patch.value)) {
        throw new Error(
          `Test failed: value at "${patch.path}" is ${JSON.stringify(actual)}, expected ${JSON.stringify(patch.value)}`,
        );
      }
      break;
    }
  }
}

// ── createSpecStreamCompiler ───────────────────────────────────────────

/** Create an empty UiSpec. */
function emptySpec(): UiSpec {
  return { root: "", elements: {}, state: {} };
}

/**
 * Stateful compiler that accumulates JSONL patch lines into a UiSpec.
 *
 * Each call to `push(line)` parses one JSONL line as a PatchOp,
 * applies it to the running spec, and returns the updated spec
 * plus the newly applied patches.
 */
export function createSpecStreamCompiler(): {
  push: (line: string) => { result: UiSpec; newPatches: PatchOp[] };
  getResult: () => UiSpec;
  getPatches: () => PatchOp[];
  reset: () => void;
} {
  let spec: Record<string, unknown> = emptySpec() as unknown as Record<string, unknown>;
  let patches: PatchOp[] = [];

  return {
    push(line: string): { result: UiSpec; newPatches: PatchOp[] } {
      const trimmed = line.trim();
      if (!trimmed) {
        return { result: spec as unknown as UiSpec, newPatches: [] };
      }

      const patch = JSON.parse(trimmed) as PatchOp;
      applyPatch(spec, patch);
      patches.push(patch);

      return { result: spec as unknown as UiSpec, newPatches: [patch] };
    },

    getResult(): UiSpec {
      return spec as unknown as UiSpec;
    },

    getPatches(): PatchOp[] {
      return patches;
    },

    reset(): void {
      spec = emptySpec() as unknown as Record<string, unknown>;
      patches = [];
    },
  };
}

// ── useUIStream ────────────────────────────────────────────────────────

/**
 * React hook for streaming JSONL patch operations into a UiSpec.
 *
 * POSTs to `config.api` with `{ prompt, currentTree }`, reads the response
 * as a streaming text body, and incrementally applies each JSONL line
 * as a PatchOp to the running spec.
 *
 * @example
 * ```tsx
 * const { spec, isStreaming, error, send, clear } = useUIStream({
 *   api: "/api/ui/stream",
 *   onComplete: (spec) => console.log("Done", spec),
 *   onError: (err) => console.error(err),
 * });
 *
 * // Kick off a stream
 * send("Create a login form");
 *
 * // Render spec progressively as it arrives
 * return <Renderer spec={spec} />;
 * ```
 */
export function useUIStream(config: UIStreamConfig): {
  spec: UiSpec;
  isStreaming: boolean;
  error: Error | null;
  send: (prompt: string, context?: Record<string, unknown>) => void;
  clear: () => void;
} {
  const [spec, setSpec] = useState<UiSpec>(emptySpec);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const compilerRef = useRef(createSpecStreamCompiler());
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    (prompt: string, context?: Record<string, unknown>) => {
      // Abort any in-flight stream
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      setIsStreaming(true);
      setError(null);

      const currentSpec = compilerRef.current.getResult();

      const body = JSON.stringify({
        prompt,
        currentTree: currentSpec,
        ...(context !== undefined ? { context } : {}),
      });

      fetch(config.api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Stream request failed: ${response.status} ${response.statusText}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("Response body is not readable");
          }

          const decoder = new TextDecoder();
          let buffer = "";

          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              // Split on newlines, keeping incomplete last line in buffer
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              // Process complete lines in a microtask-batched update
              let hasUpdates = false;
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                try {
                  compilerRef.current.push(trimmed);
                  hasUpdates = true;
                } catch (parseErr) {
                  console.warn("[useUIStream] Skipping malformed JSONL line:", trimmed, parseErr);
                }
              }

              if (hasUpdates) {
                // Snapshot the current spec for React state
                const updated = compilerRef.current.getResult();
                setSpec(structuredClone(updated) as UiSpec);
              }
            }

            // Process any remaining data in the buffer
            if (buffer.trim()) {
              try {
                compilerRef.current.push(buffer.trim());
                const updated = compilerRef.current.getResult();
                setSpec(structuredClone(updated) as UiSpec);
              } catch (parseErr) {
                console.warn("[useUIStream] Skipping malformed JSONL line:", buffer.trim(), parseErr);
              }
            }

            setIsStreaming(false);
            config.onComplete?.(compilerRef.current.getResult() as UiSpec);
          } catch (readErr) {
            reader.cancel().catch(() => {});
            throw readErr;
          }
        })
        .catch((err: unknown) => {
          // Don't report abort errors — they're intentional
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          const error = err instanceof Error ? err : new Error(String(err));
          setError(error);
          setIsStreaming(false);
          config.onError?.(error);
        });
    },
    [config],
  );

  const clear = useCallback(() => {
    // Abort any in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    compilerRef.current.reset();
    setSpec(emptySpec());
    setIsStreaming(false);
    setError(null);
  }, []);

  return { spec, isStreaming, error, send, clear };
}
