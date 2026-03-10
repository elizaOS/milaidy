# Build and release (CI, desktop binaries)

> Branch note: on `test/electrobun-cross-platform`, `.github/workflows/release-electrobun.yml` is the canonical tag-triggered desktop release workflow. `.github/workflows/release.yml` is kept as a manual legacy Electron fallback only.

Why the release pipeline and desktop bundle work the way they do.

## macOS: why two DMGs (arm64 and x64)

We ship **separate** `Milady-arm64.dmg` and `Milady-x64.dmg` because:

- **Native Node addons** (e.g. `onnxruntime-node`, `whisper-node`) ship prebuilt `.node` binaries per OS and arch. There is no single "universal" npm artifact that contains both arm64 and x64; the addon is built for the arch of the machine that ran `npm install` / `bun install`.
- **CI runs on arm64** (macos-14). If we only ran `bun install` and `bun run build` in the host arch, `node_modules` would contain only arm64 `.node` files. The packaged app would then fail on Intel with "Cannot find module .../darwin/x64/onnxruntime_binding.node".
- **So for the macos-x64 artifact** we run install and build on a real Intel runner. That makes the install and any native rebuilds produce x64 binaries, so the Intel DMG works without Rosetta-specific CI assumptions.
- **The macOS builds run on different runners.** Apple Silicon builds run on `macos-14`; Intel builds run on `macos-15-intel`.

See `.github/workflows/release-electrobun.yml`: the release matrix now pins Apple Silicon and Intel to separate macOS runners while keeping the rest of the Electrobun build flow aligned across platforms.

## Desktop bundle: why we copy plugins and deps

The packaged app runs the agent from `milady-dist/` (bundled JS + `node_modules`). The main bundle is built by tsdown with dependencies inlined where possible, but:

- **Plugins** (`@elizaos/plugin-*`) are loaded at runtime; their dist/ and any **runtime-only** dependencies (native addons, optional requires, etc.) must be present in `milady-dist/node_modules`.
- **Why not rely on a single global node_modules at pack time?** The packaged desktop app resolves runtime modules from the bundled app payload (`Resources/app/milady-dist/node_modules` on macOS, equivalent wrapper locations on Windows/Linux), not from the developer checkout. So we copy the subset we need into the packaged runtime before Electrobun wraps the app.

The packaging scripts derive that subset instead of keeping a hand-maintained allowlist:

1. `scripts/copy-electron-plugins-and-deps.mjs` handles the legacy Electron build and copies the installed `@elizaos/*` set plus their transitive runtime deps into `apps/app/electron/milady-dist/node_modules`.
2. `scripts/copy-runtime-node-modules.ts` handles the Electrobun build and scans the built `dist/` output for bare package imports, unions that with the installed `@elizaos/*` and `@milady/plugin-*` packages from the repo root, then recursively copies their runtime deps into `dist/node_modules`.
   - The same step now emits `dist/desktop-runtime-manifest.json`, a machine-readable inventory that classifies bundled packages as `base`, `lazy-base`, or `optional-pack`. **Why:** it preserves current behavior while making the desktop payload explicit enough to shrink safely in later PRs.
3. Both approaches **walk package.json `dependencies` and `optionalDependencies` recursively**. **Why:** dynamic plugin loading and native optional deps change more often than the release workflow; deriving the closure from installed package metadata avoids shipping a stale allowlist.
4. Known dev/renderer-only packages (for example `typescript`, `lucide-react`) are skipped to keep the packaged runtime smaller.

We do **not** try to exclude deps that might already be inlined by tsdown into plugin dist/, because plugins can `require()` at runtime; excluding them would risk "Cannot find module" in the packaged app.

## Release workflow: design and WHYs

The release workflow (`.github/workflows/release.yml`) is designed for **reproducible, fail-fast builds** and **diagnosable failures**. Key choices and their reasons:

- **Strict shell (`bash -euo pipefail`)** — Applied at job default for `build-desktop` so every step exits on first error, undefined variable, or pipe failure. **Why:** Without it, a failing command in the middle of a script can be ignored and the step still "succeeds", producing broken artifacts or confusing later failures.
- **Retry loops with final assertion** — `bun install` steps retry up to 3 times, then run the same install command once more after the loop. **Why:** If all retries failed, the loop exits without failing the step; the final run ensures the step fails with a clear install error instead of silently continuing.
- **`find -print0` and `while IFS= read -r -d ''`** — Copying JS into `milady-dist` and removing node-gyp artifacts use null-delimited find + read. **Why:** Filenames with newlines or spaces would break `find | while read`; null-delimited iteration is safe for any path.
- **DMG path via `find` + `stat -f`** — We pick the newest DMG with `find dist -name '*.dmg' -exec stat -f '%m\t%N' {} \; | sort -rn | head -1` instead of `ls -t dist/*.dmg`. **Why:** `ls -t` with a glob can fail or behave oddly when no DMG exists or paths have spaces; find + stat is robust and this step runs only on macOS where `stat -f` is available.
- **Wrapper diagnostics capture binary metadata and bundle size** — `apps/app/electrobun/scripts/postwrap-diagnostics.ts` records wrapper binary metadata, archive inspection results, top bundle paths, and largest packaged files in `wrapper-diagnostics.json`. **Why:** successful builds can still hide size regressions or missing helper binaries, so we keep the diagnostics on green builds too.
- **Windows: plugin prepare script uses `npx -p typescript tsc`** — In `packages/plugin-bnb-identity/build.ts` we invoke `npx -p typescript tsc` instead of `npx tsc`. **Why:** On Windows (and some CI environments), `npx tsc` can resolve to the npm package `tsc` (a joke package that prints "This is not the tsc command you are looking for") instead of the TypeScript compiler. Explicitly using the `typescript` package avoids that and makes the release Windows build succeed.
- **Single Capacitor build step** — One "Build Capacitor app" step runs `npx vite build` on all platforms. **Why:** The previous split (non-Windows vs Windows) was redundant; vite build works everywhere, so one step reduces drift and confusion.
- **Packaged DMG E2E: 240s CDP timeout in CI, stdout/stderr dump on timeout** — In CI we use a longer CDP wait and on timeout we log app stdout/stderr before failing. **Why:** CI can be slower; a longer timeout reduces flaky failures. Dumping logs makes CDP timeouts debuggable instead of silent.

## Node.js and Bun in CI: WHYs

CI workflows that need Node (for node-gyp / native modules or npm registry) were timing out on Node download and install. We fixed this as follows.

- **`useblacksmith/setup-node@v5` on Blacksmith runners** — In `test.yml`, jobs that run on `blacksmith-4vcpu-ubuntu-2404` (app-startup-e2e, electron-ui-e2e Linux) use `useblacksmith/setup-node` instead of `actions/setup-node`. **Why:** Blacksmith’s action uses their colocated cache (same DC as the runner), so Node binaries are served at ~400MB/s and we avoid slow or failing downloads from nodejs.org.
- **`actions/setup-node@v3` (not v4) on GitHub-hosted runners** — Release, test (macOS legs), nightly, publish-npm, and other workflows pin to `@v3`. **Why:** v4 has a known slow post-action step and often triggers nodejs.org downloads that time out; v3 uses the runner toolcache when the version is present and avoids the regression.
- **`check-latest: false`** — We set this explicitly on every `actions/setup-node` step (Blacksmith jobs use `useblacksmith/setup-node`, which has its own caching behavior). **Why:** With the default, the action can hit nodejs.org to check for a newer patch; that adds latency and can timeout. We want a fixed, cached Node version for reproducible CI.
- **Bun global cache (`~/.bun/install/cache`)** — test.yml, release.yml, benchmark-tests.yml, publish-npm.yml, and nightly.yml all cache this path with `actions/cache@v4` keyed by `bun.lock`. **Why:** Bun install is fast, but re-downloading every package every run was still a major cost; caching the global cache avoids re-downloading tarballs while letting `bun install` do its fast hardlink/clonefile into `node_modules`. We do not cache `node_modules` itself — compression/upload cost exceeds the gain.
- **`timeout-minutes` on jobs** — We set explicit timeouts (e.g. 20–30 min for test jobs, 45 for release build-desktop). **Why:** So a hung or extremely slow run fails in a bounded time instead of burning runner hours; also makes flakiness visible.

## Where this runs

- **Electrobun release (current desktop path on this branch):** `.github/workflows/release-electrobun.yml` — on version tag push; builds macOS arm64 (`macos-14`), macOS x64 (`macos-15-intel`), Windows x64, and Linux x64 Electrobun artifacts plus update channel files.
- **Legacy Electron compatibility stub:** `.github/workflows/release.yml` — manual workflow that only points maintainers at the Electrobun release path.
- **Local desktop build:** From repo root run `bun run build:desktop`. For an unsigned local packaging test, run `ELECTROBUN_SKIP_CODESIGN=1 bun run build:desktop`.
- **Desktop capability inventory:** After any desktop stage/build, inspect `dist/desktop-runtime-manifest.json` to see which packages are currently in the base shell path versus marked for lazy or optional delivery.
- **Named trimmed profile:** `no-streaming` is the first non-default desktop profile. Use `bun run build:desktop:no-streaming` or `bun run smoke:desktop:no-streaming` to stage/package the app with the manifest-classified streaming pack removed while keeping the default release path on `full`.
- **Manifest-aware smoke behavior:** `apps/app/electrobun/scripts/smoke-test.sh` now reads `dist/desktop-runtime-manifest.json`, so release-smoke startup assertions stay strict for `full` builds but do not fail a trimmed profile simply because an intentionally excluded optional pack is absent.
- **Optional-pack dry runs:** For ad hoc experiments beyond the named profiles, pass `--exclude-optional-pack=<pack>` through the shared builder, for example `node scripts/desktop-build.mjs stage --variant=base --exclude-optional-pack=streaming`. This only affects packages classified as `optional-pack`.
- **Local release-mode smoke:** Run `SKIP_SIGNATURE_CHECK=1 bun run smoke:desktop`. This builds Electrobun in `canary` mode, exercises the packaged launcher, and requires `wrapper-diagnostics.json`, so it is the local check that validates the `postWrap` release path.
- **macOS smoke now requires the staged `.app` artifact** — `apps/app/electrobun/scripts/smoke-test.sh` no longer mounts the DMG when the app bundle is missing. **Why:** the staged `.app` is now the primary macOS validation artifact, and letting smoke recover from the DMG masked drift in that direct-app path.
- **macOS local builds now stage a direct `.app` too** — `scripts/desktop-build.mjs` accepts `--stage-macos-release-app`, and local macOS `build:desktop` plus `smoke:desktop` use it. Those local paths also set `MILADY_STAGE_MACOS_SKIP_DMG=1`, which now also skips the optional `.app.zip` by default. The staging script prefers the fresh Electrobun build output under `apps/app/electrobun/build/*/*.app`; if that build output is still a thin wrapper shell, it extracts the embedded `Contents/Resources/*.tar.zst` payload directly and only falls back to the updater tarball if the build output has no usable app payload. **Why:** we still publish the Electrobun updater tarball in release builds, but local install/smoke paths should stage from the build output first instead of depending on updater artifacts.
- **macOS CI now verifies the staged `.app` directly** — the release workflow requires a signed `.app` under `apps/app/electrobun/artifacts/` before signature/notarization checks run, and it no longer mounts the DMG just to rediscover that app. **Why:** the staged bundle is now the primary macOS validation artifact; treating the DMG as recovery logic hid drift in the direct-app path we actually care about.

## Electrobun update-channel naming

Electrobun v1.15.x writes **platform-prefixed flat artifact names** into `apps/app/electrobun/artifacts/`, for example:

- `Milady-canary.app` (staged direct macOS app for local/CI validation)
- `canary-macos-arm64-Milady-canary.app.zip`
- `canary-macos-arm64-Milady-canary.app.tar.zst`
- `canary-macos-arm64-Milady-canary.dmg`
- `canary-macos-arm64-update.json`

Why the workflow mirrors that shape directly to `https://milady.ai/releases/`:

- The Electrobun updater resolves manifests at `${baseUrl}/${platformPrefix}-update.json`, not `${baseUrl}/${channel}/update.json`.
- It also resolves tarballs at `${baseUrl}/${platformPrefix}-${tarballFileName}`.
- Because of that, the release upload step must publish `*-update.json`, `*.tar.zst`, and optional `*.patch` files at the **flat release root**. Uploading only a generic `update.json` or nesting files under version folders breaks in-app updates.
- Public GitHub releases now also carry `*.app.zip` for macOS direct installs. That zip is derived from the staged app after signing and stapling, while `*.tar.zst` stays updater-only.
- The staged `.app` is now the primary macOS validation/build artifact in CI, and it is intentionally excluded from the updater-channel upload. That keeps signing/smoke/local install flows direct while preserving Electrobun’s flat tarball update contract.

## Desktop WebGPU: browser + native

Milady now carries both WebGPU paths in the desktop app:

- **Renderer-side WebGPU:** the existing avatar and vector-browser scenes run in the webview and prefer `three/webgpu` when the embedded browser exposes `navigator.gpu`.
- **Electrobun-native WebGPU:** `apps/app/electrobun/electrobun.config.ts` enables `bundleWGPU: true` on macOS, Windows, and Linux, so packaged desktop builds also include Dawn (`libwebgpu_dawn.*`) for Bun-side `GpuWindow`, `WGPUView`, and `<electrobun-wgpu>` surfaces.
- **Renderer choice for packaged builds:** macOS stays on the native renderer by default, while Windows and Linux default to bundled CEF. That matches Electrobun's current cross-platform guidance: Linux distribution should use CEF-backed `BrowserWindow`/`BrowserView` instances, and CEF gives us the most consistent browser-side WebGPU path on the non-macOS desktop targets.

Why this split exists:

- The current UI/React surfaces already live in the renderer webview, so browser WebGPU remains the lowest-risk path for those scenes.
- Bundling Dawn keeps the desktop runtime ready for native GPU surfaces and Bun-side compute/render workloads without maintaining a separate desktop flavor.

## Electrobun backend startup verification

The local Electrobun smoke test now verifies the backend, not just the window shell:

- After building, `bun run smoke:desktop` launches the packaged app and tails `~/.config/Milady/milady-startup.log`.
- It fails if the child runtime logs `Cannot find module`, exits before becoming healthy, or never reaches `Runtime started -- agent: ... port: ...`.
- Once the startup log reports a port, the script probes `http://127.0.0.1:${port}/api/health` and requires that endpoint to stay healthy for the liveness window.
- For non-dev builds, it also fails if `wrapper-diagnostics.json` is missing, which catches broken `postWrap` hooks before release.
- On Windows, `apps/app/electrobun/scripts/smoke-test-windows.ps1` now prefers the packaged `*.tar.zst` bundle and launches its `launcher.exe` directly. It only falls back to the `Milady-Setup*.exe` installer path when no direct packaged bundle artifact is available.

Why: the previous smoke test could pass while the launcher stayed open but the embedded agent backend had already crashed.

## See also

- [Electron startup and exception handling](./electron-startup.md) — why the agent keeps the API server up on load failure.
- [Plugin resolution and NODE_PATH](./plugin-resolution-and-node-path.md) — why dynamic plugin imports need `NODE_PATH` in dev/CLI/Electron.
- [CHANGELOG](../CHANGELOG.md) — concrete changes and WHYs per release.
