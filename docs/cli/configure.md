---
title: "milady configure"
sidebarTitle: "configure"
description: "Display configuration guidance and common environment variables."
---

Print a configuration quick-reference to the terminal. The `configure` command is an informational guide -- it shows how to read config values, which environment variables to set for model providers, and where to edit the config file directly. It does not modify any files or settings.

## Usage

```bash
milady configure
```

## Options

`milady configure` takes no options beyond the standard global flags.

| Flag | Description |
|------|-------------|
| `--version`, `-v`, `-V` | Print the current Milady version and exit |
| `--help`, `-h` | Show help for this command |
| `--profile <name>` | Use a named configuration profile |
| `--dev` | Shorthand for `--profile dev` |

## Example

```bash
milady configure
```

## Output

Running `milady configure` prints the following information to the terminal:

```
Milady Configuration

Set values with:
  milady config get <key>     Read a config value
  Edit ~/.milady/milady.json directly for full control.

Common environment variables:
  ANTHROPIC_API_KEY    Anthropic (Claude)
  OPENAI_API_KEY       OpenAI (GPT)
  AI_GATEWAY_API_KEY   Vercel AI Gateway
  GOOGLE_API_KEY       Google (Gemini)
```

## Common Environment Variables

The following environment variables configure AI model provider access. Set them in your shell profile (e.g. `~/.zshrc` or `~/.bashrc`) or in a `.env` file in your working directory.

| Environment Variable | Provider |
|---------------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `OPENAI_API_KEY` | OpenAI (GPT) |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway |
| `GOOGLE_API_KEY` | Google (Gemini) |

For a complete list of supported providers and their environment variables, see [milady models](/cli/models) and [Environment Variables](/cli/environment).

## Setting Configuration Values

`milady configure` is read-only. To actually change configuration, use one of these approaches:

**Read a value:**
```bash
milady config get gateway.port
milady config get agents.defaults.workspace
```

**Inspect all values:**
```bash
milady config show
milady config show --all      # include advanced fields
milady config show --json     # machine-readable output
```

**Find the config file:**
```bash
milady config path
# Output: /Users/you/.milady/milady.json
```

**Edit directly:**
```bash
# Open in your editor
$EDITOR ~/.milady/milady.json
```

## Related

- [milady config](/cli/config) -- read and inspect config values with `get`, `path`, and `show` subcommands
- [milady models](/cli/models) -- check which model providers are configured
- [milady setup](/cli/setup) -- initialize the config file and workspace
- [Environment Variables](/cli/environment) -- complete environment variable reference
- [Configuration Reference](/configuration) -- full config file schema and all available settings
