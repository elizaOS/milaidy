---
title: "Native Modules"
sidebarTitle: "Native Modules"
description: "IPC-based native module system that gives the Electron desktop app access to platform capabilities."
---

The Milaidy desktop app exposes platform capabilities to the web renderer through a set of **native modules** — singleton manager classes running in the Electron main process. Each module is initialized in `initializeNativeModules()` and registers its IPC handlers via `registerAllIPC()`. The renderer calls into these modules using Electron's `ipcRenderer.invoke` / `ipcRenderer.on` APIs, which are proxied through the context-isolated preload script.

There are 10 native modules in total, covering agent lifecycle, desktop integration, network discovery, voice I/O, wake-word detection, screen capture, camera, canvas windows, geolocation, and system permissions. All modules follow the same singleton pattern and are instantiated once on app startup.

## Modules

- **Agent** (`AgentManager`) — embedded Eliza runtime lifecycle: start, stop, restart, and status polling
- **Desktop Manager** (`DesktopManager`) — system tray, global shortcuts, auto-launch, window management, native notifications, power monitoring, clipboard, and shell operations
- **Gateway Discovery** (`GatewayDiscovery`) — mDNS/Bonjour scanning for `_milady._tcp` services on the local network
- **Talk Mode** (`TalkModeManager`) — speech-to-text (Whisper or Web Speech API) and text-to-speech (ElevenLabs or system TTS) pipeline
- **Swabble** (`SwabbleManager`) — continuous wake-word detection with fuzzy phrase matching
- **Screen Capture** (`ScreenCaptureManager`) — screenshots and screen recording via a hidden renderer window
- **Camera** (`CameraManager`) — camera enumeration, live preview, photo capture, and video recording via a hidden renderer window
- **Canvas** (`CanvasManager`) — auxiliary `BrowserWindow` instances for web navigation, JavaScript evaluation, and A2UI message injection
- **Location** (`LocationManager`) — IP-based geolocation with position watching and caching
- **Permissions** (`PermissionManager`) — macOS/Windows/Linux permission checking and requesting for accessibility, screen recording, microphone, camera, and shell access

## IPC Channel Conventions

Every IPC channel follows the pattern `<module>:<action>` (e.g., `agent:start`, `desktop:registerShortcut`, `gateway:startDiscovery`). Channels that push events to the renderer use `webContents.send` and are documented alongside their corresponding invoke channels in the [Desktop App](/apps/desktop) reference.

## Configuration

Native modules are initialized unconditionally on app startup. Individual module behavior is controlled through Electron environment variables and runtime IPC calls rather than static config files.

```typescript
// Example: registering a global shortcut from the renderer
import { ipcRenderer } from "electron";

await ipcRenderer.invoke("desktop:registerShortcut", {
  id: "open-chat",
  accelerator: "CmdOrCtrl+Shift+M",
});

// Listen for the shortcut being pressed
ipcRenderer.on("desktop:shortcutPressed", (_event, { id }) => {
  if (id === "open-chat") openChatWindow();
});
```

## Related

- [Desktop App](/apps/desktop) — full IPC channel reference for every native module
- [Deep Linking](/apps/desktop/deep-linking) — `milady://` URL protocol registration handled by the Canvas module
- [Capacitor Plugins](/apps/mobile/capacitor-plugins) — equivalent plugin system for iOS and Android
