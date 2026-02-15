import { Command } from "commander";
import { CLI_VERSION } from "../version.js";
import { registerProgramCommands } from "./command-registry.js";
import { configureProgramHelp } from "./help.js";
import { registerPreActionHooks } from "./preaction.js";

export function buildProgram() {
  const program = new Command();

  configureProgramHelp(program, CLI_VERSION);
  registerPreActionHooks(program, CLI_VERSION);
  registerProgramCommands(program);

  return program;
}
