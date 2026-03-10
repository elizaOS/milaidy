#!/usr/bin/env -S node --import tsx

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

type PackFile = { path: string };
type PackResult = { files?: PackFile[] };

const requiredPaths = [
  "dist/index.js",
  "dist/entry.js",
  "dist/build-info.json",
];
const forbiddenPrefixes = ["dist/Milady.app/"];
const requiredWorkflowSnippets = [
  'BUN_VERSION: "1.3.9"',
  "name: Validate Release Inputs",
  "bun-version: $" + "{{ env.BUN_VERSION }}",
  "name: Release readiness checks",
  "run: bun run release:check",
  "Install quiet macOS packaging wrappers",
  "apps/app/electrobun/scripts/xcrun-wrapper.sh",
  "apps/app/electrobun/scripts/zip-wrapper.sh",
  "ELECTROBUN_REAL_XCRUN: /usr/bin/xcrun",
  "ELECTROBUN_REAL_ZIP: /usr/bin/zip",
  "MILADY_ELECTROBUN_NOTARIZE: 0",
  "Stage desktop bundle inputs",
  "node scripts/desktop-build.mjs stage --variant=base --build-whisper",
  "Inject version.json into bundle (Windows)",
  "Inject version.json into bundle (macOS / Linux)",
  '"identifier":"com.miladyai.milady"',
  "Stage standard macOS release app",
  "apps/app/electrobun/scripts/stage-macos-release-artifacts.sh",
  "retry_stapler_validate()",
  "No staged .app bundle found in apps/app/electrobun/artifacts",
  'zipinfo -1 "$app_zip" | grep -q "\\.app/" || {',
  "No staged .app.zip found in apps/app/electrobun/artifacts",
  "Smoke test packaged macOS app",
  "SMOKE_DIAGNOSTICS_DIR:",
  "SKIP_BUILD=1",
  "bash apps/app/electrobun/scripts/smoke-test.sh",
  "Upload macOS smoke diagnostics",
  "wrapper-diagnostics.json",
  "node scripts/desktop-build.mjs package --env=$" +
    "{{ needs.prepare.outputs.env }}",
  "Stage Windows setup executables",
  "name: Write CI artifact note",
  "apps/app/electrobun/artifacts/CI-ARTIFACT-README.txt",
  "name: Upload CI transport artifacts",
  "electrobun-$" + "{{ matrix.platform.artifact-name }}-ci-bundle",
  "apps/app/electrobun/artifacts/*.app/**",
  "apps/app/electrobun/artifacts/*.app.zip",
  "apps/app/electrobun/artifacts/*.exe",
  "pattern: electrobun-*-ci-bundle",
  "name: Collect public release files",
  '-name "*.app.zip" -o \\',
  '-name "*Setup*.zip" -o \\',
  '-name "*Setup*.tar.gz" \\',
  "name: Collect update channel files",
  '-name "*.tar.zst" -o \\',
  '-name "*-update.json" \\',
  "apps/app/electrobun/build/**/wrapper-diagnostics.json",
  "https://api.github.com/repos/blackboardsh/electrobun/releases/tags/v$version",
  "$asset = @($release.assets) | Where-Object { $_.name -eq $assetName } | Select-Object -First 1",
  "$expectedHash = $asset.digest.Substring(7).ToLowerInvariant()",
  "$actualHash = (Get-FileHash -Path $tarPath -Algorithm SHA256).Hash.ToLowerInvariant()",
  "electrobun CLI checksum mismatch",
];
const forbiddenWorkflowSnippets = [
  ' -name "*.exe" -o \\',
  "No .app bundle found in artifacts; mounting DMG",
  "Failed to determine mounted DMG volume",
];
const requiredElectrobunConfigSnippets = [
  'postBuild: "scripts/postwrap-sign-runtime-macos.ts"',
  'postWrap: "scripts/postwrap-diagnostics.ts"',
  'process.env.MILADY_ELECTROBUN_NOTARIZE !== "0"',
];

function runPackDry(): PackResult[] {
  const raw = execSync("npm pack --dry-run --json --ignore-scripts", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 100,
  });
  return JSON.parse(raw) as PackResult[];
}

function assertReleaseWorkflowHasNotaryWrapper() {
  const workflow = readFileSync(
    ".github/workflows/release-electrobun.yml",
    "utf8",
  );
  const missing = requiredWorkflowSnippets.filter(
    (snippet) => !workflow.includes(snippet),
  );

  if (missing.length > 0) {
    console.error(
      "release-check: release workflow is missing notary wrapper wiring:",
    );
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }

  const forbidden = forbiddenWorkflowSnippets.filter((snippet) =>
    workflow.includes(snippet),
  );

  if (forbidden.length > 0) {
    console.error(
      "release-check: release workflow still exposes raw bootstrap artifacts on the public GitHub release:",
    );
    for (const snippet of forbidden) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertElectrobunConfigHasPostWrapSigner() {
  const config = readFileSync(
    "apps/app/electrobun/electrobun.config.ts",
    "utf8",
  );
  const missing = requiredElectrobunConfigSnippets.filter(
    (snippet) => !config.includes(snippet),
  );

  if (missing.length > 0) {
    console.error(
      "release-check: electrobun config is missing postBuild signer wiring:",
    );
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertMacArtifactStagerLooksCorrect() {
  const script = readFileSync(
    "apps/app/electrobun/scripts/stage-macos-release-artifacts.sh",
    "utf8",
  );
  const requiredSnippets = [
    `BUILD_ROOT="\${MILADY_STAGE_MACOS_BUILD_ROOT:-$ELECTROBUN_DIR/build}"`,
    'DIRECT_APP_PATH="$(find_newest_path "$BUILD_ROOT" -maxdepth 2 -type d -name "*.app")"',
    'TARBALL_PATH="$(find_newest_path "$ARTIFACTS_DIR" -maxdepth 1 -type f -name "*-macos-*.app.tar.zst")"',
    "Using direct build app:",
    "Using build app wrapper:",
    "Extracting app payload from build app archive:",
    "no usable macOS build app found under $BUILD_ROOT; falling back to updater tarball",
    "no macOS updater tarball found",
    'DIRECT_LAUNCHER_SOURCE="$SCRIPT_DIR/macos-direct-launcher.c"',
    'codesign -d --entitlements :- "$STAGED_APP_PATH"',
    "/usr/bin/clang \\",
    'install -m 0755 "$TMP_LAUNCHER_PATH" "$LAUNCHER_PATH"',
    `--options runtime "\${entitlement_args[@]}" "$LAUNCHER_PATH"`,
    `--options runtime "\${entitlement_args[@]}" "$STAGED_APP_PATH"`,
    'codesign --verify --deep --strict --verbose=2 "$STAGED_APP_PATH"',
    `SKIP_APP_ZIP="\${MILADY_STAGE_MACOS_SKIP_APP_ZIP:-$SKIP_DMG}"`,
    "create_app_zip() {",
    'ditto -c -k --sequesterRsrc --keepParent "$source_app" "$output_zip"',
    'TEMP_NOTARY_APP_ZIP_PATH="$TMP_ROOT/$FINAL_APP_ZIP_NAME"',
    "retry_command 3 20 xcrun notarytool submit \\",
    'retry_command 5 15 xcrun stapler staple "$STAGED_APP_PATH"',
    'echo "  app zip: $FINAL_APP_ZIP_PATH"',
    "hdiutil create \\",
    'retry_command 5 15 xcrun stapler staple "$TEMP_DMG_PATH"',
    'mv "$TEMP_DMG_PATH" "$FINAL_DMG_PATH"',
  ];
  const missing = requiredSnippets.filter(
    (snippet) => !script.includes(snippet),
  );

  if (missing.length > 0) {
    console.error(
      "release-check: macOS artifact stager is missing required release wiring:",
    );
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }

  const forbiddenSnippets = [
    'codesign --force --deep --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" "$STAGED_APP_PATH"',
    "exit_code=$?",
  ];
  const forbidden = forbiddenSnippets.filter((snippet) =>
    script.includes(snippet),
  );

  if (forbidden.length > 0) {
    console.error(
      "release-check: macOS artifact stager still contains known-bad signing/retry logic:",
    );
    for (const snippet of forbidden) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertWindowsSmokeScriptHasLeadingParamBlock() {
  const script = readFileSync(
    "apps/app/electrobun/scripts/smoke-test-windows.ps1",
    "utf8",
  );
  const firstRelevantLine = script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  if (firstRelevantLine !== "param(") {
    console.error(
      "release-check: smoke-test-windows.ps1 must start with a param() block before executable statements.",
    );
    console.error(`  - first relevant line: ${firstRelevantLine ?? "<none>"}`);
    process.exit(1);
  }

  const requiredSnippets = [
    'Get-ChildItem -Path $resolvedArtifactsDir -File -Filter "*.tar.zst"',
    'Join-Path $env:APPDATA "Milady\\\\milady-startup.log"',
    "Using packaged tarball:",
    "Find-Launcher $selfExtractionRoot",
    "Started extracted launcher:",
    "Runtime started -- agent: .* port:",
    "Waiting for health endpoint at http://localhost:",
  ];
  const missingSnippets = requiredSnippets.filter(
    (snippet) => !script.includes(snippet),
  );

  if (missingSnippets.length > 0) {
    console.error(
      "release-check: smoke-test-windows.ps1 is missing the packaged-launcher/dynamic-port smoke logic.",
    );
    for (const snippet of missingSnippets) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertMacSmokeScriptLaunchesPackagedLauncherDirectly() {
  const script = readFileSync(
    "apps/app/electrobun/scripts/smoke-test.sh",
    "utf8",
  );

  if (
    !script.includes(
      'LAUNCHER_PATH="$LAUNCH_APP_BUNDLE/Contents/MacOS/launcher"',
    )
  ) {
    console.error(
      "release-check: smoke-test.sh must launch the packaged Contents/MacOS/launcher directly.",
    );
    process.exit(1);
  }

  if (script.includes('open "$LAUNCH_APP_BUNDLE"')) {
    console.error(
      "release-check: smoke-test.sh must not use open(1); it can reactivate a stale installed bundle.",
    );
    process.exit(1);
  }

  const requiredSnippets = [
    "dump_failure_diagnostics()",
    "write_bundle_diagnostics()",
    "collect_recent_crash_reports()",
    "verify_wrapper_diagnostics()",
    "read_startup_log_slice()",
    "dev builds do not run postWrap",
    "wrapper-diagnostics.json was not produced for this $BUILD_ENV build",
    'if [[ "$current_size" -lt "$LOG_OFFSET" ]]; then',
    "build_launcher_command()",
    'if [[ "$(uname)" == "Darwin" && -n "$' + "{GITHUB_ACTIONS:-}" + '" ]]',
    'TERM="$' + "{TERM:-dumb}" + '"',
    "No staged .app bundle found under $OUTPUT_DIR",
    "DMG fallback is disabled.",
    'DIRECT_WGPU_DYLIB="$APP_BUNDLE/Contents/MacOS/libwebgpu_dawn.dylib"',
    'echo "WGPU : direct app bundle -> $DIRECT_WGPU_DYLIB"',
    "Launcher exited before the first health probe; continuing to wait for packaged app handoff...",
    'dump_failure_diagnostics "backend startup log reported a failure"',
    'dump_failure_diagnostics "backend never reported a started port"',
  ];
  const missing = requiredSnippets.filter(
    (snippet) => !script.includes(snippet),
  );
  if (missing.length > 0) {
    console.error(
      "release-check: smoke-test.sh is missing failure-time diagnostics hooks.",
    );
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }

  const forbiddenSnippets = [
    "attach_dmg_with_retry()",
    'MOUNT_POINT="$(attach_dmg_with_retry "$DMG_PATH")"',
    "No .app bundle found in artifacts; mounting DMG",
  ];
  const forbidden = forbiddenSnippets.filter((snippet) =>
    script.includes(snippet),
  );
  if (forbidden.length > 0) {
    console.error(
      "release-check: smoke-test.sh still contains disabled macOS DMG fallback logic.",
    );
    for (const snippet of forbidden) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function main() {
  assertReleaseWorkflowHasNotaryWrapper();
  assertElectrobunConfigHasPostWrapSigner();
  assertMacArtifactStagerLooksCorrect();
  assertWindowsSmokeScriptHasLeadingParamBlock();
  assertMacSmokeScriptLaunchesPackagedLauncherDirectly();
  const results = runPackDry();
  const files = results.flatMap((entry) => entry.files ?? []);
  const paths = new Set(files.map((file) => file.path));

  const missing = requiredPaths.filter((path) => !paths.has(path));
  const forbidden = [...paths].filter((path) =>
    forbiddenPrefixes.some((prefix) => path.startsWith(prefix)),
  );

  if (missing.length > 0 || forbidden.length > 0) {
    if (missing.length > 0) {
      console.error("release-check: missing files in npm pack:");
      for (const path of missing) {
        console.error(`  - ${path}`);
      }
    }
    if (forbidden.length > 0) {
      console.error("release-check: forbidden files in npm pack:");
      for (const path of forbidden) {
        console.error(`  - ${path}`);
      }
    }
    process.exit(1);
  }

  console.log("release-check: npm pack contents look OK.");
}

main();
