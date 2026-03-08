/**
 * Agent Native Module for Electrobun
 *
 * Embeds the Milady agent runtime (ElizaOS) as an isolated child process
 * using Bun.spawn() and exposes it to the webview via RPC messages.
 *
 * Key difference from Electron: Instead of dynamically importing eliza.js
 * into the main process (which requires fighting ASAR, CJS/ESM mismatch,
 * and NODE_PATH hacks), we spawn a separate Bun process that runs server.js
 * (which internally loads eliza.js). This gives us:
 *   - Clean process isolation (native module crashes don't kill the UI)
 *   - No ESM/CJS import gymnastics
 *   - Simple lifecycle management via SIGTERM/SIGKILL
 *   - stdout/stderr streaming for diagnostics
 *
 * The renderer never needs to know whether the API server is embedded or
 * remote -- it simply connects to `http://localhost:{port}`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AgentStatus } from "../rpc-schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SendToWebview = (message: string, payload?: unknown) => void;

// Subprocess type from Bun.spawn
type BunSubprocess = ReturnType<typeof Bun.spawn>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 2138;
const HEALTH_POLL_INTERVAL_MS = 500;
// 120s: Windows first-run can be slow (PGLite WASM init + 100+ plugins)
const HEALTH_POLL_TIMEOUT_MS = 120_000;
const SIGTERM_GRACE_MS = 5_000;

// ---------------------------------------------------------------------------
// Diagnostic logging
// ---------------------------------------------------------------------------

let diagnosticLogPath: string | null = null;

function getDiagnosticLogPath(): string {
  if (diagnosticLogPath !== null) return diagnosticLogPath;
  try {
    // Prefer platform-standard config dir
    const configDir = path.join(os.homedir(), ".config", "Milady");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    diagnosticLogPath = path.join(configDir, "milady-startup.log");
  } catch {
    // Fallback to temp dir
    diagnosticLogPath = path.join(os.tmpdir(), "milady-startup.log");
  }
  return diagnosticLogPath;
}

function diagnosticLog(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    const logPath = getDiagnosticLogPath();
    fs.appendFileSync(logPath, line);
  } catch {
    // Ignore write errors
  }
}

/** One-line, truncated error string safe for UI (status.error). */
function shortError(err: unknown, maxLen = 280): string {
  const raw =
    err instanceof Error
      ? err.message || (err.stack ?? String(err))
      : String(err);
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}...`;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the milady-dist directory.
 *
 * Priority:
 *   1. MILADY_DIST_PATH env var (explicit override)
 *   2. Walk up from import.meta.dir to find milady-dist as a sibling
 */
export function getMiladyDistFallbackCandidates(
  moduleDir: string = import.meta.dir,
  execPath: string = process.execPath,
): string[] {
  const execDir = execPath ? path.dirname(execPath) : moduleDir;

  return [
    // macOS: inside .app bundle (Contents/Resources/app/milady-dist)
    path.resolve(execDir, "../Resources/app/milady-dist"),
    // Windows NSIS/portable: resources/app/milady-dist next to exe
    path.resolve(execDir, "resources/app/milady-dist"),
    path.resolve(execDir, "../resources/app/milady-dist"),
    path.resolve(moduleDir, "app/milady-dist"),
    path.resolve(moduleDir, "../app/milady-dist"),
    path.resolve(moduleDir, "../milady-dist"),
    path.resolve(moduleDir, "../../../milady-dist"),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);
}

function resolveBunExecutablePath(execPath: string = process.execPath): string {
  const executableName = process.platform === "win32" ? "bun.exe" : "bun";
  const execDir = execPath ? path.dirname(execPath) : "";
  const candidates = [
    execPath,
    execDir ? path.join(execDir, executableName) : "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    if (
      path.basename(candidate).toLowerCase() === executableName.toLowerCase()
    ) {
      return candidate;
    }
  }

  const bunGlobal = Bun as { which?: (binary: string) => string | null };
  const whichCandidate =
    typeof bunGlobal.which === "function" ? bunGlobal.which("bun") : null;
  if (whichCandidate) return whichCandidate;

  // Windows: bun is not always on PATH; check well-known install locations.
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const winCandidates = [
      path.join(localAppData, "bun", "bun.exe"),
      path.join(programFiles, "bun", "bun.exe"),
      path.join(os.homedir(), ".bun", "bin", "bun.exe"),
    ];
    for (const candidate of winCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return "bun";
}

function resolveMiladyDistPath(): string {
  // 1. Env override
  const envPath = process.env.MILADY_DIST_PATH;
  if (envPath) {
    const resolved = path.resolve(envPath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    diagnosticLog(
      `[Agent] MILADY_DIST_PATH set but does not exist: ${resolved}`,
    );
  }

  // 2. Walk up from import.meta.dir looking for milady-dist or dist
  let dir = import.meta.dir;
  const maxDepth = 15;
  for (let i = 0; i < maxDepth; i++) {
    // Packaged: milady-dist sibling
    const miladyDist = path.join(dir, "milady-dist");
    if (fs.existsSync(miladyDist)) {
      return miladyDist;
    }
    // Dev monorepo: dist/ sibling containing eliza.js
    const devDist = path.join(dir, "dist");
    if (fs.existsSync(path.join(devDist, "eliza.js"))) {
      return devDist;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  // 3. Packaged/dev fallbacks derived from the launcher path and module dir.
  for (const candidate of getMiladyDistFallbackCandidates()) {
    if (fs.existsSync(candidate)) {
      diagnosticLog(
        `[Agent] Could not find milady-dist by walking up; using fallback: ${candidate}`,
      );
      return candidate;
    }
  }

  const fallback = getMiladyDistFallbackCandidates()[0];
  diagnosticLog(
    `[Agent] Could not find milady-dist by walking up; using fallback: ${fallback}`,
  );
  return fallback;
}

function resolveElizaEntryPath(miladyDistPath: string): string | null {
  const candidates = [
    path.join(miladyDistPath, "eliza.js"),
    path.join(miladyDistPath, "runtime", "eliza.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Health check polling
// ---------------------------------------------------------------------------

async function waitForHealthy(
  getPort: () => number,
  timeoutMs: number = HEALTH_POLL_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const port = getPort();
    const url = `http://127.0.0.1:${port}/api/health`;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(HEALTH_POLL_INTERVAL_MS);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Stdout watcher for "listening on port" detection
// ---------------------------------------------------------------------------

async function watchStdoutForReady(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    const reader = stream.getReader();
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim()) {
          onLine(line);
        }
      }
    }
    // Flush remaining buffer
    if (buffer.trim()) {
      onLine(buffer);
    }
    reader.releaseLock();
  } catch (err) {
    if (!signal.aborted) {
      diagnosticLog(
        `[Agent] stdout watcher error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

async function drainStderrToLog(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onLine?: (line: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    const reader = stream.getReader();
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim()) {
          diagnosticLog(`[Agent][stderr] ${line}`);
          onLine?.(line);
        }
      }
    }
    if (buffer.trim()) {
      diagnosticLog(`[Agent][stderr] ${buffer}`);
      onLine?.(buffer);
    }
    reader.releaseLock();
  } catch (err) {
    if (!signal.aborted) {
      diagnosticLog(
        `[Agent] stderr drain error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// Any PGLite query failure is unrecoverable within the same process (stale WASM state).
// Catch all "Failed query:" patterns so we auto-recover from any DB corruption.
const PGLITE_MIGRATION_RE = /Failed query:|create schema if not exists/i;

function resolvePgliteDataDir(): string {
  return path.join(os.homedir(), ".milady", "workspace", ".eliza", ".elizadb");
}

function deletePgliteDataDir(): void {
  const dir = resolvePgliteDataDir();
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      diagnosticLog(`[Agent] Deleted corrupt PGLite data dir: ${dir}`);
    }
  } catch (err) {
    diagnosticLog(
      `[Agent] Failed to delete PGLite data dir: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// AgentManager -- singleton
// ---------------------------------------------------------------------------

export class AgentManager {
  private sendToWebview: SendToWebview | null = null;
  private readonly statusListeners = new Set<
    (status: Readonly<AgentStatus>) => void
  >();
  private status: AgentStatus = {
    state: "not_started",
    agentName: null,
    port: null,
    startedAt: null,
    error: null,
  };
  private childProcess: BunSubprocess | null = null;
  private stdioAbortController: AbortController | null = null;
  private hasPgliteError = false;
  private pgliteRecoveryDone = false;

  setSendToWebview(fn: SendToWebview): void {
    this.sendToWebview = fn;
  }

  onStatusChange(
    listener: (status: Readonly<AgentStatus>) => void,
  ): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Start the agent runtime as a child process. Idempotent. */
  async start(): Promise<AgentStatus> {
    diagnosticLog(
      `[Agent] start() called, current state: ${this.status.state}`,
    );
    diagnosticLog(`[Agent] Diagnostic log file: ${getDiagnosticLogPath()}`);

    if (this.status.state === "running" || this.status.state === "starting") {
      return this.status;
    }

    // Reset per-startup flags
    this.pgliteRecoveryDone = false;

    // Clean up any stale process before starting
    if (this.childProcess) {
      await this.killChildProcess();
    }

    this.status = {
      state: "starting",
      agentName: null,
      port: null,
      startedAt: null,
      error: null,
    };
    this.emitStatus();

    try {
      // Resolve milady-dist path
      const miladyDistPath = resolveMiladyDistPath();
      diagnosticLog(`[Agent] Resolved milady dist: ${miladyDistPath}`);

      // Packaged builds can expose the runnable entry either at the dist root
      // or under runtime/. Prefer the root file but accept both layouts.
      const serverEntryPath = resolveElizaEntryPath(miladyDistPath);
      if (!serverEntryPath) {
        const distExists = fs.existsSync(miladyDistPath);
        let contents = "<directory missing>";
        if (distExists) {
          try {
            contents = fs.readdirSync(miladyDistPath).join(", ");
          } catch {
            contents = "<unreadable>";
          }
        }
        const errMsg = `No runnable eliza entry found in ${miladyDistPath} (checked eliza.js and runtime/eliza.js; dist exists: ${distExists}, contents: ${contents})`;
        diagnosticLog(`[Agent] ${errMsg}`);
        this.status = {
          state: "error",
          agentName: null,
          port: null,
          startedAt: null,
          error: errMsg,
        };
        this.emitStatus();
        return this.status;
      }

      diagnosticLog(`[Agent] eliza entry: exists (${serverEntryPath})`);

      // Resolve port
      let apiPort = Number(process.env.MILADY_PORT) || DEFAULT_PORT;
      diagnosticLog(`[Agent] Starting child process on port ${apiPort}...`);

      // Build NODE_PATH so the child can find node_modules
      const nodePaths: string[] = [];

      // milady-dist/node_modules for native binaries (sharp, llama-cpp, etc.)
      const distModules = path.join(miladyDistPath, "node_modules");
      if (fs.existsSync(distModules)) {
        nodePaths.push(distModules);
      }

      // Walk up from milady-dist to find monorepo root node_modules
      let searchDir = miladyDistPath;
      while (searchDir !== path.dirname(searchDir)) {
        const candidate = path.join(searchDir, "node_modules");
        if (fs.existsSync(candidate) && candidate !== distModules) {
          nodePaths.push(candidate);
          break;
        }
        searchDir = path.dirname(searchDir);
      }

      // Preserve existing NODE_PATH
      const existingNodePath = process.env.NODE_PATH;
      if (existingNodePath) {
        nodePaths.push(existingNodePath);
      }

      const childEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        MILADY_PORT: String(apiPort),
      };

      if (nodePaths.length > 0) {
        childEnv.NODE_PATH = nodePaths.join(path.delimiter);
        diagnosticLog(`[Agent] Child NODE_PATH: ${childEnv.NODE_PATH}`);
      }

      const bunExecutable = resolveBunExecutablePath();
      diagnosticLog(`[Agent] Using Bun executable: ${bunExecutable}`);
      diagnosticLog(
        `[Agent] Bun exists on disk: ${fs.existsSync(bunExecutable)}`,
      );

      // Spawn the child process
      const spawnTime = Date.now();
      const proc = Bun.spawn([bunExecutable, "run", serverEntryPath], {
        cwd: miladyDistPath,
        env: childEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      this.childProcess = proc;
      diagnosticLog(
        `[Agent] Child spawned pid=${proc.pid} elapsed=${Date.now() - spawnTime}ms`,
      );

      // Set up abort controller for stdio watchers
      this.stdioAbortController = new AbortController();
      const { signal } = this.stdioAbortController;

      // Surface the port immediately while waiting for ready
      this.status = {
        ...this.status,
        port: apiPort,
      };
      this.emitStatus();

      // Track whether we detected the "listening" message from stdout
      let detectedListening = false;

      // Watch stdout for "listening on port" or similar ready messages
      if (proc.stdout) {
        watchStdoutForReady(
          proc.stdout,
          (line: string) => {
            diagnosticLog(`[Agent][stdout] ${line}`);
            const lower = line.toLowerCase();
            // Parse dynamic port from "[milady-api] Listening on http://host:PORT"
            const portMatch = line.match(
              /Listening on https?:\/\/[^:]+:(\d+)/i,
            );
            if (portMatch) {
              const parsedPort = parseInt(portMatch[1], 10);
              if (!Number.isNaN(parsedPort) && parsedPort > 0) {
                if (parsedPort !== apiPort) {
                  diagnosticLog(
                    `[Agent] Server bound to dynamic port ${parsedPort} (requested ${apiPort})`,
                  );
                  apiPort = parsedPort;
                }
                detectedListening = true;
              }
            } else if (
              lower.includes("listening on port") ||
              lower.includes("server started") ||
              lower.includes("ready on")
            ) {
              detectedListening = true;
            }
            // Update status port so callers see the actual bound port
            this.status = { ...this.status, port: apiPort };
            this.emitStatus();
          },
          signal,
        ).catch(() => {
          // Stream ended or aborted -- expected on shutdown
        });
      }

      // Drain stderr to diagnostic log; detect PGLite migration failures
      this.hasPgliteError = false;
      if (proc.stderr) {
        drainStderrToLog(proc.stderr, signal, (line) => {
          if (PGLITE_MIGRATION_RE.test(line)) {
            this.hasPgliteError = true;
          }
        }).catch(() => {
          // Stream ended or aborted -- expected on shutdown
        });
      }

      // Monitor child process exit
      this.monitorChildExit(proc);

      // Wait for the health endpoint to respond
      // Use a getter so the health check follows dynamic port reassignment from stdout
      diagnosticLog(
        `[Agent] Waiting for health endpoint at http://127.0.0.1:${apiPort}/api/health ...`,
      );
      const healthy = await waitForHealthy(() => apiPort);

      if (!healthy) {
        // Check if process already exited
        if (proc.exitCode !== null) {
          const errMsg = `Child process exited with code ${proc.exitCode} before becoming healthy`;
          diagnosticLog(`[Agent] ${errMsg}`);
          this.childProcess = null;
          this.status = {
            state: "error",
            agentName: null,
            port: apiPort,
            startedAt: null,
            error: errMsg,
          };
          this.emitStatus();
          return this.status;
        }

        const errMsg = detectedListening
          ? "Server reported listening but health check timed out"
          : `Health check timed out after ${HEALTH_POLL_TIMEOUT_MS}ms`;
        diagnosticLog(`[Agent] ${errMsg}`);
        this.status = {
          state: "error",
          agentName: null,
          port: apiPort,
          startedAt: null,
          error: errMsg,
        };
        this.emitStatus();
        return this.status;
      }

      // Fetch agent name from the running server
      const agentName = await this.fetchAgentName(apiPort);

      this.status = {
        state: "running",
        agentName,
        port: apiPort,
        startedAt: Date.now(),
        error: null,
      };
      this.emitStatus();
      diagnosticLog(
        `[Agent] Runtime started -- agent: ${agentName}, port: ${apiPort}, pid: ${proc.pid}, startup_ms: ${Date.now() - spawnTime}`,
      );
      return this.status;
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.stack || err.message : String(err);
      diagnosticLog(`[Agent] Failed to start: ${errMsg}`);

      // Clean up child if it was spawned
      if (this.childProcess) {
        await this.killChildProcess();
      }

      this.status = {
        state: "error",
        agentName: null,
        port: this.status.port, // preserve port if set
        startedAt: null,
        error: shortError(err),
      };
      this.emitStatus();
      return this.status;
    }
  }

  /** Stop the agent runtime. */
  async stop(): Promise<void> {
    if (this.status.state !== "running" && this.status.state !== "starting") {
      return;
    }

    diagnosticLog("[Agent] Stopping...");

    // Abort stdio watchers
    if (this.stdioAbortController) {
      this.stdioAbortController.abort();
      this.stdioAbortController = null;
    }

    await this.killChildProcess();

    this.status = {
      state: "stopped",
      agentName: this.status.agentName,
      port: null,
      startedAt: null,
      error: null,
    };
    this.emitStatus();
    diagnosticLog("[Agent] Runtime stopped");
  }

  /**
   * Restart the agent runtime -- stops the current instance and starts a
   * fresh one, picking up config/plugin changes.
   */
  async restart(): Promise<AgentStatus> {
    diagnosticLog("[Agent] Restart requested -- stopping current runtime...");
    await this.stop();
    diagnosticLog("[Agent] Restarting...");
    return this.start();
  }

  getStatus(): AgentStatus {
    return { ...this.status };
  }

  getPort(): number | null {
    return this.status.port;
  }

  /** Clean up on app quit. */
  dispose(): void {
    if (this.stdioAbortController) {
      this.stdioAbortController.abort();
      this.stdioAbortController = null;
    }
    this.killChildProcess().catch((err) =>
      console.warn(
        "[Agent] dispose error:",
        err instanceof Error ? err.message : err,
      ),
    );
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private emitStatus(): void {
    if (this.sendToWebview) {
      this.sendToWebview("agentStatusUpdate", this.status);
    }
    const statusSnapshot = { ...this.status };
    for (const listener of this.statusListeners) {
      try {
        listener(statusSnapshot);
      } catch (err) {
        console.warn("[Agent] status listener failed:", err);
      }
    }
  }

  /**
   * Monitor the child process for unexpected exits and update status.
   */
  private monitorChildExit(proc: BunSubprocess): void {
    // Bun.spawn provides an `exited` promise that resolves when the process exits
    proc.exited
      .then((exitCode: number) => {
        // Only update status if this is still our active child process
        if (this.childProcess !== proc) return;

        const wasRunning = this.status.state === "running";
        const wasStarting = this.status.state === "starting";

        if (wasRunning || wasStarting) {
          diagnosticLog(
            `[Agent] Child process exited unexpectedly with code ${exitCode} (pid: ${proc.pid})`,
          );
          this.childProcess = null;

          // Auto-recover from PGLite migration failures by deleting the DB
          // and spawning a fresh process (new process = fresh WASM state).
          if (this.hasPgliteError && !this.pgliteRecoveryDone) {
            this.pgliteRecoveryDone = true;
            diagnosticLog(
              "[Agent] PGLite migration error detected — deleting DB and retrying with fresh process",
            );
            deletePgliteDataDir();
            this.status = {
              state: "not_started",
              agentName: null,
              port: null,
              startedAt: null,
              error: null,
            };
            // Delay slightly so OS releases file handles before respawn
            setTimeout(() => void this.start(), 500);
            return;
          }

          this.status = {
            state: "error",
            agentName: this.status.agentName,
            port: this.status.port,
            startedAt: null,
            error: `Process exited unexpectedly with code ${exitCode}`,
          };
          this.emitStatus();
        } else {
          // Expected exit (we called stop)
          this.childProcess = null;
        }
      })
      .catch((err: unknown) => {
        if (this.childProcess !== proc) return;
        diagnosticLog(
          `[Agent] Child process exited with error: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.childProcess = null;
        if (
          this.status.state === "running" ||
          this.status.state === "starting"
        ) {
          this.status = {
            state: "error",
            agentName: this.status.agentName,
            port: this.status.port,
            startedAt: null,
            error: shortError(err),
          };
          this.emitStatus();
        }
      });
  }

  /**
   * Kill the child process gracefully with SIGTERM, escalating to SIGKILL
   * after a timeout.
   */
  private async killChildProcess(): Promise<void> {
    const proc = this.childProcess;
    if (!proc) return;

    this.childProcess = null;

    // Already exited
    if (proc.exitCode !== null) return;

    diagnosticLog(`[Agent] Sending SIGTERM to pid ${proc.pid}`);
    proc.kill("SIGTERM");

    // Wait for graceful shutdown or timeout
    const exited = await Promise.race([
      proc.exited.then(() => true as const),
      Bun.sleep(SIGTERM_GRACE_MS).then(() => false as const),
    ]);

    if (!exited) {
      diagnosticLog(
        `[Agent] Process did not exit within ${SIGTERM_GRACE_MS}ms, sending SIGKILL`,
      );
      try {
        proc.kill("SIGKILL");
      } catch {
        // Process may have already exited between check and kill
      }
      // Wait briefly for SIGKILL to take effect
      await Promise.race([proc.exited.catch(() => {}), Bun.sleep(1_000)]);
    }

    diagnosticLog("[Agent] Child process terminated");
  }

  /**
   * Attempt to fetch the agent name from the running API server.
   * Falls back to "Milady" if the endpoint is unavailable.
   */
  private async fetchAgentName(port: number): Promise<string> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/agents`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) {
        const data = (await response.json()) as {
          agents?: Array<{ name?: string }>;
        };
        if (data.agents && data.agents.length > 0 && data.agents[0].name) {
          return data.agents[0].name;
        }
      }
    } catch {
      diagnosticLog("[Agent] Could not fetch agent name, using default");
    }
    return "Milady";
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
