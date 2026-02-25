import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { client } from "../api-client";
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

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeTerminalText(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}

function isLifoPopoutMode(): boolean {
  if (typeof window === "undefined") return false;
  const search =
    window.location.search || window.location.hash.split("?")[1] || "";
  const params = new URLSearchParams(search);
  if (!params.has("popout")) return false;
  const value = params.get("popout");
  return !value || value === "1" || value === "true" || value === "lifo";
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

  const [booting, setBooting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [runCount, setRunCount] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);

  const popoutMode = useMemo(() => isLifoPopoutMode(), []);

  const appendOutput = useCallback((line: string) => {
    setOutput((prev) => {
      const next = [...prev, line];
      return next.slice(-600);
    });
  }, []);

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

        try {
          const result = await runtime.shell.execute(command, {
            onStdout: (chunk: string) => {
              runtime.terminal.write(normalizeTerminalText(chunk));
              const trimmed = chunk.trimEnd();
              if (trimmed) appendOutput(trimmed);
            },
            onStderr: (chunk: string) => {
              runtime.terminal.write(normalizeTerminalText(chunk));
              const trimmed = chunk.trimEnd();
              if (trimmed) appendOutput(`stderr: ${trimmed}`);
            },
          });

          runtime.terminal.writeln(`[exit ${result.exitCode}]`);
          appendOutput(`[exit ${result.exitCode}]`);
        } catch (err) {
          const message = formatError(err);
          runtime.terminal.writeln(`error: ${message}`);
          appendOutput(`error: ${message}`);
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
  }, [appendOutput]);

  const enqueueAgentCommand = useCallback(
    (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) return;
      queueRef.current.push(trimmed);
      void runQueuedCommands();
    },
    [runQueuedCommands],
  );

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
    client.connectWs();

    const unbind = client.onWsEvent(
      "terminal-output",
      (data: Record<string, unknown>) => {
        const event = data as TerminalOutputEvent;
        if (event.event !== "start") return;
        if (typeof event.command !== "string" || !event.command.trim()) return;
        enqueueAgentCommand(event.command);
      },
    );

    return unbind;
  }, [enqueueAgentCommand]);

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
  }, []);

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
              {popoutMode ? "controller" : "watcher"}
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

            <button
              type="button"
              onClick={resetSession}
              className="px-3 py-1.5 rounded-md border border-border bg-card text-xs text-txt hover:border-accent hover:text-accent transition-colors"
            >
              Reset
            </button>
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
        <div className="rounded-xl border border-border overflow-hidden bg-panel min-h-[280px]">
          <div className="px-3 py-2 text-xs font-semibold border-b border-border text-txt">
            Explorer
          </div>
          <div ref={explorerRef} className="h-[calc(100%-37px)] w-full" />
        </div>
        <div className="rounded-xl border border-border overflow-hidden bg-panel min-h-[280px]">
          <div className="px-3 py-2 text-xs font-semibold border-b border-border text-txt">
            Terminal
          </div>
          <div ref={terminalRef} className="h-[calc(100%-37px)] w-full" />
        </div>
      </div>

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
