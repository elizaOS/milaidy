import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const WORKFLOW_PATH = path.join(ROOT, ".github/workflows/test.yml");

describe("Electrobun test workflow drift", () => {
  it("builds the preload bridge before packaging the app", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const preloadIndex = workflow.indexOf("name: Build webview bridge preload");
    const packageIndex = workflow.indexOf("name: Build Electrobun app");

    expect(preloadIndex).toBeGreaterThan(-1);
    expect(packageIndex).toBeGreaterThan(preloadIndex);
  });

  it("stages startup diagnostics into runner temp before upload", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Stage Electrobun build diagnostic logs");
    expect(workflow).toContain(
      'Join-Path $env:RUNNER_TEMP "electrobun-ui-e2e-logs"',
    );
    expect(workflow).toContain(
      "path: $" + "{{ runner.temp }}/electrobun-ui-e2e-logs",
    );
  });

  it("uploads packaged macOS smoke diagnostics from runner temp", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Upload packaged macOS smoke diagnostics");
    expect(workflow).toContain(
      "SMOKE_DIAGNOSTICS_DIR: $" +
        "{{ runner.temp }}/milady-packaged-dmg-smoke",
    );
    expect(workflow).toContain(
      "path: |\n            $" +
        "{{ runner.temp }}/milady-packaged-dmg-smoke/**",
    );
    expect(workflow).toContain(
      "apps/app/electrobun/build/**/wrapper-diagnostics.json",
    );
  });
});
