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
npm install -g milady
milady setup
```

### no-install (optional)

```bash
bunx milady setup
# or
npx milady setup
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

### Tests

```bash
# from repo root
bun run test
```

## License

MIT
