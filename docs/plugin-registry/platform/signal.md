---
title: "Signal Plugin"
sidebarTitle: "Signal"
description: "Signal connector for Milady — private messaging via signal-cli with HTTP/JSON-RPC mode, attachments, and read receipts."
---

The Signal plugin connects Milady agents to Signal via signal-cli running in HTTP or JSON-RPC mode, enabling private and group messaging with attachment and reaction support.

**Package:** `@elizaos/plugin-signal`

## Installation

```bash
milady plugins install signal
```

## Setup

### 1. Install signal-cli

Install [signal-cli](https://github.com/AsamK/signal-cli) and register or link a Signal account:

```bash
signal-cli -a +1234567890 register
signal-cli -a +1234567890 verify CODE
```

### 2. Start signal-cli in HTTP Mode

```bash
signal-cli -a +1234567890 daemon --http localhost:8080
```

### 3. Configure Milady

```json
{
  "connectors": {
    "signal": {
      "enabled": true,
      "account": "+1234567890",
      "httpUrl": "http://localhost:8080",
      "dmPolicy": "pairing"
    }
  }
}
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `account` | Yes | Signal phone number (E.164 format) |
| `httpUrl` | No | HTTP URL for signal-cli daemon (default: `http://localhost:8080`) |
| `host` | No | Hostname alternative to `httpUrl` |
| `port` | No | Port alternative to `httpUrl` |
| `cliPath` | No | Path to signal-cli binary for auto-start |
| `startupTimeout` | No | Seconds to wait for CLI startup (1-120, default: 30) |
| `receiveMode` | No | `on-start` or `manual` (default: `on-start`) |
| `includeAttachments` | No | Include attachments in messages (default: `true`) |
| `includeStories` | No | Process story messages (default: `false`) |
| `readReceipts` | No | Send read receipts (default: `true`) |
| `reactionNotifications` | No | Reaction notification level |
| `dmPolicy` | No | DM handling policy |

## Features

- **HTTP and JSON-RPC** — Connects to signal-cli via HTTP URL or host/port
- **Auto-start** — Optional CLI auto-start with configurable timeout
- **Attachments** — Send and receive media attachments
- **Read receipts** — Configurable delivery/read receipt support
- **Reactions** — Reaction notifications at configurable levels
- **Stories** — Optional story message processing
- **Multi-account** — Supports multiple Signal accounts via `accounts` map

## Auto-Enable

The plugin auto-enables when the `connectors.signal` block contains an `account`:

```json
{
  "connectors": {
    "signal": {
      "account": "+1234567890"
    }
  }
}
```

## Related

- [iMessage Plugin](/plugin-registry/platform/imessage) — iMessage integration
- [Telegram Plugin](/plugin-registry/platform/telegram) — Telegram bot integration
- [Connectors Guide](/guides/connectors) — General connector documentation
