# Glossary — Decoder Ring

## Acronyms & Abbreviations

| Term | Full Form | Context |
|------|-----------|---------|
| NFA | Not Financial Advice | milady feature (`/api/nfa/*` routes), lazy-loads `plugin-bnb-identity` |
| LTCG | LunchTable Trading Card Game | TCG project in `~/milady-projects/LunchTable-TCG` |
| COIN | — | Fintech super-app project (banking/crypto/investments/social) |
| elizaOS | — | AI agent framework milady is built on; packages are `@elizaos/*` |
| BNB | Binance Smart Chain | Blockchain; `plugin-bnb-identity` handles identity on BNB chain |
| TCC | — | Trust/reputation system (trust-dashboard project) |
| E2E | End-to-end | Tests using Playwright; run with `bun run test:e2e` |
| CI | Continuous Integration | GitHub Actions, Blacksmith runners for Node/Bun |
| DMG | Disk image | macOS installer format; milady ships arm64 + x64 DMGs |
| ASAR | — | Electron archive format; used in packaged Electron/Electrobun apps |
| CDP | Chrome DevTools Protocol | Used in E2E tests (240s timeout in CI) |
| MCP | Model Context Protocol | Tool protocol for AI agents; rs-sdk has MCP tools |
| TCG | Trading Card Game | LunchTable TCG |
| PR | Pull Request | All PRs in milady are reviewed/merged by agents per AGENTS.md |
| SSE | Server-Sent Events | Used in milady-go API for streaming |
| WS | WebSocket | Real-time comms in milady-go and agent-arena |
| ISR | Incremental Static Regeneration | Next.js feature (used in COIN blueprint) |

## Project Nicknames / Codenames

| Name | What |
|------|------|
| milady | Main AI desktop app + CLI |
| openclaw | Multi-channel AI gateway |
| milady-go | Go-based backend/CLI variant of milady |
| milady-gpu | GPU-accelerated milady variant |
| agentok | Electrobun desktop app |
| rs-sdk | Agent runtime SDK |
| agent-arena | Multi-agent battle/simulation platform |
| LunchTable / LTCG | White-label TCG for humans + AI agents |
| COIN | Fintech super-app (blueprint phase) |
| social-suit | Social features suite |
| trust-dashboard | Agent trust/reputation UI |

## Tools & Services

| Tool | What |
|------|------|
| Bun | Primary JS runtime + package manager (replaces Node/npm in TS projects) |
| Biome | Linting + formatting (replaces ESLint/Prettier) |
| tsdown | TypeScript bundler (used in milady) |
| Electrobun | Bun-native desktop app runtime |
| Capacitor | Cross-platform mobile/desktop wrapper |
| Convex | Real-time backend-as-a-service / DB |
| Privy | Web3 auth (used in LunchTable TCG) |
| Foundry | EVM dev tools (forge, cast, anvil) |
| Fly.io | Deployment platform |
| Blacksmith | Fast GitHub Actions runners |
| retake.tv | Agent gameplay streaming |
| Antigravity | CLI tool (`~/.antigravity/bin`) |
| Cursor | IDE (primary) |
| Claude Code | AI coding CLI |
