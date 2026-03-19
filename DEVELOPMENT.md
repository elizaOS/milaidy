# Development Guide

## Prerequisites

| Tool | Version | Check | Install |
|------|---------|-------|---------|
| Node.js | >= 22 | `node --version` | [nodejs.org](https://nodejs.org) |
| Bun | latest | `bun --version` | `curl -fsSL https://bun.sh/install \| bash` |
| Git | any | `git --version` | system package manager |

**Optional** (for native plugins like vision, TTS):
- macOS: `xcode-select --install`
- Linux: `sudo apt install build-essential python3 libcairo2-dev libjpeg-dev libpango1.0-dev`

## First-Time Setup

```bash
git clone https://github.com/milady-ai/milady.git
cd milady
bun install
```

`bun install` automatically runs postinstall hooks that:
1. Initialize git submodules
2. Seed skills into `~/.eliza/skills`
3. Ensure avatar assets exist
4. Link browser server components
5. Install vision dependencies (graceful failure if native tools missing)
6. Patch broken upstream `@elizaos` package exports

If postinstall fails on native dependencies, you can still develop — vision and TTS features will be degraded. Set `ELIZA_SKIP_NATIVE=1` to skip native dependency installation entirely.

## Running in Dev Mode

```bash
bun run dev
```

This starts:
1. **API server** on `http://localhost:31337` (Eliza runtime + REST API)
2. **Vite dev server** on `http://localhost:2138` (React dashboard, proxies `/api/*` to API)

The script waits for the API to be healthy before starting Vite, so you won't see proxy errors.

**Useful flags:**
```bash
bun run dev:ui           # UI only (API assumed running separately)
bun run dev:home         # Home dashboard instead of main app
bun run dev:desktop      # Desktop app (Electrobun)
ELIZA_DEV_LOG_LEVEL=debug bun run dev   # verbose API logs
```

### Hot Reload

- **UI changes**: Vite HMR reloads components instantly
- **Runtime/API changes**: Bun `--watch` restarts the API process

## Configuration

### Config File

The runtime config lives at `~/.eliza/eliza.json`:

```json5
{
  agent: {
    name: "mila",
    model: "anthropic/claude-opus-4-5",
  },
  env: {
    ANTHROPIC_API_KEY: "sk-ant-...",
  },
}
```

Override the path with `ELIZA_CONFIG_PATH` or `ELIZA_STATE_DIR`.

### Environment Variables

Copy `.env.example` to `.env` for development secrets. Key variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Claude models | — |
| `OPENAI_API_KEY` | OpenAI models | — |
| `MILADY_API_PORT` | API server port | 31337 (dev) |
| `MILADY_PORT` | Dashboard UI port | 2138 |
| `MILADY_GATEWAY_PORT` | Gateway WebSocket port | 18789 |
| `LOG_LEVEL` | Runtime log level | info |
| `ELIZA_DEV_LOG_LEVEL` | Dev script log level | info |
| `ELIZA_CONFIG_PATH` | Override config file path | `~/.eliza/eliza.json` |

## Testing

```bash
bun run test           # parallel test suite (recommended)
bun run test:once      # single run, no watch
bun run test:watch     # watch mode
bun run test:e2e       # end-to-end tests
bun run test:coverage  # with coverage report
bun run db:check       # database security tests
```

Coverage floors enforced in CI: 25% lines/functions, 15% branches.

## Code Quality

```bash
bun run check          # typecheck + lint (run before committing)
bun run lint:fix       # auto-fix lint issues
bun run format:fix     # auto-format code
```

Uses [Biome](https://biomejs.dev/) for linting and formatting. Config in `biome.json`.

## Building

```bash
bun run build          # full build: tsdown (src/) + vite (apps/app)
bun run build:node     # same but Node.js instead of Bun
bun run build:desktop  # Electrobun desktop app
```

Build output goes to `dist/` (runtime) and `apps/app/dist/` (UI).

## Troubleshooting

### `bun install` fails on canvas/tensorflow/whisper

These require native build tools. Install them or skip with:
```bash
ELIZA_SKIP_NATIVE=1 bun install
```

### Port already in use

`bun run dev` auto-kills zombie processes on ports 31337 and 2138. If that fails:
```bash
lsof -ti :31337 | xargs kill -9
lsof -ti :2138 | xargs kill -9
```

### Plugin not found at runtime

```bash
bun run repair    # re-runs postinstall (patches + links)
```

### Stale build artifacts

```bash
rm -rf dist apps/app/dist apps/app/.vite
bun run build
```

### Config file issues

The config path is `~/.eliza/eliza.json` (not `~/.milady/milady.json` as some old docs may say). Check with:
```bash
bun run milady doctor
```

## Architecture Overview

```
User → CLI (src/cli/) → Runtime (src/runtime/eliza.ts) → Plugins (@elizaos/*)
                            ↓
                       API Server (src/api/) ← Vite Proxy ← Dashboard (apps/app/)
                            ↓
                    Platform Connectors (Telegram, Discord, etc.)
```

The runtime dynamically loads plugins at startup based on config. Plugins are resolved via `import()` which requires NODE_PATH to be set correctly (see CLAUDE.md for details).
