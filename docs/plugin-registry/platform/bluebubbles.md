---
title: "BlueBubbles Plugin"
sidebarTitle: "BlueBubbles"
description: "BlueBubbles connector for Milady — iMessage bridge with reactions, effects, group management, and attachment support."
---

The BlueBubbles plugin connects Milady agents to iMessage via a BlueBubbles server, providing a cross-platform iMessage bridge with rich actions including reactions, message effects, and group management.

**Package:** `@elizaos/plugin-bluebubbles`

## Installation

```bash
milady plugins install bluebubbles
```

## Setup

### 1. Install BlueBubbles Server

Install [BlueBubbles](https://bluebubbles.app/) on a Mac with iMessage configured. The server must be running and accessible from the machine running Milady.

### 2. Get Server Credentials

From the BlueBubbles server settings, note the:
- **Server URL** (e.g., `http://192.168.1.100:1234`)
- **Server password**

### 3. Configure Milady

```json
{
  "connectors": {
    "bluebubbles": {
      "enabled": true,
      "serverUrl": "http://localhost:1234",
      "password": "your-password",
      "dmPolicy": "pairing"
    }
  }
}
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `serverUrl` | Yes | BlueBubbles server URL |
| `password` | Yes | Server password |
| `webhookPath` | No | Webhook endpoint path for incoming events |
| `readReceipts` | No | Send read receipts (default: `true`) |
| `dmPolicy` | No | DM handling policy |

## Features

- **iMessage bridge** — Full iMessage access via BlueBubbles server
- **Reactions** — React to messages with tapback emojis
- **Message effects** — Send messages with iMessage effects (slam, loud, gentle, invisible ink, etc.)
- **Edit and unsend** — Edit or unsend previously sent messages
- **Reply** — Reply to specific messages in threads
- **Attachments** — Send media attachments
- **Group management** — Rename groups, set group icons, add/remove participants, leave groups
- **Read receipts** — Configurable read receipt support
- **Multi-account** — Supports multiple accounts via `accounts` map

## Auto-Enable

The plugin auto-enables when the `connectors.bluebubbles` block contains a `serverUrl` and `password`:

```json
{
  "connectors": {
    "bluebubbles": {
      "serverUrl": "http://localhost:1234",
      "password": "your-password"
    }
  }
}
```

## Troubleshooting

### Connection Refused

Verify the BlueBubbles server is running and the URL is reachable from the Milady host. If running on a different machine, ensure firewall rules allow the connection.

### Authentication Failed

Double-check the server password matches the one configured in BlueBubbles server settings.

## Related

- [iMessage Plugin](/plugin-registry/platform/imessage) — Native macOS iMessage integration
- [Signal Plugin](/plugin-registry/platform/signal) — Signal messaging integration
- [Connectors Guide](/guides/connectors) — General connector documentation
