---
title: Chrome Extension
sidebarTitle: Chrome Extension
description: Use the Milady Browser Relay Chrome extension to let your agent control browser tabs via the Chrome DevTools Protocol.
---

The **Milady Browser Relay** is a Chrome extension that bridges your browser tabs to the Milaidy agent runtime using the Chrome DevTools Protocol (CDP). This allows your agent to inspect, navigate, and interact with web pages in real time.

## What It Does

The extension attaches Chrome's built-in debugger to browser tabs and relays CDP commands between the Milaidy agent and the browser over a WebSocket connection. This gives the agent the ability to:

- Read page content and DOM structure.
- Execute JavaScript in the page context.
- Navigate to URLs, create new tabs, close tabs, and activate tabs.
- Observe page events (network requests, console output, DOM changes).
- Capture screenshots and interact with elements programmatically.
- Control the browser as part of autonomous agent workflows.

The extension uses **Manifest V3** and runs its logic entirely inside a background service worker. There is no popup UI; the toolbar icon is a single-click toggle, and all configuration happens on a dedicated options page.

## Installation

The extension is not published to the Chrome Web Store. You install it from source by loading the unpacked directory into Chrome.

### Using the CLI (recommended)

The `milaidy` CLI can install the extension files to a stable path for you:

```bash
milaidy browser extension install
milaidy browser extension path
```

The second command prints the absolute path you will point Chrome to in step 3 below.

### Manual Installation

1. Clone the Milaidy repository and locate `apps/chrome-extension/`.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the extension directory (the folder containing `manifest.json`).
5. The **Milady Browser Relay** icon appears in your toolbar.
6. Pin the extension so the icon is always visible.

On first install, the extension automatically opens its options page with setup instructions. This only happens once (the `helpOnErrorShown` flag is stored in `chrome.storage.local`).

### Prerequisites

Before the extension can function, the Milaidy relay server must be running on your machine. The relay is part of the Milaidy Gateway — start it with browser control enabled:

```bash
milaidy start --browser-relay
```

Verify the relay is reachable by opening `http://127.0.0.1:18792/` in your browser. You should get a response (any HTTP status) rather than a connection refused error.

## Architecture

The extension consists of three files plus icons:

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 declaration: permissions, background worker, options page |
| `background.js` | Service worker — all CDP relay logic, WebSocket management, badge state |
| `options.html` | Options page — relay port configuration and reachability check |
| `options.js` | Options page logic — load, save, and validate the relay port |

### Data Flow

```
Browser Tab  <-->  Chrome Extension  <-->  Milaidy Agent
 (CDP 1.3)         (WebSocket)           (Relay Server)
```

The relay architecture involves three components that communicate through two protocols:

1. **Chrome DevTools Protocol (CDP 1.3)** between the extension and the browser's debugging API.
2. **WebSocket JSON messages** between the extension and the Milaidy relay server.

### Internal State

The background service worker maintains several maps to track active sessions:

| Map | Key | Value | Purpose |
|-----|-----|-------|---------|
| `tabs` | Tab ID | `{ state, sessionId, targetId, attachOrder }` | Track attached tabs and their session state |
| `tabBySession` | Session ID | Tab ID | Reverse lookup from session to tab |
| `childSessionToTab` | Child session ID | Parent tab ID | Map iframe/worker sessions to the owning tab |
| `pending` | Request ID | `{ resolve, reject }` | Track in-flight relay requests awaiting responses |

Session IDs follow the pattern `cb-tab-{n}` where `n` is an auto-incrementing counter. This ensures each tab attachment gets a globally unique identifier within the extension's lifetime.

## How It Works

### Attach/Detach Lifecycle

1. **Click the toolbar icon** on any tab to attach or detach.
2. If already attached, the extension detaches the debugger and notifies the relay with a `Target.detachedFromTarget` event.
3. If not attached, the extension enters the connecting state:
   a. Sets the badge to the yellow connecting indicator.
   b. Calls `ensureRelayConnection()` to establish or reuse the WebSocket.
   c. Attaches Chrome's debugger to the tab using CDP version 1.3.
   d. Sends `Page.enable` to start receiving page lifecycle events.
   e. Calls `Target.getTargetInfo` to obtain the tab's unique `targetId`.
   f. Notifies the relay with a `Target.attachedToTarget` event containing the session ID, target info, and `waitingForDebugger: false`.
   g. Sets the badge to the red ON indicator.
4. Click the toolbar icon again to detach from the tab.

### WebSocket Connection

The extension connects to the relay server at `ws://127.0.0.1:{port}/extension`. Before opening the WebSocket, it performs a **preflight check**: an HTTP `HEAD` request to `http://127.0.0.1:{port}/` with a 2-second timeout. If the server is not reachable, attachment fails gracefully and the badge shows the error state.

The WebSocket connection has a 5-second connect timeout. Once connected, the extension listens for three types of messages:

- **Ping/Pong** — the relay sends `{ method: "ping" }` heartbeats. The extension replies with `{ method: "pong" }`.
- **Responses** — messages with a numeric `id` and either `result` or `error`, matched to pending requests.
- **Commands** — `forwardCDPCommand` messages from the agent, which the extension executes against the attached tab.

If the WebSocket closes or errors, the extension automatically detaches all tabs, clears all session maps, and sets badges to the connecting (yellow) state with a tooltip indicating disconnection.

### CDP Command Handling

When the relay sends a `forwardCDPCommand`, the extension routes it to the correct tab using the `sessionId` or `targetId` from the message. If neither is provided, it falls back to the first connected tab.

The extension handles several CDP methods with special logic:

| CDP Method | Behavior |
|------------|----------|
| `Runtime.enable` | Disables then re-enables Runtime (with a 50ms pause) to get a clean execution context |
| `Target.createTarget` | Creates a new Chrome tab via `chrome.tabs.create`, waits 100ms for it to load, then attaches the debugger |
| `Target.closeTarget` | Closes the specified tab via `chrome.tabs.remove` |
| `Target.activateTarget` | Focuses the window (`chrome.windows.update`) and activates the tab (`chrome.tabs.update`) |
| All others | Forwarded directly to `chrome.debugger.sendCommand` |

For child targets (iframes, service workers), the extension tracks `Target.attachedToTarget` and `Target.detachedFromTarget` events from the debugger. CDP commands targeting a child session use the child's session ID when calling `chrome.debugger.sendCommand`.

### Event Forwarding

All CDP events from attached tabs are forwarded to the relay as `forwardCDPEvent` messages. Each event includes the session ID (either the tab's main session or a child session) so the relay can route events to the correct consumer on the agent side.

## Configuration

### Relay Port

The extension connects to a local relay server. The default port is **18792**.

To change the port:

1. Right-click the extension icon and select **Options** (or navigate to the extension's options page from `chrome://extensions`).
2. Enter a new port number in the **Relay port** field (1-65535).
3. Click **Save**.

The options page shows the current relay URL (`http://127.0.0.1:{port}/`) and automatically tests whether the relay server is reachable. The reachability check uses a `HEAD` request with a 900ms timeout. The status indicator turns green if the relay responds, or shows an error message with instructions if it does not.

Port values are validated and clamped: non-numeric values, numbers less than or equal to 0, and numbers greater than 65535 all revert to the default port.

Only change the port if your Milaidy profile uses a different `cdpUrl` port.

### Permissions

The extension requires these Chrome permissions:

| Permission | Purpose |
|------------|---------|
| `debugger` | Attach Chrome DevTools Protocol to tabs and send CDP commands |
| `tabs` | Query and manage browser tabs (create, remove, activate, get info) |
| `activeTab` | Access the currently active tab when the toolbar icon is clicked |
| `storage` | Persist relay port configuration in `chrome.storage.local` |

**Host permissions:** `http://127.0.0.1/*` and `http://localhost/*` — only local connections are allowed. The extension never makes requests to any external domain.

### Storage Keys

The extension stores its configuration in `chrome.storage.local`:

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `relayPort` | number | `18792` | Relay server port |
| `helpOnErrorShown` | boolean | `false` | Whether the options page has been auto-opened on first error |

## Badge States

The extension icon displays a per-tab badge indicating the connection state:

| Badge | Color | Meaning |
|-------|-------|---------|
| **ON** | Red (`#FF5A36`) | Debugger attached and relay connected |
| *(empty)* | — | Not attached to this tab |
| **...** (ellipsis) | Yellow (`#F59E0B`) | Connecting to the relay server |
| **!** | Dark red (`#B91C1C`) | Error — relay server not reachable |

Badge text color is always white (`#FFFFFF`).

### Tooltip States

The toolbar icon tooltip also updates to reflect the current state:

- `"Milady Browser Relay (click to attach/detach)"` — idle, not attached.
- `"Milady Browser Relay: connecting to local relay..."` — connecting to the relay WebSocket.
- `"Milady Browser Relay: attached (click to detach)"` — attached and active.
- `"Milady Browser Relay: disconnected (click to re-attach)"` — relay WebSocket disconnected after previously being connected.
- `"Milady Browser Relay: relay not running (open options for setup)"` — relay server unreachable during initial connection.

## Multiple Tab Support

The extension supports attaching to multiple tabs simultaneously. Each attached tab gets its own session ID and maintains an independent CDP connection. The relay server receives events tagged with the correct session ID, so the agent can distinguish between tabs.

When a tab is closed or navigated away while attached, Chrome fires a debugger detach event. The extension handles this by cleaning up the tab's session, removing child session mappings, and notifying the relay with a `Target.detachedFromTarget` event.

If the WebSocket connection to the relay drops, all tabs are detached simultaneously. The extension does not attempt automatic reconnection. The user must click the toolbar icon again to re-attach.

## Development Workflow

### Project Structure

```
apps/chrome-extension/
  background.js      # Service worker (all relay logic)
  manifest.json      # Manifest V3 definition
  options.html       # Options page (inline CSS, dark theme)
  options.js         # Options page logic
  icons/
    icon16.png       # 16x16 toolbar icon
    icon32.png       # 32x32 toolbar icon
    icon48.png       # 48x48 extension tile
    icon128.png      # 128x128 extension page / store icon
    extension.png    # Background image for options page
```

### Making Changes

The extension uses plain JavaScript (no build step required). To develop:

1. Edit files directly in `apps/chrome-extension/`.
2. Go to `chrome://extensions/` and click the refresh icon on the Milady Browser Relay card.
3. If you changed `manifest.json`, you may need to remove and re-add the extension.

### Debugging the Service Worker

1. Go to `chrome://extensions/`.
2. Find the Milady Browser Relay card.
3. Click **"service worker"** under "Inspect views" to open DevTools for the background worker.
4. The Console tab shows `console.warn` messages from the extension, including attach failures with stack traces.

### Debugging the Options Page

1. Open the options page (right-click the extension icon, then **Options**).
2. Right-click anywhere on the page and choose **Inspect** to open DevTools.
3. The Console tab shows any errors from port validation or relay reachability checks.

### Debugging CDP Traffic

To see the CDP commands and events flowing through the extension:

1. Open the service worker DevTools (see above).
2. Set breakpoints in `handleForwardCdpCommand` to inspect incoming commands.
3. Set breakpoints in `onDebuggerEvent` to inspect outgoing events.
4. The `sendToRelay` function serializes all messages as JSON, so you can log `JSON.stringify(payload)` to see the full message.

## Troubleshooting

### Extension shows a red `!` badge

The relay server is not reachable. Verify that:

1. The Milaidy Gateway is running with browser relay enabled.
2. The relay server port matches what the extension expects (default: 18792).
3. No firewall is blocking `127.0.0.1:{port}`.
4. Try opening `http://127.0.0.1:18792/` in your browser directly.

### Extension shows a yellow `...` badge that never resolves

The WebSocket connection is failing after the preflight succeeds. This can happen if:

1. The relay server accepts HTTP but has not started the WebSocket endpoint at `/extension`.
2. The WebSocket connect timeout (5 seconds) is being exceeded.
3. Another process is listening on the port but is not the Milaidy relay.

### Debugger detaches unexpectedly

Chrome detaches the debugger automatically in certain situations:

- The user opens Chrome DevTools on the same tab (only one debugger can be attached at a time).
- The tab navigates to a `chrome://` or `chrome-extension://` URL (internal pages cannot be debugged).
- The tab crashes or is discarded by Chrome's memory management.
- The extension is reloaded or updated.

### "Another debugger is already attached"

Close the Chrome DevTools panel for the tab, then click the extension icon again. Chrome only allows one debugger per tab.

### Options page shows "Relay not reachable"

The options page performs a `HEAD` request with a 900ms timeout. If the relay is slow to respond or the port is wrong, you will see this message. Double-check the port and ensure the relay process is running.

### Extension does not appear after "Load unpacked"

- Verify that you selected the directory containing `manifest.json`, not a parent directory.
- Check `chrome://extensions/` for error messages on the extension card.
- Ensure `manifest.json` is valid JSON (no trailing commas, correct syntax).

## Security Considerations

- **Local only** — the extension only connects to `127.0.0.1` and `localhost`. It does not make any external network requests. The host permissions in the manifest are restricted to these addresses.
- **CDP access** — when attached, the debugger has full access to the tab's content, cookies, network traffic, and JavaScript execution. Only attach to tabs you trust.
- **No remote connections** — the relay server must run on the same machine as the browser. There is no authentication mechanism for remote connections.
- **Detach when not in use** — click the toolbar icon to detach the debugger when you do not need agent browser control. The debugger is automatically detached if the relay connection drops.
- **Relay preflight** — the extension performs a HEAD request to the relay server before opening a WebSocket, with a 2-second timeout. If the server is not reachable, attachment fails gracefully.
- **Session isolation** — each attached tab gets a unique session ID. CDP events are routed to the correct session. Child targets (iframes, service workers) are tracked and mapped to their parent tab.
- **No data persistence** — the extension does not store any page content, CDP events, or browsing data. All state is held in memory and cleared when the service worker shuts down or the relay disconnects.
- **Manifest V3** — the extension uses Manifest V3, which runs the background script as a service worker with limited lifetime. Chrome may terminate the worker during idle periods, which naturally tears down all WebSocket connections and debugger attachments.
