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
 */

import path from "node:path";
import { app, type BrowserWindow, ipcMain } from "electron";
import type { IpcValue } from "./ipc-types";

/**
 * Dynamic import that survives TypeScript's CommonJS transformation.
 * tsc converts `import()` to `require()` when targeting CommonJS, but the
 * milady dist bundles are ESM.  This wrapper keeps a real `import()` call
 * at runtime.
 */
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<Record<string, unknown>>;

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
    if (this.status.state === "running" || this.status.state === "starting") {
      return this.status;
    }

    this.status.state = "starting";
    this.status.error = null;
    this.sendToRenderer("agent:status", this.status);

    try {
      // Resolve the milady dist.
      // In dev: __dirname = electron/build/src/native/ → 6 levels up to milady root/dist
      // In packaged app: extraResources copies dist/ to Resources/milady-dist/
      const miladyDist = app.isPackaged
        ? path.join(process.resourcesPath, "milady-dist")
        : path.resolve(__dirname, "../../../../../../dist");

      console.log(
        `[Agent] Resolved milady dist: ${miladyDist} (packaged: ${app.isPackaged})`,
      );

      // 1. Start API server immediately so the UI can bootstrap while runtime starts.
      //    (or MILADY_PORT if set)
      const apiPort = Number(process.env.MILADY_PORT) || 2138;
      const serverModule = await dynamicImport(
        path.join(miladyDist, "server.js"),
      ).catch((err: unknown) => {
        console.warn(
          "[Agent] Could not load server.js:",
          err instanceof Error ? err.message : err,
        );
        return null;
      });

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
      } else {
        console.warn(
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
      const elizaModule = await dynamicImport(path.join(miladyDist, "eliza.js"));
      const resolvedStartEliza = (elizaModule.startEliza ??
        (elizaModule.default as Record<string, unknown>)?.startEliza) as
        | ((opts: {
            headless: boolean;
          }) => Promise<Record<string, unknown> | null>)
        | undefined;

      if (typeof resolvedStartEliza !== "function") {
        throw new Error("eliza.js does not export startEliza");
      }
      startEliza = resolvedStartEliza;

      // 3. Start Eliza runtime in headless mode.
      const runtimeResult = await startEliza({ headless: true });
      if (!runtimeResult) {
        throw new Error(
          "startEliza returned null — runtime failed to initialize",
        );
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
        console.log(
          `[Agent] Runtime started — agent: ${agentName}, port: ${actualPort}`,
        );
      } else {
        console.log(
          `[Agent] Runtime started — agent: ${agentName}, API unavailable`,
        );
      }
      return this.status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status = {
        state: "error",
        agentName: null,
        port: this.status.port,
        startedAt: null,
        error: msg,
      };
      this.sendToRenderer("agent:status", this.status);
      console.error("[Agent] Failed to start:", msg);
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
