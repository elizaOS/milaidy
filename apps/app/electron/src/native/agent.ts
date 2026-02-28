/**
 * Agent Native Module for Electron
 *
 * Embeds the Milady agent runtime (ElizaOS) directly in the Electron main
 * process and exposes it to the renderer via IPC.
 *
 * On startup the module:
 *   1. Imports startEliza (headless) from the milady dist
 *   2. Starts the API server on an available port
 *   3. Sends the port number to the renderer so the UI's api-client can connect
 *
 * The renderer never needs to know whether the API server is embedded or
 * remote — it simply connects to `http://localhost:{port}`.
 *
 * --- Exception handling (DO NOT REMOVE as "excess" or "deslop") ---
 * Startup uses multiple try/catch and .catch() guards so that:
 * 1. If eliza.js fails to load (e.g. missing native .node binary), the API
 *    server stays up and the UI can still connect and show an error state.
 * 2. If startEliza() throws, we set state to "error" with port preserved so
 *    the renderer gets a usable status instead of "Failed to fetch".
 * 3. The outer catch does NOT tear down the API server — only the runtime.
 * Without these guards, a single missing native module makes the whole app
 * window unusable (no API, no error message). See docs/electron-startup.md.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, type BrowserWindow, ipcMain } from "electron";
import type { IpcValue } from "./ipc-types";

// Diagnostic logging to file for debugging packaged app startup issues
let diagnosticLogPath: string | null = null;

function getDiagnosticLogPath(): string | null {
  if (diagnosticLogPath !== null) return diagnosticLogPath;
  try {
    if (app.isPackaged) {
      diagnosticLogPath = path.join(
        app.getPath("userData"),
        "milady-startup.log",
      );
    }
  } catch {
    // app.getPath may not be available in test environments
  }
  return diagnosticLogPath;
}

function diagnosticLog(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(message);
  const logPath = getDiagnosticLogPath();
  if (logPath) {
    try {
      fs.appendFileSync(logPath, line);
    } catch {
      // Ignore write errors
    }
  }
}

/** One-line, truncated error string safe for UI (status.error). Full stack still goes to diagnosticLog. */
function shortError(err: unknown, maxLen = 280): string {
  const raw =
    err instanceof Error
      ? err.message || (err.stack ?? String(err))
      : String(err);
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

/**
 * Dynamic import that survives TypeScript's CommonJS transformation.
 * tsc converts `import()` to `require()` when targeting CommonJS, but the
 * milady dist bundles are ESM.  This wrapper keeps a real `import()` call
 * at runtime.
 *
 * For ASAR-packed files (Electron packaged app), ESM import() doesn't work
 * because Node's ESM loader can't read from ASAR archives.  In that case
 * we fall back to require() with the filesystem path.
 */
const dynamicImport = async (
  specifier: string,
): Promise<Record<string, unknown>> => {
  // Convert file:// URLs to filesystem paths for require() fallback
  const fsPath = specifier.startsWith("file://")
    ? fileURLToPath(specifier)
    : specifier;

  // If the path is inside an ASAR archive (but NOT in app.asar.unpacked),
  // require() is the only option.  Electron patches require() to handle
  // ASAR reads, but the ESM loader does NOT support ASAR.
  // Note: app.asar.unpacked is a regular directory on the real filesystem,
  // so ESM import() works there.
  const isAsar = fsPath.includes(".asar") && !fsPath.includes(".asar.unpacked");

  if (isAsar) {
    console.log(`[Agent] Loading from ASAR via require(): ${fsPath}`);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(fsPath) as Record<string, unknown>;
    } catch (requireErr) {
      console.error(
        "[Agent] ASAR require() failed:",
        requireErr instanceof Error ? requireErr.message : requireErr,
      );
      throw requireErr;
    }
  }

  // Primary path: use new Function to get a real async import() at runtime,
  // bypassing tsc's CJS downgrade.
  try {
    // Ensure we use a file:// URL for import()
    const importUrl = fsPath.startsWith("file://")
      ? fsPath
      : specifier.startsWith("file://")
        ? specifier
        : pathToFileURL(fsPath).href;
    console.log(`[Agent] Loading via ESM import(): ${importUrl}`);
    const importer = new Function("s", "return import(s)") as (
      s: string,
    ) => Promise<Record<string, unknown>>;
    return await importer(importUrl);
  } catch (primaryErr) {
    // If the primary path failed, try require() with filesystem path
    console.warn(
      "[Agent] ESM dynamic import failed, falling back to require():",
      primaryErr instanceof Error ? primaryErr.message : primaryErr,
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(fsPath) as Record<string, unknown>;
  }
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentStatus {
  state: "not_started" | "starting" | "running" | "stopped" | "error";
  agentName: string | null;
  port: number | null;
  startedAt: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// AgentManager — singleton
// ---------------------------------------------------------------------------

export class AgentManager {
  private mainWindow: BrowserWindow | null = null;
  private status: AgentStatus = {
    state: "not_started",
    agentName: null,
    port: null,
    startedAt: null,
    error: null,
  };
  // Keep references so we can shut down gracefully
  private runtime: Record<string, unknown> | null = null;
  private apiClose: (() => Promise<void>) | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /** Start the agent runtime + API server. Idempotent. */
  async start(): Promise<AgentStatus> {
    diagnosticLog(
      `[Agent] start() called, current state: ${this.status.state}`,
    );
    const logPath = getDiagnosticLogPath();
    if (logPath) {
      diagnosticLog(`[Agent] Diagnostic log file: ${logPath}`);
    }
    if (this.status.state === "running" || this.status.state === "starting") {
      return this.status;
    }

    if (this.apiClose) {
      try {
        await this.apiClose();
      } catch (err) {
        console.warn(
          "[Agent] Failed to close stale API server before restart:",
          err instanceof Error ? err.message : err,
        );
      } finally {
        this.apiClose = null;
        this.status.port = null;
      }
    }
    if (
      this.runtime &&
      typeof (this.runtime as { stop?: () => Promise<void> }).stop ===
        "function"
    ) {
      try {
        await (this.runtime as { stop: () => Promise<void> }).stop();
      } catch (err) {
        console.warn(
          "[Agent] Failed to stop stale runtime before restart:",
          err instanceof Error ? err.message : err,
        );
      } finally {
        this.runtime = null;
      }
    }

    this.status.state = "starting";
    this.status.error = null;
    this.sendToRenderer("agent:status", this.status);

    try {
      // Resolve the milady dist.
      // In dev: Use milady-dist in electron app dir (same bundle as packaged)
      // In packaged app: dist is unpacked to app.asar.unpacked/milady-dist
      // (asarUnpack in electron-builder.config.json ensures milady-dist is
      // extracted outside the ASAR so ESM import() works normally.)
      const miladyDist = app.isPackaged
        ? path.join(
            app.getAppPath().replace("app.asar", "app.asar.unpacked"),
            "milady-dist",
          )
        : path.resolve(__dirname, "../../../milady-dist");

      diagnosticLog(
        `[Agent] Resolved milady dist: ${miladyDist} (packaged: ${app.isPackaged})`,
      );
      // Check if milady-dist exists
      if (app.isPackaged) {
        const distExists = fs.existsSync(miladyDist);
        const serverJsExists = fs.existsSync(
          path.join(miladyDist, "server.js"),
        );
        const elizaJsExists = fs.existsSync(path.join(miladyDist, "eliza.js"));
        diagnosticLog(
          `[Agent] milady-dist exists: ${distExists}, server.js: ${serverJsExists}, eliza.js: ${elizaJsExists}`,
        );
        if (distExists) {
          const files = fs.readdirSync(miladyDist);
          diagnosticLog(`[Agent] milady-dist contents: ${files.join(", ")}`);
        }
      }

      // Ensure eliza.js dynamic imports (e.g. @elizaos/plugin-*) resolve.
      // Packaged: ASAR's node_modules. Dev: monorepo root node_modules (milady-dist
      // lives under apps/app/electron/, so resolution from there must see root).
      const existing = process.env.NODE_PATH || "";
      if (app.isPackaged) {
        const asarModules = path.join(app.getAppPath(), "node_modules");
        process.env.NODE_PATH = existing
          ? `${asarModules}${path.delimiter}${existing}`
          : asarModules;
        diagnosticLog(
          `[Agent] Added ASAR node_modules to NODE_PATH: ${asarModules}`,
        );
      } else {
        // Dev: walk up from this file until we find node_modules (monorepo root),
        // so we don't depend on a fixed depth (e.g. tsc-out vs build/src/native).
        let dir = __dirname;
        let rootModules: string | null = null;
        while (dir !== path.dirname(dir)) {
          const candidate = path.join(dir, "node_modules");
          if (fs.existsSync(candidate)) {
            rootModules = candidate;
            break;
          }
          dir = path.dirname(dir);
        }
        if (rootModules) {
          process.env.NODE_PATH = existing
            ? `${rootModules}${path.delimiter}${existing}`
            : rootModules;
          diagnosticLog(
            `[Agent] Added monorepo root node_modules to NODE_PATH: ${rootModules}`,
          );
        }
      }
      // Force Node to re-read NODE_PATH before we load eliza.js.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:module").Module._initPaths();

      // 1. Start API server immediately so the UI can bootstrap while runtime starts.
      //    (or MILADY_PORT if set)
      const apiPort = Number(process.env.MILADY_PORT) || 2138;
      diagnosticLog(
        `[Agent] Loading server.js from: ${path.join(miladyDist, "server.js")}`,
      );
      // WHY .catch(): Keep API server step independent. If server.js fails we
      // still try to load eliza.js and set error state; do not let one throw
      // kill the whole startup (see file-level comment).
      const serverModule = await dynamicImport(
        pathToFileURL(path.join(miladyDist, "server.js")).href,
      ).catch((err: unknown) => {
        const errMsg =
          err instanceof Error ? err.stack || err.message : String(err);
        diagnosticLog(`[Agent] FAILED to load server.js: ${errMsg}`);
        return null;
      });
      diagnosticLog(
        `[Agent] server.js loaded: ${serverModule != null}, has startApiServer: ${typeof serverModule?.startApiServer === "function"}`,
      );

      let actualPort: number | null = null;
      let startEliza:
        | ((opts: {
            headless: boolean;
          }) => Promise<Record<string, unknown> | null>)
        | null = null;
      // `startApiServer()` returns an `updateRuntime()` helper that broadcasts
      // status updates and restores conversation state after a hot restart.
      // Keep it around so our onRestart hook can call it.
      let apiUpdateRuntime: ((rt: unknown) => void) | null = null;

      if (serverModule?.startApiServer) {
        diagnosticLog(`[Agent] Starting API server on port ${apiPort}...`);
        const {
          port: resolvedPort,
          close,
          updateRuntime,
        } = await serverModule.startApiServer({
          port: apiPort,
          initialAgentState: "starting",
          // IMPORTANT: the web UI expects POST /api/agent/restart to work.
          // Without an onRestart handler, config changes that require a runtime
          // restart appear to "not work".
          onRestart: async () => {
            console.log(
              "[Agent] HTTP restart requested — restarting embedded runtime…",
            );

            // 1) Stop old runtime (do NOT stop the API server)
            const prevRuntime = this.runtime;
            if (
              prevRuntime &&
              typeof (prevRuntime as { stop?: () => Promise<void> }).stop ===
                "function"
            ) {
              try {
                await (prevRuntime as { stop: () => Promise<void> }).stop();
              } catch (stopErr) {
                console.warn(
                  "[Agent] Error stopping runtime during HTTP restart:",
                  stopErr instanceof Error ? stopErr.message : stopErr,
                );
              }
            }

            if (!startEliza) {
              console.error(
                "[Agent] HTTP restart failed: runtime bootstrap not initialized",
              );
              return null;
            }

            // 2) Start new runtime (picks up latest config/env from disk)
            const nextRuntime = await startEliza({ headless: true });
            if (!nextRuntime) {
              console.error(
                "[Agent] HTTP restart failed: startEliza returned null",
              );
              return null;
            }

            this.runtime = nextRuntime as Record<string, unknown>;

            // Tell the API server about the new runtime so status is broadcast
            // and conversations are restored.
            apiUpdateRuntime?.(nextRuntime as unknown);

            // 3) Update the Electron-side status (renderer may be listening via IPC)
            const nextName =
              (nextRuntime as { character?: { name?: string } }).character
                ?.name ?? "Milady";
            this.status = {
              ...this.status,
              state: "running",
              agentName: nextName,
              port: actualPort,
              startedAt: Date.now(),
              error: null,
            };
            this.sendToRenderer("agent:status", this.status);

            console.log(`[Agent] HTTP restart complete — agent: ${nextName}`);
            return nextRuntime as Record<string, unknown>;
          },
        });
        actualPort = resolvedPort;
        this.apiClose = close;
        apiUpdateRuntime = updateRuntime;
        diagnosticLog(`[Agent] API server started on port ${actualPort}`);
      } else {
        diagnosticLog(
          "[Agent] Could not find API server module — runtime will start without HTTP API",
        );
      }

      // Surface the API port while runtime is still booting.
      this.status = {
        ...this.status,
        port: actualPort,
      };
      this.sendToRenderer("agent:status", this.status);

      // 2. Resolve runtime bootstrap entry (may be slow on cold boot).
      // WHY .catch() here: eliza.js can fail (e.g. onnxruntime-node missing
      // darwin/x64 .node on Intel Mac). Without this guard we throw, outer
      // catch runs, and we used to close the API server — so the UI got
      // "Failed to fetch" with no way to show error. Now we return null,
      // set state "error" with port kept, so renderer can connect and display
      // the failure. Do not remove as "excess" exception handling.
      diagnosticLog(
        `[Agent] Loading eliza.js from: ${path.join(miladyDist, "eliza.js")}`,
      );
      let elizaLoadError: string | null = null;
      const elizaModule = await dynamicImport(
        pathToFileURL(path.join(miladyDist, "eliza.js")).href,
      ).catch((err: unknown) => {
        const errMsg =
          err instanceof Error ? err.stack || err.message : String(err);
        diagnosticLog(`[Agent] FAILED to load eliza.js: ${errMsg}`);
        elizaLoadError = shortError(err);
        return null;
      });

      if (elizaModule) {
        diagnosticLog(
          `[Agent] eliza.js loaded, exports: ${Object.keys(elizaModule).join(", ")}`,
        );
      }

      const resolvedStartEliza = elizaModule
        ? ((elizaModule.startEliza ??
            (elizaModule.default as Record<string, unknown>)?.startEliza) as
            | ((opts: {
                headless: boolean;
              }) => Promise<Record<string, unknown> | null>)
            | undefined)
        : undefined;

      if (typeof resolvedStartEliza !== "function") {
        const reason = elizaModule
          ? "eliza.js does not export startEliza"
          : (elizaLoadError ?? "eliza.js failed to load (see log above)");
        diagnosticLog(`[Agent] Cannot start runtime: ${reason}`);

        this.status = {
          state: "error",
          agentName: null,
          port: actualPort,
          startedAt: null,
          error: reason,
        };
        this.sendToRenderer("agent:status", this.status);
        return this.status;
      }
      startEliza = resolvedStartEliza;

      // 3. Start Eliza runtime in headless mode.
      // WHY try/catch: startEliza() can throw (plugin init, native deps).
      // Catching here lets us set state "error" and keep the API server up
      // so the UI can show the error; do not let this bubble and tear down
      // the server (see file-level comment).
      diagnosticLog(`[Agent] Starting Eliza runtime in headless mode...`);
      let runtimeResult: Record<string, unknown> | null = null;
      let runtimeInitError: string | null = null;
      try {
        runtimeResult = await startEliza({ headless: true });
      } catch (runtimeErr) {
        const errMsg =
          runtimeErr instanceof Error
            ? runtimeErr.stack || runtimeErr.message
            : String(runtimeErr);
        diagnosticLog(`[Agent] Runtime startup threw: ${errMsg}`);
        runtimeInitError = shortError(runtimeErr);
      }

      if (!runtimeResult) {
        const reason = runtimeInitError ?? "Runtime failed to initialize";
        diagnosticLog(`[Agent] ${reason}`);
        this.status = {
          state: "error",
          agentName: null,
          port: actualPort,
          startedAt: null,
          error: reason,
        };
        this.sendToRenderer("agent:status", this.status);
        return this.status;
      }

      this.runtime = runtimeResult as Record<string, unknown>;
      const agentName =
        (runtimeResult as { character?: { name?: string } }).character?.name ??
        "Milady";

      // Attach runtime to the already-running API server.
      apiUpdateRuntime?.(runtimeResult as unknown);

      this.status = {
        state: "running",
        agentName,
        port: actualPort,
        startedAt: Date.now(),
        error: null,
      };

      this.sendToRenderer("agent:status", this.status);
      if (actualPort) {
        diagnosticLog(
          `[Agent] Runtime started — agent: ${agentName}, port: ${actualPort}`,
        );
      } else {
        diagnosticLog(
          `[Agent] Runtime started — agent: ${agentName}, API unavailable`,
        );
      }
      return this.status;
    } catch (err) {
      // WHY we do NOT call this.apiClose() here: If the failure was loading
      // eliza.js or startEliza(), the API server is already running. Tearing
      // it down would make the window show "Failed to fetch" with no error
      // message. We only clear runtime and set status; port stays so renderer
      // can connect and display the error. Do not "simplify" by adding
      // this.apiClose() in this catch.
      const msg =
        err instanceof Error
          ? (err as Error).stack || err.message
          : String(err);
      if (
        this.runtime &&
        typeof (this.runtime as { stop?: () => Promise<void> }).stop ===
          "function"
      ) {
        try {
          await (this.runtime as { stop: () => Promise<void> }).stop();
        } catch (stopErr) {
          console.warn(
            "[Agent] Failed to stop runtime after startup failure:",
            stopErr instanceof Error ? stopErr.message : stopErr,
          );
        }
      }
      this.runtime = null;
      this.status = {
        state: "error",
        agentName: null,
        port: this.status.port,
        startedAt: null,
        error: msg,
      };
      this.sendToRenderer("agent:status", this.status);
      diagnosticLog(`[Agent] Failed to start: ${msg}`);
      return this.status;
    }
  }

  /** Stop the agent runtime. */
  async stop(): Promise<void> {
    if (this.status.state !== "running" && this.status.state !== "starting") {
      return;
    }

    try {
      if (this.apiClose) {
        await this.apiClose();
        this.apiClose = null;
      }
      if (
        this.runtime &&
        typeof (this.runtime as { stop?: () => Promise<void> }).stop ===
          "function"
      ) {
        await (this.runtime as { stop: () => Promise<void> }).stop();
      }
    } catch (err) {
      console.warn(
        "[Agent] Error during shutdown:",
        err instanceof Error ? err.message : err,
      );
    }

    this.runtime = null;
    this.status = {
      state: "stopped",
      agentName: this.status.agentName,
      port: null,
      startedAt: null,
      error: null,
    };
    this.sendToRenderer("agent:status", this.status);
    console.log("[Agent] Runtime stopped");
  }

  /**
   * Restart the agent runtime — stops the current instance and starts a
   * fresh one, picking up config/plugin changes.
   */
  async restart(): Promise<AgentStatus> {
    console.log("[Agent] Restart requested — stopping current runtime…");
    await this.stop();
    console.log("[Agent] Restarting…");
    return this.start();
  }

  getStatus(): AgentStatus {
    return { ...this.status };
  }

  getPort(): number | null {
    return this.status.port;
  }

  private sendToRenderer(channel: string, data: IpcValue): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /** Clean up on app quit. */
  dispose(): void {
    this.stop().catch((err) =>
      console.warn(
        "[Agent] dispose error:",
        err instanceof Error ? err.message : err,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let agentManager: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!agentManager) {
    agentManager = new AgentManager();
  }
  return agentManager;
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

export function registerAgentIPC(): void {
  const manager = getAgentManager();

  ipcMain.handle("agent:start", async () => {
    return manager.start();
  });

  ipcMain.handle("agent:stop", async () => {
    await manager.stop();
    return { ok: true };
  });

  ipcMain.handle("agent:restart", async () => {
    return manager.restart();
  });

  ipcMain.handle("agent:status", () => {
    return manager.getStatus();
  });
}
