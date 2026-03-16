# Dev Stack & Environment

## Machine
- M4 MacBook Air
- macOS, username: home
- Shell: zsh

## Primary Tools
- **IDE:** Cursor
- **AI coding:** Claude Code
- **Git host:** GitHub (dexploarer)
- **npm:** published packages (authToken in ~/.npmrc)

## Languages & Runtimes

| Language | Runtime/Version | Use |
|----------|----------------|-----|
| TypeScript | Bun (primary), Node 22 (compat) | All TS projects |
| Go | go mod | milady-go, agent-arena-go |
| Rust | cargo | in PATH, available |
| Solidity | Foundry (forge/cast/anvil) | EVM contracts |
| Python | python3 | scripts, analysis |

## Package Management
- **Bun** — default for all TS projects (`bun install`, `bun add`, `bun run`)
- **pnpm** — openclaw
- **npm** — avoid unless forced
- Never use yarn in Wes's projects

## Build Tools
- **tsdown** — TypeScript bundling (milady, openclaw)
- **Vite** — frontend builds
- **Biome** — lint/format (replaces ESLint + Prettier)

## Key CLI Tools in PATH
```
bun          - JS runtime + pkg manager
gh           - GitHub CLI
fly          - Fly.io deployments
foundry      - EVM (forge, cast, anvil)
solana       - Solana CLI
cargo        - Rust pkg manager
docker       - containers
antigravity  - custom CLI
openclaw     - openclaw CLI
```

## Deployment
- **Fly.io** — primary cloud deployment
- **Docker** — containerization
- **Render** — openclaw
- **GitHub Actions** — CI (Blacksmith runners for speed)

## Environment Files
- `~/.zshrc` — shell config (Bun, NVM, Fly, Postgres, Cargo, Solana, Foundry, Antigravity)
- `~/.gitconfig` — dexploarer / dexploarer@gmail.com
- `~/.npmrc` — npm auth token

## Web3 Stack
- **EVM:** Foundry, go-ethereum, ethers.js
- **Solana:** solana-go, Solana CLI
- **Auth:** Privy (Web3 login in LunchTable)
- **Identity:** plugin-bnb-identity (BNB chain)

## AI/Agent Stack
- **elizaOS** — core agent framework (`@elizaos/*`)
- **Anthropic Claude** — primary LLM (via SDK)
- **Ollama** — local models (`~/.ollama`)
- **MCP** — Model Context Protocol (tools in rs-sdk)
- **Convex** — real-time DB for agent state

## Testing
- **Vitest** — unit tests (milady, openclaw)
- **Playwright** — E2E browser tests
- `bun run test` — run all tests
- `bun run test:e2e` — E2E only
- `bun run test:live` — live integration tests
