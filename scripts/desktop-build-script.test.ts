import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve(import.meta.dirname, "desktop-build.mjs");

describe("desktop-build.mjs", () => {
  it("stages the desktop runtime, renderer, preload, and native inputs", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain('runPackageBinary("tsdown", [],');
    expect(script).toContain("scripts/write-build-info.ts");
    expect(script).toContain("scripts/copy-runtime-node-modules.ts");
    expect(script).toContain("--exclude-optional-pack");
    expect(script).toContain(
      'runBun(["install", "--frozen-lockfile", "--ignore-scripts"], {',
    );
    expect(script).toContain(
      "Ensuring Electrobun workspace dependencies are installed",
    );
    expect(script).toContain('runPackageBinary("vite", ["build"],');
    expect(script).toContain('runBun(["run", "build:preload"]');
    expect(script).toContain('runBun(["run", "build:native-effects"]');
    expect(script).toContain('runBun(["run", "build:whisper"]');
  });

  it("supports prefixed child commands and electrobun package fallback", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain("PROFILE_EXCLUDED_OPTIONAL_PACKS");
    expect(script).toContain("function getProfileExcludedOptionalPacks(");
    expect(script).toContain("MILADY_DESKTOP_COMMAND_PREFIX");
    expect(script).toContain("function buildInvocation(");
    expect(script).toContain("function getRepeatedArgValues(");
    expect(script).toContain('const direct = which("electrobun")');
    expect(script).toContain(
      'runPackageBinary("electrobun", commandArgs, options);',
    );
    expect(script).toContain('case "stage":');
    expect(script).toContain('case "package":');
    expect(script).toContain('case "build":');
    expect(script).toContain('case "run":');
  });

  it("packages through the electrobun workspace build script", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain('const packageArgs = ["run", "build"]');
    expect(script).toContain(
      'packageArgs.push("--", `--env=$' + "{buildEnv}`);",
    );
    expect(script).toContain("runBun(packageArgs, {");
  });

  it("can stage a direct macOS release app from the Electrobun build output", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain(
      'const stageMacosReleaseApp = getBooleanArg(args, "stage-macos-release-app");',
    );
    expect(script).toContain(
      'if (stageMacosReleaseApp && process.platform === "darwin") {',
    );
    expect(script).toContain(
      "apps/app/electrobun/scripts/stage-macos-release-artifacts.sh",
    );
    expect(script).toContain('MILADY_ELECTROBUN_NOTARIZE: "0"');
    expect(script).toContain("MILADY_STAGE_MACOS_SKIP_DMG");
    expect(script).toContain(
      "--stage-macos-release-app        Stage a direct macOS .app + DMG from the Electrobun build output",
    );
  });
});
