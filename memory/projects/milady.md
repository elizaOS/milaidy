# Milady

**Type:** Desktop/Mobile/Web AI App
**Version:** 2.0.0-alpha.87
**Tagline:** "your schizo AI waifu that actually respects your privacy"
**Repo:** https://github.com/milady-ai/milady
**Path:** `~/milady`

## What it is
Local-first AI assistant built on elizaOS. Connects to Eliza Cloud or remote self-hosted backend. Manages sessions, tools, and "vibes" through a Gateway control plane. Has desktop (Electrobun + Capacitor), Chrome extension, and mobile apps. Connects to Telegram, Discord, etc.

## Stack
- Runtime: Bun + Node 22 compatible
- Language: TypeScript (strict, Biome)
- Bundler: tsdown + Vite
- Desktop: Electrobun (macOS/Windows/Linux) + Capacitor (iOS/Android)
- AI: elizaOS (`@elizaos/*` plugins)
- Linting: Biome (`bun run check`)
- Tests: Playwright + Vitest

## Key Commands
```bash
bun install
bun run build       # tsdown + Vite
bun run check       # Biome lint
bun run test        # unit + playwright
bun run test:e2e
bun run dev:cli     # CLI in dev mode
```

## Structure
- `src/` — core runtime, CLI, config, providers, hooks, utils, types
- `apps/app/` — Capacitor mobile/desktop, React UI
- `apps/chrome-extension/`
- `deploy/` — Docker configs
- `scripts/` — build, dev, release tooling
- `skills/` — cached skill catalog
- `packages/` — workspace packages (app-core, mldy, ui, plugins)
- `test/` — e2e tests

## Current Focus (from git log)
- CI/build reliability (timeouts, caching, Blacksmith runners)
- Plugin system (NODE_PATH fix, Bun exports patch)
- Multi-platform builds (arm64/x64 DMGs, Windows, Linux)
- Streaming plugin migration to `@elizaos/` npm packages
- Three.js lazy-loading for 3D features
- UI polish (searchbar, padding, icons)

## Important Rules (AGENTS.md)
- All PRs reviewed/merged by agents — humans do QA
- Don't remove exception-handling guards in `apps/app/electron/src/native/agent.ts`
- Don't remove NODE_PATH setup in `src/runtime/eliza.ts`
- Don't remove Bun exports patch in `scripts/patch-deps.mjs`
- No aesthetic redesigns — agent capability > human aesthetics

## Deployment
- macOS: arm64.dmg + x64.dmg (separate, notarized)
- Windows: Setup.exe
- Linux: AppImage, .deb, Snap, Flatpak, APT
- Docker: `deploy/Dockerfile*`
