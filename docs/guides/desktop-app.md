---
title: Desktop App (Electron)
sidebarTitle: Desktop App
description: Install and use the Milady desktop application on macOS, Windows, and Linux with embedded agent runtime and native features.
---

# Desktop App (Electron)

The Milady desktop app wraps the web dashboard in a native Electron shell, adding system-level features like tray icons, global keyboard shortcuts, native notifications, and an embedded agent runtime that requires no separate server.

## Download and Install

### macOS

Download the `.dmg` file from the [GitHub releases page](https://github.com/milady-ai/milady/releases). Open the DMG and drag Milady to your Applications folder.

- **Build targets:** DMG and ZIP.
- **Category:** Productivity (`public.app-category.productivity`).
- **Code signed and notarized** — hardened runtime with Apple notarization enabled.

### Windows

Download the `.exe` installer (NSIS) from the releases page.

- **Build target:** NSIS installer.
- **Options:** Choose installation directory, run elevated if needed.
- **Code signed** via Azure Code Signing (`milady-code-sign` certificate profile).

### Linux

Download the `.AppImage` or `.deb` package from the releases page.

- **Build targets:** AppImage and deb.
- **Category:** Utility.

## Embedded Agent Runtime

The desktop app embeds the full Milady agent runtime directly in the Electron main process. No separate server or CLI is needed.

On startup, the agent module:

1. Dynamically imports the headless `startEliza` function from the bundled Milady distribution.
2. Starts the API server on an available port.
3. Sends the port number to the renderer process so the UI's API client can connect.

The renderer never needs to distinguish between an embedded or remote API server — it connects to `http://localhost:{port}` using the injected `window.__MILADY_API_BASE__` value.

### Agent Status States

The embedded agent reports its state to the UI:

| State | Meaning |
|-------|---------|
| `not_started` | Agent has not been started yet |
| `starting` | Agent is initializing |
| `running` | Agent is active and accepting requests |
| `stopped` | Agent has been shut down |
| `error` | Agent encountered a fatal error |

### External API Override

For testing or connecting to a remote agent, set the environment variable:

```
MILADY_ELECTRON_TEST_API_BASE=http://your-host:port
```

This skips the embedded agent and connects to the specified API server instead. Setting `MILADY_ELECTRON_SKIP_EMBEDDED_AGENT=1` also disables the embedded runtime.

## Native Modules

The desktop app registers 10 native modules via IPC, each providing platform-specific capabilities:

### Desktop Manager

Core native desktop features:

- **System tray** — customizable tray icon with context menu, tooltip, and click/double-click/right-click event handling.
- **Global keyboard shortcuts** — register system-wide hotkeys that work even when the app is not focused.
- **Auto-launch** — configure the app to start on system login, optionally hidden.
- **Window management** — programmatic control over window size, position, always-on-top, fullscreen, opacity, vibrancy (macOS), and more.
- **Native notifications** — rich notifications with actions, reply support, urgency levels, and click handling.
- **Power monitoring** — battery state, idle detection, suspend/resume events.
- **Clipboard operations** — read/write text, HTML, RTF, and images.
- **Shell operations** — open external URLs, reveal files in Finder/Explorer, system beep.

### Gateway Discovery

Network discovery for finding and connecting to Milady gateway servers on the local network.

### Talk Mode

Native speech-to-text and text-to-speech pipeline with ElevenLabs integration and system TTS fallback.

### Swabble (Voice Wake)

Voice wake-word detection for hands-free activation on macOS.

### Screen Capture

Native screenshot and screen recording capabilities.

### Camera

Camera capture for photo and video.

### Canvas

Native canvas rendering support.

### Location

GPS and geolocation services.

### Permissions

System permission management (microphone, camera, screen recording, etc.).

### Whisper

Local Whisper-based speech transcription.

## Global Shortcuts

The desktop app registers these global keyboard shortcuts:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` | Open the Command Palette |
| `Cmd/Ctrl+E` | Open the Emote Picker |

These shortcuts work system-wide when the app is running.

## Deep Linking

The desktop app supports the `milady://` custom URL protocol for deep linking.

### Share Target

The `milady://share` URL scheme allows external applications to share content with your agent:

```
milady://share?title=Hello&text=Check+this+out&url=https://example.com
```

Parameters:
- `title` — optional title for the shared content.
- `text` — optional text body.
- `url` — optional URL to share.
- `file` — one or more file paths (can be repeated).

File drag-and-drop from the OS is also supported via Electron's `open-file` event.

## Auto-Updater

The desktop app includes automatic update checking via `electron-updater`, publishing to GitHub releases under the `milady-ai/milady` repository. Updates are checked on launch and users are notified when a new version is available.

## Development Mode

In development mode:

- A **file watcher** (chokidar) monitors the web asset directory and auto-reloads the app when files change (1.5 second debounce).
- Content Security Policy is adjusted for development.
- The `MILADY_ELECTRON_USER_DATA_DIR` environment variable can override the user data directory for automated E2E testing.
