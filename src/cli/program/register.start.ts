import crypto from "node:crypto";
import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links";
import { theme } from "../../terminal/theme";
import { runCommandWithRuntime } from "../cli-utils";

const defaultRuntime = { error: console.error, exit: process.exit };

/**
 * Generate a random connection key for remote access.
 * Only called when explicitly requested via --connection-key flag
 * without a value, or when binding to a non-localhost address.
 */
function generateConnectionKey(): string {
  const generated = crypto.randomBytes(16).toString("hex");
  process.env.MILADY_API_TOKEN = generated;
  process.env.ELIZA_API_TOKEN = generated;
  return generated;
}

/**
 * Check if the server is binding to a network-accessible address
 * (not localhost), which requires a connection key for security.
 */
function isNetworkBind(): boolean {
  const bind =
    process.env.MILADY_API_BIND?.trim() || process.env.ELIZA_API_BIND?.trim();
  if (!bind) return false;
  return bind !== "127.0.0.1" && bind !== "localhost" && bind !== "::1";
}

async function startAction() {
  // Auto-generate a connection key only when binding to a network address
  // and no token is already configured. Localhost access stays open.
  const existingToken =
    process.env.MILADY_API_TOKEN?.trim() || process.env.ELIZA_API_TOKEN?.trim();

  if (!existingToken && isNetworkBind()) {
    generateConnectionKey();
  }

  const connectionKey =
    process.env.MILADY_API_TOKEN?.trim() || process.env.ELIZA_API_TOKEN?.trim();

  await runCommandWithRuntime(defaultRuntime, async () => {
    const { startEliza } = await import("../../runtime/eliza");
    // Use serverOnly mode: starts API server, no interactive chat loop
    await startEliza({
      serverOnly: true,
      onEmbeddingProgress: (phase, detail) => {
        if (phase === "downloading") {
          console.log(`[milady] Embedding: ${detail ?? "downloading..."}`);
        } else if (phase === "ready") {
          console.log(`[milady] Embedding model ready`);
        }
      },
    });

    const port = process.env.MILADY_PORT || process.env.ELIZA_PORT || "2138";
    console.log("");
    console.log("╭──────────────────────────────────────────╮");
    console.log("│  Milady is running.                      │");
    console.log("│                                          │");
    console.log(`│  Connect at: http://localhost:${port.padEnd(13)}│`);
    if (connectionKey) {
      console.log(
        `│  Connection key: ${connectionKey.slice(0, 20).padEnd(22)}│`,
      );
    }
    console.log("╰──────────────────────────────────────────╯");
    console.log("");
  });
}

export function registerStartCommand(program: Command) {
  program
    .command("start")
    .description("Start the elizaOS agent runtime")
    .option(
      "--connection-key [key]",
      "Set or auto-generate a connection key for remote access",
    )
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/getting-started", "docs.eliza.ai/getting-started")}\n`,
    )
    .action(async (opts: { connectionKey?: string | boolean }) => {
      if (typeof opts.connectionKey === "string" && opts.connectionKey) {
        // Explicit key provided
        process.env.MILADY_API_TOKEN = opts.connectionKey;
        process.env.ELIZA_API_TOKEN = opts.connectionKey;
      } else if (opts.connectionKey === true) {
        // Flag passed without value — auto-generate
        generateConnectionKey();
      }
      await startAction();
    });

  program
    .command("run")
    .description("Alias for start")
    .option(
      "--connection-key [key]",
      "Set or auto-generate a connection key for remote access",
    )
    .action(async (opts: { connectionKey?: string | boolean }) => {
      if (typeof opts.connectionKey === "string" && opts.connectionKey) {
        process.env.MILADY_API_TOKEN = opts.connectionKey;
        process.env.ELIZA_API_TOKEN = opts.connectionKey;
      } else if (opts.connectionKey === true) {
        generateConnectionKey();
      }
      await startAction();
    });
}
