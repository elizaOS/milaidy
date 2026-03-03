import path from "node:path";

const CLI_NAME = "milady";

/** Matches a milady command with optional package-runner prefix (pnpm, bun, npm, bunx, npx). */
export const CLI_PREFIX_RE = /^(?:((?:pnpm|bun|npm|bunx|npx)\s+))?(milady)\b/;

export function resolveCliName(argv: string[] = process.argv): string {
  const argv1 = argv[1];
  if (!argv1) {
    return CLI_NAME;
  }
  const base = path.basename(argv1).trim();
  return base === CLI_NAME ? base : CLI_NAME;
}

export function replaceCliName(
  command: string,
  cliName = resolveCliName(),
): string {
  if (!command.trim() || !CLI_PREFIX_RE.test(command)) {
    return command;
  }
  return command.replace(
    CLI_PREFIX_RE,
    (_match, runner: string | undefined) => {
      return `${runner ?? ""}${cliName}`;
    },
  );
}
