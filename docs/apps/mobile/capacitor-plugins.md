---
title: "Capacitor Plugins"
sidebarTitle: "Capacitor Plugins"
description: "Nine custom Capacitor plugins that give the Milaidy mobile app access to native iOS and Android capabilities."
---

The Milaidy mobile app ships nine custom Capacitor plugins plus the core `@capacitor/haptics` plugin. Each plugin is built as an independent package under `apps/app/plugins/` and must be compiled before the web app can bundle it (`bun run plugin:build`). Plugins are wrapped by the plugin bridge (`src/bridge/plugin-bridge.ts`), which performs capability detection per platform and provides graceful degradation to web API fallbacks where possible.

All plugins follow the same structure: a TypeScript interface that describes the web-facing API, a web implementation used in browser environments, and native implementations for iOS (Swift) and Android (Kotlin). On platforms where a feature is unavailable the plugin call is silently caught and logged by the bridge's `Proxy` wrapper.

## Plugins

- **`@milady/capacitor-gateway`** — Bonjour/mDNS gateway discovery and persistent WebSocket RPC connection with token/password authentication and automatic reconnection
- **`@milady/capacitor-swabble`** — Continuous wake-word detection using the native Speech framework (iOS), SpeechRecognizer (Android), or Whisper.cpp (desktop); falls back to Web Speech API on web
- **`@milady/capacitor-talkmode`** — Full speech pipeline: STT (native or Whisper), chat relay to the agent, and TTS via ElevenLabs streaming or native speech synthesis
- **`@milady/capacitor-camera`** — Camera enumeration, live preview rendering into an HTML element, photo capture, video recording, and manual controls (zoom, focus, flash)
- **`@milady/capacitor-location`** — GPS and network-based geolocation with accuracy levels, position watching, and background location support on iOS/Android
- **`@milady/capacitor-screencapture`** — Screenshots (PNG/JPEG/WebP) and screen recording with pause/resume; falls back to `getDisplayMedia` on web
- **`@milady/capacitor-canvas`** — Drawing primitives, layer management, web view navigation, JavaScript evaluation, A2UI message injection, and `milady://` deep link interception
- **`@milady/capacitor-agent`** — Agent lifecycle management (start, stop, status) via IPC on Electron and HTTP on iOS/Android/web
- **`@milady/capacitor-desktop`** — Electron/macOS-only: system tray, global shortcuts, window management, auto-launch, notifications, power monitoring, clipboard, and shell operations
- **`@capacitor/haptics`** — Haptic feedback (impact, notification, and selection patterns) on iOS and Android only

## Configuration

Plugin capabilities are detected at bridge initialization time. Check availability before calling platform-specific methods:

```typescript
import { isFeatureAvailable } from "./bridge/plugin-bridge";

if (isFeatureAvailable("gatewayDiscovery")) {
  // mDNS discovery — native only
  await window.Milady.plugins.gateway.startDiscovery();
}

if (isFeatureAvailable("voiceWake")) {
  // Native Speech or Web Speech API fallback
  await window.Milady.plugins.swabble.startListening({
    triggers: ["milady", "hey milady"],
  });
}
```

The plugin bridge exposes the full capability map at `window.Milady.pluginCapabilities` and per-plugin access at `window.Milady.plugins`. Use `waitForBridge()` to ensure initialization is complete before accessing these properties.

## Related

- [Mobile App](/apps/mobile) — full plugin API reference, platform configuration, and build instructions
- [Build Guide](/apps/mobile/build-guide) — how to compile plugins and produce signed iOS/Android builds
- [Native Modules](/apps/desktop/native-modules) — equivalent capability system for the Electron desktop app
