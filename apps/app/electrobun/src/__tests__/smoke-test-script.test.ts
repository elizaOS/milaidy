import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SMOKE_TEST_PATH = path.resolve(
  import.meta.dirname,
  "../../scripts/smoke-test.sh",
);

describe("smoke-test.sh", () => {
  it("uses the shared desktop build entrypoint when packaging locally", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain(
      'scripts/desktop-build.mjs build --profile="$DESKTOP_BUILD_PROFILE" --variant=base',
    );
    expect(script).toContain(
      'DESKTOP_BUILD_PROFILE="$' + "{DESKTOP_BUILD_PROFILE:-full}" + '"',
    );
    expect(script).toContain('--profile="$DESKTOP_BUILD_PROFILE"');
    expect(script).toContain("build_args+=(--stage-macos-release-app)");
    expect(script).not.toContain(
      'bunx tsdown && echo \'{"type":"module"}\' > dist/package.json',
    );
    expect(script).not.toContain(
      "node --import tsx scripts/copy-runtime-node-modules.ts --scan-dir dist --target-dist dist",
    );
  });

  it("waits for packaged app handoff after the launcher exits", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain(
      'PACKAGED_HANDOFF_GRACE_SECONDS="$' +
        '{PACKAGED_HANDOFF_GRACE_SECONDS:-90}"',
    );
    expect(script).toContain(
      "Launcher exited before the first health probe; continuing to wait for packaged app handoff...",
    );
    expect(script).toContain(
      "Launcher exited; waiting for packaged app handoff...",
    );
    expect(script).toContain(
      "Launcher handoff detected; following packaged app process",
    );
    expect(script).toContain('if [[ "$f" == *"/.dmg-staging/"* ]]; then');
  });

  it("requires a staged app bundle instead of mounting the DMG", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain("No staged .app bundle found under $OUTPUT_DIR");
    expect(script).toContain(
      "DMG fallback is disabled.",
    );
    expect(script).not.toContain("attach_dmg_with_retry()");
    expect(script).not.toContain(
      'MOUNT_POINT="$(attach_dmg_with_retry "$DMG_PATH")"',
    );
    expect(script).not.toContain(
      "No .app bundle found in artifacts; mounting DMG",
    );
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
    expect(script).toContain("Contents/Resources/app/bun/index\\\\.js");
    expect(script).toContain("Contents/Resources/main\\\\.js");
  });

  it("requires wrapper diagnostics for non-dev packaged builds", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain("verify_wrapper_diagnostics() {");
    expect(script).toContain('if [[ "$BUILD_ENV" == "dev" ]]; then');
    expect(script).toContain("dev builds do not run postWrap");
    expect(script).toContain(
      "wrapper-diagnostics.json was not produced for this $BUILD_ENV build",
    );
    expect(script).toContain("Wrapper diagnostics: $WRAPPER_DIAGNOSTICS_PATH");
    expect(script).toContain("print_wrapper_diagnostics_summary");
  });

  it("uses a minimal launcher environment on macOS GitHub Actions", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain("build_launcher_command() {");
    expect(script).toContain(
      'if [[ "$(uname)" == "Darwin" && -n "$' +
        "{GITHUB_ACTIONS:-}" +
        '" ]]; then',
    );
    expect(script).toContain("/usr/bin/env");
    expect(script).toContain("-i");
    expect(script).toContain('HOME="$HOME"');
    expect(script).toContain('TERM="$' + "{TERM:-dumb}" + '"');
    expect(script).toContain(
      '"$' + "{LAUNCH_COMMAND[@]}" + '" >"$LAUNCHER_STDOUT"',
    );
  });

  it("falls back to the full startup log when the packaged app recreates it", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain("read_startup_log_slice() {");
    expect(script).toContain(
      'if [[ "$current_size" -lt "$LOG_OFFSET" ]]; then',
    );
    expect(script).toContain('cat "$STARTUP_LOG"');
    expect(script).toContain('LOG_SLICE="$(read_startup_log_slice)"');
  });

  it("makes streaming startup assertions conditional on the staged runtime manifest", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain("desktop_runtime_manifest_excludes_pack() {");
    expect(script).toContain("startup_log_has_unexpected_missing_module() {");
    expect(script).toContain(
      'DESKTOP_RUNTIME_MANIFEST="$REPO_ROOT/dist/desktop-runtime-manifest.json"',
    );
    expect(script).toContain(
      'if desktop_runtime_manifest_excludes_pack "streaming"; then',
    );
    expect(script).toContain(
      'if startup_log_has_unexpected_missing_module "$LOG_SLICE"',
    );
    expect(script).toContain(
      "Streaming plugin resolution check skipped (streaming capability pack excluded).",
    );
  });
});
