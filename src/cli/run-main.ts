import process from "node:process";
import { getLogPrefix } from "../utils/log-prefix";
import { getPrimaryCommand, hasHelpOrVersion } from "./argv";
import { registerSubCliByName } from "./program/register.subclis";

async function loadDotEnv(): Promise<void> {
  try {
    const { config } = await import("dotenv");
    config({ quiet: true });
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND" &&
      (err as NodeJS.ErrnoException).code !== "ERR_MODULE_NOT_FOUND"
    ) {
      throw err;
    }
  }
}

function formatUncaughtError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

function hasInsufficientCreditsSignal(input: string): boolean {
  return /\b(insufficient(?:[_\s]+(?:credits?|quota))|insufficient_quota|out of credits|payment required|statuscode:\s*402)\b/i.test(
    input,
  );
}

function shouldIgnoreUnhandledRejection(reason: unknown): boolean {
  const formatted = formatUncaughtError(reason);
  if (
    !/AI_NoOutputGeneratedError|No output generated|AI_APICallError/i.test(
      formatted,
    )
  ) {
    return false;
  }

  if (hasInsufficientCreditsSignal(formatted)) {
    return true;
  }

  if (reason && typeof reason === "object") {
    const statusCode = (reason as { statusCode?: number }).statusCode;
    if (statusCode === 402) return true;

    const responseBody = (reason as { responseBody?: unknown }).responseBody;
    if (
      typeof responseBody === "string" &&
      hasInsufficientCreditsSignal(responseBody)
    ) {
      return true;
    }
  }

  return false;
}

export async function runCli(argv: string[] = process.argv) {
  await loadDotEnv();

  // Normalize env: copy Z_AI_API_KEY → ZAI_API_KEY when ZAI_API_KEY is empty.
  if (!process.env.ZAI_API_KEY?.trim() && process.env.Z_AI_API_KEY?.trim()) {
    process.env.ZAI_API_KEY = process.env.Z_AI_API_KEY;
  }

  const { buildProgram } = await import("./program");
  const program = buildProgram();

  // Prevent Commander from calling process.exit() directly so that piped stdio (vitest etc)
  // has a chance to flush cleanly before the process spins down.
  program.exitOverride();

  process.on("unhandledRejection", (reason) => {
    if (shouldIgnoreUnhandledRejection(reason)) {
      console.warn(
        `${getLogPrefix()} Provider credits appear exhausted; request failed without output. Top up credits and retry.`,
      );
      return;
    }
    console.error(
      `${getLogPrefix()} Unhandled rejection:`,
      formatUncaughtError(reason),
    );
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    console.error(
      `${getLogPrefix()} Uncaught exception:`,
      formatUncaughtError(error),
    );
    process.exit(1);
  });

  const primary = getPrimaryCommand(argv);
  if (primary && !hasHelpOrVersion(argv)) {
    await registerSubCliByName(program, primary);
  }

  try {
    await program.parseAsync(argv);
  } catch (err) {
    // If commander threw because of an early exit (e.g. --help, --version), don't crash.
    if (err && typeof err === "object" && "code" in err && "exitCode" in err) {
      process.exitCode = (err as { exitCode: number }).exitCode ?? 1;
      return;
    }
    throw err;
  }
}
