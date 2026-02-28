<p align="center">
  <img src="../ui/public/pfp.jpg" alt="Milady" width="120" />
</p>

<h1 align="center">Milady</h1>

<p align="center">
  <em>cute agents for the acceleration</em>
</p>

<p align="center">
  <a href="https://github.com/milady-ai/milady/actions/workflows/release.yml"><img src="https://github.com/milady-ai/milady/actions/workflows/release.yml/badge.svg" alt="Build & Release" /></a>
  <a href="https://github.com/milady-ai/milady/actions/workflows/test.yml"><img src="https://github.com/milady-ai/milady/actions/workflows/test.yml/badge.svg" alt="Tests" /></a>
  <a href="https://www.npmjs.com/package/milady"><img src="https://img.shields.io/npm/v/milady" alt="npm version" /></a>
  <a href="https://github.com/milady-ai/milady/blob/main/LICENSE"><img src="https://img.shields.io/github/license/milady-ai/milady" alt="License" /></a>
</p>

<p align="center">
  <a href="https://milady.ai">milady.ai</a>
</p>

---

A personal AI assistant you run on your own devices, built on [ElizaOS](https://github.com/elizaos). Cross-platform — macOS, Windows, Linux, iOS, and Android.

## Install

### One-line install (recommended)

macOS / Linux / WSL:

```bash
curl -fsSL https://milady-ai.github.io/milady/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://milady-ai.github.io/milady/install.ps1 | iex
```

### npm global

```bash
npm install -g miladyai
milady setup
```

### no-install (optional)

```bash
bunx miladyai setup
# or
npx miladyai setup
```

### Download the App

Desktop and mobile builds are available on the [Releases](https://github.com/milady-ai/milady/releases) page:

| Platform | Format |
|---|---|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows | `.exe` installer |
| Linux | `.AppImage`, `.deb` |
| iOS | App Store (coming soon) |
| Android | Play Store (coming soon) |

## Quick Start

```bash
milady onboard --install-daemon
milady agent --message "hello" --thinking high
```

## Development

**Prerequisites:** Node.js >= 22, bun

### Setup

```bash
git clone https://github.com/milady-ai/milady.git
cd milady

bun install
bun run build
```

### Run the App (Desktop)

```bash
cd apps/app
bun install
bun run build:electron
bun run electron
```

### Dev Server

```bash
cd apps/app
bun run dev
```

### Mobile

```bash
# iOS (requires macOS + Xcode 15+)
bun run ios

# Android (requires Android Studio + SDK 34+)
bun run android
```

### Build Plugins

```bash
bun run plugin:build
```

### Desktop app startup and errors

If the embedded agent fails to load (e.g. missing native module), the app keeps the API server up so the UI can show an error instead of "Failed to fetch". **Why:** Without that, one load failure would close the API server and the window would show only "Failed to fetch" with no message. See [Electron startup and exception handling](../../docs/electron-startup.md) for why the guards in `electron/src/native/agent.ts` exist and must not be removed.

### Plugin resolution

Dynamic plugin imports (`import("@elizaos/plugin-*")`) resolve from the importing file's location. In dev mode and CLI, that can miss root `node_modules`. We set `NODE_PATH` to repo root in `src/runtime/eliza.ts`, `scripts/run-node.mjs`, and `electron/src/native/agent.ts` (dev path). **Why:** Without this, plugins like `@elizaos/plugin-coding-agent` fail with "Cannot find module" on boot. For Bun specifically, some published plugins have `exports["."].bun = "./src/index.ts"` (missing in the tarball); we patch those in `scripts/patch-deps.mjs` so Bun resolves via `dist/`. See [Plugin resolution and NODE_PATH](../../docs/plugin-resolution-and-node-path.md) (including "Bun and published package exports").

### Build and release (Electron bundle, CI)

Plugin and native deps for the packaged app are copied into `milady-dist/node_modules` by `scripts/copy-electron-plugins-and-deps.mjs`, which **derives** the list from each @elizaos package's `package.json` (no manual list). macOS Intel builds run install and build under Rosetta so x64 native binaries are included. **Why:** [Build and release (CI, desktop binaries)](../../docs/build-and-release.md) explains arch, copy script, and release workflow.

### Tests

```bash
# from repo root
bun run test
```

## License

MIT
