---
title: "Environment Variables"
sidebarTitle: "environment"
description: "Complete reference for all Milaidy environment variables."
---

Milaidy reads environment variables at startup to configure paths, ports, API access, feature flags, and runtime behavior. Variables take precedence over config file values for path and server settings. This page documents every recognized environment variable.

## Path and State

These variables control where Milaidy stores its state, config, and credentials.

| Variable | Description | Default |
|----------|-------------|---------|
| `MILADY_STATE_DIR` | Override the state directory. All resolved paths default to subdirectories of this directory. | `~/.milady/` |
| `MILADY_CONFIG_PATH` | Override the config file path. Takes precedence over `MILADY_STATE_DIR` for config resolution. | `~/.milady/milady.json` |
| `MILADY_PROFILE` | Active configuration profile name. When set, the state directory becomes `~/.milady-<profile>/`. Equivalent to the `--profile` CLI flag. | (none) |
| `MILADY_OAUTH_DIR` | Override the OAuth credentials directory. | `~/.milady/credentials/` |
| `MILADY_WORKSPACE_ROOT` | Override the workspace root directory used by the registry client. | (auto-resolved from config) |

### Path Resolution

`MILADY_CONFIG_PATH` takes the highest precedence. If not set, `MILADY_STATE_DIR` determines where `milady.json` is looked for. If neither is set, the default `~/.milady/milady.json` is used.

When a `--profile <name>` flag or `MILADY_PROFILE` is set, the state directory becomes `~/.milady-<name>/` and all path defaults shift accordingly.

---

## Server Configuration

These variables control the API server and network behavior.

| Variable | Description | Default |
|----------|-------------|---------|
| `MILADY_PORT` | API server port when running `milaidy start`. | `2138` |
| `MILADY_HEADLESS` | Run in headless mode. Set to `1` to suppress interactive prompts. | (unset) |
| `MILADY_GATEWAY_PORT` | Gateway port. Automatically set to `19001` when the `--dev` flag is used. | (unset) |
| `MILADY_API_TOKEN` | Static API token for authenticating requests to the agent API server. When set, all API requests must include this token. | (unset) |
| `MILADY_ALLOW_WS_QUERY_TOKEN` | When set to `1`, allows the API token to be passed as a WebSocket query parameter (less secure; useful for some clients). | (unset) |
| `API_PORT` / `SERVER_PORT` | Alternative port overrides used by some runtime actions. Prefer `MILADY_PORT`. | (unset) |

---

## Update and Registry

These variables affect the update checker and plugin registry client.

| Variable | Description | Default |
|----------|-------------|---------|
| `MILADY_UPDATE_CHANNEL` | Override the active release channel (`stable`, `beta`, or `nightly`). Takes precedence over the `update.channel` value in `milady.json`. Invalid values are ignored and fall back to the config value. | (from config) |
| `MILADY_SKILLS_CATALOG` | Override the path to the skills catalog JSON file. | (auto-resolved from package root) |
| `MILADY_DISABLE_LAZY_SUBCOMMANDS` | When set to `1` (or any truthy value), all subcommands (`plugins`, `models`) are eagerly registered at startup instead of on first invocation. Useful for shell completion scripts. | (unset) |

---

## Display and CLI Behavior

These variables affect the CLI output and banner behavior.

| Variable | Description | Default |
|----------|-------------|---------|
| `MILADY_HIDE_BANNER` | When set to `1`, suppresses the Milaidy ASCII banner that normally prints before each command. The banner is also suppressed for the `update` and `completion` commands regardless of this variable. | (unset) |
| `FORCE_COLOR` | Force colored terminal output even when stdout is not a TTY. Set to any non-empty, non-`0` string to enable. | (unset) |
| `LOG_LEVEL` | Set the logging verbosity level. Accepted values: `debug`, `info`, `warn`, `error`. | `info` |
| `NODE_NO_WARNINGS` | Suppresses Node.js runtime warnings. Automatically set to `1` by the CLI when `--verbose` / `--debug` is not active. | (auto-set) |

---

## Model Provider API Keys

These variables configure access to AI model providers. Set at least one to enable model inference.

| Variable | Provider | Notes |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | Claude 3 and 4 model families |
| `OPENAI_API_KEY` | OpenAI (GPT) | GPT-4o, GPT-4, and other OpenAI models |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway | Routes requests through the Vercel AI Gateway |
| `GOOGLE_API_KEY` | Google (Gemini) | Gemini model family |
| `GROQ_API_KEY` | Groq | Fast inference via Groq hardware |
| `XAI_API_KEY` | xAI (Grok) | Grok model family |
| `OPENROUTER_API_KEY` | OpenRouter | Unified API routing for many providers |
| `OLLAMA_BASE_URL` | Ollama (local) | Base URL for a local Ollama server (not an API key) |

Use `milaidy models` to check which providers are currently configured.

---

## Authentication and Credentials

These variables affect how Milaidy stores and applies credentials.

| Variable | Description | Default |
|----------|-------------|---------|
| `MILADY_HOME` | Base directory for credentials storage used by the auth layer. | `~/.milady/` |

---

## Editor

| Variable | Description | Default |
|----------|-------------|---------|
| `EDITOR` | Editor command used by `milaidy plugins open`. Accepts a full command string (e.g. `code`, `vim`, `nano -w`). | `code` |

---

## Truthy Value Convention

Several Milaidy environment variables use a "truthy value" convention. A variable is considered truthy when it is set to a non-empty string that is not `0`, `false`, `no`, or `off` (case-insensitive). Unset variables are always falsy.

Examples:
- `MILADY_HEADLESS=1` -- truthy
- `MILADY_HEADLESS=true` -- truthy
- `MILADY_HEADLESS=0` -- falsy
- `MILADY_HEADLESS=` -- falsy (empty string)

---

## Setting Variables

Set environment variables in your shell profile for persistent configuration:

```bash
# ~/.zshrc or ~/.bashrc
export ANTHROPIC_API_KEY="sk-ant-..."
export MILADY_PORT=3000
export MILADY_STATE_DIR="/srv/milady/state"
```

Or set them inline for a single command:

```bash
ANTHROPIC_API_KEY="sk-ant-..." MILADY_PORT=3000 milaidy start
```

Or use a `.env` file in your working directory (Milaidy loads `.env` files via the runtime configuration system).

## Related

- [milaidy models](/cli/models) -- check configured model providers
- [milaidy config](/cli/config) -- read and inspect config file values
- [milaidy configure](/cli/configure) -- display common environment variable guidance
- [CLI Reference](/cli-reference) -- complete CLI command reference with global flags
