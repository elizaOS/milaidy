import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const WORKFLOW_PATH = path.join(
  ROOT,
  ".github/workflows/release-electrobun.yml",
);
const WINDOWS_SMOKE_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/smoke-test-windows.ps1",
);
const MACOS_STAGE_SCRIPT_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/stage-macos-release-artifacts.sh",
);
const MACOS_EFFECTS_BUILD_SCRIPT_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/build-macos-effects.sh",
);
const MACOS_DIRECT_LAUNCHER_SOURCE_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/macos-direct-launcher.c",
);

describe("Electrobun release workflow drift", () => {
  it("stages the built renderer before packaging", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Stage renderer for Electrobun bundle");
    expect(workflow).toContain(
      "cp -r apps/app/dist apps/app/electrobun/renderer",
    );
  });

  it("injects version.json into packaged bundles after the build step", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const buildIndex = workflow.indexOf("name: Build Electrobun app");
    const windowsIndex = workflow.indexOf(
      "name: Inject version.json into bundle (Windows)",
    );
    const unixIndex = workflow.indexOf(
      "name: Inject version.json into bundle (macOS / Linux)",
    );

    expect(buildIndex).toBeGreaterThan(-1);
    expect(windowsIndex).toBeGreaterThan(buildIndex);
    expect(unixIndex).toBeGreaterThan(buildIndex);
    expect(workflow).toContain('"identifier":"com.miladyai.milady"');
  });

  it("builds the Intel macOS artifact on the real Intel runner", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("- name: macOS (Intel)");
    expect(workflow).toContain("runner: macos-15-intel");
    expect(workflow).toContain("- name: Setup Node.js");
    expect(workflow).toContain("- name: Setup Bun");
    expect(workflow).toContain(
      "arch -x86_64 bun install --frozen-lockfile --ignore-scripts",
    );
    expect(workflow).toContain("arch -x86_64 bunx tsdown");
    expect(workflow).toContain("arch -x86_64 npx vite build");
    expect(workflow).toContain("arch -x86_64 bun run build:whisper");
    expect(workflow).toContain(
      `arch -x86_64 electrobun build --env=\${{ needs.prepare.outputs.env }}`,
    );
    expect(workflow).not.toContain(
      "name: Setup Node.js (macOS Intel via Rosetta)",
    );
    expect(workflow).not.toContain("name: Setup Bun (macOS Intel via Rosetta)");
    expect(workflow).not.toContain("bun-darwin-x64.zip");
  });

  it("keeps updater transport files off the public GitHub release asset list", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Collect public release files");
    expect(workflow).toContain(' -name "*.dmg" -o \\');
    expect(workflow).toContain(' -name "*.exe" -o \\');
    expect(workflow).toContain(' -name "*Setup*.tar.gz" \\');

    expect(workflow).toContain("name: Collect update channel files");
    expect(workflow).toContain(' -name "*.tar.zst" -o \\');
    expect(workflow).toContain(' -name "*-update.json" \\');
    expect(workflow).toContain("files: release-files/*");
    expect(workflow).toContain("update-channel/");
  });

  it("treats the staged macOS app as an intermediate signed bundle, not a notarized final artifact", () => {
    const stageScript = fs.readFileSync(MACOS_STAGE_SCRIPT_PATH, "utf8");

    expect(stageScript).toContain(
      "electrobun. Re-sign only what changed and keep the original entitlements",
    );
    expect(stageScript).toContain(
      'codesign -d --entitlements :- "$STAGED_APP_PATH"',
    );
    expect(stageScript).toContain(
      `--options runtime "\${entitlement_args[@]}" "$LAUNCHER_PATH"`,
    );
    expect(stageScript).toContain(
      `--options runtime "\${entitlement_args[@]}" "$STAGED_APP_PATH"`,
    );
    expect(stageScript).toContain(
      'codesign --verify --deep --strict --verbose=2 "$STAGED_APP_PATH"',
    );
    expect(stageScript).toContain("command_status=$?");
    expect(stageScript).not.toContain(
      'codesign --force --deep --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" "$STAGED_APP_PATH"',
    );
    expect(stageScript).not.toContain(
      'spctl -a -vv --type exec "$STAGED_APP_PATH"',
    );
    expect(stageScript).toContain("xcrun notarytool submit \\");
    expect(stageScript).toContain('xcrun stapler staple "$TEMP_DMG_PATH"');
  });

  it("pins the native macOS effects build to C++17", () => {
    const buildScript = fs.readFileSync(
      MACOS_EFFECTS_BUILD_SCRIPT_PATH,
      "utf8",
    );

    expect(buildScript).toContain("-std=c++17");
  });

  it("launches the staged macOS app via absolute bun and main.js paths", () => {
    const launcherSource = fs.readFileSync(
      MACOS_DIRECT_LAUNCHER_SOURCE_PATH,
      "utf8",
    );

    expect(launcherSource).toContain('"%s/bun"');
    expect(launcherSource).toContain('"%s/../Resources/main.js"');
    expect(launcherSource).not.toContain(
      '{"./bun", "../Resources/main.js", NULL}',
    );
  });

  it("reads the Windows packaged startup log from %APPDATA%", () => {
    const smokeScript = fs.readFileSync(WINDOWS_SMOKE_PATH, "utf8");

    expect(smokeScript).toContain(
      'Join-Path $env:APPDATA "Milady\\\\milady-startup.log"',
    );
    expect(smokeScript).not.toContain(
      'Join-Path $env:USERPROFILE ".config\\\\Milady\\\\milady-startup.log"',
    );
  });

  it("collects Windows smoke diagnostics from runner environment paths before upload", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Collect Windows smoke diagnostics");
    expect(workflow).toContain("name: Upload Windows smoke diagnostics");
    expect(workflow).toContain(
      'Join-Path $env:APPDATA "Milady\\\\milady-startup.log"',
    );
    expect(workflow).toContain(
      'Join-Path $env:LOCALAPPDATA "com.miladyai.milady"',
    );
    expect(workflow).toContain(
      "path: apps/app/electrobun/artifacts/windows-smoke-diagnostics/**",
    );
    expect(workflow).not.toContain("env.USERPROFILE }}\\.config\\Milady");
  });
});
