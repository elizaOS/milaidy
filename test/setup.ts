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

  const origResolve = (Module as { _resolveFilename: Function })
    ._resolveFilename;
  (Module as { _resolveFilename: Function })._resolveFilename =
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

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    get length() {
      return store.size;
    },
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
  } as Storage;
}

function hasStorageApi(value: unknown): value is Storage {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Storage).getItem === "function" &&
      typeof (value as Storage).setItem === "function" &&
      typeof (value as Storage).removeItem === "function" &&
      typeof (value as Storage).clear === "function",
  );
}

function ensureStorage(
  target: Record<string, unknown>,
  key: "localStorage" | "sessionStorage",
  fallback?: Storage,
): Storage {
  const existing = target[key];
  if (hasStorageApi(existing)) {
    return existing;
  }
  const storage = fallback ?? createMockStorage();
  Object.defineProperty(target, key, {
    value: storage,
    writable: true,
    configurable: true,
  });
  return storage;
}

const sharedLocalStorage = ensureStorage(
  globalThis as Record<string, unknown>,
  "localStorage",
);
const sharedSessionStorage = ensureStorage(
  globalThis as Record<string, unknown>,
  "sessionStorage",
);

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
    }) as CanvasRenderingContext2D;

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

if (typeof globalThis.window !== "undefined") {
  const win = globalThis.window as unknown as Record<string, unknown>;
  ensureStorage(win, "localStorage", sharedLocalStorage);
  ensureStorage(win, "sessionStorage", sharedSessionStorage);
}

import { withIsolatedTestHome } from "./test-env";

// ── Environment isolation ────────────────────────────────────────────
// Snapshot process.env at file level so that env mutations made by any test
// or beforeAll/afterAll hooks don't leak to the next test file when running
// in the same forked worker.
const fileEnvSnapshot = { ...process.env };

afterAll(() => {
  // Restore env to its state when this file started.
  for (const key of Object.keys(process.env)) {
    if (!(key in fileEnvSnapshot)) {
      delete process.env[key];
    } else if (process.env[key] !== fileEnvSnapshot[key]) {
      process.env[key] = fileEnvSnapshot[key];
    }
  }
  for (const key of Object.keys(fileEnvSnapshot)) {
    if (!(key in process.env)) {
      process.env[key] = fileEnvSnapshot[key];
    }
  }
});

const testEnv = withIsolatedTestHome();
afterAll(() => testEnv.cleanup());

afterAll(() => {
  // Some integration-style tests can leave chokidar/fs watchers open in workers,
  // which keeps Vitest from exiting cleanly on local runs.
  const getActiveHandles = (
    process as {
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
