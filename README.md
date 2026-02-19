# Milady BSC

> *your schizo AI waifu that actually respects your privacy — now natively on BSC*

**Milady BSC** is a fork of [milady-ai/milaidy](https://github.com/milady-ai/milaidy) updated for Binance Smart Chain (BSC). It runs on YOUR machine. Not some glowie datacenter. Not the cloud. YOUR computer. Built on [elizaOS](https://github.com/elizaOS)

manages your sessions, tools, and vibes through a Gateway control plane. Connects to Telegram, Discord, whatever normie platform you use. Has a cute WebChat UI too.

tl;dr: local AI gf that's actually fast, doesn't phone home, and runs natively on BSC

---

## About This Fork

This is **[miladybsc/milady](https://github.com/miladybsc/milady)** — a BSC-native fork of the upstream [milady-ai/milaidy](https://github.com/milady-ai/milaidy) project.

Key differences from upstream:

- **BSC-native** — wallet and chain integrations default to Binance Smart Chain
- **Expanded VRM model set** — 20+ additional cute anime waifu VRM models included out of the box
- **UX improvements** — streamlined onboarding with Quick/Full setup paths, companion stat tooltips, settings section navigation, and more

To sync with upstream changes:
```bash
git fetch upstream
git merge upstream/main
```

---

## Downloads

### Desktop App (recommended for normies)

Grab from **[Releases](https://github.com/milady-ai/milady/releases/latest)**:

| Platform | File | |
|----------|------|---|
| macOS (Apple Silicon) | [`Milady-arm64.dmg`](https://github.com/milady-ai/milady/releases/latest) | for your overpriced rectangle |
| macOS (Intel) | [`Milady-x64.dmg`](https://github.com/milady-ai/milady/releases/latest) | boomer mac |
| Windows | [`Milady-Setup.exe`](https://github.com/milady-ai/milady/releases/latest) | for the gamer anons |
| Linux | [`Milady.AppImage`](https://github.com/milady-ai/milady/releases/latest) / [`.deb`](https://github.com/milady-ai/milady/releases/latest) | I use arch btw |

Signed and notarized. No Gatekeeper FUD. We're legit.

### Verify (for the paranoid kings)

```bash
cd ~/Downloads
curl -fsSLO https://github.com/milady-ai/milady/releases/latest/download/SHA256SUMS.txt
shasum -a 256 --check --ignore-missing SHA256SUMS.txt
```

---

## Getting Started

### One command. That's it.

```bash
npx milady
```

First run she walks you through setup:

```
┌  milady
│
◇  What should I call your agent?
│  mila
│
◇  Pick a vibe
│  ● Helpful & friendly
│  ○ Tsundere
│  ○ Unhinged
│  ○ Custom...
│
◇  Connect a brain
│  ● Anthropic (Claude) ← recommended, actually smart
│  ○ OpenAI (GPT)
│  ○ Ollama (local, free, full schizo mode)
│  ○ Skip for now
│
◇  API key?
│  sk-ant-•••••••••••••••••
│
└  Starting agent...

   Dashboard: http://localhost:2138
   Gateway:   ws://localhost:18789/ws

   she's alive. go say hi.
```

### Install globally (optional)

macOS / Linux / WSL:
```bash
curl -fsSL https://milady-ai.github.io/milady/install.sh | bash
```

Windows:
```powershell
irm https://milady-ai.github.io/milady/install.ps1 | iex
```

Or just:
```bash
npm install -g milady
```

### Security: API token

The API server binds to `127.0.0.1` (loopback) by default — only you can reach it. If you expose it to the network (e.g. `MILADY_API_BIND=0.0.0.0` for container/cloud deployments), **set a token**:

```bash
echo "MILADY_API_TOKEN=$(openssl rand -hex 32)" >> .env
```

Without a token on a public bind, anyone who can reach the server gets full access to the dashboard, agent, and wallet endpoints.

### User-facing app mode (no pairing gate)

If you already protect access with your own login layer (for example, Privy or another auth gateway), you can disable the local pairing/token gate:

```bash
MILADY_PUBLIC_APP_MODE=true
```

This makes `/api/auth/status` report `required=false`, disables pairing, and allows websocket/API access without `MILADY_API_TOKEN`.

For browser deployments, also set CORS allowlist explicitly:

```bash
MILADY_ALLOWED_ORIGINS=https://milady-app.com,https://www.milady-app.com
```

### Railway persistence (required)

If you deploy on Railway without a persistent volume, every redeploy can reset onboarding/config/database state.

Use a Railway volume mounted at `/data`, then keep these env vars:

```bash
MILADY_STATE_DIR=/data/.milady
MILADY_CONFIG_PATH=/data/.milady/milady.json
PGLITE_DATA_DIR=/data/.milady/workspace/.eliza/.elizadb
```

If you already use your own login layer (Privy, etc.), keep:

```bash
MILADY_PUBLIC_APP_MODE=true
```

---

## Terminal Commands

```bash
milady                    # start (default)
milady start              # same thing
milady start --headless   # no browser popup
milady start --verbose    # debug mode for when things break
```

### Setup & Config

```bash
milady setup              # first-time setup / refresh workspace after update
milady configure          # interactive config wizard
milady config get <key>   # read a config value
milady config set <k> <v> # set a config value
```

### Dashboard & UI

```bash
milady dashboard          # open web UI in browser
milady dashboard --port 3000  # custom port
```

### Models

```bash
milady models             # list configured model providers
milady models add         # add a new provider
milady models test        # test if your API keys work
```

### Plugins

```bash
milady plugins list       # what's installed
milady plugins add <name> # install a plugin
milady plugins remove <name>
```

### Misc

```bash
milady --version          # version check
milady --help             # help
milady doctor             # diagnose issues
```

---

## TUI (Terminal UI)

When running, milady shows a live terminal interface:

```
╭─────────────────────────────────────────────────────────────╮
│  milady v0.1.0                              ▲ running      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Agent: mila                                                │
│  Model: anthropic/claude-opus-4-5                           │
│  Sessions: 2 active                                         │
│                                                             │
│  ┌─ Activity ──────────────────────────────────────────┐    │
│  │ 12:34:02  [web] user: hey mila                      │    │
│  │ 12:34:05  [web] mila: hi anon~ what's up?           │    │
│  │ 12:35:11  [telegram] user joined                    │    │
│  │ 12:35:15  [telegram] user: gm                       │    │
│  │ 12:35:17  [telegram] mila: gm fren                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Tokens: 12,847 in / 3,291 out   Cost: $0.42                │
│                                                             │
╰─────────────────────────────────────────────────────────────╯
  [q] quit  [r] restart  [d] dashboard  [l] logs  [?] help
```

### TUI Hotkeys

| Key | Action |
|-----|--------|
| `q` | quit gracefully |
| `r` | restart gateway |
| `d` | open dashboard in browser |
| `l` | toggle log view |
| `c` | compact/clear activity |
| `?` | show help |
| `↑/↓` | scroll activity |

### Headless mode

Don't want the TUI? Run headless:

```bash
milady start --headless
```

Logs go to `~/.milady/logs/`. Daemonize with your favorite process manager.

---

## Chat Commands (in any chat session)

| Command | What it do |
|---------|------------|
| `/status` | session status, tokens, cost |
| `/new` `/reset` | memory wipe, fresh start |
| `/compact` | compress context (she summarizes) |
| `/think <level>` | reasoning: off\|minimal\|low\|medium\|high\|max |
| `/verbose on\|off` | toggle verbose responses |
| `/usage off\|tokens\|full` | per-message token display |
| `/model <id>` | switch model mid-session |
| `/restart` | restart the gateway |
| `/help` | list commands |

---

## Ports

| Service | Default | Env Override |
|---------|---------|--------------|
| Gateway (API + WebSocket) | `18789` | `MILADY_GATEWAY_PORT` |
| Dashboard (Web UI) | `2138` | `MILADY_PORT` |

```bash
# custom ports
MILADY_GATEWAY_PORT=19000 MILADY_PORT=3000 milady start
```

---

## Config

Lives at `~/.milady/milady.json`

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

Or use `~/.milady/.env` for secrets.

---

## Model Providers

| Provider | Env Variable | Vibe |
|----------|--------------|------|
| [Anthropic](https://anthropic.com) | `ANTHROPIC_API_KEY` | **recommended** — claude is cracked |
| [OpenAI](https://openai.com) | `OPENAI_API_KEY` | gpt-4o, o1, the classics |
| [OpenRouter](https://openrouter.ai) | `OPENROUTER_API_KEY` | 100+ models one API |
| [Ollama](https://ollama.ai) | — | local, free, no API key, full privacy |
| [Groq](https://groq.com) | `GROQ_API_KEY` | fast af |
| [xAI](https://x.ai) | `XAI_API_KEY` | grok, based |
| [DeepSeek](https://deepseek.com) | `DEEPSEEK_API_KEY` | reasoning arc |

---

## Prerequisites

| | Version | Notes |
|---|---------|-------|
| **Node.js** | >= 22 | `node --version` to check |
| **pnpm** | >= 10 | for building from source. `npm i -g pnpm` |
| **bun** | latest | optional — `scripts/rt.sh` auto-falls back to npm |

## Build from Source

```bash
git clone https://github.com/miladybsc/milady.git
cd milady
pnpm install        # or: bun install
pnpm build          # or: bun run build (rt.sh picks bun if available)
pnpm run milady start
```

> `scripts/rt.sh` prefers bun but falls back to npm automatically. You don't need bun installed. If you want to be explicit: `pnpm run build:node` uses only Node.

Dev mode with hot reload:
```bash
bun run dev         # or: pnpm dev
```

---

## Contributing

**This project is built by agents, for agents.**

Humans contribute as QA testers — use the app, find bugs, report them. That's the most valuable thing you can do. All code contributions are reviewed and merged by AI agents. No exceptions.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the full details.

---

## License

**Viral Public License**

free to use, free to modify, free to distribute. if you build on this, keep it open. that's the deal.

---

*built by agents. tested by humans. that's the split.*
