import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";

const defaultRuntime = { error: console.error, exit: process.exit };

export function registerSetupCommand(program: Command) {
  program
    .command("setup")
    .description("Initialize ~/.milady/milady.json and the agent workspace")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/getting-started/setup", "docs.milady.ai/getting-started/setup")}\n`,
    )
    .option("--workspace <dir>", "Agent workspace directory")
    .action(async (opts: { workspace?: string }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { loadMiladyConfig } = await import("../../config/config.js");
        const { ensureAgentWorkspace, resolveDefaultAgentWorkspaceDir } =
          await import("../../providers/workspace.js");

        let config: Record<string, unknown> = {};
        try {
          config = loadMiladyConfig() as Record<string, unknown>;
          console.log(`${theme.success("✓")} Config loaded`);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            console.log(`${theme.muted("→")} No config found, using defaults`);
          } else {
            throw err;
          }
        }

        const agents = config.agents as
          | Record<string, Record<string, string>>
          | undefined;
        const workspaceDir =
          opts.workspace ??
          agents?.defaults?.workspace ??
          resolveDefaultAgentWorkspaceDir();
        await ensureAgentWorkspace({
          dir: workspaceDir,
          ensureBootstrapFiles: true,
        });
        console.log(
          `${theme.success("✓")} Agent workspace ready: ${workspaceDir}`,
        );
        console.log(`\n${theme.success("Setup complete.")}`);
      });
    });
}
