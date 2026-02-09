<p align="center">
  <img src="../ui/public/pfp.jpg" alt="Milaidy" width="120" />
</p>

<h1 align="center">Milaidy</h1>

<p align="center">
  <em>cute agents for the acceleration</em>
</p>

<p align="center">
  <a href="https://github.com/milady-ai/milaidy/actions/workflows/release.yml"><img src="https://github.com/milady-ai/milaidy/actions/workflows/release.yml/badge.svg" alt="Build & Release" /></a>
  <a href="https://github.com/milady-ai/milaidy/actions/workflows/test.yml"><img src="https://github.com/milady-ai/milaidy/actions/workflows/test.yml/badge.svg" alt="Tests" /></a>
  <a href="https://www.npmjs.com/package/milaidy"><img src="https://img.shields.io/npm/v/milaidy" alt="npm version" /></a>
  <a href="https://github.com/milady-ai/milaidy/blob/main/LICENSE"><img src="https://img.shields.io/github/license/milady-ai/milaidy" alt="License" /></a>
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
curl -fsSL https://milady-ai.github.io/milaidy/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://milady-ai.github.io/milaidy/install.ps1 | iex
```

### npm / npx

```bash
npm install -g milaidy
# or run without installing
npx milaidy
# or with bun
bunx milaidy
```

Then run setup:

```bash
milaidy setup
```

### Download the App

Desktop and mobile builds are available on the [Releases](https://github.com/milady-ai/milaidy/releases) page:

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
milaidy onboard --install-daemon
milaidy agent --message "hello" --thinking high
```

## Development

**Prerequisites:** Node.js >= 22, bun

### Setup

```bash
git clone https://github.com/milady-ai/milaidy.git
cd milaidy

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
