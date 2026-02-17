import type { Command } from "commander";
import { registerConfigCli } from "./register.config";
import { registerConfigureCommand } from "./register.configure";
import { registerDashboardCommand } from "./register.dashboard";
import { registerSetupCommand } from "./register.setup";
import { registerStartCommand } from "./register.start";
import { registerSubCliCommands } from "./register.subclis";
import { registerTuiCommand } from "./register.tui";
import { registerUpdateCommand } from "./register.update";

export function registerProgramCommands(
  program: Command,
  argv: string[] = process.argv,
) {
  registerStartCommand(program);
  registerTuiCommand(program);
  registerSetupCommand(program);
  registerConfigureCommand(program);
  registerConfigCli(program);
  registerDashboardCommand(program);
  registerUpdateCommand(program);
  registerSubCliCommands(program, argv);
}
