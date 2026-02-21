---
title: "milady tui"
sidebarTitle: "tui"
description: "Start Milady with the interactive terminal UI."
---

Start Milady with the full-screen interactive terminal chat interface. This is the **default command** -- running `milady` with no arguments is equivalent to `milady tui`.

The TUI boots the full ElizaOS agent runtime (with `requireConfig: true`) and launches a multi-pane terminal application with a status bar, scrollable chat area, and a multi-line input editor with slash command autocomplete.

## Usage

```bash
milady tui [options]
milady        # equivalent default
```

## Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-m, --model <model>` | string | (from config) | Override the default model for this session |

Global flags:

| Flag | Description |
|------|-------------|
| `--version`, `-v`, `-V` | Print the current Milady version and exit |
| `--help`, `-h` | Show help for this command |
| `--profile <name>` | Use a named configuration profile |
| `--dev` | Shorthand for `--profile dev` |

## Examples

```bash
# Start with default settings (same as running milady)
milady tui

# Override the model for this session
milady tui -m anthropic/claude-sonnet-4-20250514

# Use a named profile
milady --profile work tui

# Use dev profile with model override
milady --dev tui --model openai/gpt-4o
```

## Behavior

When you run `milady tui`:

1. The ElizaOS runtime boots with `requireConfig: true` -- the agent fails fast if no config is found.
2. If a `--model` flag is provided, it is passed as a `modelOverride` to the TUI layer.
3. The TUI launches as a full-screen terminal application with these panes:
   - **Status bar** -- agent name, current model, and connection status
   - **Chat area** -- conversation history with rendered messages and tool output
   - **Input editor** -- multi-line editor with slash command autocomplete
   - **Footer** -- available hotkeys

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send the current message |
| `Shift+Enter` | Insert a newline (multi-line input) |
| `Ctrl+P` | Open the model selector overlay |
| `Ctrl+E` | Toggle expand/collapse of tool output blocks |
| `Ctrl+C` | Cancel the current operation, or quit if the input is idle |

## Slash Commands

Slash commands are typed directly in the TUI input field. The autocomplete provider suggests available commands as you type. Press `Tab` to complete a command name.

| Command | Description |
|---------|-------------|
| `/model [provider/id]` | Open the model selector overlay, or switch directly to a specific model (e.g. `/model anthropic/claude-sonnet-4-20250514`) |
| `/models` | Alias for `/model` |
| `/clear` | Clear the chat display and reset to the welcome message |
| `/help` | Show help information |
| `/exit` | Quit Milady |
| `/quit` | Alias for `/exit` |

When using `/model` without an argument, a centered overlay appears listing all available models with the current selection highlighted. Credential status is shown per provider when available.

Slash commands are handled entirely within the TUI layer and do not reach the agent runtime or generate chat messages.

## Model Override

The `--model` flag (or `-m`) accepts a provider-prefixed model identifier in the format `provider/model-id`. Examples:

```bash
milady tui -m anthropic/claude-sonnet-4-20250514
milady tui -m openai/gpt-4o
milady tui -m google/gemini-2.0-flash
```

The model override applies only for the current session. To set a persistent default model, edit `~/.milady/milady.json` directly.

## Related

- [milady start](/cli/start) -- headless server mode with no TUI
- [Chat Commands](/chat-commands) -- full reference for runtime commands, hooks, and plugin-provided commands
- [milady models](/cli/models) -- check which model providers are configured
- [Environment Variables](/cli/environment) -- all environment variables
