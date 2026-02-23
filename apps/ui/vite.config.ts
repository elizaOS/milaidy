import type { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type ProxyOptions } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

function normalizeBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }
  if (trimmed === "./") {
    return "./";
  }
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

/** Check if an error is a transient connection error (backend starting/restarting). */
function isTransientConnError(err: NodeJS.ErrnoException): boolean {
  if (err.code === "ECONNREFUSED" || err.code === "ECONNRESET") return true;
  // Node 22+ wraps multiple connection attempts in AggregateError
  const agg = err as NodeJS.ErrnoException & { errors?: NodeJS.ErrnoException[] };
  if (agg.errors) {
    return agg.errors.some(
      (e) => e.code === "ECONNREFUSED" || e.code === "ECONNRESET",
    );
  }
  return false;
}

/**
 * Patch proxy.emit to silently swallow transient connection errors
 * (ECONNREFUSED / ECONNRESET) that occur when the backend API on :31337
 * is starting or restarting (bun --watch).
 *
 * For HTTP requests, responds with 503 so the UI can show a "backend starting"
 * state. For WebSocket upgrades, silently drops the error (Socket has no
 * writeHead, so the guard naturally skips the 503 response).
 */
const withQuietErrors: NonNullable<ProxyOptions["configure"]> = (proxy) => {
  const origEmit = proxy.emit;
  proxy.emit = function (event: string, ...rest) {
    if (
      event === "error" &&
      isTransientConnError(rest[0] as NodeJS.ErrnoException)
    ) {
      const res = rest[2] as ServerResponse | undefined;
      if (res && typeof res.writeHead === "function" && !res.headersSent) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Backend not ready" }));
      }
      return true;
    }
    return origEmit.apply(this, [event, ...rest] as Parameters<typeof origEmit>);
  } as typeof origEmit;
};

export default defineConfig(() => {
  const envBase = process.env.MILAIDY_CONTROL_UI_BASE_PATH?.trim();
  const base = envBase ? normalizeBase(envBase) : "./";
  return {
    base,
    publicDir: path.resolve(here, "public"),
    optimizeDeps: {
      include: ["lit/directives/repeat.js"],
    },
    build: {
      outDir: path.resolve(here, "../dist/control-ui"),
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      host: true,
      port: 2138,
      strictPort: false,
      proxy: {
        "/api": {
          target: "http://localhost:31337",
          changeOrigin: true,
          configure: withQuietErrors,
        },
        "/ws": {
          target: "ws://localhost:31337",
          ws: true,
          configure: withQuietErrors,
        },
      },
    },
  };
});
