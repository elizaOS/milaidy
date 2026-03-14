---
title: Desktop App (Electrobun)
sidebarTitle: Desktop App
description: Install and use the Milady desktop application on macOS, Windows, and Linux with native features and configurable local or remote runtime connectivity.
---

The Milady desktop app wraps the companion UI in a native Electrobun shell, adding system-level features like tray icons, global keyboard shortcuts, native notifications, and native OS capability bridges. Electrobun can either launch the canonical Milady runtime locally or connect the UI to an already-running local or remote runtime.

## Download and Install

### macOS

Download the `.dmg` file from the [GitHub releases page](https://github.com/milady-ai/milady/releases). Open the DMG and drag Milady to your Applications folder.

- **Build targets:** DMG and ZIP.
- **Category:** Productivity (`public.app-category.productivity`).
- **Code signed and notarized** -- hardened runtime with Apple notarization enabled.

### Windows

Download the `.exe` installer (NSIS) from the releases page.

- **Build target:** NSIS installer.
- **Options:** Choose installation directory, run elevated if needed.
- **Code signed** via Azure Code Signing (`milady-code-sign` certificate profile).

### Linux

Download the `.AppImage` or `.deb` package from the releases page.

- **Build targets:** AppImage and deb.
- **Category:** Utility.

### Build from Source

```bash
git clone https://github.com/milady-ai/milady.git && cd milady
bun install && bun run build
bun run dev:desktop
```

In development mode, the Electrobun app resolves the Milady distribution from the repository root's `dist/` directory. In packaged builds, assets are copied into the app bundle under `Resources/app/milady-dist/`.

## Desktop Runtime Modes

Electrobun is a native shell, not a separate runtime architecture. Desktop, VPS, sandboxed, and CLI/server deployments all use the same Milady runtime entrypoint. The shell chooses one of three runtime modes at startup:

| Mode | Behavior |
|------|----------|
| `local` | Spawn the canonical Milady runtime locally as a child Bun process |
| `external` | Do not spawn a local runtime; point the renderer at an explicit API base |
| `disabled` | Do not auto-start a local runtime; still point the renderer at the expected local API base for a manually managed server |

### Startup Sequence

On startup, the Electrobun shell and `AgentManager` coordinate these steps:

1. **Resolve the runtime bundle** -- In dev mode, Electrobun finds the repository root `dist/` bundle. In packaged builds, the runtime is copied into `Resources/app/milady-dist/`.
2. **Resolve desktop runtime mode** -- Environment variables decide whether the shell should use `local`, `external`, or `disabled` runtime mode.
3. **Bootstrap the renderer with an API base** -- The static renderer server injects `window.__MILADY_API_BASE__` into `index.html` before React mounts so the UI never falls back to the static server for `/api/*` requests.
4. **If mode is `local`, spawn the canonical runtime** -- Electrobun launches `bun run entry.js start` as a child process, waits for `/api/health`, and then pushes the actual bound port to the renderer.
5. **If mode is `external`, connect only** -- Electrobun does not start a child runtime. The renderer uses the normalized external API base and optional API token.
6. **If mode is `disabled`, wait for a manually managed local runtime** -- Electrobun does not auto-start the child runtime, but the renderer still targets the expected local API base so a separately managed server can satisfy requests.

### Port Configuration

The expected local API port is determined by `MILADY_PORT` (default: **2138**). In `local` mode the child runtime is started with that port request, but if the runtime binds a different port Electrobun detects it from stdout and updates the renderer API base dynamically. In `disabled` mode, the same expected local port is used for a separately managed local server.

### Agent Status States

The embedded agent reports its state to the UI via IPC:

| State | Meaning |
|-------|---------|
| `not_started` | Agent has not been started yet |
| `starting` | Agent is initializing (API server may already be available) |
| `running` | Agent is active and accepting requests |
| `stopped` | Agent has been shut down |
| `error` | Agent encountered a fatal error |

### Runtime Mode Overrides

For testing, remote connectivity, or locally managed runtime workflows:

| Environment Variable | Effect |
|---------------------|--------|
| `MILADY_DESKTOP_TEST_API_BASE` | Use this API base and switch to `external` mode |
| `MILADY_DESKTOP_API_BASE` | Use this API base and switch to `external` mode |
| `MILADY_ELECTRON_TEST_API_BASE` | Legacy fallback for older test harnesses |
| `MILADY_ELECTRON_API_BASE` | Legacy fallback for older desktop setups |
| `MILADY_API_BASE_URL` / `MILADY_API_BASE` | Generic API-base fallback vars; also switch to `external` mode |
| `MILADY_DESKTOP_SKIP_EMBEDDED_AGENT=1` | Switch to `disabled` mode; do not auto-start the child runtime |
| `MILADY_API_TOKEN` | Inject an API authentication token into the renderer |

## Native Modules

The desktop app registers **10 native modules** via IPC, each providing platform-specific capabilities. All modules are initialized in `initializeNativeModules()` and their IPC handlers are registered in `registerAllIPC()`. Every module follows a singleton pattern with a dedicated manager class.

### Agent

Local embedded runtime management via the `AgentManager` class.

| IPC Channel | Description |
|------------|-------------|
| `agent:start` | Start the local child runtime when desktop mode is `local` |
| `agent:stop` | Stop the local child runtime |
| `agent:restart` | Stop and restart the runtime, picking up config changes |
| `agent:status` | Get the current `AgentStatus` object |

In `external` and `disabled` mode, `agent:start` rejects instead of spawning the embedded runtime. The agent also emits `agent:status` events to the renderer whenever local-runtime state changes.

### Desktop Manager

Core native desktop features via the `DesktopManager` class. This is the largest module, covering eight subsystems:

**System Tray** -- Create, update, and destroy tray icons with context menus. Supports tooltip, title (macOS), icons for menu items, and submenus. Tray events (`click`, `double-click`, `right-click`) are forwarded to the renderer with modifier key state and cursor coordinates.

**Global Keyboard Shortcuts** -- Register system-wide hotkeys that work even when the app is not focused. Each shortcut has a unique ID and an Electron accelerator string. When pressed, a `desktop:shortcutPressed` event is sent to the renderer.

| IPC Channel | Description |
|------------|-------------|
| `desktop:registerShortcut` | Register a global shortcut by ID and accelerator |
| `desktop:unregisterShortcut` | Unregister a shortcut by ID |
| `desktop:unregisterAllShortcuts` | Remove all registered shortcuts |
| `desktop:isShortcutRegistered` | Check if an accelerator is currently registered |

**Auto-Launch** -- Configure the app to start on system login, optionally hidden, via `desktop:setAutoLaunch` and `desktop:getAutoLaunchStatus`.

**Window Management** -- Programmatic control over the main window. Supports size, position, min/max dimensions, resizability, always-on-top, fullscreen, opacity, vibrancy (macOS), background color, and more. Window events (`focus`, `blur`, `maximize`, `minimize`, `restore`, `close`) are forwarded to the renderer.

**Native Notifications** -- Rich notifications with actions, reply support, urgency levels, and click handling. Each notification gets a unique auto-incremented ID. Supports `click`, `action`, `reply`, and `close` event callbacks forwarded to the renderer.

**Power Monitoring** -- Battery state, idle time detection, and suspend/resume events. Emits `desktop:powerSuspend`, `desktop:powerResume`, `desktop:powerOnAC`, and `desktop:powerOnBattery` events.

**Clipboard Operations** -- Read and write text, HTML, RTF, and images to the system clipboard.

**Shell Operations** -- Open external URLs in the default browser, reveal files in Finder/Explorer, and trigger system beeps.

### Gateway Discovery

Network discovery for finding Milady gateway servers on the local network via the `GatewayDiscovery` class. Uses mDNS/Bonjour for service discovery with the `_milady._tcp` service type.

The module dynamically loads discovery libraries in priority order:
1. **mdns** (native, faster)
2. **bonjour-service** (pure JS, more portable)
3. **bonjour** or **mdns-js** (fallback alternatives)

Discovered gateways include metadata from TXT records: stable ID, TLS configuration, gateway port, canvas port, and Tailnet DNS name. Events (`found`, `updated`, `lost`) are forwarded to the renderer via `gateway:discovery`.

| IPC Channel | Description |
|------------|-------------|
| `gateway:startDiscovery` | Begin scanning with optional service type and timeout |
| `gateway:stopDiscovery` | Stop active discovery |
| `gateway:getDiscoveredGateways` | List all currently known gateways |
| `gateway:isDiscovering` | Check if discovery is active |

### Talk Mode

Full conversation mode via the `TalkModeManager` class, integrating speech-to-text (STT) and text-to-speech (TTS).

**STT Engines:**
- **Whisper** (default) -- Offline speech recognition using `whisper-node` with configurable model sizes: `tiny`, `base`, `small`, `medium`, `large`. Supports word-level timing and streaming transcription.
- **Web Speech API** -- Falls back to the browser's built-in speech recognition when Whisper is unavailable.

**TTS Engines:**
- **ElevenLabs** -- High-quality streaming TTS via the ElevenLabs API. Configurable voice ID, model ID (default: `eleven_v3`), stability, similarity boost, and speed. Audio chunks are streamed to the renderer as base64-encoded data.
- **System TTS** -- Falls back to the renderer's browser speech synthesis.

**Voice Activity Detection (VAD):** Configurable silence threshold and duration for automatic speech segmentation.

| State | Meaning |
|-------|---------|
| `idle` | Talk mode is off |
| `listening` | Actively capturing and transcribing audio |
| `processing` | Processing captured speech |
| `speaking` | TTS is playing audio |
| `error` | An error occurred |

Audio data flows from the renderer to the main process via `talkmode:audioChunk` IPC messages as `Float32Array` samples.

### Swabble (Voice Wake)

Wake word detection for hands-free activation via the `SwabbleManager` class. Uses Whisper for continuous speech transcription combined with a `WakeWordGate` that performs timing-based wake word matching.

**Configuration:**
- `triggers` -- Array of wake word phrases (e.g., `["milady", "hey milady"]`)
- `minPostTriggerGap` -- Minimum pause (seconds) after the wake word before the command starts (default: 0.45s)
- `minCommandLength` -- Minimum number of words in the command after the wake word (default: 1)
- `modelSize` -- Whisper model size to use

The wake word gate includes **fuzzy matching** for common transcription variations (e.g., "melody" matches "milady", "okay" matches "ok").

When a wake word is detected, a `swabble:wakeWord` event is sent to the renderer containing the matched trigger, extracted command, full transcript, and the post-trigger gap measurement.

### Screen Capture

Native screenshot and screen recording via the `ScreenCaptureManager` class.

**Screenshots:** Capture the primary screen, a specific source, or the main window. Supports PNG and JPEG formats with configurable quality. Screenshots can be saved to the user's Pictures directory.

**Screen Recording:** Uses a hidden `BrowserWindow` renderer for `MediaRecorder`-based recording (since MediaRecorder requires a renderer context). Supports configurable quality presets, FPS, bitrate, system audio, and max duration auto-stop. Recordings are saved as WebM (VP9 preferred) to the system temp directory.

| Quality | Bitrate |
|---------|---------|
| `low` | 1 Mbps |
| `medium` | 4 Mbps |
| `high` | 8 Mbps |
| `highest` | 16 Mbps |

Recording supports pause/resume and provides real-time state updates including duration and file size.

### Camera

Camera capture for photo and video via the `CameraManager` class. Like screen recording, this uses a hidden `BrowserWindow` renderer for `getUserMedia` / `MediaRecorder` access.

**Features:**
- Device enumeration with direction detection (front/back/external)
- Live preview with configurable resolution and frame rate
- Photo capture in JPEG, PNG, or WebP with quality control
- Video recording with configurable quality, bitrate, audio, and max duration
- Permission checking and requesting

| Quality | Video Bitrate |
|---------|--------------|
| `low` | 1 Mbps |
| `medium` | 2.5 Mbps |
| `high` | 5 Mbps |
| `highest` | 8 Mbps |

### Canvas

Auxiliary `BrowserWindow` management via the `CanvasManager` class. Each canvas is a separate window used for web navigation, JavaScript evaluation, page snapshots, and A2UI (Agent-to-UI) message injection.

| IPC Channel | Description |
|------------|-------------|
| `canvas:createWindow` | Create a new canvas window (default 1280x720, hidden) |
| `canvas:destroyWindow` | Close and dispose a canvas window |
| `canvas:navigate` | Navigate a canvas to a URL |
| `canvas:eval` | Execute JavaScript in the canvas page |
| `canvas:snapshot` | Capture a screenshot (supports sub-rectangles) |
| `canvas:a2uiPush` | Inject an A2UI message payload |
| `canvas:a2uiReset` | Reset A2UI state on the page |
| `canvas:show` / `canvas:hide` | Toggle visibility |
| `canvas:resize` | Resize with optional animation |
| `canvas:listWindows` | List all active canvas windows |

Canvas windows emit `canvas:didFinishLoad`, `canvas:didFailLoad`, and `canvas:windowClosed` events to the main renderer.

### Location

GPS and geolocation services via the `LocationManager` class using IP-based geolocation.

<Info>
Native platform location APIs (CoreLocation on macOS, Windows.Devices.Geolocation on Windows) require native Node.js addons not currently implemented. IP-based geolocation provides approximately 5km accuracy. For higher accuracy, the renderer should use the browser's Geolocation API, which accesses native location services through Chromium.
</Info>

The module queries multiple IP geolocation services as fallbacks: `ip-api.com`, `ipapi.co`, and `freegeoip.app`. It supports single position queries, position watching (polling at configurable intervals), and caching of the last known location.

### Permissions

System permission management via the `PermissionManager` class with platform-specific implementations for macOS, Windows, and Linux.

**Managed permissions:**

| Permission ID | Name | Platforms | Required For |
|--------------|------|-----------|-------------|
| `accessibility` | Accessibility | macOS | Computer use, browser control |
| `screen-recording` | Screen Recording | macOS | Computer use, vision |
| `microphone` | Microphone | All | Talk mode, voice |
| `camera` | Camera | All | Camera, vision |
| `shell` | Shell Access | All | Shell/terminal commands |

Permission states are cached for 30 seconds (configurable). The shell permission includes a soft toggle -- it can be disabled in the UI without affecting the OS-level permission.

IPC channels include `permissions:getAll`, `permissions:check`, `permissions:request`, `permissions:openSettings`, `permissions:checkFeature`, and `permissions:setShellEnabled`.

## Global Shortcuts

The desktop app registers these global keyboard shortcuts:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` | Open the Command Palette |
| `Cmd/Ctrl+E` | Open the Emote Picker |

These shortcuts work system-wide when the app is running. Additional shortcuts can be registered dynamically via the `desktop:registerShortcut` IPC channel.

## Deep Linking

The desktop app supports the `milady://` custom URL protocol for deep linking. The protocol is registered via Capacitor's Electron deep linking module.

### Share Target

The `milady://share` URL scheme allows external applications to share content with your agent:

```
milady://share?title=Hello&text=Check+this+out&url=https://example.com
```

**Parameters:**
- `title` -- optional title for the shared content.
- `text` -- optional text body.
- `url` -- optional URL to share.
- `file` -- one or more file paths (can be repeated).

File drag-and-drop from the OS is also supported via Electron's `open-file` event. Share payloads are queued if the main window is not yet ready and flushed once the renderer finishes loading. Events are dispatched as `milady:share-target` custom DOM events.

## Auto-Updater

The desktop app checks for updates on launch via `electron-updater`, publishing to GitHub releases under the `milady-ai/milady` repository. Set `MILADY_ELECTRON_DISABLE_AUTO_UPDATER=1` to disable.

## Development Mode

In development mode:

- A **file watcher** (chokidar) monitors the web asset directory and auto-reloads the app when files change (1.5-second debounce).
- Content Security Policy is adjusted for development -- `localhost` and `devtools://*` origins are allowed for scripts.
- DevTools open automatically on DOM ready (disable with `MILADY_ELECTRON_DISABLE_DEVTOOLS=1`).
- The `MILADY_ELECTRON_USER_DATA_DIR` environment variable can override the user data directory for automated E2E testing.

| Environment Variable | Effect |
|---------------------|--------|
| `MILADY_ELECTRON_USER_DATA_DIR` | Override user data directory path |
| `MILADY_ELECTRON_DISABLE_DEVTOOLS=1` | Prevent DevTools from auto-opening |
| `MILADY_ELECTRON_DISABLE_AUTO_UPDATER=1` | Skip update check on launch |

## Security Considerations

<Warning>
The desktop app runs with full system access. Be cautious with plugins and custom actions that execute shell commands or access the filesystem.
</Warning>

- **Content Security Policy** -- Applied to all windows. The policy is intentionally permissive to support third-party embedded apps that may require WebAssembly and external scripts.
- **Window navigation** -- External URLs are blocked from the main window and opened in the default browser. Only the custom scheme and localhost origins are allowed.
- **Context isolation** -- All `BrowserWindow` instances use `contextIsolation: true` and `nodeIntegration: false`.
- **SSRF protection** -- Custom action HTTP handlers block requests to private/internal network addresses. See [Custom Actions](/guides/custom-actions).
