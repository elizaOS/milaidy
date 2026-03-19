#!/usr/bin/env -S node --import tsx

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PackFile = { path: string };
type PackResult = { files?: PackFile[] };

const requiredPaths = [
  "dist/index.js",
  "dist/entry.js",
  "dist/build-info.json",
  "scripts/run-repo-setup.mjs",
  "scripts/setup-eliza-workspace.mjs",
  "scripts/patch-deps.mjs",
  "scripts/ensure-vision-deps.mjs",
  "scripts/lib/patch-bun-exports.mjs",
];
const forbiddenPrefixes = ["dist/Milady.app/"];
const orchestratorPackageName = "@elizaos/plugin-agent-orchestrator";
const orchestratorBrokenLifecycleTarget = "./scripts/ensure-node-pty.mjs";
const requiredWorkflowSnippets = [
  'BUN_VERSION: "1.3.11"',
  "name: Validate Release Inputs",
  "bun-version: $" + "{{ env.BUN_VERSION }}",
  "name: Release readiness checks",
  "run: bun run release:check",
  "key: bun-electrobun-validate-$" + "{{ hashFiles('bun.lock') }}",
  "restore-keys: bun-electrobun-validate-",
  "name: Ensure avatar assets",
  "node scripts/ensure-avatars.mjs",
  "Install quiet macOS packaging wrappers",
  "apps/app/electrobun/scripts/hdiutil-wrapper.sh",
  "apps/app/electrobun/scripts/xcrun-wrapper.sh",
  "apps/app/electrobun/scripts/zip-wrapper.sh",
  "ELECTROBUN_REAL_HDIUTIL: /usr/bin/hdiutil",
  "ELECTROBUN_REAL_XCRUN: /usr/bin/xcrun",
  "ELECTROBUN_REAL_ZIP: /usr/bin/zip",
  "Stage desktop bundle inputs",
  "node scripts/desktop-build.mjs stage --variant=base --build-whisper",
  "Inject version.json into bundle (Windows)",
  "Inject version.json into bundle (macOS / Linux)",
  '"identifier":"com.miladyai.milady"',
  "Stage standard macOS release app",
  "apps/app/electrobun/scripts/stage-macos-release-artifacts.sh",
  "retry_stapler_validate()",
  "Smoke test packaged macOS app",
  "SMOKE_DIAGNOSTICS_DIR:",
  "SKIP_BUILD=1",
  "bash apps/app/electrobun/scripts/smoke-test.sh",
  "Upload macOS smoke diagnostics",
  "wrapper-diagnostics.json",
  "Install Inno Setup 6.7.1",
  "jrsoftware/issrc/releases/download/is-6_7_1/innosetup-6.7.1.exe",
  "Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing",
  "Extract Windows app bundle for Inno Setup",
  "tar -xf $tarball.FullName -C $extractDir",
  "Build Inno Setup installer",
  "packaging/inno/build-inno.ps1",
  "Verify Windows public installer looks complete",
  'Get-ChildItem -Path "apps/app/electrobun/artifacts" -File -Filter "Milady-Setup-*.exe"',
  "$minimumBytes = 50MB",
  "apps/app/electrobun/artifacts/*.exe",
  "name: Collect public release files",
  '-name "Milady-Setup-*.exe.zip" -o \\',
  '-name "*Setup*.tar.gz" -o \\',
  "name: Collect update channel files",
  '-name "*.tar.zst" -o \\',
  '-name "*-update.json" \\',
  "DMG attach attempt $attempt/5 failed",
  "https://api.github.com/repos/blackboardsh/electrobun/releases/tags/v$version",
  "$asset = @($release.assets) | Where-Object { $_.name -eq $assetName } | Select-Object -First 1",
  "$expectedHash = $asset.digest.Substring(7).ToLowerInvariant()",
  "$actualHash = (Get-FileHash -Path $tarPath -Algorithm SHA256).Hash.ToLowerInvariant()",
  "electrobun CLI checksum mismatch",
  "process.stdout.write(fs.realpathSync(packageDir));",
  'Write-Host "Resolved electrobun package dir: $resolvedElectrobunDir"',
  '$cacheDir     = Join-Path $resolvedElectrobunDir ".cache"',
  '$resolvedRceditDir = Join-Path $resolvedElectrobunDir "node_modules\\rcedit"',
  "node scripts/desktop-build.mjs package --env=$" +
    "{{ needs.prepare.outputs.env }}",
  "MILADY_ELECTROBUN_NOTARIZE: 0",
  'MILADY_DISABLE_LOCAL_EMBEDDINGS: "1"',
  'MILADY_WINDOWS_SMOKE_REQUIRE_INSTALLER: "1"',
  "ANTHROPIC_API_KEY: $" + "{{ secrets.ANTHROPIC_API_KEY }}",
  'Join-Path $PWD "apps/app/electrobun/node_modules/electrobun"',
  "if ($null -eq $resolvedRceditPackageJson)",
  '$resolvedRceditPackageJson = "$resolvedRceditPackageJson".Trim()',
];
const forbiddenWorkflowSnippets = [' -name "*.exe" -o \\'];
const requiredElectrobunConfigSnippets = [
  'postBuild: "scripts/postwrap-sign-runtime-macos.ts"',
  'postWrap: "scripts/postwrap-diagnostics.ts"',
  'process.env.MILADY_ELECTROBUN_NOTARIZE !== "0"',
  '"../../../plugins.json": "milady-dist/plugins.json"',
  '"../../../package.json": "milady-dist/package.json"',
];
const localPackHotspotPaths = [
  "dist/node_modules",
  "apps/app/dist/vrms",
  "apps/app/dist/animations",
];

type RootPackageJson = {
  bundleDependencies?: string[];
  bundledDependencies?: string[];
  dependencies?: Record<string, string>;
  files?: string[];
  scripts?: Record<string, string>;
};

/**
 * Returns true if the version specifier is an exact pinned version
 * (no range operators, no tags, no URLs).
 *
 * Accepted: "0.3.14", "1.0.0", "2.0.0-alpha.87"
 * Rejected: "^0.3.14", "~1.0.0", ">=1.0.0", "next", "latest", "*",
 *           "workspace:*", "npm:foo@1.0.0", "https://...", "git+..."
 */
export function isExactVersion(specifier: string): boolean {
  if (!specifier || specifier.length === 0) return false;
  // Reject range operators, tags, URLs, workspace protocol
  if (/^[~^>=<*]/.test(specifier)) return false;
  if (/^(workspace|npm|file|git\+|https?):/.test(specifier)) return false;
  // Must look like a semver: starts with a digit, contains only digits/dots/hyphens/alphanumeric
  return /^\d+\.\d+\.\d+/.test(specifier);
}

type DependencyPackageJson = {
  scripts?: Record<string, string>;
};

function runPackDry(): PackResult[] {
  const raw = execSync("npm pack --dry-run --json --ignore-scripts", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 100,
  });
  return JSON.parse(raw) as PackResult[];
}

export function findLocalPackHotspots(
  candidates = localPackHotspotPaths,
  pathExists: (candidate: string) => boolean = existsSync,
): string[] {
  return candidates.filter((candidate) => pathExists(candidate));
}

export function shouldSkipExactPackDryRun(
  hotspots: string[],
  env = process.env,
): boolean {
  if (hotspots.length === 0) {
    return false;
  }

  if (env.CI || env.GITHUB_ACTIONS) {
    return false;
  }

  if (env.MILADY_FORCE_PACK_DRY_RUN === "1") {
    return false;
  }

  return true;
}

export function isPackPathCoveredByFilesList(
  packPath: string,
  filesList: string[],
): boolean {
  const normalizedPath = packPath.replaceAll("\\", "/");
  return filesList.some((entry) => {
    const normalizedEntry = entry.replaceAll("\\", "/").replace(/\/$/, "");
    return (
      normalizedPath === normalizedEntry ||
      normalizedPath.startsWith(`${normalizedEntry}/`)
    );
  });
}

export function bundlesDependency(
  pkg: RootPackageJson,
  dependencyName: string,
): boolean {
  const bundled = [
    ...(pkg.bundleDependencies ?? []),
    ...(pkg.bundledDependencies ?? []),
  ];
  return bundled.includes(dependencyName);
}

export function isExactVersionSpecifier(
  versionSpecifier: string | undefined,
): boolean {
  if (typeof versionSpecifier !== "string") {
    return false;
  }

  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    versionSpecifier,
  );
}

export function hasLifecycleScriptReferencingMissingFile(
  pkg: DependencyPackageJson,
  packageDir: string,
  scriptName: string,
  relativeTarget: string,
  pathExists: (candidate: string) => boolean = existsSync,
): boolean {
  const lifecycleCommand = pkg.scripts?.[scriptName];
  if (
    typeof lifecycleCommand !== "string" ||
    !lifecycleCommand.includes(relativeTarget)
  ) {
    return false;
  }

  return !pathExists(resolve(packageDir, relativeTarget));
}
function runFastLocalPackCheck(hotspots: string[]) {
  console.warn(
    "release-check: skipping exact npm pack --dry-run because local desktop build artifacts are present and package.json whitelists broad build directories:",
  );
  for (const hotspot of hotspots) {
    console.warn(`  - ${hotspot}`);
  }
  console.warn(
    "release-check: package.json files includes 'dist' and 'apps/app/dist', so a local pack dry-run has to walk those trees. Set MILADY_FORCE_PACK_DRY_RUN=1 to run the exact pack check anyway.",
  );

  const rootPackage = JSON.parse(
    readFileSync("package.json", "utf8"),
  ) as RootPackageJson;
  const includedFiles = rootPackage.files ?? [];
  const missing = requiredPaths.filter((path) => !existsSync(path));
  const uncovered = requiredPaths.filter(
    (path) => !isPackPathCoveredByFilesList(path, includedFiles),
  );
  const forbidden = forbiddenPrefixes.filter((prefix) =>
    existsSync(prefix.replace(/\/$/, "")),
  );

  if (missing.length > 0 || uncovered.length > 0 || forbidden.length > 0) {
    if (missing.length > 0) {
      console.error("release-check: missing files in publish roots:");
      for (const path of missing) {
        console.error(`  - ${path}`);
      }
    }
    if (uncovered.length > 0) {
      console.error(
        "release-check: package.json files does not whitelist required publish files:",
      );
      for (const path of uncovered) {
        console.error(`  - ${path}`);
      }
    }
    if (forbidden.length > 0) {
      console.error("release-check: forbidden files present in publish roots:");
      for (const prefix of forbidden) {
        console.error(`  - ${prefix}`);
      }
    }
    process.exit(1);
  }

  console.log("release-check: local publish-root sanity check looks OK.");
}

function assertBundledAgentOrchestratorInstallFix() {
  const rootPackage = JSON.parse(
    readFileSync("package.json", "utf8"),
  ) as RootPackageJson;
  if (!bundlesDependency(rootPackage, orchestratorPackageName)) {
    console.error(
      "release-check: package.json must bundle @elizaos/plugin-agent-orchestrator until the upstream tarball stops shipping a broken postinstall hook.",
    );
    process.exit(1);
  }

  const orchestratorVersion =
    rootPackage.dependencies?.[orchestratorPackageName];
  if (!isExactVersionSpecifier(orchestratorVersion)) {
    console.error(
      "release-check: package.json must pin @elizaos/plugin-agent-orchestrator to an exact version until the upstream tarball stops shipping a broken postinstall hook.",
    );
    process.exit(1);
  }

  const orchestratorPackageJsonPath = resolve(
    "node_modules",
    "@elizaos",
    "plugin-agent-orchestrator",
    "package.json",
  );
  if (!existsSync(orchestratorPackageJsonPath)) {
    console.error(
      "release-check: node_modules/@elizaos/plugin-agent-orchestrator/package.json is missing. Run bun install before publishing.",
    );
    process.exit(1);
  }

  const orchestratorPackage = JSON.parse(
    readFileSync(orchestratorPackageJsonPath, "utf8"),
  ) as DependencyPackageJson;
  if (
    hasLifecycleScriptReferencingMissingFile(
      orchestratorPackage,
      dirname(orchestratorPackageJsonPath),
      "postinstall",
      orchestratorBrokenLifecycleTarget,
    )
  ) {
    console.error(
      "release-check: @elizaos/plugin-agent-orchestrator still references missing scripts/ensure-node-pty.mjs. Run `node scripts/patch-deps.mjs` or `bun run postinstall` before publishing.",
    );
    process.exit(1);
  }
}
function assertOrchestratorVersionPinned() {
  const rootPackage = JSON.parse(
    readFileSync("package.json", "utf8"),
  ) as RootPackageJson;
  const version = rootPackage.dependencies?.[orchestratorPackageName];
  if (!version) {
    console.error(
      `release-check: ${orchestratorPackageName} is not in dependencies.`,
    );
    process.exit(1);
  }
  if (!isExactVersion(version)) {
    console.error(
      `release-check: ${orchestratorPackageName} must be pinned to an exact version (e.g. "0.3.14"), but found "${version}". Floating tags like "next" or ranges like "^0.3.14" are not allowed for release builds.`,
    );
    process.exit(1);
  }
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
    'find "$ARTIFACTS_DIR" -maxdepth 1 -type f -name "*-macos-*.app.tar.zst"',
    "no macOS updater tarball found",
    'DIRECT_LAUNCHER_SOURCE="$SCRIPT_DIR/macos-direct-launcher.c"',
    'codesign -d --entitlements :- "$STAGED_APP_PATH"',
    "/usr/bin/clang \\",
    'install -m 0755 "$TMP_LAUNCHER_PATH" "$LAUNCHER_PATH"',
    `--options runtime "\${entitlement_args[@]}" "$LAUNCHER_PATH"`,
    `--options runtime "\${entitlement_args[@]}" "$STAGED_APP_PATH"`,
    'codesign --verify --deep --strict --verbose=2 "$STAGED_APP_PATH"',
    "hdiutil create \\",
    "retry_command 3 20 xcrun notarytool submit \\",
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
    "Find-Launcher $resolvedBuildDir",
    'Get-ChildItem -Path $resolvedArtifactsDir -File -Filter "*.tar.zst"',
    'Join-Path $env:APPDATA "Milady\\\\milady-startup.log"',
    '$requireInstaller = $env:MILADY_WINDOWS_SMOKE_REQUIRE_INSTALLER -eq "1"',
    "Installing via Inno Setup:",
    "/VERYSILENT",
    "installed Inno package",
    "$persistLauncherPathFile = $env:MILADY_TEST_WINDOWS_LAUNCHER_PATH_FILE",
    "Using $launcherSource launcher:",
    "Using packaged tarball:",
    "Find-Launcher $selfExtractionRoot",
    "Started extracted launcher:",
    "Runtime started -- agent: .* port:",
    "Waiting for health endpoint at http://(?:localhost|127\\.0\\.0\\.1):",
    "$handler.UseProxy = $false",
    '--noproxy "127.0.0.1"',
    "Dump-PortDiagnostics",
    "Dump-ProcessDiagnostics",
    "Dump-FailureDiagnostics",
    "periodic diagnostics at",
    "FAILURE DIAGNOSTICS",
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
    "build_launcher_command()",
    'if [[ "$(uname)" == "Darwin" && -n "$' + "{GITHUB_ACTIONS:-}" + '" ]]',
    'TERM="$' + "{TERM:-dumb}" + '"',
    "attach_dmg_with_retry()",
    'MOUNT_POINT="$(attach_dmg_with_retry "$DMG_PATH")"',
    'DIRECT_WGPU_DYLIB="$APP_BUNDLE/Contents/MacOS/libwebgpu_dawn.dylib"',
    'echo "WGPU : direct app bundle -> $DIRECT_WGPU_DYLIB"',
    "assert_packaged_archive_asset()",
    'echo "Packaged renderer asset check PASSED (wrapper archive)."',
    'echo "Launcher: $' + "{LAUNCHER_PATH:-<unset>}" + '"',
    'local launcher_stdout="$' + "{LAUNCHER_STDOUT:-}" + '"',
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
}


function assertStartApiServerCatchBlockSafety() {
  const elizaSource = readFileSync(
    "packages/autonomous/src/runtime/eliza.ts",
    "utf8",
  );

  // The catch block around startApiServer must use console.error so errors
  // are visible in packaged builds (Electrobun agent.ts reads stderr).
  if (!elizaSource.includes("console.error(apiErrMsg)")) {
    console.error(
      "release-check: eliza.ts startApiServer catch block must use console.error(apiErrMsg) so errors are visible in packaged builds.",
    );
    process.exit(1);
  }

  // In server-only mode, a failed API server must be fatal.
  const catchIndex = elizaSource.indexOf("} catch (apiErr)");
  if (catchIndex === -1) {
    console.error(
      "release-check: eliza.ts must have a catch (apiErr) block around startApiServer.",
    );
    process.exit(1);
  }
  const catchBlock = elizaSource.slice(
    catchIndex,
    elizaSource.indexOf("// ── Server-only mode", catchIndex),
  );
  if (
    !catchBlock.includes("opts?.serverOnly") ||
    !catchBlock.includes("process.exit(1)")
  ) {
    console.error(
      "release-check: eliza.ts startApiServer catch block must call process.exit(1) when opts?.serverOnly is true.",
    );
    process.exit(1);
  }
}

function main() {
  assertReleaseWorkflowHasNotaryWrapper();
  assertElectrobunConfigHasPostWrapSigner();
  assertMacArtifactStagerLooksCorrect();
  assertWindowsSmokeScriptHasLeadingParamBlock();
  assertMacSmokeScriptLaunchesPackagedLauncherDirectly();
  assertStartApiServerCatchBlockSafety();
  assertBundledAgentOrchestratorInstallFix();
  assertOrchestratorVersionPinned();
  const localHotspots = findLocalPackHotspots();
  if (shouldSkipExactPackDryRun(localHotspots)) {
    runFastLocalPackCheck(localHotspots);
    return;
  }
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
