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

  it("reads the Windows packaged startup log from %APPDATA%", () => {
    const smokeScript = fs.readFileSync(WINDOWS_SMOKE_PATH, "utf8");

    expect(smokeScript).toContain(
      'Join-Path $env:APPDATA "Milady\\\\milady-startup.log"',
    );
    expect(smokeScript).not.toContain(
      'Join-Path $env:USERPROFILE ".config\\\\Milady\\\\milady-startup.log"',
    );
  });
});
