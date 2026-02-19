---
title: Mobile App (iOS/Android)
sidebarTitle: Mobile App
description: Run Milaidy on iOS and Android devices using the Capacitor-based mobile app with native plugin support.
---

# Mobile App (iOS/Android)

The Milaidy mobile app brings the full dashboard experience to iOS and Android devices using [Capacitor](https://capacitorjs.com/), a cross-platform native runtime. The same web UI runs inside a native WebView with access to device hardware through Capacitor plugins.

## Platform Support

| Platform | Scheme | Notes |
|----------|--------|-------|
| **iOS** | HTTPS | Automatic content inset, mobile-preferred content mode, link preview disabled |
| **Android** | HTTPS | Input capture enabled, mixed content disabled, WebContents debugging off in production |

**App ID:** `com.milaidyai.milaidy`

### Platform Configuration

The shared Capacitor configuration (`capacitor.config.ts`) defines:

- **Web directory:** `dist` — the bundled web app assets.
- **Navigation allowlist:** `localhost` and `127.0.0.1` for connecting to the embedded or local API server.
- **Keyboard plugin:** body resize mode with fullscreen resize support.
- **Status bar:** dark style with `#0a0a0a` background.

## Capacitor Plugins

The mobile app uses 9 custom Milaidy Capacitor plugins, each providing native capabilities with web fallbacks:

### 1. Gateway (`@milaidy/capacitor-gateway`)

Connects the mobile app to a Milaidy agent running elsewhere on the network.

- **Discovery:** Native network discovery to find gateway servers (native platforms only).
- **WebSocket:** Real-time communication available on all platforms.
- On web, discovery falls back to manual connection; WebSocket works natively in the browser.

### 2. Swabble (`@milaidy/capacitor-swabble`)

Voice wake-word detection for hands-free activation.

- **Continuous listening:** Only available on native platforms (iOS/Android).
- On web, falls back to the Web Speech API if available.

### 3. Talk Mode (`@milaidy/capacitor-talkmode`)

Full speech pipeline: speech-to-text, chat with agent, text-to-speech response.

- **ElevenLabs TTS:** Available on all platforms (web app calls the API directly with the user's API key).
- **System TTS:** Native speech synthesis on iOS/Android; Web Speech Synthesis API on web.

### 4. Camera (`@milaidy/capacitor-camera`)

Photo and video capture.

- Available on all native platforms.
- On web, falls back to `navigator.mediaDevices.getUserMedia`.

### 5. Location (`@milaidy/capacitor-location`)

GPS and geolocation services.

- **GPS:** Available on native platforms.
- **Background location:** Available on iOS/Android only (not on Electron).
- On web, uses the browser Geolocation API.

### 6. Screen Capture (`@milaidy/capacitor-screencapture`)

Screenshot and screen recording.

- **Screenshots:** Native platforms only.
- **Recording:** Native platforms and web (via `getDisplayMedia`).

### 7. Canvas (`@milaidy/capacitor-canvas`)

Canvas rendering support. Available on all platforms (HTML Canvas API is universal).

### 8. Desktop (`@milaidy/capacitor-desktop`)

Desktop-specific features (macOS/Electron only):

- System tray management.
- Global keyboard shortcuts.
- Native menus.

Not available on iOS/Android — these features are silently unavailable on mobile.

### 9. Haptics (`@capacitor/haptics`)

Native haptic feedback for touch interactions (core Capacitor plugin, not custom).

- **Impact feedback:** Light, medium, heavy intensities.
- **Notification feedback:** Success, warning, error patterns.
- **Selection feedback:** Start, changed, end for pickers and sliders.
- Available on iOS and Android only.

## Plugin Bridge Layer

The plugin bridge (`plugin-bridge.ts`) provides a unified interface to all plugins with:

### Capability Detection

Each plugin reports its capabilities for the current platform:

```typescript
interface PluginCapabilities {
  gateway: { available, discovery, websocket }
  voiceWake: { available, continuous }
  talkMode: { available, elevenlabs, systemTts }
  camera: { available, photo, video }
  location: { available, gps, background }
  screenCapture: { available, screenshot, recording }
  canvas: { available }
  desktop: { available, tray, shortcuts, menu }
}
```

### Platform Fallbacks

When a native plugin is unavailable, the bridge provides graceful degradation:

- **Camera** falls back to `getUserMedia`.
- **Location** falls back to the browser Geolocation API.
- **Voice** falls back to Web Speech API.
- **Screen capture** falls back to `getDisplayMedia`.
- **Desktop features** are silently unavailable on mobile.

Web API detection helpers check for `SpeechRecognition`, `speechSynthesis`, `mediaDevices`, `geolocation`, and `getDisplayMedia` before reporting capability.

## Gateway Connection

On mobile, the agent typically runs on a separate machine (desktop or server). The mobile app connects to it via the Gateway plugin:

1. **Discovery** (native only) — the app scans the local network for Milaidy gateways.
2. **Manual connection** — enter the gateway URL directly.
3. **WebSocket** — once connected, all communication happens over a persistent WebSocket connection.

## Storage Bridge

The storage bridge (`storage-bridge.ts`) ensures persistent data survives across app sessions on native platforms.

### How It Works

- **Web:** Pass-through to `localStorage` — no special handling needed.
- **Native (iOS/Android):** Intercepts `localStorage` operations via a proxy and syncs specific keys to Capacitor's `Preferences` plugin for reliable persistence.

### Synced Keys

The following keys are automatically synced to native Preferences:

| Key | Purpose |
|-----|---------|
| `milaidy.control.settings.v1` | Dashboard settings and preferences |
| `milaidy.device.identity` | Device identity token |
| `milaidy.device.auth` | Device authentication credentials |

### API

```typescript
// Read a value (works on both native and web)
const value = await getStorageValue("milaidy.device.identity");

// Write a value
await setStorageValue("milaidy.control.settings.v1", jsonString);

// Remove a value
await removeStorageValue("milaidy.device.auth");

// Register additional keys for native sync
registerSyncedKey("my.custom.key");
```

## Capacitor Bridge

The global bridge object is exposed on `window.Milaidy` and provides:

- `capabilities` — platform capability flags (native, haptics, camera, microphone, etc.).
- `pluginCapabilities` — per-plugin capability details.
- `haptics` — haptic feedback functions.
- `plugins` — access to all Milaidy plugins with fallback support.
- `isFeatureAvailable(feature)` — check if a specific feature is available.
- `platform` — platform detection (isNative, isIOS, isAndroid, isElectron, isWeb, isMacOS).

The bridge dispatches a `milaidy:bridge-ready` custom event on `document` when initialization completes. Use `waitForBridge()` to await initialization.
