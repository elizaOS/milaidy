---
title: "Dashboard Settings"
sidebarTitle: "Dashboard Settings"
description: "Configure the Milaidy web dashboard preferences, theme, permissions, and advanced runtime options."
---

The Dashboard Settings panel gives you control over the appearance, behavior, and capabilities exposed by the Milaidy web interface. Settings are persisted to `localStorage` under the key `milady.control.settings.v1` and, on native platforms (iOS/Android), automatically synced to Capacitor Preferences so they survive app reinstalls. Changes take effect immediately without restarting the agent.

The settings panel is accessed from the gear icon in the dashboard header or via the Command Palette (Cmd/Ctrl+K). It is organized into sections covering general preferences, chat behavior, voice and audio, permissions, and advanced runtime toggles.

## Key Concepts

- **Theme** — light, dark, or system-synced appearance with configurable accent color
- **Chat preferences** — default model selection, streaming toggle, message timestamp display, and chat history retention limits
- **Voice settings** — Talk Mode engine selection (ElevenLabs vs. system TTS), default voice ID, microphone input device, and VAD sensitivity
- **Permissions** — per-feature toggles for shell access, camera, microphone, screen capture, and location; reflects the underlying OS permission state reported by the Permissions native module
- **Notifications** — enable or disable native desktop notifications and choose which agent event types trigger them
- **Advanced** — agent API base URL override, experimental feature flags, debug logging level, and storage management (clear cache, reset to defaults)

## Configuration

Settings are read and written through the dashboard's settings store. On native platforms the storage bridge ensures all writes are mirrored to Capacitor Preferences automatically — no additional configuration is required.

```typescript
// Example: reading the current settings object (internal API)
const raw = localStorage.getItem("milady.control.settings.v1");
const settings = raw ? JSON.parse(raw) : {};

// Example: writing a single preference
const updated = { ...settings, theme: "dark" };
localStorage.setItem("milady.control.settings.v1", JSON.stringify(updated));
```

To reset all settings to their defaults, use the **Reset to Defaults** button in the Advanced section of the settings panel. This clears `milady.control.settings.v1` from both `localStorage` and native Preferences and reloads the dashboard.

## Related

- [Web Dashboard](/apps/dashboard) — dashboard layout and navigation overview
- [Desktop App](/apps/desktop) — global keyboard shortcuts and native permission management
- [Mobile App](/apps/mobile) — storage bridge that syncs settings to Capacitor Preferences on iOS/Android
