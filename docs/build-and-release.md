# Build and release (CI, desktop binaries)

> Branch note: on `test/electrobun-cross-platform`, `.github/workflows/release-electrobun.yml` is the canonical tag-triggered desktop release workflow. `.github/workflows/release.yml` is kept as a manual legacy Electron fallback only.

Why the release pipeline and desktop bundle work the way they do.

## macOS: why two DMGs (arm64 and x64)

We ship **separate** `Milady-arm64.dmg` and `Milady-x64.dmg` because:

- **Native Node addons** (e.g. `onnxruntime-node`, `whisper-node`) ship prebuilt `.node` binaries per OS and arch. There is no single "universal" npm artifact that contains both arm64 and x64; the addon is built for the arch of the machine that ran `npm install` / `bun install`.
- **CI runs on arm64** (macos-14). If we only ran `bun install` and `bun run build` in the host arch, `node_modules` would contain only arm64 `.node` files. The packaged app would then fail on Intel with "Cannot find module .../darwin/x64/onnxruntime_binding.node".
- **So for the macos-x64 artifact** we run install and build under **Rosetta** (`arch -x86_64 bun install`, `arch -x86_64 electrobun build`, etc.). That makes the install and any native rebuilds produce x64 binaries, so the Intel DMG works.
- **Both macOS builds run on the same runner (macos-14).** We do not use the deprecated `macos-15-intel` runner; the Intel artifact is built on the Apple Silicon runner under Rosetta.

See `.github/workflows/release-electrobun.yml`: the "Install root dependencies", "Build core dist", "Build renderer", "Build native macOS effects dylib", "Build whisper", "Bundle backend node_modules", "Install electrobun CLI", and "Build Electrobun app" steps run under `arch -x86_64` when `matrix.platform.artifact-name === "macos-x64"`.

## Desktop bundle: why we copy plugins and deps

The packaged app runs the agent from `milady-dist/` (bundled JS + `node_modules`). The main bundle is built by tsdown with dependencies inlined where possible, but:

- **Plugins** (`@elizaos/plugin-*`) are loaded at runtime; their dist/ and any **runtime-only** dependencies (native addons, optional requires, etc.) must be present in `milady-dist/node_modules`.
- **Why not rely on a single global node_modules at pack time?** The app is built into an ASAR (and unpacked dirs); resolution at runtime is from the app directory. So we copy the subset we need into `apps/app/electron/milady-dist/node_modules` before `electron-builder` runs.

The packaging scripts derive that subset instead of keeping a hand-maintained allowlist:

1. `scripts/copy-electron-plugins-and-deps.mjs` handles the legacy Electron build and copies the installed `@elizaos/*` set plus their transitive runtime deps into `apps/app/electron/milady-dist/node_modules`.
2. `scripts/copy-runtime-node-modules.ts` handles the Electrobun build and scans the built `dist/` output for bare package imports, unions that with the installed `@elizaos/*` and `@milady/plugin-*` packages from the repo root, then recursively copies their runtime deps into `dist/node_modules`.
3. Both approaches **walk package.json `dependencies` and `optionalDependencies` recursively**. **Why:** dynamic plugin loading and native optional deps change more often than the release workflow; deriving the closure from installed package metadata avoids shipping a stale allowlist.
4. Known dev/renderer-only packages (for example `typescript`, `lucide-react`) are skipped to keep the packaged runtime smaller.

We do **not** try to exclude deps that might already be inlined by tsdown into plugin dist/, because plugins can `require()` at runtime; excluding them would risk "Cannot find module" in the packaged app.

## Release workflow: design and WHYs

The release workflow (`.github/workflows/release.yml`) is designed for **reproducible, fail-fast builds** and **diagnosable failures**. Key choices and their reasons:

- **Strict shell (`bash -euo pipefail`)** — Applied at job default for `build-desktop` so every step exits on first error, undefined variable, or pipe failure. **Why:** Without it, a failing command in the middle of a script can be ignored and the step still "succeeds", producing broken artifacts or confusing later failures.
- **Retry loops with final assertion** — `bun install` steps retry up to 3 times, then run the same install command once more after the loop. **Why:** If all retries failed, the loop exits without failing the step; the final run ensures the step fails with a clear install error instead of silently continuing.
- **Crash dump uses `@electron/asar`** — When electron-builder crashes, we list ASAR contents with `npx @electron/asar list`, not the deprecated `asar` package. **Why:** The deprecated package can be missing or incompatible; `@electron/asar` is the maintained tool and works when the build fails.
- **`find -print0` and `while IFS= read -r -d ''`** — Copying JS into `milady-dist` and removing node-gyp artifacts use null-delimited find + read. **Why:** Filenames with newlines or spaces would break `find | while read`; null-delimited iteration is safe for any path.
- **DMG path via `find` + `stat -f`** — We pick the newest DMG with `find dist -name '*.dmg' -exec stat -f '%m\t%N' {} \; | sort -rn | head -1` instead of `ls -t dist/*.dmg`. **Why:** `ls -t` with a glob can fail or behave oddly when no DMG exists or paths have spaces; find + stat is robust and this step runs only on macOS where `stat -f` is available.
- **Remove node-gyp build artifacts before packaging** — We delete `build-tmp*` and `node_gyp_bins` under `node_modules` (root and milady-dist). **Why:** @tensorflow/tfjs-node and other native addons leave symlinks to system Python there; electron-builder refuses to pack symlinks to paths outside the app (security), so the pack step would fail without removal.
- **Size report includes `milady-dist`** — We report sizes of both `app.asar.unpacked/node_modules` and `app.asar.unpacked/milady-dist` (and its node_modules when present). **Why:** Both regions contribute to artifact size; reporting both makes it obvious where bloat comes from.
- **Size report `du | sort | head` pipelines** — We run each pipeline in a subshell and capture exit code with `( pipeline ) || r=$?`, then allow 0 or 141; we also redirect `sort` stderr to `/dev/null`. **Why:** Under `bash -euo pipefail`, when `head` closes the pipe after N lines, `sort` gets SIGPIPE and exits 141; the step would exit before `r=$?` ran. The subshell + `||` lets us treat 141 as success. Silencing `sort` avoids noisy "Broken pipe" in logs.
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

- **Electrobun release (current desktop path on this branch):** `.github/workflows/release-electrobun.yml` — on version tag push; builds macOS arm64 and macOS x64 (both on macos-14, Intel via Rosetta), Windows x64, and Linux x64 Electrobun artifacts plus update channel files.
- **Legacy Electron compatibility stub:** `.github/workflows/release.yml` — manual workflow that only points maintainers at the Electrobun release path.
- **Local desktop build:** From repo root, use the Electrobun path: `bun run build:desktop` for a local bundle build, then `bash apps/app/electrobun/scripts/smoke-test.sh` for packaged desktop verification.

## Electrobun update-channel naming

Electrobun v1.15.x writes **platform-prefixed flat artifact names** into `apps/app/electrobun/artifacts/`, for example:

- `canary-macos-arm64-Milady-canary.app.tar.zst`
- `canary-macos-arm64-Milady-canary.dmg`
- `canary-macos-arm64-update.json`

Why the workflow mirrors that shape directly to `https://milady.ai/releases/`:

- The Electrobun updater resolves manifests at `${baseUrl}/${platformPrefix}-update.json`, not `${baseUrl}/${channel}/update.json`.
- It also resolves tarballs at `${baseUrl}/${platformPrefix}-${tarballFileName}`.
- Because of that, the release upload step must publish `*-update.json`, `*.tar.zst`, and optional `*.patch` files at the **flat release root**. Uploading only a generic `update.json` or nesting files under version folders breaks in-app updates.

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

- After building, `apps/app/electrobun/scripts/smoke-test.sh` launches the packaged app and tails `~/.config/Milady/milady-startup.log`.
- It fails if the child runtime logs `Cannot find module`, exits before becoming healthy, or never reaches `Runtime started -- agent: ... port: ...`.
- Once the startup log reports a port, the script probes `http://127.0.0.1:${port}/api/health` and requires that endpoint to stay healthy for the liveness window.
- On Windows, `apps/app/electrobun/scripts/smoke-test-windows.ps1` now prefers the packaged `*.tar.zst` bundle and launches its `launcher.exe` directly. It only falls back to the `Milady-Setup*.exe` installer path when no direct packaged bundle artifact is available.

Why: the previous smoke test could pass while the launcher stayed open but the embedded agent backend had already crashed.

## See also

- [Electron startup and exception handling](./electron-startup.md) — why the agent keeps the API server up on load failure.
- [Plugin resolution and NODE_PATH](./plugin-resolution-and-node-path.md) — why dynamic plugin imports need `NODE_PATH` in dev/CLI/Electron.
- [CHANGELOG](../CHANGELOG.md) — concrete changes and WHYs per release.
