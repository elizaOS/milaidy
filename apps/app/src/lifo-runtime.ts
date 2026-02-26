export type LifoKernel = import("@lifo-sh/core").Kernel;
export type LifoShell = import("@lifo-sh/core").Shell;
export type LifoTerminal = import("@lifo-sh/ui").Terminal;
export type LifoFileExplorer = import("@lifo-sh/ui").FileExplorer;
export type LifoRegistry = import("@lifo-sh/core").CommandRegistry;
export type LifoCommandContext = import("@lifo-sh/core").CommandContext;

export interface LifoRuntime {
  kernel: LifoKernel;
  shell: LifoShell;
  terminal: LifoTerminal;
  explorer: LifoFileExplorer;
  registry: LifoRegistry;
  env: Record<string, string>;
}

export interface LifoSyncMessage {
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

export function normalizeTerminalText(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}

export async function createLifoRuntime(
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
