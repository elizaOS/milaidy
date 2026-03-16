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
const MACOS_SMOKE_SCRIPT_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/smoke-test.sh",
);
const WINDOWS_PACKAGED_TEST_PATH = path.join(
  ROOT,
  "apps/app/test/electrobun-packaged/electrobun-windows-startup.e2e.spec.ts",
);

describe("Electrobun release workflow drift", () => {
  it("uses the shared desktop-build script to stage bundle inputs before packaging", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Stage desktop bundle inputs");
    expect(workflow).toContain(
      "node scripts/desktop-build.mjs stage --variant=base --build-whisper",
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
    expect(workflow).toContain(
      'MILADY_DESKTOP_COMMAND_PREFIX="arch -x86_64" node scripts/desktop-build.mjs stage --variant=base --build-whisper',
    );
    expect(workflow).toContain(
      'MILADY_DESKTOP_COMMAND_PREFIX="arch -x86_64" node scripts/desktop-build.mjs package --env=${{ needs.prepare.outputs.env }}',
    );
    expect(workflow).not.toContain("arch -x86_64 bun install --ignore-scripts");
    expect(workflow).not.toContain(
      "name: Setup Node.js (macOS Intel via Rosetta)",
    );
    expect(workflow).not.toContain("name: Setup Bun (macOS Intel via Rosetta)");
    expect(workflow).not.toContain("bun-darwin-x64.zip");
  });

  it("pins Bun and runs release-check before the desktop matrix", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const validateJobIndex = workflow.indexOf("name: Validate Release Inputs");
    const buildJobIndex = workflow.indexOf(
      "name: Build $" + "{{ matrix.platform.name }}",
    );
    const releaseCheckIndex = workflow.indexOf("run: bun run release:check");

    expect(workflow).toContain('BUN_VERSION: "1.3.9"');
    expect(workflow).toContain("bun-version: $" + "{{ env.BUN_VERSION }}");
    expect(workflow).not.toContain("bun-version: latest");
    expect(validateJobIndex).toBeGreaterThan(-1);
    expect(buildJobIndex).toBeGreaterThan(validateJobIndex);
    expect(releaseCheckIndex).toBeGreaterThan(validateJobIndex);
    expect(workflow).toContain("needs: [prepare, validate-release]");
  });

  it("uses a non-matrix cache key in validate-release", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const validateSection = workflow.slice(
      workflow.indexOf("name: Validate Release Inputs"),
      workflow.indexOf("  build:"),
    );

    expect(validateSection).toContain(
      "key: bun-electrobun-validate-${{ hashFiles('bun.lock') }}",
    );
    expect(validateSection).toContain(
      "restore-keys: bun-electrobun-validate-",
    );
    expect(validateSection).not.toContain("matrix.platform.artifact-name");
  });

  it("verifies the Windows electrobun tarball digest before extraction", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      "https://api.github.com/repos/blackboardsh/electrobun/releases/tags/v$version",
    );
    expect(workflow).toContain(
      "$asset = @($release.assets) | Where-Object { $_.name -eq $assetName } | Select-Object -First 1",
    );
    expect(workflow).toContain(
      "$actualHash = (Get-FileHash -Path $tarPath -Algorithm SHA256).Hash.ToLowerInvariant()",
    );
    expect(workflow).toContain("electrobun CLI checksum mismatch");
    expect(workflow).toContain("Verified electrobun CLI SHA256:");
  });

  it("stages the desktop bundle before restoring local electrobun caches", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const stageIndex = workflow.indexOf("name: Stage desktop bundle inputs");
    const cacheIndex = workflow.indexOf(
      "name: Cache local electrobun core downloads",
    );

    expect(stageIndex).toBeGreaterThan(-1);
    expect(cacheIndex).toBeGreaterThan(stageIndex);
    expect(workflow).toContain("name: Cache local electrobun core downloads");
    expect(workflow).toContain(
      "path: apps/app/electrobun/node_modules/electrobun/.cache",
    );
    expect(workflow).not.toContain(
      "name: Materialize local electrobun package for build",
    );
    expect(workflow).not.toContain('bun install -g "electrobun@$ELECTROBUN_VERSION"');
  });

  it("caches whisper models for release builds and avoids workflow-local staging drift", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Cache Whisper models and binaries");
    expect(workflow).toContain("~/.cache/milady/whisper");
    expect(workflow).toContain(
      "restore-keys: whisper-$" + "{{ matrix.platform.artifact-name }}-",
    );
    expect(workflow).toContain(
      "name: Stage desktop bundle inputs",
    );
  });

  it("keeps updater transport files off the public GitHub release asset list", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Collect public release files");
    expect(workflow).toContain(' -name "*.dmg" -o \\');
    expect(workflow).toContain(' -name "*Setup*.zip" -o \\');
    expect(workflow).toContain(' -name "*Setup*.tar.gz" -o \\');
    expect(workflow).toContain(' -name "*.msix" \\');
    expect(workflow).not.toContain(' -name "*.exe" -o \\');

    expect(workflow).toContain("name: Collect update channel files");
    expect(workflow).toContain(' -name "*.tar.zst" -o \\');
    expect(workflow).toContain(' -name "*.patch" -o \\');
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

  it("rebuilds the staged macOS direct launcher with the packaged launcher architecture", () => {
    const stageScript = fs.readFileSync(MACOS_STAGE_SCRIPT_PATH, "utf8");

    expect(stageScript).toContain(
      'LAUNCHER_ARCHES="$(lipo -archs "$LAUNCHER_PATH" 2>/dev/null || true)"',
    );
    expect(stageScript).toContain("clang_arch_args=()");
    expect(stageScript).toContain('clang_arch_args+=(-arch "$arch")');
    expect(stageScript).toContain(
      'echo "stage-macos-release-artifacts: unsupported launcher architecture: $arch"',
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable expansion in shell script assertion
    expect(stageScript).toContain('"${clang_arch_args[@]}"');
  });

  it("pins the native macOS effects build to C++17", () => {
    const buildScript = fs.readFileSync(
      MACOS_EFFECTS_BUILD_SCRIPT_PATH,
      "utf8",
    );

    expect(buildScript).toContain("-std=c++17");
  });

  it("validates renderer assets from the wrapped macOS runtime archive before launch", () => {
    const smokeScript = fs.readFileSync(MACOS_SMOKE_SCRIPT_PATH, "utf8");

    expect(smokeScript).toContain("assert_packaged_archive_asset()");
    expect(smokeScript).toContain(
      'echo "Packaged renderer asset check PASSED (wrapper archive)."',
    );
    expect(smokeScript).toContain(
      'echo "Launcher: $' + "{LAUNCHER_PATH:-<unset>}" + '"',
    );
    expect(smokeScript).toContain(
      'local launcher_stdout="$' + "{LAUNCHER_STDOUT:-}" + '"',
    );
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

  it("prefers the live Windows build launcher and persists it for UI tests", () => {
    const smokeScript = fs.readFileSync(WINDOWS_SMOKE_PATH, "utf8");
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(smokeScript).toContain("Find-Launcher $resolvedBuildDir");
    expect(smokeScript).toContain(
      'Write-Host "Using $launcherSource launcher:',
    );
    expect(smokeScript).toContain(
      "$persistLauncherPathFile = $env:MILADY_TEST_WINDOWS_LAUNCHER_PATH_FILE",
    );
    expect(smokeScript).toContain("Set-Content -Path $persistLauncherPathFile");
    expect(workflow).toContain(
      "MILADY_TEST_WINDOWS_LAUNCHER_PATH_FILE: $" +
        "{{ runner.temp }}\\milady-windows-ui-launcher.txt",
    );
    expect(workflow).toContain(
      'Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_LAUNCHER_PATH=$launcherPath"',
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

  it("seeds the Windows embedding model cache before packaged smoke", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Seed Windows embedding model cache");
    expect(workflow).toContain(
      '$modelName = "nomic-embed-text-v1.5.Q4_K_S.gguf"',
    );
    expect(workflow).toContain(
      '$modelRepo = "nomic-ai/nomic-embed-text-v1.5-GGUF"',
    );
    expect(workflow).toContain(
      "Invoke-WebRequest -Uri $url -OutFile $modelPath",
    );
  });

  it("runs the Windows packaged renderer bootstrap check without installing a separate browser", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      "name: Run Windows packaged renderer bootstrap check",
    );
    expect(workflow).toContain(
      "bunx playwright test --config playwright.electrobun.packaged.config.ts test/electrobun-packaged/electrobun-windows-startup.e2e.spec.ts",
    );
    expect(workflow).not.toContain(
      "name: Install Playwright Chromium (Windows)",
    );
    expect(workflow).not.toContain(
      "bunx playwright install chromium --with-deps",
    );
  });

  it("verifies the packaged Windows renderer reaches the external API without CDP assumptions", () => {
    const windowsPackagedTest = fs.readFileSync(
      WINDOWS_PACKAGED_TEST_PATH,
      "utf8",
    );

    expect(windowsPackagedTest).toContain(
      "MILADY_DESKTOP_TEST_API_BASE: api.baseUrl",
    );
    expect(windowsPackagedTest).toContain('request.includes("/api/status")');
    expect(windowsPackagedTest).toContain("waitForRendererBootstrap");
    expect(windowsPackagedTest).not.toContain("chromium.connectOverCDP");
    expect(windowsPackagedTest).not.toContain("--remote-debugging-port");
    expect(windowsPackagedTest).not.toContain(
      "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
    );
  });
});
