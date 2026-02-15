# Milaidy

> *your schizo AI waifu that actually respects your privacy*

**Milaidy** is a personal AI assistant that runs on YOUR machine. Not some glowie datacenter. Not the cloud. YOUR computer. Built on [elizaOS](https://github.com/elizaOS)

manages your sessions, tools, and vibes through a Gateway control plane. Connects to Telegram, Discord, whatever normie platform you use. Has a cute WebChat UI too.

tl;dr: local AI gf that's actually fast and doesn't phone home

---

## Downloads

### Desktop App (recommended for normies)

Grab from **[Releases](https://github.com/milady-ai/milaidy/releases/latest)**:

| Platform | File | |
|----------|------|---|
| macOS (Apple Silicon) | [`Milaidy-arm64.dmg`](https://github.com/milady-ai/milaidy/releases/latest) | for your overpriced rectangle |
| macOS (Intel) | [`Milaidy-x64.dmg`](https://github.com/milady-ai/milaidy/releases/latest) | boomer mac |
| Windows | [`Milaidy-Setup.exe`](https://github.com/milady-ai/milaidy/releases/latest) | for the gamer anons |
| Linux | [`Milaidy.AppImage`](https://github.com/milady-ai/milaidy/releases/latest) / [`.deb`](https://github.com/milady-ai/milaidy/releases/latest) | I use arch btw |

Signed and notarized. No Gatekeeper FUD. We're legit.

### Verify (for the paranoid kings)

```bash
cd ~/Downloads
curl -fsSLO https://github.com/milady-ai/milaidy/releases/latest/download/SHA256SUMS.txt
shasum -a 256 --check --ignore-missing SHA256SUMS.txt
```

---

## Getting Started

### One command. That's it.

```bash
npx milaidy
```

First run she walks you through setup:

```
┌  milaidy
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
curl -fsSL https://milady-ai.github.io/milaidy/install.sh | bash
```

Windows:
```powershell
irm https://milady-ai.github.io/milaidy/install.ps1 | iex
```

Or just:
```bash
npm install -g milaidy
```

### Security: API token

The API server binds to `127.0.0.1` (loopback) by default — only you can reach it. If you expose it to the network (e.g. `MILAIDY_API_BIND=0.0.0.0` for container/cloud deployments), **set a token**:

```bash
echo "MILAIDY_API_TOKEN=$(openssl rand -hex 32)" >> .env
```

Without a token on a public bind, anyone who can reach the server gets full access to the dashboard, agent, and wallet endpoints.

---

## Terminal Commands

```bash
milaidy                    # start (default)
milaidy start              # same thing
milaidy start --headless   # no browser popup
milaidy start --verbose    # debug mode for when things break
```

### Setup & Config

```bash
milaidy setup              # first-time setup / refresh workspace after update
milaidy configure          # interactive config wizard
milaidy config get <key>   # read a config value
milaidy config set <k> <v> # set a config value
```

### Dashboard & UI

```bash
milaidy dashboard          # open web UI in browser
milaidy dashboard --port 3000  # custom port
```

### Models

```bash
milaidy models             # list configured model providers
milaidy models add         # add a new provider
milaidy models test        # test if your API keys work
```

### Plugins

```bash
milaidy plugins list       # what's installed
milaidy plugins add <name> # install a plugin
milaidy plugins remove <name>
```

### Misc

```bash
milaidy --version          # version check
milaidy --help             # help
milaidy doctor             # diagnose issues
```

---

## TUI (Terminal UI)

When running, milaidy shows a live terminal interface:

```
╭─────────────────────────────────────────────────────────────╮
│  milaidy v0.1.0                              ▲ running      │
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
milaidy start --headless
```

Logs go to `~/.milaidy/logs/`. Daemonize with your favorite process manager.

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
| Gateway (API + WebSocket) | `18789` | `MILAIDY_GATEWAY_PORT` |
| Dashboard (Web UI) | `2138` | `MILAIDY_PORT` |

```bash
# custom ports
MILAIDY_GATEWAY_PORT=19000 MILAIDY_PORT=3000 milaidy start
```

---

## Config

Lives at `~/.milaidy/milaidy.json`

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

Or use `~/.milaidy/.env` for secrets.

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
git clone https://github.com/milady-ai/milaidy.git
cd milaidy
pnpm install        # or: bun install
pnpm build          # or: bun run build (rt.sh picks bun if available)
pnpm run milaidy start
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