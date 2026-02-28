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

## Where this runs

- **Release:** `.github/workflows/release.yml` — on version tag push; builds all platforms and uploads artifacts.
- **Local desktop build:** From repo root, build core and app, then e.g. `cd apps/app/electron && bunx electron-builder build --mac --arm64 --publish never`. For a full signed/notarized local test, see `scripts/verify-build.sh` (macOS).

## See also

- [Electron startup and exception handling](./electron-startup.md) — why the agent keeps the API server up on load failure.
- [Plugin resolution and NODE_PATH](./plugin-resolution-and-node-path.md) — why dynamic plugin imports need `NODE_PATH` in dev/CLI/Electron.
- [CHANGELOG](../CHANGELOG.md) — concrete changes and WHYs per release.
