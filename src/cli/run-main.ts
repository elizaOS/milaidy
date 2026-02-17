import process from "node:process";
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

export async function runCli(argv: string[] = process.argv) {
  await loadDotEnv();

  // Normalize env: copy Z_AI_API_KEY → ZAI_API_KEY when ZAI_API_KEY is empty.
  if (!process.env.ZAI_API_KEY?.trim() && process.env.Z_AI_API_KEY?.trim()) {
    process.env.ZAI_API_KEY = process.env.Z_AI_API_KEY;
  }

  const { buildProgram } = await import("./program");
  const program = buildProgram();

  process.on("unhandledRejection", (reason) => {
    console.error("[milady] Unhandled rejection:", formatUncaughtError(reason));
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    console.error("[milady] Uncaught exception:", formatUncaughtError(error));
    process.exit(1);
  });

  const primary = getPrimaryCommand(argv);
  if (primary && !hasHelpOrVersion(argv)) {
    await registerSubCliByName(program, primary);
  }

  await program.parseAsync(argv);
}
