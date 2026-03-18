# Milady — Agent Conventions

## What This Is

Milady is a local-first AI assistant built on [elizaOS](https://github.com/elizaOS). It wraps the Eliza runtime with a CLI, desktop app (Electrobun), web dashboard, and platform connectors (Telegram, Discord, etc.).

## Quick Start (Dev)

```bash
bun install          # runs postinstall hooks automatically
bun run dev          # API on :31337, UI on :2138 with hot reload
```

Optional — link a local Eliza checkout for live package development:
```bash
bun run setup:eliza-workspace   # clones ../eliza if missing, symlinks all @elizaos/* packages
```

## Build & Test

```bash
bun run build        # tsdown + vite
bun run check        # typecheck + lint
bun run test         # parallel test suite
bun run test:e2e     # end-to-end tests
bun run db:check     # database security + readonly tests
```

## Project Layout

```
src/
  entry.ts              CLI bootstrap (env, log level)
  cli/                  Commander CLI (milady command)
  runtime/
    eliza.ts            Agent loader — sets NODE_PATH, loads plugins dynamically
    dev-server.ts       Dev mode entry point (started by dev-ui.mjs)
  api/                  Dashboard API (port 31337 in dev, 2138 in prod)
  plugins/              Milady-specific plugins
  services/             Business logic
apps/
  app/                  Main web + desktop UI (Vite + React)
  home/                 Home dashboard
  homepage/             Marketing site
scripts/
  dev-ui.mjs            Dev orchestrator (API + Vite)
  run-node.mjs          CLI runner (spawns entry.js with NODE_PATH)
  run-repo-setup.mjs    Postinstall sequencer
  setup-eliza-workspace.mjs   Clone + link ../eliza packages
  patch-deps.mjs        Post-install patches for broken upstream exports
plugins/                Workspace plugins (plugin-*)
packages/               Internal packages
```

## Key Architecture Decisions

### NODE_PATH (do not remove)
Dynamic plugin imports (`import("@elizaos/plugin-foo")`) need NODE_PATH set to the repo root's `node_modules`. This is set in three places — all three are required:
1. `src/runtime/eliza.ts` — module-level, before dynamic imports
2. `scripts/run-node.mjs` — child process env
3. `apps/app/electron/src/native/agent.ts` — Electron main process

See `docs/plugin-resolution-and-node-path.md`.

### Bun exports patch (do not remove)
`scripts/patch-deps.mjs` removes dead `exports["."].bun` entries from `@elizaos` packages that point to missing `src/` paths. Without this, Bun fails to resolve plugins at runtime.

### Electron startup guards (do not remove)
The try/catch blocks in `apps/app/electron/src/native/agent.ts` keep the desktop window usable when the runtime fails. See `docs/electron-startup.md`.

## Config

- **Runtime config**: `~/.eliza/eliza.json` (or `ELIZA_CONFIG_PATH` / `ELIZA_STATE_DIR`)
- **Env secrets**: `~/.eliza/.env` or project `.env`
- **Namespace**: The CLI auto-detects "milady" from package.json name

## Code Standards

- TypeScript strict mode. No `any` without explanation.
- Biome for lint + format: `bun run lint:fix && bun run format:fix`
- Tests required for bug fixes and features. Coverage floor: 25% lines, 15% branches.
- Files under ~500 LOC. Split when it improves clarity.
- No secrets in code. No real credentials.
- Minimal dependencies — only add if `src/` directly imports them.
- Commit messages: concise, action-oriented (e.g., `fix telegram reconnect on rate limit`)

## Dependencies on Eliza

All `@elizaos/*` packages use the `alpha` dist-tag. When developing locally, `bun run setup:eliza-workspace` symlinks packages from `../eliza` so changes are picked up immediately. Set `ELIZA_SKIP_LOCAL_ELIZA=1` to use only npm-published versions.

## Ports

| Service | Dev Port | Env Override |
|---------|----------|--------------|
| API + WebSocket | 31337 | `MILADY_API_PORT` |
| Dashboard UI | 2138 | `MILADY_PORT` |
| Gateway | 18789 | `MILADY_GATEWAY_PORT` |

## Common Pitfalls

- **`bun install` fails on native deps**: TensorFlow, canvas, whisper-node require native build tools. Set `ELIZA_SKIP_NATIVE=1` or install Xcode CLI tools / build-essential.
- **Plugin not found at runtime**: Ensure NODE_PATH is set. Run `bun run repair` to re-run postinstall.
- **Stale Vite cache after patching deps**: `bun run dev` passes `--force` to Vite automatically. If issues persist, delete `apps/app/.vite/`.
- **Config file not found**: The actual path is `~/.eliza/eliza.json`, not `~/.milady/milady.json`.
