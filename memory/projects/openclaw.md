# OpenClaw

**Type:** Multi-channel AI Gateway
**Version:** 2026.3.14
**Repo:** https://github.com/openclaw/openclaw
**Path:** `~/openclaw`

## What it is
Multi-channel AI gateway with extensible messaging integrations. Connects AI models to Discord, Telegram, Feishu, and other platforms. Has a gateway health monitor, plugin system, and Docker deployment.

## Stack
- Runtime: Node.js / pnpm workspace
- Language: TypeScript
- Bundler: tsdown
- Tests: Vitest (unit, e2e, gateway, live, extensions, channels)

## Recent Work (git log)
- Android dark theme
- Gateway health monitor hardening (account gating, stale threshold, max restarts)
- Feishu: structured cards, identity header, note footer, streaming
- Feishu: reactions and card action support
- Edge TTS output validation
- New model support (zai glm-5-turbo)
- Docker lsof addition
- Plugin deduplication

## Structure
- `src/` — core gateway
- `packages/` — workspace packages
- `apps/` — app variants
- `extensions/` — platform extensions
- `skills/` — skills
- `ui/` — UI components
- `vendor/` — vendored deps

## Deployment
- Docker (docker-compose.yml)
- Fly.io (fly.toml, fly.private.toml)
- Render (render.yaml)
