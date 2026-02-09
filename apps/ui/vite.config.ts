import type { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
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
  const transientCodes = new Set(["ECONNREFUSED", "ECONNRESET", "EAGAIN"]);
  if (err.code && transientCodes.has(err.code)) return true;
  // Node 22+ wraps multiple connection attempts in AggregateError
  const agg = err as NodeJS.ErrnoException & { errors?: NodeJS.ErrnoException[] };
  if (agg.errors) {
    return agg.errors.some(
      (e) => e.code != null && transientCodes.has(e.code),
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
  proxy.emit = function (this: typeof proxy, event: string, ...rest) {
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
  const apiPort = process.env.MILAIDY_API_PORT || "2138";
  return {
    base,
    plugins: [tailwindcss(), react()],
    publicDir: path.resolve(here, "public"),
    build: {
      outDir: path.resolve(here, "../dist/control-ui"),
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      host: true,
      port: 18789,
      strictPort: false,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
          configure: withQuietErrors,
        },
        "/ws": {
          target: `ws://127.0.0.1:${apiPort}`,
          ws: true,
          configure: withQuietErrors,
        },
      },
    },
  };
});
