---
title: "WhatsApp Plugin"
sidebarTitle: "WhatsApp"
description: "WhatsApp connector for Milady — personal and multi-account messaging via the Baileys WebSocket API."
---

The WhatsApp plugin connects Milady agents to WhatsApp using the Baileys WebSocket library, enabling messaging from personal WhatsApp accounts without the official Business API.

**Package:** `@elizaos/plugin-whatsapp`

## Overview

The WhatsApp plugin uses Baileys, an unofficial WhatsApp Web multi-device API client. It connects using the same protocol as WhatsApp Web, meaning no official WhatsApp Business API account is required.

**Important:** Using unofficial WhatsApp APIs may violate WhatsApp's Terms of Service. Use at your own risk and review WhatsApp's policies before deploying in production.

## Installation

```bash
milady plugins install whatsapp
```

## Setup

### 1. Configure Authentication Directory

The plugin stores WhatsApp session credentials in an `authDir` directory. On first run, it will display a QR code for you to scan with your phone.

```json
{
  "connectors": {
    "whatsapp": {
      "authDir": "./whatsapp-auth"
    }
  }
}
```

### 2. Scan the QR Code

On first start, the plugin prints a QR code to the terminal. Scan it with WhatsApp on your phone:

1. Open WhatsApp on your phone
2. Go to **Settings → Linked Devices → Link a Device**
3. Scan the QR code displayed in the terminal

The session is saved to `authDir` and persists across restarts.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `authDir` | Yes | Directory path for auth state files |
| `enabled` | No | Set `false` to disable (default: `true`) |
| `allowedJids` | No | Array of WhatsApp JIDs (phone numbers) to respond to |
| `allowedGroups` | No | Array of group JIDs to participate in |
| `ignoreOwnMessages` | No | Skip messages sent by the bot itself (default: `true`) |

```json
{
  "connectors": {
    "whatsapp": {
      "authDir": "./whatsapp-auth",
      "allowedJids": ["1234567890@s.whatsapp.net"],
      "allowedGroups": ["1234567890-1234567890@g.us"]
    }
  }
}
```

## Multi-Account Support

Run multiple WhatsApp accounts by configuring the `accounts` map:

```json
{
  "connectors": {
    "whatsapp": {
      "accounts": {
        "account1": {
          "authDir": "./whatsapp-auth-1"
        },
        "account2": {
          "authDir": "./whatsapp-auth-2",
          "enabled": false
        }
      }
    }
  }
}
```

## Features

- **Personal accounts** — No Business API subscription required
- **Multi-device support** — WhatsApp multi-device protocol
- **Group chats** — Responds in group conversations
- **Private messages** — 1:1 message handling
- **Media** — Receives and sends images, documents, voice notes
- **Status updates** — Can post to WhatsApp Status
- **Multi-account** — Manage multiple WhatsApp numbers

## Message Flow

```
WhatsApp WebSocket event
       ↓
Plugin filters by allowed JIDs/groups
       ↓
Media downloaded and processed if present
       ↓
AgentRuntime processes message
       ↓
Response sent via Baileys API
```

## Auto-Enable

The plugin auto-enables when `connectors.whatsapp` contains an `authDir` or `accounts` configuration with at least one account that has `authDir` set.

## Session Persistence

Session credentials are stored in the `authDir` as multiple JSON files. Back up this directory to avoid needing to re-scan the QR code after a restart.

## Related

- [Telegram Plugin](/plugin-registry/platform/telegram) — Telegram bot integration (official API)
- [Connectors Guide](/guides/whatsapp) — WhatsApp setup guide
- [Connectors Overview](/guides/connectors) — All connector options
