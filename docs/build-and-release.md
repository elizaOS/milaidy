# Build and release (CI, desktop binaries)

Why the release pipeline and Electron bundle work the way they do.

## macOS: why two DMGs (arm64 and x64)

We ship **separate** `Milady-arm64.dmg` and `Milady-x64.dmg` because:

- **Native Node addons** (e.g. `onnxruntime-node`, `whisper-node`) ship prebuilt `.node` binaries per OS and arch. There is no single "universal" npm artifact that contains both arm64 and x64; the addon is built for the arch of the machine that ran `npm install` / `bun install`.
- **CI runs on arm64** (macos-14). If we only ran `bun install` and `bun run build` in the host arch, `node_modules` would contain only arm64 `.node` files. The packaged app would then fail on Intel with "Cannot find module .../darwin/x64/onnxruntime_binding.node".
- **So for the macos-x64 artifact** we run install and Electron build under **Rosetta** (`arch -x86_64 bun install`, `arch -x86_64 bun run build`). That makes the install and any native rebuilds produce x64 binaries, so the Intel DMG works.

See `.github/workflows/release.yml`: the "Install root dependencies", "Install Electron dependencies", and "Build Electron app" steps branch on `matrix.platform.artifact-name === "macos-x64"` and wrap the command in `arch -x86_64` when building the Intel artifact.

## Electron bundle: why we copy plugins and deps

The packaged app runs the agent from `milady-dist/` (bundled JS + `node_modules`). The main bundle is built by tsdown with dependencies inlined where possible, but:

- **Plugins** (`@elizaos/plugin-*`) are loaded at runtime; their dist/ and any **runtime-only** dependencies (native addons, optional requires, etc.) must be present in `milady-dist/node_modules`.
- **Why not rely on a single global node_modules at pack time?** The app is built into an ASAR (and unpacked dirs); resolution at runtime is from the app directory. So we copy the subset we need into `apps/app/electron/milady-dist/node_modules` before `electron-builder` runs.

The script `scripts/copy-electron-plugins-and-deps.mjs`:

1. Discovers which `@elizaos/*` packages to copy (from root package.json; plugins must have a `dist/` folder).
2. Copies those packages into `milady-dist/node_modules`.
3. **Walks each package's `package.json` dependencies** (and optionalDependencies) recursively and copies those too. **Why:** Plugins declare what they need; we derive the full set so we don't maintain a manual list and miss new deps.
4. Skips known dev/renderer-only packages (e.g. `typescript`, `lucide-react`) to avoid bloating the bundle. See script header and `DEP_SKIP` for rationale.

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
- **Single Capacitor build step** — One "Build Capacitor app" step runs `npx vite build` on all platforms. **Why:** The previous split (non-Windows vs Windows) was redundant; vite build works everywhere, so one step reduces drift and confusion.
- **Packaged DMG E2E: 240s CDP timeout in CI, stdout/stderr dump on timeout** — In CI we use a longer CDP wait and on timeout we log app stdout/stderr before failing. **Why:** CI can be slower; a longer timeout reduces flaky failures. Dumping logs makes CDP timeouts debuggable instead of silent.

## Where this runs

- **Release:** `.github/workflows/release.yml` — on version tag push; builds all platforms and uploads artifacts.
- **Local desktop build:** From repo root, build core and app, then e.g. `cd apps/app/electron && bunx electron-builder build --mac --arm64 --publish never`. For a full signed/notarized local test, see `scripts/verify-build.sh` (macOS).

## See also

- [Electron startup and exception handling](./electron-startup.md) — why the agent keeps the API server up on load failure.
- [Plugin resolution and NODE_PATH](./plugin-resolution-and-node-path.md) — why dynamic plugin imports need `NODE_PATH` in dev/CLI/Electron.
- [CHANGELOG](../CHANGELOG.md) — concrete changes and WHYs per release.
