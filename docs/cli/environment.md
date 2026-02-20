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
| `MILADY_HEADLESS` | Run in headless mode. Set to `1` to suppress interactive prompts. **Note:** This variable is read by the dev server (`dev-server.ts`) and is not parsed by `startEliza()` directly. The headless behavior in the main runtime is controlled by the `opts.headless` parameter passed programmatically. | (unset) |
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
| `LOG_LEVEL` | Set the logging verbosity level. Accepted values: `debug`, `info`, `warn`, `error`. | `error` |
| `NODE_NO_WARNINGS` | Suppresses Node.js runtime warnings. Automatically set to `1` by the CLI when `--verbose` / `--debug` is not active. | (auto-set) |

---

## Model Provider API Keys

These variables configure access to AI model providers. Set at least one to enable model inference.

| Variable | Provider | Notes |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | Claude 3 and 4 model families |
| `CLAUDE_API_KEY` | Anthropic (Claude) | Alias for `ANTHROPIC_API_KEY` |
| `OPENAI_API_KEY` | OpenAI (GPT) | GPT-4o, GPT-4, and other OpenAI models |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway | Routes requests through the Vercel AI Gateway |
| `AIGATEWAY_API_KEY` | Vercel AI Gateway | Alias for `AI_GATEWAY_API_KEY` |
| `GOOGLE_API_KEY` | Google (Gemini) | Gemini model family |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google (Gemini) | Alias for `GOOGLE_API_KEY` |
| `GROQ_API_KEY` | Groq | Fast inference via Groq hardware |
| `XAI_API_KEY` | xAI (Grok) | Grok model family |
| `GROK_API_KEY` | xAI (Grok) | Alias for `XAI_API_KEY` |
| `OPENROUTER_API_KEY` | OpenRouter | Unified API routing for many providers |
| `DEEPSEEK_API_KEY` | DeepSeek | DeepSeek model family |
| `TOGETHER_API_KEY` | Together AI | Together AI inference |
| `MISTRAL_API_KEY` | Mistral | Mistral model family |
| `COHERE_API_KEY` | Cohere | Cohere model family |
| `PERPLEXITY_API_KEY` | Perplexity | Perplexity model family |
| `ZAI_API_KEY` | Zai | Zai model provider |
| `OLLAMA_BASE_URL` | Ollama (local) | Base URL for a local Ollama server (not an API key) |
| `ELIZAOS_CLOUD_API_KEY` | ElizaOS Cloud | Cloud-hosted model inference via ElizaOS |
| `ELIZAOS_CLOUD_ENABLED` | ElizaOS Cloud | Set to `1` to enable ElizaOS Cloud (requires API key) |

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

## Database

These variables configure the database backend used by the ElizaOS runtime.

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_URL` | PostgreSQL connection URL. When set, switches the database provider from PGLite to PostgreSQL. | (unset -- PGLite used) |
| `PGLITE_DATA_DIR` | Override the PGLite data directory. Automatically set by the runtime when using PGLite mode. | `~/.milady/pglite/` |

---

## Model Override

These variables override the default model selections used by the runtime.

| Variable | Description | Default |
|----------|-------------|---------|
| `SMALL_MODEL` | Override the small/fast model used for lightweight tasks. | (from provider defaults) |
| `LARGE_MODEL` | Override the large/capable model used for complex tasks. | (from provider defaults) |
| `ELIZAOS_CLOUD_SMALL_MODEL` | Override the small model when using ElizaOS Cloud. | (from cloud defaults) |
| `ELIZAOS_CLOUD_LARGE_MODEL` | Override the large model when using ElizaOS Cloud. | (from cloud defaults) |

---

## Local Embedding

These variables configure local embedding model inference. Only relevant when using local embeddings instead of a cloud provider.

| Variable | Description | Default |
|----------|-------------|---------|
| `LOCAL_EMBEDDING_MODEL` | GGUF model filename for local embeddings. | (auto-selected) |
| `LOCAL_EMBEDDING_MODEL_REPO` | Hugging Face repo containing the embedding model. | (auto-selected) |
| `LOCAL_EMBEDDING_DIMENSIONS` | Embedding vector dimensions. | (auto-detected from model) |
| `LOCAL_EMBEDDING_CONTEXT_SIZE` | Maximum context size for the embedding model. | (auto-detected from model) |
| `LOCAL_EMBEDDING_GPU_LAYERS` | Number of GPU layers to offload. Set to `auto` on Apple Silicon. | `0` (CPU-only) |
| `LOCAL_EMBEDDING_USE_MMAP` | Enable memory-mapped file access for the model. | (auto) |

---

## Runtime Behavior

These variables control ElizaOS runtime initialization behavior.

| Variable | Description | Default |
|----------|-------------|---------|
| `ELIZA_ALLOW_DESTRUCTIVE_MIGRATIONS` | Allow destructive database migrations on startup. Automatically set to `true` by Milaidy. | `true` (set by Milaidy) |
| `IGNORE_BOOTSTRAP` | Skip the ElizaOS bootstrap plugin. Automatically set to `true` by Milaidy (Milaidy provides its own bootstrap). | `true` (set by Milaidy) |
| `MILADY_DISABLE_WORKSPACE_PLUGIN_OVERRIDES` | When set to `1`, disables loading plugin overrides from workspace directories. | (unset) |

---

## Skills and Marketplace

These variables configure the skills registry and marketplace integration.

| Variable | Description | Default |
|----------|-------------|---------|
| `SKILLS_REGISTRY` | URL of the skills registry. Falls back to `CLAWHUB_REGISTRY` if not set. | `https://clawhub.ai` |
| `CLAWHUB_REGISTRY` | Alias for `SKILLS_REGISTRY`. | (unset) |
| `SKILLSMP_API_KEY` | API key for authenticating with the skills marketplace. | (unset) |

---

## Wallet and Blockchain

These variables configure blockchain wallet keys used by wallet plugins.

| Variable | Description | Default |
|----------|-------------|---------|
| `EVM_PRIVATE_KEY` | Private key for EVM-compatible chains (Ethereum, Polygon, etc.). | (unset) |
| `SOLANA_PRIVATE_KEY` | Private key for the Solana blockchain. | (unset) |

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
- [CLI Reference](/cli/overview) -- complete CLI command reference with global flags
