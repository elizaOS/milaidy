import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../styles/xterm.css";
import {
  client,
  type SandboxBrowserEndpoints,
  type SandboxWindowInfo,
} from "../api-client";
import { isLifoPopoutMode } from "../lifo-popout";
import { pathForTab } from "../navigation";

type LifoKernel = import("@lifo-sh/core").Kernel;
type LifoShell = import("@lifo-sh/core").Shell;
type LifoTerminal = import("@lifo-sh/ui").Terminal;
type LifoFileExplorer = import("@lifo-sh/ui").FileExplorer;
type LifoRegistry = import("@lifo-sh/core").CommandRegistry;
type LifoCommandContext = import("@lifo-sh/core").CommandContext;

interface LifoRuntime {
  kernel: LifoKernel;
  shell: LifoShell;
  terminal: LifoTerminal;
  explorer: LifoFileExplorer;
  registry: LifoRegistry;
  env: Record<string, string>;
}

interface TerminalOutputEvent {
  event?: unknown;
  command?: unknown;
}

interface LifoSyncMessage {
  source: "controller";
  type:
    | "heartbeat"
    | "session-reset"
    | "command-start"
    | "stdout"
    | "stderr"
    | "command-exit"
    | "command-error";
  command?: string;
  chunk?: string;
  exitCode?: number;
  message?: string;
}

const LIFO_SYNC_CHANNEL_NAME = "milady-lifo-sync";
const MONITOR_SCREENSHOT_POLL_MS = 1800;
const MONITOR_META_POLL_MS = 10000;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeTerminalText(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}

function buildLifoPopoutUrl(): string {
  if (typeof window === "undefined") return "";

  const targetPath = pathForTab("lifo", import.meta.env.BASE_URL);

  if (window.location.protocol === "file:") {
    return `${window.location.origin}${window.location.pathname}#${targetPath}?popout=lifo`;
  }

  const url = new URL(window.location.href);
  url.pathname = targetPath;
  const params = new URLSearchParams(url.search);
  params.set("popout", "lifo");
  url.search = params.toString();
  url.hash = "";
  return url.toString();
}

async function createLifoRuntime(
  terminalElement: HTMLElement,
  explorerElement: HTMLElement,
): Promise<LifoRuntime> {
  const core = await import("@lifo-sh/core");
  const ui = await import("@lifo-sh/ui");

  const kernel = new core.Kernel();
  await kernel.boot({ persist: true });

  const registry = core.createDefaultRegistry();
  core.bootLifoPackages(kernel.vfs, registry);

  const terminal = new ui.Terminal(terminalElement);
  const env = kernel.getDefaultEnv();
  const shell = new core.Shell(terminal, kernel.vfs, registry, env);

  const jobTable = shell.getJobTable();
  registry.register("ps", core.createPsCommand(jobTable));
  registry.register("top", core.createTopCommand(jobTable));
  registry.register("kill", core.createKillCommand(jobTable));
  registry.register("watch", core.createWatchCommand(registry));
  registry.register("help", core.createHelpCommand(registry));
  registry.register("node", core.createNodeCommand(kernel.portRegistry));
  registry.register("curl", core.createCurlCommand(kernel.portRegistry));

  const shellExecute = async (
    cmd: string,
    ctx: LifoCommandContext,
  ): Promise<number> => {
    const result = await shell.execute(cmd, {
      cwd: ctx.cwd,
      env: ctx.env,
      onStdout: (chunk: string) => ctx.stdout.write(chunk),
      onStderr: (chunk: string) => ctx.stderr.write(chunk),
    });
    return result.exitCode;
  };

  registry.register("npm", core.createNpmCommand(registry, shellExecute));
  registry.register("lifo", core.createLifoPkgCommand(registry, shellExecute));

  await shell.sourceFile("/etc/profile");
  await shell.sourceFile(`${env.HOME}/.bashrc`);
  shell.start();

  const explorer = new ui.FileExplorer(explorerElement, kernel.vfs, {
    cwd: shell.getCwd(),
  });

  return {
    kernel,
    shell,
    terminal,
    explorer,
    registry,
    env,
  };
}

export function LifoSandboxView() {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const explorerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<LifoRuntime | null>(null);
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);
  const popoutRef = useRef<Window | null>(null);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const controllerHeartbeatAtRef = useRef(0);

  const [booting, setBooting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [runCount, setRunCount] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);

  const popoutMode = useMemo(() => isLifoPopoutMode(), []);
  const [controllerOnline, setControllerOnline] = useState(popoutMode);
  const [monitorOnline, setMonitorOnline] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [monitorUpdatedAt, setMonitorUpdatedAt] = useState<number | null>(null);
  const [browserEndpoints, setBrowserEndpoints] =
    useState<SandboxBrowserEndpoints | null>(null);
  const [sandboxWindows, setSandboxWindows] = useState<SandboxWindowInfo[]>([]);
  const [screenPreviewBase64, setScreenPreviewBase64] = useState<string | null>(
    null,
  );

  const appendOutput = useCallback((line: string) => {
    setOutput((prev) => {
      const next = [...prev, line];
      return next.slice(-600);
    });
  }, []);

  const screenPreviewUrl = useMemo(
    () =>
      screenPreviewBase64
        ? `data:image/png;base64,${screenPreviewBase64}`
        : null,
    [screenPreviewBase64],
  );

  const broadcastSyncMessage = useCallback(
    (message: Omit<LifoSyncMessage, "source">) => {
      if (!popoutMode) return;
      syncChannelRef.current?.postMessage({
        source: "controller",
        ...message,
      } satisfies LifoSyncMessage);
    },
    [popoutMode],
  );

  const teardown = useCallback(() => {
    try {
      runtimeRef.current?.explorer.destroy();
    } catch {
      // Ignore teardown failures.
    }

    runtimeRef.current = null;
    queueRef.current = [];
    runningRef.current = false;

    if (terminalRef.current) {
      terminalRef.current.innerHTML = "";
    }
    if (explorerRef.current) {
      explorerRef.current.innerHTML = "";
    }
  }, []);

  const runQueuedCommands = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (!runtime || runningRef.current) return;

    runningRef.current = true;

    try {
      while (queueRef.current.length > 0) {
        const command = queueRef.current.shift();
        if (!command) continue;

        runtime.terminal.writeln(`$ ${command}`);
        appendOutput(`$ ${command}`);
        setRunCount((prev) => prev + 1);
        broadcastSyncMessage({ type: "command-start", command });

        try {
          const result = await runtime.shell.execute(command, {
            onStdout: (chunk: string) => {
              runtime.terminal.write(normalizeTerminalText(chunk));
              const trimmed = chunk.trimEnd();
              if (trimmed) appendOutput(trimmed);
              broadcastSyncMessage({ type: "stdout", chunk });
            },
            onStderr: (chunk: string) => {
              runtime.terminal.write(normalizeTerminalText(chunk));
              const trimmed = chunk.trimEnd();
              if (trimmed) appendOutput(`stderr: ${trimmed}`);
              broadcastSyncMessage({ type: "stderr", chunk });
            },
          });

          runtime.terminal.writeln(`[exit ${result.exitCode}]`);
          appendOutput(`[exit ${result.exitCode}]`);
          broadcastSyncMessage({
            type: "command-exit",
            exitCode: result.exitCode,
          });
        } catch (err) {
          const message = formatError(err);
          runtime.terminal.writeln(`error: ${message}`);
          appendOutput(`error: ${message}`);
          broadcastSyncMessage({ type: "command-error", message });
        }

        try {
          runtime.explorer.refresh();
        } catch {
          // Keep processing command queue even if explorer refresh fails.
        }
      }
    } finally {
      runningRef.current = false;
    }
  }, [appendOutput, broadcastSyncMessage]);

  const enqueueAgentCommand = useCallback(
    (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) return;
      queueRef.current.push(trimmed);
      void runQueuedCommands();
    },
    [runQueuedCommands],
  );

  const refreshMonitorMeta = useCallback(async () => {
    if (popoutMode) return;
    try {
      const [browser, windowsResponse] = await Promise.all([
        client.getSandboxBrowser(),
        client.getSandboxWindows(),
      ]);
      setBrowserEndpoints(browser);
      setSandboxWindows(
        Array.isArray(windowsResponse.windows) ? windowsResponse.windows : [],
      );
      setMonitorError(null);
    } catch (err) {
      setMonitorError(formatError(err));
    }
  }, [popoutMode]);

  const refreshScreenPreview = useCallback(async () => {
    if (popoutMode) return;
    try {
      const screenshot = await client.getSandboxScreenshot();
      if (typeof screenshot.data !== "string" || !screenshot.data.trim()) {
        throw new Error("Sandbox screenshot response was empty");
      }
      setScreenPreviewBase64(screenshot.data);
      setMonitorUpdatedAt(Date.now());
      setMonitorOnline(true);
      setMonitorError(null);
    } catch (err) {
      setMonitorOnline(false);
      setMonitorError(formatError(err));
    }
  }, [popoutMode]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const terminalElement = terminalRef.current;
      const explorerElement = explorerRef.current;
      if (!terminalElement || !explorerElement) return;

      teardown();
      setBooting(true);
      setReady(false);
      setError(null);
      setOutput([`Starting Lifo session #${sessionKey + 1}...`]);
      setRunCount(0);

      try {
        const runtime = await createLifoRuntime(
          terminalElement,
          explorerElement,
        );
        if (cancelled) {
          try {
            runtime.explorer.destroy();
          } catch {
            // Ignore cleanup failure on cancelled boot.
          }
          return;
        }

        runtimeRef.current = runtime;
        runtime.terminal.writeln(
          "Lifo runtime ready. Waiting for agent commands...",
        );
        appendOutput("Lifo runtime ready. Waiting for agent commands...");
        setReady(true);

        void runQueuedCommands();
      } catch (err) {
        setError(formatError(err));
      } finally {
        setBooting(false);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [appendOutput, runQueuedCommands, sessionKey, teardown]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(LIFO_SYNC_CHANNEL_NAME);
    syncChannelRef.current = channel;

    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let heartbeatWatchInterval: ReturnType<typeof setInterval> | null = null;

    if (popoutMode) {
      setControllerOnline(true);
      broadcastSyncMessage({ type: "heartbeat" });
      heartbeatInterval = setInterval(() => {
        broadcastSyncMessage({ type: "heartbeat" });
      }, 1000);
    } else {
      heartbeatWatchInterval = setInterval(() => {
        const online = Date.now() - controllerHeartbeatAtRef.current < 3500;
        setControllerOnline(online);
      }, 1000);
    }

    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (popoutMode) return;
      const data = event.data as Partial<LifoSyncMessage> | null;
      if (!data || data.source !== "controller") return;

      if (data.type === "heartbeat") {
        controllerHeartbeatAtRef.current = Date.now();
        setControllerOnline(true);
        return;
      }

      const runtime = runtimeRef.current;
      if (!runtime) return;

      switch (data.type) {
        case "session-reset":
          setSessionKey((value) => value + 1);
          break;
        case "command-start":
          if (typeof data.command !== "string") return;
          runtime.terminal.writeln(`$ ${data.command}`);
          appendOutput(`$ ${data.command}`);
          setRunCount((prev) => prev + 1);
          break;
        case "stdout":
          if (typeof data.chunk !== "string") return;
          runtime.terminal.write(normalizeTerminalText(data.chunk));
          if (data.chunk.trimEnd()) appendOutput(data.chunk.trimEnd());
          break;
        case "stderr":
          if (typeof data.chunk !== "string") return;
          runtime.terminal.write(normalizeTerminalText(data.chunk));
          if (data.chunk.trimEnd()) {
            appendOutput(`stderr: ${data.chunk.trimEnd()}`);
          }
          break;
        case "command-exit":
          if (typeof data.exitCode !== "number") return;
          runtime.terminal.writeln(`[exit ${data.exitCode}]`);
          appendOutput(`[exit ${data.exitCode}]`);
          try {
            runtime.explorer.refresh();
          } catch {
            // Ignore refresh failures when mirroring popout events.
          }
          break;
        case "command-error":
          if (typeof data.message !== "string") return;
          runtime.terminal.writeln(`error: ${data.message}`);
          appendOutput(`error: ${data.message}`);
          break;
      }
    };

    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (heartbeatWatchInterval) clearInterval(heartbeatWatchInterval);
      syncChannelRef.current = null;
      channel.close();
    };
  }, [appendOutput, broadcastSyncMessage, popoutMode]);

  useEffect(() => {
    if (popoutMode) return;

    let cancelled = false;

    const refreshMeta = async () => {
      if (cancelled) return;
      await refreshMonitorMeta();
    };
    const refreshPreview = async () => {
      if (cancelled) return;
      await refreshScreenPreview();
    };

    void refreshMeta();
    void refreshPreview();

    const previewInterval = window.setInterval(() => {
      void refreshPreview();
    }, MONITOR_SCREENSHOT_POLL_MS);

    const metaInterval = window.setInterval(() => {
      void refreshMeta();
    }, MONITOR_META_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(previewInterval);
      window.clearInterval(metaInterval);
    };
  }, [popoutMode, refreshMonitorMeta, refreshScreenPreview]);

  useEffect(() => {
    client.connectWs();

    const unbind = client.onWsEvent(
      "terminal-output",
      (data: Record<string, unknown>) => {
        const event = data as TerminalOutputEvent;
        if (event.event !== "start") return;
        if (typeof event.command !== "string" || !event.command.trim()) return;
        const popoutOpen =
          !popoutMode && popoutRef.current != null && !popoutRef.current.closed;
        if (!popoutMode && (controllerOnline || popoutOpen)) {
          // A dedicated popout controller is active; watcher mirrors via sync.
          return;
        }
        enqueueAgentCommand(event.command);
      },
    );

    return unbind;
  }, [controllerOnline, enqueueAgentCommand, popoutMode]);

  useEffect(() => {
    if (!popoutMode) return;
    const previous = document.title;
    document.title = "Milady • Lifo Agent Popout";
    return () => {
      document.title = previous;
    };
  }, [popoutMode]);

  const resetSession = useCallback(() => {
    setSessionKey((value) => value + 1);
    broadcastSyncMessage({ type: "session-reset" });
  }, [broadcastSyncMessage]);

  const openPopout = useCallback(() => {
    const existing = popoutRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }

    const url = buildLifoPopoutUrl();
    const popup = window.open(
      url,
      "milady-lifo-popout",
      "popup,width=1400,height=860",
    );

    if (!popup) {
      setError("Popup blocked. Allow popups to launch the Lifo popout window.");
      return;
    }

    popoutRef.current = popup;
    controllerHeartbeatAtRef.current = Date.now();
    setControllerOnline(true);
    popup.focus();
  }, []);

  return (
    <section className="h-full min-h-[620px] flex flex-col gap-3">
      <header className="rounded-xl border border-border bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-txt">
              {popoutMode ? "Lifo Agent Popout" : "Lifo Agent Surface"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {popoutMode
                ? "Dedicated full Lifo runtime. Agent commands execute here in real time."
                : "Embedded full Lifo watcher. Open popout for the dedicated agent-controlled surface."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                error
                  ? "bg-danger/20 text-danger"
                  : ready
                    ? "bg-ok/20 text-ok"
                    : "bg-warn/20 text-warn"
              }`}
            >
              {error ? "error" : ready ? "ready" : "booting"}
            </span>

            <span className="rounded-full px-2 py-1 text-[11px] font-medium bg-card border border-border text-muted">
              {popoutMode
                ? "controller"
                : controllerOnline
                  ? "watcher • synced"
                  : "watcher • local"}
            </span>

            {!popoutMode && (
              <button
                type="button"
                onClick={openPopout}
                className="px-3 py-1.5 rounded-md border border-accent bg-accent text-accent-fg text-xs hover:bg-accent-hover transition-colors"
              >
                Open Lifo Popout
              </button>
            )}

            {popoutMode && (
              <button
                type="button"
                onClick={resetSession}
                className="px-3 py-1.5 rounded-md border border-border bg-card text-xs text-txt hover:border-accent hover:text-accent transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 text-[11px] text-muted">
          Agent commands replayed: <span className="text-txt">{runCount}</span>
        </div>

        {error && (
          <p className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
            {error}
          </p>
        )}
      </header>

      <div className="grid flex-1 min-h-[360px] grid-cols-1 xl:grid-cols-[360px_1fr] gap-3">
        <div
          className={`rounded-xl border border-border overflow-hidden bg-panel min-h-[280px] ${
            popoutMode ? "" : "pointer-events-none select-none"
          }`}
        >
          <div className="px-3 py-2 text-xs font-semibold border-b border-border text-txt">
            Explorer
          </div>
          <div ref={explorerRef} className="h-[calc(100%-37px)] w-full" />
        </div>
        <div
          className={`rounded-xl border border-border overflow-hidden bg-panel min-h-[280px] ${
            popoutMode ? "" : "pointer-events-none select-none"
          }`}
        >
          <div className="px-3 py-2 text-xs font-semibold border-b border-border text-txt">
            Terminal
          </div>
          <div ref={terminalRef} className="h-[calc(100%-37px)] w-full" />
        </div>
      </div>

      {!popoutMode && (
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-3">
          <div className="rounded-xl border border-border overflow-hidden bg-panel min-h-[320px]">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-txt">
                  Lifo Computer-Use Surface
                </div>
                <div className="text-[11px] text-muted">
                  Watch-only desktop mirror of what the autonomous agent is
                  doing.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                    monitorOnline ? "bg-ok/20 text-ok" : "bg-warn/20 text-warn"
                  }`}
                >
                  {monitorOnline ? "live" : "offline"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void refreshMonitorMeta();
                    void refreshScreenPreview();
                  }}
                  className="px-2.5 py-1 rounded-md border border-border bg-card text-[11px] text-txt hover:border-accent hover:text-accent transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="h-[320px] bg-black/90 flex items-center justify-center overflow-hidden">
              {screenPreviewUrl ? (
                <img
                  src={screenPreviewUrl}
                  alt="Sandbox computer-use surface"
                  className="h-full w-full object-contain"
                />
              ) : (
                <p className="px-4 text-center text-xs text-muted">
                  Waiting for sandbox screen frames...
                </p>
              )}
            </div>

            <div className="px-3 py-2 border-t border-border text-[11px] text-muted">
              {monitorUpdatedAt
                ? `Last frame: ${new Date(monitorUpdatedAt).toLocaleTimeString()}`
                : "No frames captured yet"}
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-panel min-h-[320px]">
            <div className="px-3 py-2 border-b border-border">
              <div className="text-xs font-semibold text-txt">
                Browser + Sandbox Context
              </div>
              <div className="text-[11px] text-muted">
                Agent controls browser/computer tools; this panel mirrors state.
              </div>
            </div>

            <div className="p-3 space-y-3 text-[11px]">
              <div>
                <div className="text-muted uppercase tracking-wide text-[10px]">
                  CDP Endpoint
                </div>
                <div className="mt-1 rounded border border-border bg-card px-2 py-1 text-txt break-all">
                  {browserEndpoints?.cdpEndpoint ?? "Unavailable"}
                </div>
              </div>

              <div>
                <div className="text-muted uppercase tracking-wide text-[10px]">
                  WS Endpoint
                </div>
                <div className="mt-1 rounded border border-border bg-card px-2 py-1 text-txt break-all">
                  {browserEndpoints?.wsEndpoint ?? "Unavailable"}
                </div>
              </div>

              <div>
                <div className="text-muted uppercase tracking-wide text-[10px]">
                  Visible Windows ({sandboxWindows.length})
                </div>
                <div className="mt-1 max-h-[154px] overflow-auto rounded border border-border bg-card p-2 space-y-1">
                  {sandboxWindows.length > 0 ? (
                    sandboxWindows.slice(0, 20).map((windowInfo) => (
                      <div key={windowInfo.id} className="text-txt">
                        <span className="text-muted">{windowInfo.app}:</span>{" "}
                        {windowInfo.title || "(untitled)"}
                      </div>
                    ))
                  ) : (
                    <div className="text-muted">
                      No active windows reported.
                    </div>
                  )}
                </div>
              </div>

              {monitorError && (
                <div className="rounded border border-danger/40 bg-danger/10 px-2 py-1 text-danger">
                  {monitorError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-panel p-3 min-h-[140px] max-h-[220px] overflow-auto">
        <div className="text-xs font-semibold text-txt">Agent Replay Log</div>
        <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-muted font-mono">
          {output.length > 0
            ? output.join("\n")
            : booting
              ? "Booting Lifo..."
              : "Waiting for the agent to run a terminal command."}
        </pre>
      </div>
    </section>
  );
}
