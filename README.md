# Milady

> *your schizo AI waifu that actually respects your privacy*

**Milady** is a personal AI assistant that is **local-first by default** and can also connect to **Eliza Cloud** or a **remote self-hosted backend** when you want hosted runtime access. Built on [elizaOS](https://github.com/elizaOS)

manages your sessions, tools, and vibes through a Gateway control plane. Connects to Telegram, Discord, whatever normie platform you use. Has a cute WebChat UI too.

tl;dr: local AI gf that's actually fast and doesn't phone home

---

## Downloads

### Desktop App (recommended for normies)

Grab from **[Releases](https://github.com/milady-ai/milady/releases/latest)**:

| Platform | File | |
|----------|------|---|
| macOS (Apple Silicon) | [`Milady-arm64.dmg`](https://github.com/milady-ai/milady/releases/latest) | for your overpriced rectangle |
| macOS (Intel) | [`Milady-x64.dmg`](https://github.com/milady-ai/milady/releases/latest) | boomer mac (why separate arm64/x64: [Build & release](docs/build-and-release.md#macos-why-two-dmgs-arm64-and-x64)) |
| Windows | [`Milady-Setup.exe`](https://github.com/milady-ai/milady/releases/latest) | for the gamer anons |
| iOS | [App Store](https://apps.apple.com/app/milady-private-ai-assistant/id0000000000) | for the privacy-pilled |
| Android | [Google Play](https://play.google.com/store/apps/details?id=ai.milady.app) / [APK](https://github.com/milady-ai/milady/releases/latest) | for the degen on the go |
| Linux | [`.AppImage`](https://github.com/milady-ai/milady/releases/latest) / [`.deb`](https://github.com/milady-ai/milady/releases/latest) / [Snap](#snap) / [Flatpak](#flatpak) / [APT repo](#debian--ubuntu-apt) | I use arch btw |

Signed and notarized. No Gatekeeper FUD. We're legit.

### Verify (for the paranoid kings)

```bash
cd ~/Downloads
curl -fsSLO https://github.com/milady-ai/milady/releases/latest/download/SHA256SUMS.txt
shasum -a 256 --check --ignore-missing SHA256SUMS.txt
```

---

## Getting Started

### New Environment Setup (recommended)

```bash
curl -fsSL https://milady-ai.github.io/milady/install.sh | bash
milady setup
```

Then start Milady:

```bash
milady
```

First run walks you through onboarding:

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

### Alternative install paths

Windows:
```powershell
irm https://milady-ai.github.io/milady/install.ps1 | iex
```

NPM global:
```bash
npm install -g miladyai
milady setup
```



### Homebrew (macOS / Linux)

```bash
brew tap milady-ai/milady
brew install milady          # CLI
brew install --cask milady   # Desktop app (macOS only)
```

### Snap

```bash
sudo snap install milady
milady setup
```

Snap packages auto-update in the background. Available on Ubuntu, Fedora, Manjaro, and any distro with [snapd](https://snapcraft.io/docs/installing-snapd) installed.

For the latest development builds:
```bash
sudo snap install milady --edge
```

### Flatpak

```bash
flatpak install flathub ai.milady.Milady
flatpak run ai.milady.Milady
```

Or sideload from a [release bundle](https://github.com/milady-ai/milady/releases/latest):
```bash
flatpak --user install milady.flatpak
```

### Debian / Ubuntu (APT)

```bash
# Add the repository
curl -fsSL https://apt.milady.ai/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/milady.gpg
echo "deb [signed-by=/usr/share/keyrings/milady.gpg] https://apt.milady.ai stable main" | \
  sudo tee /etc/apt/sources.list.d/milady.list

# Install
sudo apt update && sudo apt install milady
```

Works on Debian 12+, Ubuntu 22.04+, Linux Mint 22+, Pop!_OS, and other Debian derivatives. Updates come through `apt upgrade`.

### Security: API token

The API server binds to `127.0.0.1` (loopback) by default — only you can reach it. If you expose it to the network (e.g. `MILADY_API_BIND=0.0.0.0` for container/cloud deployments), **set a token**:

```bash
echo "MILADY_API_TOKEN=$(openssl rand -hex 32)" >> .env
```

Without a token on a public bind, anyone who can reach the server gets full access to the dashboard, agent, and wallet endpoints.

### Hosting Modes

On first run, onboarding now asks where the backend should live:

- `Local` — run the backend on the current machine, exactly like the existing local flow.
- `Cloud` — either use `Eliza Cloud` or attach to a `Remote Milady` backend with its address and access key.

If you choose `Eliza Cloud`, the app provisions and connects to a managed backend. If you choose `Remote Milady`, the frontend rebinds to the backend you specify and continues against that API.

### Remote Backend Deployment

Use this when you want the Milady frontend to connect to a backend running on your VPS, homelab box, or another machine.

1. Install Milady on the target machine.
2. Bind the API to a reachable address.
3. Generate a strong API token.
4. Allow the frontend origin explicitly.
5. Expose the backend over HTTPS or a private Tailscale URL.

Recommended server environment:

```bash
export MILADY_API_BIND=0.0.0.0
export MILADY_API_TOKEN="$(openssl rand -hex 32)"
export MILADY_ALLOWED_ORIGINS="https://app.milady.ai,https://milady.ai,https://elizacloud.ai,https://www.elizacloud.ai"
milady start --headless
```

The access key the user enters in onboarding is the value of `MILADY_API_TOKEN`.

If you want to connect from the desktop shell instead of the web frontend:

```bash
MILADY_DESKTOP_API_BASE=https://your-milady-host.example.com \
MILADY_API_TOKEN=your-token \
bun run dev:desktop
```

### Tailscale

For private remote access without opening the backend publicly, expose it over your tailnet:

```bash
tailscale serve --https=443 http://127.0.0.1:2138
```

If you intentionally want a public Tailscale URL:

```bash
tailscale funnel --https=443 http://127.0.0.1:2138
```

Then use the Tailscale HTTPS URL as the backend address in onboarding and keep using the same `MILADY_API_TOKEN` as the access key.

### Eliza Cloud

`Milady` uses the existing `Eliza Cloud` deployment directly at `https://elizacloud.ai`. The managed control plane, auth surface, billing, and instance dashboard all live there; there is no separate Milady-hosted cloud control plane to deploy.

Managed browser flow:

1. Sign in on `https://elizacloud.ai/login?returnTo=%2Fdashboard%2Fmilady`
2. Open or create a Milady instance in `https://elizacloud.ai/dashboard/milady`
3. Eliza Cloud redirects to `https://app.milady.ai` with a one-time launch session
4. `app.milady.ai` exchanges that launch session directly with Eliza Cloud and attaches to the selected managed backend

The desktop/local app still exposes local `/api/cloud/*` passthrough routes for cloud login, billing, and compat management so it can persist the Eliza Cloud API key into the local config/runtime. That is local app plumbing, not a separate hosted Milady server.

The integration plan lives in [docs/eliza-cloud-rollout.md](docs/eliza-cloud-rollout.md).

The implementation and proxy runbook lives in [docs/eliza-cloud-deployment.md](docs/eliza-cloud-deployment.md).

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

## Developing Eliza Packages Locally

Milady relies heavily on `@elizaos/*` packages internally. If you want to customize Eliza plugins, or work on `../eliza` and see your changes reflected in `milady` instantly, we have a workspace linking tool.

The setup script handles everything automatically—it will even clone `eliza` for you into `../eliza` if you don't already have it checked out.

Just run the workspace setup script:
```bash
bun run setup:eliza-workspace
```
This script will:
- Discover all `@elizaos/*` packages inside `../eliza/packages/` and `../eliza/plugins/`.
- Compile required prerequisites.
- Automatically symlink each discovered package directly into `milady/node_modules/@elizaos/` and its `apps/*/node_modules/` folders.

Whenever you save a file in `../eliza`, TypeScript and bundlers running in `milady` will pick up the live local package rather than depending on published NPM packages. Just restart your `milady` instances to pull in changes for backend code.

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

Lives at `~/.eliza/eliza.json` (override with `ELIZA_CONFIG_PATH` or `ELIZA_STATE_DIR`)

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

Or use `~/.eliza/.env` for secrets.

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

### Using Ollama (local models)

[Ollama](https://ollama.ai) lets you run models locally with zero API keys. Install it, pull a model, and configure Milady:

```bash
# install ollama
curl -fsSL https://ollama.ai/install.sh | sh

# pull a model
ollama pull gemma3:4b
```

> **⚠️ Known issue:** The `@elizaos/plugin-ollama` has an SDK version incompatibility with the current AI SDK. Use Ollama's **OpenAI-compatible endpoint** as a workaround:

Edit `~/.milady/milady.json`:

```json5
{
  env: {
    OPENAI_API_KEY: "ollama",           // any non-empty string works
    OPENAI_BASE_URL: "http://localhost:11434/v1",  // ollama's openai-compat endpoint
    SMALL_MODEL: "gemma3:4b",           // or any model you pulled
    LARGE_MODEL: "gemma3:4b",
  },
}
```

This routes through the OpenAI plugin instead of the broken Ollama plugin. Works with any Ollama model — just make sure `ollama serve` is running.

**Recommended models for local use:**

| Model | Size | Vibe |
|-------|------|------|
| `gemma3:4b` | ~3GB | fast, good for chat |
| `llama3.2` | ~2GB | lightweight, quick responses |
| `mistral` | ~4GB | solid all-rounder |
| `deepseek-r1:8b` | ~5GB | reasoning arc |

---

## Prerequisites

| | Version | Check | Install |
|---|---------|-------|---------|
| **Node.js** | >= 22 | `node --version` | [nodejs.org](https://nodejs.org) |
| **Bun** | latest | `bun --version` | `curl -fsSL https://bun.sh/install \| bash` |
| **Git** | any | `git --version` | system package manager |

**Optional** (for vision/TTS plugins with native deps):
- macOS: `xcode-select --install`
- Linux: `sudo apt install build-essential python3 libcairo2-dev libjpeg-dev libpango1.0-dev`

## Build from Source

```bash
git clone https://github.com/milady-ai/milady.git
cd milady
bun install          # runs postinstall hooks (patches deps, seeds skills, etc.)
bun run build
bun run milady start
```

> `scripts/rt.sh` prefers bun but falls back to npm automatically. If you want to be explicit: `bun run build:node` uses only Node.

### Dev mode (recommended for development)

```bash
bun run dev          # starts API (:31337) + Vite UI (:2138) with hot reload
```

This auto-kills zombie processes on the dev ports, waits for the API to be healthy, then starts the Vite dev server with proxy.

```bash
bun run check        # typecheck + lint (run before committing)
bun run test         # parallel test suite
bun run doctor       # diagnose environment issues
bun run repair       # re-run postinstall hooks
```

See **[DEVELOPMENT.md](./DEVELOPMENT.md)** for the full development guide including troubleshooting, architecture overview, and config reference.

### Documentation (with WHYs)

- **[Plugin resolution and NODE_PATH](docs/plugin-resolution-and-node-path.md)** — Why we set `NODE_PATH` in three places so dynamic plugin imports resolve when building from source (CLI, desktop dev, Electron).
- **[Build and release](docs/build-and-release.md)** — Why the release pipeline uses strict shell, retries, setup-node v3/Blacksmith, Bun cache, timeouts; why size-report pipelines handle SIGPIPE; why Windows plugin build uses `npx -p typescript tsc`.

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
