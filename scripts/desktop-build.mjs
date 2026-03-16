#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "apps", "app");
const ELECTROBUN_DIR = path.join(APP_DIR, "electrobun");
const DIST_PACKAGE_JSON = path.join(ROOT, "dist", "package.json");
const PROFILE_EXCLUDED_OPTIONAL_PACKS = {
  full: [],
  "no-streaming": ["streaming"],
};
const COMMAND_PREFIX = (process.env.MILADY_DESKTOP_COMMAND_PREFIX ?? "")
  .trim()
  .split(/\s+/)
  .filter(Boolean);

const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "build";
const flagStart = command === "build" && argv[0]?.startsWith("--") ? 0 : 1;
const args = argv.slice(flagStart);

const buildProfile =
  getArgValue(args, "profile") ?? process.env.MILADY_DESKTOP_PROFILE ?? "full";
const variant =
  getArgValue(args, "variant") ?? process.env.VITE_APP_VARIANT ?? "base";
const buildEnv = getArgValue(args, "env") ?? process.env.BUILD_ENV ?? "";
const buildWhisper = getBooleanArg(args, "build-whisper");
const stageMacosReleaseApp = getBooleanArg(args, "stage-macos-release-app");
const excludedOptionalPacks = [
  ...new Set([
    ...getProfileExcludedOptionalPacks(buildProfile),
    ...getRepeatedArgValues(args, "exclude-optional-pack"),
  ]),
];

function fail(message, code = 1) {
  console.error(`[desktop-build] ${message}`);
  process.exit(code);
}

function getProfileExcludedOptionalPacks(profile) {
  const packs = PROFILE_EXCLUDED_OPTIONAL_PACKS[profile];
  if (!packs) {
    fail(
      `Unknown desktop build profile: ${profile}. Available profiles: ${Object.keys(PROFILE_EXCLUDED_OPTIONAL_PACKS).join(", ")}`,
    );
  }
  return packs;
}

function which(commandName) {
  const pathEnv = process.env.PATH ?? "";
  if (!pathEnv) return null;

  const isWindows = process.platform === "win32";
  const exts = isWindows
    ? (process.env.PATHEXT?.split(";").filter(Boolean) ?? [
        ".EXE",
        ".CMD",
        ".BAT",
        ".COM",
      ])
    : [""];

  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const suffix = isWindows && ext && !commandName.endsWith(ext) ? ext : "";
      const candidate = path.join(dir, `${commandName}${suffix}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function getArgValue(argvItems, name) {
  const exact = `--${name}`;
  const prefixed = `--${name}=`;
  const index = argvItems.indexOf(exact);
  if (index >= 0) {
    const value = argvItems[index + 1];
    return value && !value.startsWith("--") ? value : null;
  }

  const inline = argvItems.find((item) => item.startsWith(prefixed));
  return inline ? inline.slice(prefixed.length) : null;
}

function getBooleanArg(argvItems, name) {
  const value = getArgValue(argvItems, name);
  if (value !== null) {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }
  return argvItems.includes(`--${name}`);
}

function getRepeatedArgValues(argvItems, name) {
  const values = [];
  const exact = `--${name}`;
  const prefixed = `--${name}=`;

  for (let i = 0; i < argvItems.length; i += 1) {
    const item = argvItems[i];
    if (item === exact) {
      const value = argvItems[i + 1];
      if (value && !value.startsWith("--")) {
        values.push(value);
        i += 1;
      }
      continue;
    }

    if (item.startsWith(prefixed)) {
      values.push(item.slice(prefixed.length));
    }
  }

  return values;
}

function buildInvocation(binary, binaryArgs = []) {
  if (COMMAND_PREFIX.length === 0) {
    return { command: binary, args: binaryArgs };
  }

  return {
    command: COMMAND_PREFIX[0],
    args: [...COMMAND_PREFIX.slice(1), binary, ...binaryArgs],
  };
}

function run(commandName, commandArgs, options = {}) {
  const { cwd = ROOT, env = process.env, label } = options;
  const invocation = buildInvocation(commandName, commandArgs);
  const rendered = [invocation.command, ...invocation.args].join(" ");
  console.log(`[desktop-build] ${label ?? rendered}`);

  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    fail(
      `${rendered} failed with exit code ${result.status ?? 1}`,
      result.status ?? 1,
    );
  }
}

function runBun(commandArgs, options = {}) {
  const bun = which("bun");
  if (!bun) {
    fail('Could not find "bun" in PATH.');
  }
  run(bun, commandArgs, options);
}

function runNode(commandArgs, options = {}) {
  const node = which("node") ?? process.execPath;
  run(node, commandArgs, options);
}

function runPackageBinary(binary, binaryArgs, options = {}) {
  const bunx = which("bunx");
  if (bunx) {
    run(bunx, [binary, ...binaryArgs], options);
    return;
  }

  const npx = which("npx");
  if (npx) {
    run(npx, [binary, ...binaryArgs], options);
    return;
  }

  fail(`Could not find bunx or npx to run ${binary}.`);
}

function runElectrobun(commandArgs, options = {}) {
  const direct = which("electrobun");
  if (direct) {
    run(direct, commandArgs, options);
    return;
  }

  runPackageBinary("electrobun", commandArgs, options);
}

function ensureAppDirs() {
  for (const dir of [APP_DIR, ELECTROBUN_DIR]) {
    if (!fs.existsSync(dir)) {
      fail(`Expected directory not found: ${dir}`);
    }
  }
}

function writeDistPackageJson() {
  fs.mkdirSync(path.dirname(DIST_PACKAGE_JSON), { recursive: true });
  fs.writeFileSync(DIST_PACKAGE_JSON, '{"type":"module"}\n');
}

function stageDesktopBuild() {
  ensureAppDirs();

  runPackageBinary("tsdown", [], {
    cwd: ROOT,
    label: "Building core runtime bundle with tsdown",
  });
  writeDistPackageJson();

  runNode(["--import", "tsx", "scripts/write-build-info.ts"], {
    cwd: ROOT,
    label: "Writing build metadata",
  });

  runNode(
    [
      "--import",
      "tsx",
      "scripts/copy-runtime-node-modules.ts",
      "--scan-dir",
      "dist",
      "--target-dist",
      "dist",
      ...excludedOptionalPacks.flatMap((pack) => [
        "--exclude-optional-pack",
        pack,
      ]),
    ],
    {
      cwd: ROOT,
      label:
        excludedOptionalPacks.length > 0
          ? `Bundling runtime node_modules into dist (profile=${buildProfile}, excluding: ${excludedOptionalPacks.join(", ")})`
          : `Bundling runtime node_modules into dist (profile=${buildProfile})`,
    },
  );

  runBun(["install", "--frozen-lockfile", "--ignore-scripts"], {
    cwd: APP_DIR,
    label: "Ensuring app workspace dependencies are installed",
  });

  runBun(["install", "--frozen-lockfile", "--ignore-scripts"], {
    cwd: ELECTROBUN_DIR,
    label: "Ensuring Electrobun workspace dependencies are installed",
  });

  runPackageBinary("vite", ["build"], {
    cwd: APP_DIR,
    env: { ...process.env, VITE_APP_VARIANT: variant },
    label: `Building renderer bundle (VITE_APP_VARIANT=${variant})`,
  });

  runBun(["run", "build:preload"], {
    cwd: ELECTROBUN_DIR,
    label: "Building Electrobun preload bridge",
  });

  if (process.platform === "darwin") {
    runBun(["run", "build:native-effects"], {
      cwd: ELECTROBUN_DIR,
      label: "Building native macOS effects dylib",
    });
  }

  if (
    buildWhisper &&
    (process.platform === "darwin" || process.platform === "linux")
  ) {
    runBun(["run", "build:whisper"], {
      cwd: ELECTROBUN_DIR,
      label: "Building whisper.cpp native binary",
    });
  }
}

function packageDesktopBuild() {
  ensureAppDirs();
  const packageArgs = ["run", "build"];
  if (buildEnv) {
    packageArgs.push("--", `--env=${buildEnv}`);
  }

  const packageEnv = {
    ...process.env,
  };

  runBun(packageArgs, {
    cwd: ELECTROBUN_DIR,
    env: packageEnv,
    label: buildEnv
      ? `Packaging Electrobun app (env=${buildEnv})`
      : "Packaging Electrobun app",
  });

  if (stageMacosReleaseApp && process.platform === "darwin") {
    run(
      "bash",
      ["apps/app/electrobun/scripts/stage-macos-release-artifacts.sh"],
      {
        cwd: ROOT,
        env: {
          ...packageEnv,
          ELECTROBUN_SKIP_CODESIGN: process.env.ELECTROBUN_SKIP_CODESIGN ?? "1",
          MILADY_STAGE_MACOS_SKIP_DMG:
            process.env.MILADY_STAGE_MACOS_SKIP_DMG ?? "1",
        },
        label: "Staging direct macOS release app",
      },
    );
  }
}

function runDesktopBuild() {
  const electrobunArgs = ["run"];
  runElectrobun(electrobunArgs, {
    cwd: ELECTROBUN_DIR,
    label: "Launching packaged Electrobun app",
  });
}

function printUsage() {
  console.log(`Usage: node scripts/desktop-build.mjs <command> [options]

Commands:
  stage    Build runtime/assets/preload inputs for desktop packaging
  package  Run electrobun build against the staged desktop inputs
  build    Run stage + package
  run      Run stage + package + electrobun run

Options:
  --profile <full|no-streaming>    Optional desktop packaging profile (default: full)
  --variant <base|companion|full>  Renderer build variant (default: base)
  --env <channel>                  Electrobun build env (e.g. canary, stable)
  --build-whisper                  Build whisper.cpp on macOS/Linux during stage
  --stage-macos-release-app        Stage a direct macOS .app + DMG from the Electrobun build output
  --exclude-optional-pack <name>   Exclude a manifest-classified optional capability pack during staging

Environment:
  MILADY_DESKTOP_COMMAND_PREFIX    Prefix every spawned command, e.g. "arch -x86_64"
`);
}

switch (command) {
  case "stage":
    stageDesktopBuild();
    break;
  case "package":
    packageDesktopBuild();
    break;
  case "build":
    stageDesktopBuild();
    packageDesktopBuild();
    break;
  case "run":
    stageDesktopBuild();
    packageDesktopBuild();
    runDesktopBuild();
    break;
  case "help":
  case "--help":
  case "-h":
    printUsage();
    break;
  default:
    fail(`Unknown command: ${command}`);
}
