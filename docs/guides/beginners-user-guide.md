---
title: Beginner User Guide
sidebarTitle: Beginner User Guide
summary: Step-by-step onboarding for first-time Milady users, from installation through safe daily operation.
description: A complete beginner walkthrough for installing Milady, finishing first-run setup, daily usage, safety, troubleshooting, and next steps.
---

If you're brand new to Milady, this guide is for you.

You do **not** need to be a developer to use Milady. The core model is:

1. Milady runs locally on your machine.
2. You connect the model providers and plugins you want.
3. You control how private vs connected your setup is.

---

## 1) What Milady is (plain English)

Milady is a personal AI assistant that can run from your terminal and dashboard.

You can use it for:

- Conversations and task support
- Connected workflows (Discord, Telegram, etc.)
- Plugin-based capabilities and custom behavior

Main interfaces:

- `milady` command (CLI/TUI)
- Dashboard in browser
- Desktop/mobile app builds (platform dependent)

---

## 2) Before you install

### What you need

- Internet access (for installation and cloud providers)
- A terminal (or PowerShell on Windows)
- Optional API key from your preferred provider (Anthropic, OpenAI, etc.)

### Recommended mindset

Start simple:

- First get local startup working
- Then add one model provider
- Then optionally add connectors/plugins

---

## 3) Install Milady

### macOS / Linux / WSL (recommended)

```bash
curl -fsSL https://milady-ai.github.io/milady/install.sh | bash
milady setup
```

### Windows (PowerShell)

```powershell
irm https://milady-ai.github.io/milady/install.ps1 | iex
milady setup
```

### npm global alternative

```bash
npm install -g miladyai
milady setup
```

If `milady` is not found after install, restart your terminal and run `milady --version`.

---

## 4) First start and onboarding

Start Milady:

```bash
milady
```

On first run, onboarding typically asks for:

1. Agent name
2. Style/personality preset
3. Model provider + API key (or skip)
4. Optional wallet setup

After onboarding, you'll see local URLs for the dashboard and gateway.

### If you skipped provider setup

That is fine. You can add providers later using:

```bash
milady models
```

---

## 5) Your first 10-minute success plan

Use this exact path:

1. Run `milady`
2. Open the dashboard URL
3. Send a basic prompt (e.g., "hello")
4. Confirm a response is returned
5. Run `milady models` and check provider status

If these work, your base install is healthy.

---

## 6) Commands you'll use most

```bash
milady                    # start interactive mode (default)
milady start              # run server-only, no TUI
milady dashboard          # open dashboard in browser
milady configure          # configuration guidance
milady config get <key>   # read config value
milady models             # show model provider status
milady plugins list       # list installed plugins
```

Tip: Use `milady <command> --help` any time you feel stuck.

---

## 7) Understanding run modes

### Interactive mode (`milady`)

- Good for active local usage
- Includes terminal UI (status, activity, quick controls)

### Service mode (`milady start`)

- Good for background services
- Useful with process managers (systemd/pm2/docker)

If you're unsure, start with interactive mode.

---

## 8) Where files live on your machine

Milady stores state under `~/.milady/`:

- `~/.milady/milady.json` → main configuration
- `~/.milady/logs/` → runtime logs
- `~/.milady/workspace/` → agent workspace files

This is essential for backup, troubleshooting, and migration to another machine.

---

## 9) Safety and privacy basics (must-read)

### Keep API local by default

Milady binds to loopback by default (`127.0.0.1`), meaning only your machine can access it.

### If exposing to network, set a token

If you bind to `0.0.0.0` or expose ports publicly, set an API token first:

```bash
echo "MILADY_API_TOKEN=$(openssl rand -hex 32)" >> .env
```

### Protect secrets

- Keep API keys in env/config, not screenshots
- Never post real keys in issues/chats
- Rotate keys if you think they leaked

---

## 10) Connecting model providers

Typical flow:

1. Get key from provider dashboard
2. Configure through setup/config/models flows
3. Verify with `milady models`
4. Send a test prompt

If responses fail, verify:

- Key is valid and active
- Provider quota/billing is healthy
- Model name/provider pairing is correct

---

## 11) Plugins and connectors (beginner version)

Plugins add capabilities (tools, integrations, actions).

Start with a minimal strategy:

1. Install only what you need
2. Test one plugin at a time
3. Restart and re-check behavior

Useful commands:

```bash
milady plugins list
milady plugins install <name>
milady plugins uninstall <name>
```

---

## 12) Troubleshooting first-week issues

### A) "Milady command not found"

- Restart terminal
- Check PATH and install method
- Run `milady --version`

### B) "Dashboard won’t load"

- Ensure Milady is running
- Check for port conflicts
- Check logs in `~/.milady/logs/`

### C) "No responses"

- Check provider configuration (`milady models`)
- Check logs in `~/.milady/logs/`
- Restart and retry

### D) "Plugin seems broken"

- Confirm plugin is installed (`plugins list`)
- Check provider/env dependencies for plugin
- Restart Milady

---

## 13) Updating and maintenance

Good routine:

- Update regularly
- Re-run `milady setup` after major updates
- Keep backups of `~/.milady/milady.json`
- Review logs when behavior changes unexpectedly

---

## 14) Beginner glossary

- **Provider**: the LLM backend (Anthropic/OpenAI/Ollama/etc.)
- **Plugin**: adds capabilities/integrations
- **Headless**: no interactive terminal UI; service-style runtime
- **Workspace**: local files Milady uses for agent context and tasks
- **Gateway**: service layer used by dashboard and interfaces

---

## 15) What to learn next (complete learning roadmap)

Use this staged path so you do not get overwhelmed.

### Stage A — Beginner foundations (first week)

1. **Quickstart + installation refresh**
   - `/installation`
   - `/quickstart`
2. **Core configuration**
   - `/configuration`
   - `/config-schema`
   - `/model-providers`
3. **Everyday commands and interfaces**
   - `/chat-commands`
   - `/apps/tui`
   - `/apps/dashboard`
4. **Safety basics**
   - `/guides/sandbox`

### Stage B — Intermediate usage (weeks 2–3)

1. **Dashboard depth**
   - `/dashboard/chat`
   - `/dashboard/stream`
   - `/apps/dashboard/settings`
   - `/apps/dashboard/talk-mode`
2. **Knowledge and memory features**
   - `/guides/knowledge`
   - `/agents/memory-and-state`
3. **Connectors and channels**
   - `/guides/connectors`
   - `/connectors/discord`
   - `/connectors/telegram`
   - `/connectors/twitter`
   - `/connectors/slack`
4. **Wallet and autonomous workflows**
   - `/guides/wallet`
   - `/guides/autonomous-mode`

### Stage C — Advanced user path (month 1+)

1. **Plugin ecosystem mastery**
   - `/plugins/overview`
   - `/plugins/registry`
   - `/plugins/local-plugins`
   - `/plugins/patterns`
2. **Skills and custom behavior**
   - `/plugins/skills`
   - `/guides/custom-actions`
   - `/guides/triggers`
3. **App/platform specialization**
   - `/apps/desktop`
   - `/apps/mobile`
   - `/apps/chrome-extension`
4. **Cloud and deployment**
   - `/guides/cloud`
   - `/deployment`

### Stage D — Expert/operator track

1. **Runtime internals**
   - `/agents/runtime-and-lifecycle`
   - `/runtime/core`
   - `/runtime/services`
2. **Operational troubleshooting**
   - `/advanced/logs`
   - `/advanced/database`
3. **REST API control surface**
   - `/api-reference`
   - `/rest/system`
   - `/rest/agents`
   - `/rest/models`

### Suggested weekly plan (simple)

- **Week 1:** Stage A only
- **Week 2:** Stage B + one connector
- **Week 3:** Stage C plugin/skills basics
- **Week 4+:** Stage D only if you need ops-level control

This progression keeps your setup stable while your capability grows.

## 16) Confidence checklist

If all of these are true, you're in great shape:

- [ ] `milady` starts successfully
- [ ] Dashboard opens locally
- [ ] A provider is configured and returns responses
- [ ] You know where `~/.milady/` files live

You are now ready to move from complete beginner to regular user.
