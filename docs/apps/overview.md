---
title: Apps Overview
sidebarTitle: Overview
description: Milaidy ships as a cross-platform suite — desktop, mobile, browser extension, web dashboard, and terminal UI.
---

Milaidy is available on every platform you work on. Each app connects to the same agent runtime, giving you a consistent experience whether you're at your desk or on your phone.

## Available Apps

<CardGroup cols={2}>

<Card title="Desktop App" icon="desktop" href="/apps/desktop">
  Electron-based desktop app for macOS, Windows, and Linux with native OS integration and embedded runtime.
</Card>

<Card title="Mobile App" icon="mobile" href="/apps/mobile">
  iOS and Android app built with Capacitor, featuring native plugins and push notifications.
</Card>

<Card title="Chrome Extension" icon="chrome" href="/apps/chrome-extension">
  Browser relay extension that lets your agent control and observe browser tabs.
</Card>

<Card title="Dashboard" icon="browser" href="/apps/dashboard">
  Web-based management interface for agent configuration, monitoring, and analytics.
</Card>

<Card title="TUI" icon="terminal" href="/apps/tui">
  Terminal user interface for keyboard-driven agent interaction and management.
</Card>

</CardGroup>

## Architecture

All apps share a common connection pattern:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Desktop App │     │  Mobile App  │     │  Chrome Ext  │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────┬───────┘────────────────────┘
                    │
              ┌─────▼──────┐
              │  Agent API  │
              │  (REST/WS)  │
              └─────┬───────┘
                    │
              ┌─────▼──────┐
              │   Runtime   │
              └─────────────┘
```

- **Desktop** embeds the runtime directly (offline-capable)
- **Mobile** connects via REST API
- **Chrome Extension** communicates via WebSocket
- **Dashboard** uses REST + WebSocket for real-time updates
- **TUI** embeds the runtime directly (like desktop)

## Choosing an App

| Need | Best App |
|------|----------|
| Full offline capability | Desktop |
| On-the-go access | Mobile |
| Browser automation | Chrome Extension |
| Team management | Dashboard |
| Keyboard-driven workflow | TUI |

## Related

- [Installation](/installation) — Install the CLI and apps
- [Configuration](/configuration) — Configure your agent
- [Quickstart](/quickstart) — Get started in minutes
