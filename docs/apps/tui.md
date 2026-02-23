---
title: "Terminal UI (TUI)"
sidebarTitle: "TUI"
description: "Interact with your Milady agent from the terminal using the keyboard-driven text interface and chat commands."
---

<Warning>
The TUI is under active development and may be disabled in current builds. The `launchTUI()` function currently throws `"TUI is disabled."` when called. The documentation below is retained for reference and will apply once the TUI is re-enabled.
</Warning>

The Milady TUI is a terminal-based interface for chatting with your agent and managing the runtime without opening a browser or desktop app. It renders directly in your terminal emulator using a full-screen layout with a conversation list, active chat view, and status bar. All interaction is keyboard-driven, making it well-suited to headless servers, SSH sessions, and power-user workflows.

The TUI connects to the same local API server as the web dashboard (default port `2138`). It can be launched alongside the dashboard or as the sole interface when running in a headless environment.

## Features

- Full-screen terminal layout with split conversation list and chat pane
- Real-time streaming of agent responses as they are generated
- Keyboard shortcuts for all core actions — no mouse required
- Slash commands (e.g., `/clear`, `/status`, `/restart`) for runtime control from the chat input
- Markdown rendering for agent responses — bold, italic, code blocks, and lists are rendered inline
- Conversation history navigation with search
- Status bar showing agent state, model, and token usage

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Tab` / `Shift+Tab` | Move focus between conversation list and chat pane |
| `↑` / `↓` | Navigate conversations or scroll chat history |
| `Enter` | Open selected conversation / send message |
| `Ctrl+N` | Start a new conversation |
| `Ctrl+D` | Delete selected conversation |
| `Ctrl+L` | Clear the current chat view |
| `Ctrl+R` | Restart the embedded agent |
| `Ctrl+Q` | Quit the TUI |
| `Esc` | Cancel current input / close overlay |

## Configuration

Launch the TUI with the `milady tui` command. The `--port` flag overrides the default API port if the agent is running on a non-standard port.

```bash
# Start the TUI connected to the default local agent
milady tui

# Connect to an agent running on a custom port
milady tui --port 3000

# Connect to a remote agent
milady tui --api-base http://192.168.1.100:2138
```

**Slash commands** (typed directly in the chat input):

| Command | Description |
|---------|-------------|
| `/clear` | Clear the current conversation |
| `/status` | Print current agent status and runtime info |
| `/restart` | Trigger an agent restart via the API |
| `/model <name>` | Switch the active model for this conversation |
| `/help` | List all available slash commands |

## Related

- [CLI Reference](/cli/overview) — full list of `milady` CLI commands including `tui`
- [Web Dashboard](/apps/dashboard) — browser-based alternative to the TUI
- [Desktop App](/apps/desktop) — Electron app with embedded terminal panel
