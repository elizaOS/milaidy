import { isRich, theme } from "../terminal/theme";
import { resolveCommitHash } from "./git-commit";

type BannerOptions = {
  env?: NodeJS.ProcessEnv;
  argv?: string[];
  commit?: string | null;
  richTty?: boolean;
};

let bannerEmitted = false;

export function formatCliBannerLine(
  version: string,
  options: BannerOptions = {},
): string {
  const commit = options.commit ?? resolveCommitHash({ env: options.env });
  const commitLabel = commit ?? "unknown";
  const rich = options.richTty ?? isRich();
  const title = "Milady";
  if (rich) {
    return `${theme.heading(title)} ${theme.info(version)} ${theme.muted(`(${commitLabel})`)}`;
  }
  return `${title} ${version} (${commitLabel})`;
}

export function emitCliBanner(version: string, options: BannerOptions = {}) {
  if (bannerEmitted) {
    return;
  }
  const argv = options.argv ?? process.argv;
  if (!process.stdout.isTTY) {
    return;
  }
  if (argv.some((a) => a === "--json" || a.startsWith("--json="))) {
    return;
  }
  if (argv.some((a) => a === "--version" || a === "-V" || a === "-v")) {
    return;
  }
  const _rich = options.richTty ?? isRich();
  const line = formatCliBannerLine(version, options);
  process.stdout.write(`${line}\n\n`);
  bannerEmitted = true;
}

export function hasEmittedCliBanner(): boolean {
  return bannerEmitted;
}
