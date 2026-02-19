---
title: Chrome Extension
sidebarTitle: Chrome Extension
description: Use the Milady Browser Relay Chrome extension to let your agent control browser tabs via the Chrome DevTools Protocol.
---

# Chrome Extension

The **Milady Browser Relay** is a Chrome extension that bridges your browser tabs to the Milady agent runtime using the Chrome DevTools Protocol (CDP). This allows your agent to inspect, navigate, and interact with web pages in real time.

## What It Does

The extension attaches Chrome's built-in debugger to browser tabs and relays CDP commands between the Milady agent and the browser over a WebSocket connection. This gives the agent the ability to:

- Read page content and DOM structure.
- Execute JavaScript in the page context.
- Navigate to URLs, create new tabs, close tabs, and activate tabs.
- Observe page events (network requests, console output, DOM changes).
- Control the browser as part of autonomous agent workflows.

## Installation

The extension is not published to the Chrome Web Store. Install it from source:

1. Clone the Milady repository.
2. Navigate to `apps/chrome-extension/`.
3. Open Chrome and go to `chrome://extensions/`.
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the `apps/chrome-extension/` directory.
6. The Milady Browser Relay icon appears in your toolbar.

On first install, the extension automatically opens its options page with setup instructions.

## How It Works

The relay architecture involves three components:

```
Browser Tab  <-->  Chrome Extension  <-->  Milady Agent
 (CDP)              (WebSocket)           (Relay Server)
```

### Step by Step

1. **Click the toolbar icon** on any tab to attach or detach.
2. The extension connects to the local relay server via WebSocket (`ws://127.0.0.1:{port}/extension`).
3. It attaches Chrome's debugger to the active tab using CDP version 1.3.
4. CDP events from the browser are forwarded to the relay server as `forwardCDPEvent` messages.
5. CDP commands from the agent arrive as `forwardCDPCommand` messages and are executed against the attached tab.
6. Click the toolbar icon again to detach from the tab.

### CDP Command Handling

The extension handles several CDP methods with special logic:

| CDP Method | Behavior |
|------------|----------|
| `Runtime.enable` | Disables then re-enables Runtime to get a clean state |
| `Target.createTarget` | Creates a new Chrome tab and attaches the debugger |
| `Target.closeTarget` | Closes the specified tab |
| `Target.activateTarget` | Focuses the window and activates the tab |
| All others | Forwarded directly to Chrome's debugger |

## Configuration

### Relay Port

The extension connects to a local relay server. The default port is **18792**.

To change the port:

1. Right-click the extension icon and select **Options** (or navigate to the extension's options page).
2. Enter a new port number in the **Relay port** field.
3. Click **Save**.

The options page also shows the current relay URL (`http://127.0.0.1:{port}/`) and tests whether the relay server is reachable.

Only change the port if your Milady profile uses a different `cdpUrl` port.

### Permissions

The extension requires these Chrome permissions:

| Permission | Purpose |
|------------|---------|
| `debugger` | Attach Chrome DevTools Protocol to tabs |
| `tabs` | Query and manage browser tabs |
| `activeTab` | Access the currently active tab |
| `storage` | Persist relay port configuration |

**Host permissions:** `http://127.0.0.1/*` and `http://localhost/*` — only local connections are allowed.

## Badge States

The extension icon displays a badge indicating the connection state for each tab:

| Badge | Color | Meaning |
|-------|-------|---------|
| **ON** | Red (`#FF5A36`) | Debugger attached and relay connected |
| *(empty)* | — | Not attached to this tab |
| **...** | Yellow (`#F59E0B`) | Connecting to the relay server |
| **!** | Dark red (`#B91C1C`) | Error — relay server not reachable |

### Tooltip States

The toolbar icon tooltip also updates to reflect the current state:

- `"Milady Browser Relay (click to attach/detach)"` — idle state.
- `"Milady Browser Relay: connecting to local relay..."` — connecting.
- `"Milady Browser Relay: attached (click to detach)"` — attached and active.
- `"Milady Browser Relay: disconnected (click to re-attach)"` — relay disconnected.
- `"Milady Browser Relay: relay not running (open options for setup)"` — relay server unreachable.

## Security Considerations

- **Local only** — the extension only connects to `127.0.0.1` and `localhost`. It does not make any external network requests.
- **CDP access** — when attached, the debugger has full access to the tab's content, cookies, and network. Only attach to tabs you trust.
- **No remote connections** — the relay server must run on the same machine as the browser. There is no authentication mechanism for remote connections.
- **Detach when not in use** — click the toolbar icon to detach the debugger when you do not need agent browser control. The debugger is automatically detached if the relay connection drops.
- **Relay preflight** — the extension performs a HEAD request to the relay server before opening a WebSocket, with a 2-second timeout. If the server is not reachable, attachment fails gracefully.
- **Session isolation** — each attached tab gets a unique session ID. CDP events are routed to the correct session. Child targets (iframes, service workers) are tracked and mapped to their parent tab.
