# Milaidy — Personal AI Assistant

**Milaidy** is a _personal AI assistant_ you run on your own devices, built on [ElizaOS](https://github.com/elizaos).
The Gateway is the control plane that manages sessions, tools, and events. It connects to messaging platforms, companion apps, and a WebChat UI.

If you want a personal, single-user assistant that feels local, fast, and always-on, this is it.

## Download

### macOS Desktop App

Download the latest DMG from **[GitHub Releases](https://github.com/milady-ai/milaidy/releases/latest)**:

| Platform | Download |
|---|---|
| macOS (Apple Silicon) | [`Milaidy-arm64.dmg`](https://github.com/milady-ai/milaidy/releases/latest) |
| macOS (Intel) | [`Milaidy-x64.dmg`](https://github.com/milady-ai/milaidy/releases/latest) |
| Windows | [`Milaidy-Setup.exe`](https://github.com/milady-ai/milaidy/releases/latest) |
| Linux | [`Milaidy.AppImage`](https://github.com/milady-ai/milaidy/releases/latest) / [`.deb`](https://github.com/milady-ai/milaidy/releases/latest) |

The macOS app is signed and notarized — no Gatekeeper warnings on a fresh install.

### Verify checksums

Every release includes a `SHA256SUMS.txt` file. After downloading, verify integrity:

```bash
# macOS / Linux
cd ~/Downloads
curl -fsSLO https://github.com/milady-ai/milaidy/releases/latest/download/SHA256SUMS.txt
shasum -a 256 --check --ignore-missing SHA256SUMS.txt
```

```powershell
# Windows (PowerShell)
cd ~\Downloads
Invoke-WebRequest -Uri "https://github.com/milady-ai/milaidy/releases/latest/download/SHA256SUMS.txt" -OutFile SHA256SUMS.txt
# Compare manually:
Get-FileHash .\Milaidy-Setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## Quick Start — Zero Config

Get an agent running in seconds. No config files needed.

```bash
npx milaidy
```

That's it. On first run, Milaidy walks you through:
1. **Pick a name** for your agent (or use a random one)
2. **Choose a personality** style
3. **Connect a model** provider (or skip to configure later)

The agent starts immediately after onboarding. The web dashboard opens at `http://localhost:18789`.

## Install

Runtime: **Node >= 22**. Works with npm or bun.

### One-line install (recommended)

macOS / Linux / WSL:

```bash
curl -fsSL https://milady-ai.github.io/milaidy/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://milady-ai.github.io/milaidy/install.ps1 | iex
```

The installer checks for Node.js, installs it if needed, then installs milaidy globally and runs initial setup.

### Manual install

```bash
npm install -g milaidy
```

Then start the agent:

```bash
milaidy start
```

### npx (no install)

Run directly without installing globally:

```bash
npx milaidy
```

Or with bun:

```bash
bunx milaidy
```

## Usage

```bash
milaidy start          # Start the agent runtime (default command)
milaidy setup          # Initialize workspace and config
milaidy dashboard      # Open the Control UI in your browser
milaidy configure      # Configuration guidance
milaidy config get <key>  # Read a config value
milaidy models         # Show configured model providers
milaidy plugins list   # List available plugins
milaidy --help         # Show all commands
```

Upgrading? Run `milaidy setup` after updating to refresh the workspace.

### Default ports

When running, Milaidy listens on these local ports:

- **Gateway/Runtime**: `http://localhost:18789` (WebSocket + HTTP API (server))
- **Dashboard/Control UI**: `http://localhost:2138` (Web interface (client))

Override with environment variables:
```bash
export MILAIDY_GATEWAY_PORT=19000  # Change gateway port
export MILAIDY_PORT=3000           # Change dashboard port
```

## Models

Pick any AI provider during onboarding, or configure later.

**Cloud providers:**

| Provider | Env Variable | Notes |
|---|---|---|
| [Anthropic](https://www.anthropic.com/) (Claude) | `ANTHROPIC_API_KEY` | Recommended — Opus 4.5 for long-context |
| [OpenAI](https://openai.com/) (GPT) | `OPENAI_API_KEY` | GPT-4o, o1, etc. |
| [OpenRouter](https://openrouter.ai/) | `OPENROUTER_API_KEY` | Access to 100+ models |
| [Google Gemini](https://ai.google.dev/) | `GOOGLE_API_KEY` | Gemini Pro/Ultra |
| [xAI](https://x.ai/) (Grok) | `XAI_API_KEY` | Grok-2 |
| [Groq](https://groq.com/) | `GROQ_API_KEY` | Fast inference |
| [DeepSeek](https://deepseek.com/) | `DEEPSEEK_API_KEY` | DeepSeek-V3 |

**Local (free, no API key):**

| Provider | Setup |
|---|---|
| [Ollama](https://ollama.ai/) | Install Ollama, then select it during onboarding |

**Recommended:** Anthropic Pro/Max (100/200) + Opus 4.5 for long-context strength and better prompt-injection resistance.

## Wallet Setup (Web3)

Milaidy has first-class EVM and Solana wallet support. Wallets are generated automatically and managed through the config.

### Auto-generated wallets

On first run, Milaidy can generate fresh EVM (Ethereum/Base/Arbitrum/Optimism/Polygon) and Solana keypairs. Private keys are stored locally in your config — never sent anywhere.

### Configure wallet keys

Set your own keys in `~/.milaidy/milaidy.json` or via environment variables:

```bash
# EVM (Ethereum, Base, Arbitrum, etc.)
export EVM_PRIVATE_KEY="0x..."

# Solana
export SOLANA_PRIVATE_KEY="..."  # base58-encoded
```

### Portfolio & NFT viewing

To view token balances and NFTs in the dashboard, configure API keys:

```bash
# EVM chains (Alchemy)
export ALCHEMY_API_KEY="..."

# Solana (Helius)
export HELIUS_API_KEY="..."
```

Or set them in the dashboard under the Wallet/Inventory tab.

### Supported chains

- **EVM:** Ethereum, Base, Arbitrum, Optimism, Polygon
- **Solana:** Mainnet (SPL tokens + NFTs via Helius DAS)

## Configuration

Config file: `~/.milaidy/milaidy.json`

Minimal example:

```json5
{
  agent: {
    model: "anthropic/claude-opus-4-5",
  },
}
```

Environment variables can also be set in `~/.milaidy/.env` or in the `env` section of the config:

```json5
{
  env: {
    ANTHROPIC_API_KEY: "sk-ant-...",
  },
}
```

## Agent workspace + skills

- Workspace root: `~/.milaidy/workspace` (configurable via `agents.defaults.workspace`).
- Injected prompt files: `AGENTS.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`.
- Skills: `~/.milaidy/workspace/skills/<skill>/SKILL.md`.

## Security model

- **Default:** tools run on the host for the **main** session, so the agent has full access when it's just you.
- **Group/channel safety:** set `agents.defaults.sandbox.mode: "non-main"` to run non-main sessions inside per-session Docker sandboxes.

## Chat commands

- `/status` — session status (model + tokens, cost)
- `/new` or `/reset` — reset the session
- `/compact` — compact session context (summary)
- `/think <level>` — off|minimal|low|medium|high|xhigh
- `/verbose on|off`
- `/usage off|tokens|full` — per-response usage footer
- `/restart` — restart the gateway

## From source (development)

Requires **Bun** for builds from source.

```bash
git clone https://github.com/milady-ai/milaidy.git
cd milaidy

bun install
bun run ui:build   # auto-installs UI deps on first run
bun run build

bun run milaidy start

# Dev loop (auto-reload on TS changes)
bun run dev
```

`bun run milaidy ...` runs TypeScript directly (via `tsx`). `bun run build` produces `dist/` for running via Node / the packaged `milaidy` binary.

### Building the desktop app

```bash
bun run build:desktop
```

### Release builds (signed & notarized)

Release builds are automated via GitHub Actions. See `.github/workflows/release.yml`.

Required repository secrets for signed macOS builds:
- `CSC_LINK` — base64-encoded .p12 signing certificate
- `CSC_KEY_PASSWORD` — certificate password
- `APPLE_ID` — Apple Developer account email
- `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password from [appleid.apple.com](https://appleid.apple.com)
- `APPLE_TEAM_ID` — Apple Developer Team ID

## License

MIT
