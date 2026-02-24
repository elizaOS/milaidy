import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type IAgentRuntime, Service } from "@elizaos/core";
import {
  isCommandAllowed,
  loadRepoPromptConfig,
  normalizeCommandName,
  type RepoPromptConfig,
} from "../config.ts";

export interface RepoPromptRunInput {
  command?: string;
  args?: string[];
  window?: string | number;
  tab?: string;
  cwd?: string;
  stdin?: string;
}

export interface RepoPromptRunResult {
  ok: boolean;
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export interface RepoPromptStatus {
  available: boolean;
  running: boolean;
  cliPath: string;
  defaultWindow?: string;
  defaultTab?: string;
  timeoutMs: number;
  maxOutputChars: number;
  allowedCommands: string[];
  lastRunAt?: number;
  lastExitCode?: number | null;
  lastDurationMs?: number;
  lastCommand?: string;
  lastError?: string;
}

const MAX_ARGS = 64;
const MAX_ARG_LENGTH = 4096;
const DISALLOWED_ARG_FLAGS = new Set(["-e", "--eval", "--exec", "--command"]);

function appendWithLimit(
  current: string,
  chunk: Buffer | string,
  limit: number,
): { value: string; truncated: boolean } {
  if (current.length >= limit) {
    return { value: current, truncated: true };
  }

  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  const remaining = limit - current.length;

  if (text.length <= remaining) {
    return { value: current + text, truncated: false };
  }

  return {
    value: current + text.slice(0, remaining),
    truncated: true,
  };
}

function withTruncationSuffix(value: string, truncated: boolean): string {
  if (!truncated) {
    return value;
  }

  const suffix = "\n...[truncated by plugin-repoprompt]";
  return value.endsWith(suffix) ? value : `${value}${suffix}`;
}

function cleanOptionalValue(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : undefined;
}

function isPathInside(baseDir: string, targetDir: string): boolean {
  if (baseDir === targetDir) {
    return true;
  }

  const normalizedBase =
    process.platform === "win32" ? baseDir.toLowerCase() : baseDir;
  const normalizedTarget =
    process.platform === "win32" ? targetDir.toLowerCase() : targetDir;
  return normalizedTarget.startsWith(`${normalizedBase}${path.sep}`);
}

export class RepoPromptService extends Service {
  static override serviceType = "repoprompt";

  override capabilityDescription =
    "Run RepoPrompt CLI commands from actions and routes with timeout and allowlist safeguards.";

  private readonly runtimeConfig: RepoPromptConfig;
  private runQueue: Promise<unknown> = Promise.resolve();
  private running = false;
  private available = true;
  private lastRunAt?: number;
  private lastExitCode?: number | null;
  private lastDurationMs?: number;
  private lastCommand?: string;
  private lastError?: string;

  constructor(runtime?: IAgentRuntime, config?: RepoPromptConfig) {
    super(runtime);
    this.runtimeConfig = config ?? loadRepoPromptConfig(process.env);
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    return new RepoPromptService(runtime);
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(RepoPromptService.serviceType);
    if (service && "stop" in service && typeof service.stop === "function") {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    this.running = false;
  }

  getStatus(): RepoPromptStatus {
    return {
      available: this.available,
      running: this.running,
      cliPath: this.runtimeConfig.cliPath,
      defaultWindow: this.runtimeConfig.defaultWindow,
      defaultTab: this.runtimeConfig.defaultTab,
      timeoutMs: this.runtimeConfig.timeoutMs,
      maxOutputChars: this.runtimeConfig.maxOutputChars,
      allowedCommands: [...this.runtimeConfig.allowedCommands],
      lastRunAt: this.lastRunAt,
      lastExitCode: this.lastExitCode,
      lastDurationMs: this.lastDurationMs,
      lastCommand: this.lastCommand,
      lastError: this.lastError,
    };
  }

  async run(input: RepoPromptRunInput): Promise<RepoPromptRunResult> {
    const task = this.runQueue.then(
      () => this.executeRun(input),
      () => this.executeRun(input),
    );

    this.runQueue = task.then(
      () => undefined,
      () => undefined,
    );

    return task;
  }

  private resolveCommand(input: RepoPromptRunInput): string {
    const explicit = cleanOptionalValue(input.command);
    if (explicit) {
      return normalizeCommandName(explicit);
    }

    const firstNonFlag = (input.args ?? []).find((arg) => !arg.startsWith("-"));
    const inferred = cleanOptionalValue(firstNonFlag);

    if (!inferred) {
      throw new Error(
        "RepoPrompt command missing. Provide `command`, or include a non-flag command token in `args`.",
      );
    }

    return normalizeCommandName(inferred);
  }

  private validateUserArgs(inputArgs: string[] | undefined): void {
    const args = inputArgs ?? [];
    if (args.length > MAX_ARGS) {
      throw new Error(
        `Too many RepoPrompt args (${args.length}). Maximum allowed is ${MAX_ARGS}.`,
      );
    }

    for (const arg of args) {
      const value = String(arg).trim();
      if (value.length > MAX_ARG_LENGTH) {
        throw new Error(
          `RepoPrompt arg too long (${value.length} chars). Maximum allowed is ${MAX_ARG_LENGTH}.`,
        );
      }

      const normalized = value.toLowerCase();
      if (
        DISALLOWED_ARG_FLAGS.has(normalized) ||
        normalized.startsWith("--exec=") ||
        normalized.startsWith("--eval=") ||
        normalized.startsWith("--command=")
      ) {
        throw new Error(`RepoPrompt arg "${value}" is not allowed.`);
      }
    }
  }

  private resolveWorkingDirectory(inputCwd?: string): string {
    const workspaceRootPath = path.resolve(this.runtimeConfig.workspaceRoot);
    const requestedPath = path.resolve(
      cleanOptionalValue(inputCwd) ?? workspaceRootPath,
    );

    let workspaceRoot: string;
    let requested: string;

    try {
      workspaceRoot = fs.realpathSync(workspaceRootPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `RepoPrompt workspace root is not accessible (${workspaceRootPath}): ${message}`,
      );
    }

    try {
      requested = fs.realpathSync(requestedPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `RepoPrompt cwd is not accessible (${requestedPath}): ${message}`,
      );
    }

    if (!isPathInside(workspaceRoot, requested)) {
      throw new Error(
        `RepoPrompt cwd must stay within REPOPROMPT_WORKSPACE_ROOT (${workspaceRoot}). Received: ${requested}`,
      );
    }

    return requested;
  }

  private buildChildEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    const baseKeys = [
      "PATH",
      "HOME",
      "USERPROFILE",
      "SHELL",
      "COMSPEC",
      "PATHEXT",
      "SystemRoot",
      "TMP",
      "TEMP",
    ];

    for (const key of baseKeys) {
      const value = process.env[key];
      if (typeof value === "string" && value.length > 0) {
        env[key] = value;
      }
    }

    for (const [key, value] of Object.entries(process.env)) {
      if (
        key.startsWith("REPOPROMPT_") &&
        typeof value === "string" &&
        value.length > 0
      ) {
        env[key] = value;
      }
    }

    return env;
  }

  private buildProcessArgs(input: RepoPromptRunInput): string[] {
    const args: string[] = [];

    const windowValue = input.window ?? this.runtimeConfig.defaultWindow;
    if (windowValue !== undefined && String(windowValue).trim().length > 0) {
      args.push("-w", String(windowValue).trim());
    }

    const tabValue = cleanOptionalValue(
      input.tab ?? this.runtimeConfig.defaultTab,
    );
    if (tabValue) {
      args.push("-t", tabValue);
    }

    const explicitCommand = cleanOptionalValue(input.command);
    if (explicitCommand) {
      args.push(explicitCommand);
    }

    for (const arg of input.args ?? []) {
      args.push(String(arg));
    }

    return args;
  }

  private async executeRun(
    input: RepoPromptRunInput,
  ): Promise<RepoPromptRunResult> {
    const command = this.resolveCommand(input);
    if (!isCommandAllowed(command, this.runtimeConfig.allowedCommands)) {
      throw new Error(
        `RepoPrompt command "${command}" is not allowed. Allowed commands: ${this.runtimeConfig.allowedCommands.join(", ")}`,
      );
    }

    this.validateUserArgs(input.args);
    const args = this.buildProcessArgs(input);
    const cwd = this.resolveWorkingDirectory(input.cwd);

    if (
      input.stdin &&
      Buffer.byteLength(input.stdin, "utf8") > this.runtimeConfig.maxStdinBytes
    ) {
      throw new Error(
        `RepoPrompt stdin exceeds limit (${this.runtimeConfig.maxStdinBytes} bytes).`,
      );
    }

    this.running = true;
    this.lastCommand = command;

    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;

    try {
      const child = spawn(this.runtimeConfig.cliPath, args, {
        cwd,
        env: this.buildChildEnv(),
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });

      if (input.stdin) {
        child.stdin?.write(input.stdin);
      }
      child.stdin?.end();

      child.stdout?.on("data", (chunk) => {
        const next = appendWithLimit(
          stdout,
          chunk,
          this.runtimeConfig.maxOutputChars,
        );
        stdout = next.value;
        stdoutTruncated = stdoutTruncated || next.truncated;
      });

      child.stderr?.on("data", (chunk) => {
        const next = appendWithLimit(
          stderr,
          chunk,
          this.runtimeConfig.maxOutputChars,
        );
        stderr = next.value;
        stderrTruncated = stderrTruncated || next.truncated;
      });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore kill errors
        }

        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore kill errors
          }
        }, 250);
      }, this.runtimeConfig.timeoutMs);

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => resolve(code));
      }).finally(() => {
        clearTimeout(timeoutHandle);
      });

      if (timedOut) {
        const timeoutMessage = `RepoPrompt CLI timed out after ${this.runtimeConfig.timeoutMs}ms.`;
        const next = appendWithLimit(
          stderr,
          timeoutMessage,
          this.runtimeConfig.maxOutputChars,
        );
        stderr = next.value;
        stderrTruncated = stderrTruncated || next.truncated;
      }

      const durationMs = Date.now() - startedAt;
      const ok = !timedOut && exitCode === 0;

      this.available = true;
      this.lastRunAt = startedAt;
      this.lastExitCode = exitCode;
      this.lastDurationMs = durationMs;
      this.lastError = ok
        ? undefined
        : stderr || `Process exited with code ${String(exitCode)}`;

      return {
        ok,
        command,
        args,
        exitCode,
        stdout: withTruncationSuffix(stdout, stdoutTruncated),
        stderr: withTruncationSuffix(stderr, stderrTruncated),
        durationMs,
        timedOut,
        stdoutTruncated,
        stderrTruncated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastRunAt = startedAt;
      this.lastExitCode = null;
      this.lastDurationMs = Date.now() - startedAt;
      this.lastError = message;

      const maybeErrno = error as NodeJS.ErrnoException;
      if (maybeErrno?.code === "ENOENT") {
        this.available = false;
      }

      throw error;
    } finally {
      this.running = false;
    }
  }
}
