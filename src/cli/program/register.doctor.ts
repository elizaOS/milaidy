import type { Command } from "commander";
import { theme } from "../../terminal/theme";
import { runCommandWithRuntime } from "../cli-utils";
import type { CheckResult, CheckStatus } from "../doctor/checks";

const defaultRuntime = { error: console.error, exit: process.exit };

function statusIcon(status: CheckStatus): string {
  switch (status) {
    case "pass":
      return theme.success("✓");
    case "fail":
      return theme.error("✗");
    case "warn":
      return theme.warn("⚠");
    case "skip":
      return theme.muted("–");
  }
}

function printResult(result: CheckResult): void {
  const icon = statusIcon(result.status);
  const label = result.label.padEnd(20);
  const detail = result.detail ? theme.muted(result.detail) : "";
  console.log(`  ${icon} ${label} ${detail}`);
  if (result.fix && result.status !== "pass") {
    console.log(`      ${theme.muted("fix:")} ${theme.command(result.fix)}`);
  }
}

export function registerDoctorCommand(program: Command) {
  program
    .command("doctor")
    .description("Check environment health and diagnose common issues")
    .option("--no-ports", "Skip port availability checks")
    .action(async (opts: { ports: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { runAllChecks } = await import("../doctor/checks");

        console.log(`\n${theme.heading("Milady Health Check")}\n`);

        const results = await runAllChecks({ checkPorts: opts.ports });

        for (const result of results) {
          printResult(result);
        }

        const issues = results.filter(
          (r) => r.status === "fail" || r.status === "warn",
        );
        const failures = results.filter((r) => r.status === "fail");

        console.log();
        if (failures.length === 0 && issues.length === 0) {
          console.log(
            `  ${theme.success("Everything looks good.")} Ready to run ${theme.command("milady start")}.`,
          );
        } else if (failures.length > 0) {
          console.log(
            `  ${theme.error(`${failures.length} issue${failures.length === 1 ? "" : "s"} found.`)} Run ${theme.command("milady setup")} to fix.`,
          );
        } else {
          console.log(
            `  ${theme.warn(`${issues.length} warning${issues.length === 1 ? "" : "s"}.`)} Things should still work.`,
          );
        }

        console.log();

        if (failures.length > 0) {
          process.exit(1);
        }
      });
    });
}
