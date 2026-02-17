import { ascii } from "../ascii";
import { cyberGreen, isRich, theme } from "../terminal/theme";
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
  const title = "milAIdy";
  if (rich) {
    return `${theme.heading(title)} ${theme.info(version)} ${theme.muted(`(${commitLabel})`)}`;
  }
  return `${title} ${version} (${commitLabel})`;
}

function formatAsciiBanner(rich: boolean): string {
  if (rich) {
    return ascii
      .split("\n")
      .map((line) => cyberGreen(line))
      .join("\n");
  }
  return ascii;
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
  const rich = options.richTty ?? isRich();
  const art = formatAsciiBanner(rich);
  const line = formatCliBannerLine(version, options);
  process.stdout.write(`\n${art}\n\n${line}\n\n`);
  bannerEmitted = true;
}

export function hasEmittedCliBanner(): boolean {
  return bannerEmitted;
}
