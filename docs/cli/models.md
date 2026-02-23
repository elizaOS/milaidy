---
title: "milady models"
sidebarTitle: "models"
description: "Show configured model providers by checking environment variables."
---

Show the status of all supported AI model providers. The `models` command checks for the presence of each provider's API key environment variable and reports whether each provider is `configured` or `not set`. No API calls are made -- the check is purely local.

## Usage

```bash
milady models
```

## Options

`milady models` takes no options beyond the standard global flags.

| Flag | Description |
|------|-------------|
| `-v, --version` | Print the current Milady version and exit |
| `--help`, `-h` | Show help for this command |
| `--profile <name>` | Use a named configuration profile (state dir becomes `~/.milady-<name>/`) |
| `--dev` | Shorthand for `--profile dev` (also sets the gateway port to `19001`) |
| `--verbose` | Enable informational runtime logs |
| `--debug` | Enable debug-level runtime logs |
| `--no-color` | Disable ANSI colors |

## Example

```bash
milady models
```

## Output

```
[milady] Model providers:
  Anthropic (Claude): configured
  OpenAI (GPT): not set
  Vercel AI Gateway: not set
  Google (Gemini): not set
  Groq: not set
  xAI (Grok): not set
  OpenRouter: not set
  Ollama (local): not set
```

Each line shows `configured` if the corresponding environment variable is set and non-empty, or `not set` if it is absent or empty.

## Supported Providers

| Environment Variable | Provider | Notes |
|---------------------|----------|-------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | Claude 3 and 4 model families |
| `OPENAI_API_KEY` | OpenAI (GPT) | GPT-4o, GPT-4, and other OpenAI models |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway | Routes requests through the Vercel AI Gateway |
| `GOOGLE_API_KEY` | Google (Gemini) | Gemini model family |
| `GROQ_API_KEY` | Groq | Fast inference via Groq hardware |
| `XAI_API_KEY` | xAI (Grok) | Grok model family |
| `OPENROUTER_API_KEY` | OpenRouter | Unified API for many providers |
| `OLLAMA_BASE_URL` | Ollama (local) | Local models via Ollama (URL, not a key) |

## Setting Provider Keys

Set your API keys as environment variables in your shell profile or `.env` file:

```bash
# In ~/.zshrc or ~/.bashrc
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."

# Reload your shell
source ~/.zshrc
```

Or set them inline when running Milady:

```bash
ANTHROPIC_API_KEY="sk-ant-..." milady tui
```

## Selecting a Model at Runtime

Use the `--model` flag with `milady tui` to override the active model for a session:

```bash
milady tui --model anthropic/claude-sonnet-4-20250514
milady tui --model openai/gpt-4o
milady tui --model google/gemini-2.0-flash
```

Inside the TUI, use the `/model` slash command or press `Ctrl+P` to open the model selector overlay.

## Related

- [milady configure](/cli/configure) -- print provider key guidance to the terminal
- [milady tui](/cli/tui) -- start the TUI with a model override flag
- [Environment Variables](/cli/environment) -- complete environment variable reference
- [Model Providers](/model-providers) -- detailed provider configuration and model IDs
