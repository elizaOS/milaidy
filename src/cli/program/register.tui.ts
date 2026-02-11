import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";

const defaultRuntime = { error: console.error, exit: process.exit };

async function tuiAction(options: { model?: string }) {
  await runCommandWithRuntime(defaultRuntime, async () => {
    const { launchTUI } = await import("../../tui/index.js");
    const { bootElizaRuntime } = await import("../../runtime/eliza.js");

    const runtime = await bootElizaRuntime({ requireConfig: true });

    await launchTUI(runtime, {
      modelOverride: options.model,
    });
  });
}

export function registerTuiCommand(program: Command) {
  program
    .command("tui")
    .description("Start Milaidy with the interactive TUI")
    .option(
      "-m, --model <model>",
      "Model to use (e.g. anthropic/claude-sonnet-4-20250514)",
    )
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/tui", "docs.milady.ai/tui")}\n`,
    )
    .action(tuiAction);
}
