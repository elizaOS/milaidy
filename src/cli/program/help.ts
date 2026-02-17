import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links";
import { isRich, theme } from "../../terminal/theme";
import { formatCliBannerLine, hasEmittedCliBanner } from "../banner";
import { replaceCliName, resolveCliName } from "../cli-name";

const CLI_NAME = resolveCliName();

const EXAMPLES = [
  ["milady", "Start Milady in the interactive TUI."],
  ["milady start", "Start the classic runtime/chat loop."],
  ["milady dashboard", "Open the Control UI in your browser."],
  ["milady setup", "Initialize ~/.milady/milady.json and the agent workspace."],
  ["milady config get agents.defaults.model.primary", "Read a config value."],
  ["milady models", "Show configured model providers."],
  ["milady plugins list", "List available plugins."],
  ["milady update", "Check for and install the latest version."],
  ["milady update channel beta", "Switch to the beta release channel."],
] as const;

export function configureProgramHelp(program: Command, programVersion: string) {
  program
    .name(CLI_NAME)
    .description("")
    .version(programVersion, "-v, --version")
    .option("--verbose", "Enable informational runtime logs")
    .option("--debug", "Enable debug-level runtime logs")
    .option(
      "--dev",
      "Dev profile: isolate state under ~/.milady-dev with separate config and ports",
    )
    .option(
      "--profile <name>",
      "Use a named profile (isolates MILADY_STATE_DIR/MILADY_CONFIG_PATH under ~/.milady-<name>)",
    );

  program.option("--no-color", "Disable ANSI colors", false);

  program.configureHelp({
    optionTerm: (option) => theme.option(option.flags),
    subcommandTerm: (cmd) => theme.command(cmd.name()),
  });

  program.configureOutput({
    writeOut: (str) => {
      const colored = str
        .replace(/^Usage:/gm, theme.heading("Usage:"))
        .replace(/^Options:/gm, theme.heading("Options:"))
        .replace(/^Commands:/gm, theme.heading("Commands:"));
      process.stdout.write(colored);
    },
    writeErr: (str) => process.stderr.write(str),
    outputError: (str, write) => write(theme.error(str)),
  });

  program.addHelpText("beforeAll", () => {
    if (hasEmittedCliBanner()) {
      return "";
    }
    const rich = isRich();
    const line = formatCliBannerLine(programVersion, { richTty: rich });
    return `\n${line}\n`;
  });

  const fmtExamples = EXAMPLES.map(
    ([cmd, desc]) =>
      `  ${theme.command(replaceCliName(cmd, CLI_NAME))}\n    ${theme.muted(desc)}`,
  ).join("\n");

  program.addHelpText("afterAll", ({ command }) => {
    if (command !== program) {
      return "";
    }
    const docs = formatDocsLink("/cli", "docs.milady.ai/cli");
    return `\n${theme.heading("Examples:")}\n${fmtExamples}\n\n${theme.muted("Docs:")} ${docs}\n`;
  });
}
