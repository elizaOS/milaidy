---
title: "Computer Use Plugin"
sidebarTitle: "Computer Use"
description: "Computer use plugin for Milaidy — screen control, mouse/keyboard automation, desktop screenshot, and GUI interaction."
---

The Computer Use plugin gives Milaidy agents the ability to control the desktop — taking screenshots, moving the mouse, clicking, typing, and interacting with any GUI application running on the host machine.

**Package:** `@elizaos/plugin-computeruse`

## Overview

Computer use enables agents to operate the computer as a human would: viewing the screen, making decisions based on what they see, and interacting with the OS and applications through mouse and keyboard. This unlocks automation of any desktop application, not just those with APIs.

## Installation

```bash
milaidy plugins install computeruse
```

## Enable via Features

```json
{
  "features": {
    "computeruse": true
  }
}
```

Or uncomment in `OPTIONAL_CORE_PLUGINS` in your configuration:

```json
{
  "plugins": {
    "allow": ["computeruse"]
  }
}
```

## Platform Support

| Platform | Support |
|---------|---------|
| macOS | Full support |
| Linux (X11) | Full support |
| Linux (Wayland) | Partial support |
| Windows | Full support |

## Actions

| Action | Description |
|--------|-------------|
| `TAKE_SCREENSHOT` | Capture the current screen state |
| `MOUSE_MOVE` | Move the mouse cursor to coordinates |
| `MOUSE_CLICK` | Click at coordinates or on an element |
| `MOUSE_DRAG` | Click and drag from one point to another |
| `TYPE_TEXT` | Type text using the keyboard |
| `KEY_PRESS` | Press a keyboard shortcut or key combo |
| `SCROLL` | Scroll the mouse wheel |
| `FIND_ELEMENT` | Find a UI element by text or description |
| `OPEN_APPLICATION` | Launch an application by name |
| `GET_SCREEN_INFO` | Get screen resolution and layout |

## Vision Integration

Computer use works best with a vision-capable model. The workflow:

```
1. TAKE_SCREENSHOT
       ↓
2. Send to vision model (e.g., GPT-4o, Claude claude-sonnet-4-5)
       ↓
3. Model describes what is on screen
       ↓
4. Agent decides next action
       ↓
5. Execute action (click, type, etc.)
       ↓
6. Repeat
```

Configure a vision-capable model as the primary model:

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-5"
      }
    }
  },
  "features": {
    "computeruse": true
  }
}
```

## Usage Examples

After the plugin is loaded:

> "Open Safari and navigate to hacker news"

> "Take a screenshot and tell me what application is open"

> "Click the Submit button on the form"

> "Type 'Hello world' in the terminal"

> "Open the System Preferences and take a screenshot of the Privacy settings"

## Coordinate System

Coordinates are in pixels from the top-left corner of the primary screen:

```
(0, 0) ──────────────→ x
  │
  │      screen
  │
  ↓ y
```

For multi-monitor setups, coordinates extend beyond the primary screen dimensions.

## Security Considerations

Computer use is a powerful capability. Consider:

- **Sandboxing**: The agent has full access to everything visible on screen and can interact with any application. Run in a dedicated VM or container for sensitive environments.
- **Rate limiting**: Add delays between actions to prevent runaway automation loops.
- **Approval gates**: Consider requiring human approval before executing destructive actions.
- **Logging**: Enable trajectory logging to audit agent actions.

## Trajectory Logging

Computer use sessions are automatically logged by the `@elizaos/plugin-trajectory-logger` (a core plugin). Logs include screenshots and action sequences for debugging and RL training.

## Related

- [Browser Plugin](/plugin-registry/browser) — Web-only automation (sandboxed)
- [Shell Plugin](/plugin-registry/cron) — Shell command execution
- [Sandbox Guide](/guides/sandbox) — Security and isolation options
