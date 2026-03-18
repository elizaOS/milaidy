import Module from "node:module";
import { afterAll, afterEach, vi } from "vitest";

// ── React deduplication ──────────────────────────────────────────────
// bun hoists react-test-renderer's peer react into a separate .bun/ path,
// creating two React instances that break hooks.  Intercept Node's CJS
// resolution so every `require("react")` returns the root copy.
// Wrapped in try/catch so CI environments without react don't crash.
try {
  const _require = Module.createRequire(import.meta.url);
  const rootReactDir = require("node:path").dirname(
    _require.resolve("react/package.json"),
  );

  const origResolve = (Module as unknown as { _resolveFilename: Function })
    ._resolveFilename;
  (Module as unknown as { _resolveFilename: Function })._resolveFilename =
    function patchedResolve(
      request: string,
      parent: unknown,
      isMain: boolean,
      options: unknown,
    ) {
      const resolved: string = origResolve.call(
        this,
        request,
        parent,
        isMain,
        options,
      );
      // Redirect any .bun/-hoisted react files to the root copy so
      // react-test-renderer and component code share one React instance.
      if (
        resolved.includes("node_modules/.bun/") &&
        resolved.includes("/react/") &&
        !resolved.includes("react-dom") &&
        !resolved.includes("react-test-renderer")
      ) {
        // Extract the relative path within the react package
        const reactPkgIdx = resolved.lastIndexOf("/react/");
        if (reactPkgIdx !== -1) {
          const relPath = resolved.slice(reactPkgIdx + "/react/".length);
          return require("node:path").join(rootReactDir, relPath);
        }
      }
      return resolved;
    };
} catch {
  // React not available — skip deduplication patch (e.g. CI without react)
}

// Ensure Vitest environment is properly set
process.env.VITEST = "true";
// Keep test output focused on failures; individual tests can override.
process.env.LOG_LEVEL ??= "error";
// Allow tests to run without a real database (uses InMemoryDatabaseAdapter).
process.env.ALLOW_NO_DATABASE ??= "true";

declare global {
  // React 18 testing flag to suppress act() environment warnings.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error.bind(console);

function shouldIgnoreConsoleError(args: unknown[]): boolean {
  const first = args[0];
  if (typeof first !== "string") return false;
  return (
    first.includes("react-test-renderer is deprecated") ||
    first.includes(
      "The current testing environment is not configured to support act(...)",
    )
  );
}

console.error = (...args: unknown[]) => {
  if (shouldIgnoreConsoleError(args)) return;
  originalConsoleError(...args);
};

if (typeof globalThis.HTMLCanvasElement !== "undefined") {
  const createCanvas2DContext = (): CanvasRenderingContext2D =>
    ({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(0),
        width: 0,
        height: 0,
      })),
      putImageData: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      transform: vi.fn(),
      setTransform: vi.fn(),
      resetTransform: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => null),
      canvas: document.createElement("canvas"),
      lineWidth: 1,
      globalAlpha: 1,
      fillStyle: "#000",
      strokeStyle: "#000",
    }) as unknown as CanvasRenderingContext2D;

  Object.defineProperty(globalThis.HTMLCanvasElement.prototype, "getContext", {
    value: vi.fn((contextType: string) =>
      contextType === "2d" ? createCanvas2DContext() : null,
    ),
    writable: true,
    configurable: true,
  });

  Object.defineProperty(globalThis.HTMLCanvasElement.prototype, "toDataURL", {
    value: vi.fn(() => "data:image/png;base64,dGVzdA=="),
    writable: true,
    configurable: true,
  });
}

import { withIsolatedTestHome } from "./test-env";

// ── Environment isolation ────────────────────────────────────────────
// Snapshot process.env before each test file so that env mutations made by
// individual tests (e.g. setting MILADY_API_TOKEN) don't leak to subsequent
// test files running in the same forked worker process.
const envSnapshot = { ...process.env };

afterEach(() => {
  // Restore env: delete keys that were added, restore original values.
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) {
      delete process.env[key];
    } else if (process.env[key] !== envSnapshot[key]) {
      process.env[key] = envSnapshot[key];
    }
  }
  // Restore keys that may have been deleted by tests.
  for (const key of Object.keys(envSnapshot)) {
    if (!(key in process.env)) {
      process.env[key] = envSnapshot[key];
    }
  }
});

const testEnv = withIsolatedTestHome();
afterAll(() => testEnv.cleanup());

afterAll(() => {
  // Some integration-style tests can leave chokidar/fs watchers open in workers,
  // which keeps Vitest from exiting cleanly on local runs.
  const getActiveHandles = (
    process as unknown as {
      _getActiveHandles?: () => unknown[];
    }
  )._getActiveHandles;
  const handles = getActiveHandles?.() ?? [];
  for (const handle of handles) {
    if (!handle || typeof handle !== "object") continue;
    const name = (handle as { constructor?: { name?: string } }).constructor
      ?.name;
    if (name !== "FSWatcher" && name !== "FSEvent" && name !== "StatWatcher") {
      continue;
    }
    try {
      (handle as { close?: () => void }).close?.();
    } catch {
      // Best-effort cleanup only.
    }
  }
});

afterEach(() => {
  // Guard against leaked fake timers across test files/workers.
  vi.useRealTimers();
  // Reset module mocks to prevent vi.mock() pollution across test files.
  vi.restoreAllMocks();
});
