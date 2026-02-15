import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { isRich, theme } from "../../terminal/theme.js";
import { formatCliBannerLine, hasEmittedCliBanner } from "../banner.js";
import { replaceCliName, resolveCliName } from "../cli-name.js";

const CLI_NAME = resolveCliName();

const EXAMPLES = [
  ["milaidy", "Start Milaidy in the interactive TUI."],
  ["milaidy start", "Start the classic runtime/chat loop."],
  ["milaidy dashboard", "Open the Control UI in your browser."],
  [
    "milaidy setup",
    "Initialize ~/.milaidy/milaidy.json and the agent workspace.",
  ],
  ["milaidy config get agents.defaults.model.primary", "Read a config value."],
  ["milaidy models", "Show configured model providers."],
  ["milaidy plugins list", "List available plugins."],
  ["milaidy update", "Check for and install the latest version."],
  ["milaidy update channel beta", "Switch to the beta release channel."],
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
      "Dev profile: isolate state under ~/.milaidy-dev with separate config and ports",
    )
    .option(
      "--profile <name>",
      "Use a named profile (isolates MILAIDY_STATE_DIR/MILAIDY_CONFIG_PATH under ~/.milaidy-<name>)",
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
