import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SMOKE_TEST_PATH = path.resolve(
  import.meta.dirname,
  "../../scripts/smoke-test.sh",
);

describe("smoke-test.sh", () => {
  it("waits for packaged app handoff after the launcher exits", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain(
      'PACKAGED_HANDOFF_GRACE_SECONDS="$' +
        '{PACKAGED_HANDOFF_GRACE_SECONDS:-15}"',
    );
    expect(script).toContain(
      "Launcher exited; waiting for packaged app handoff...",
    );
    expect(script).toContain(
      "Launcher handoff detected; following packaged app process",
    );
    expect(script).toContain("launcher exited before packaged app handoff");
    expect(script).toContain('if [[ "$f" == *"/.dmg-staging/"* ]]; then');
  });

  it("accepts both wrapper bundles and direct app bundles", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain(
      'RUNTIME_ARCHIVE="$(find "$APP_BUNDLE/Contents/Resources"',
    );
    expect(script).toContain(
      'DIRECT_WGPU_DYLIB="$APP_BUNDLE/Contents/MacOS/libwebgpu_dawn.dylib"',
    );
    expect(script).toContain(
      'echo "WGPU : wrapper bundle -> $RUNTIME_ARCHIVE"',
    );
    expect(script).toContain(
      'echo "WGPU : direct app bundle -> $DIRECT_WGPU_DYLIB"',
    );
  });

  it("uses a minimal launcher environment on macOS GitHub Actions", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain("build_launcher_command() {");
    expect(script).toContain(
      'if [[ "$(uname)" == "Darwin" && -n "$' + '{GITHUB_ACTIONS:-}" ]]; then',
    );
    expect(script).toContain("/usr/bin/env");
    expect(script).toContain("-i");
    expect(script).toContain('HOME="$HOME"');
    expect(script).toContain('TERM="$' + '{TERM:-dumb}"');
    expect(script).toContain('"$' + '{LAUNCH_COMMAND[@]}" >"$LAUNCHER_STDOUT"');
  });
});
