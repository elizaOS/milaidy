---
title: "Slack Plugin"
sidebarTitle: "Slack"
description: "Slack connector for Milaidy — workspace bot, channel monitoring, slash commands, and interactive components."
---

The Slack plugin connects Milaidy agents to Slack workspaces as a bot app, handling messages in channels, DMs, and threads with support for slash commands and interactive components.

**Package:** `@elizaos/plugin-slack`

## Installation

```bash
milaidy plugins install slack
```

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App → From scratch**
3. Name the app and select your workspace

### 2. Configure Bot Permissions

Navigate to **OAuth & Permissions → Scopes → Bot Token Scopes** and add:

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | Receive @mentions |
| `channels:history` | Read channel messages |
| `channels:read` | List channels |
| `chat:write` | Post messages |
| `groups:history` | Read private channel messages |
| `im:history` | Read DM history |
| `im:read` | Access DM info |
| `im:write` | Send DMs |
| `mpim:history` | Read group DM history |
| `reactions:write` | Add reactions |
| `users:read` | Look up user info |

### 3. Enable Socket Mode (Recommended for Development)

Navigate to **Socket Mode** and toggle it on. Generate an App-Level Token with the `connections:write` scope.

### 4. Enable Event Subscriptions

Navigate to **Event Subscriptions** and subscribe to bot events:

- `app_mention`
- `message.channels`
- `message.groups`
- `message.im`
- `message.mpim`

### 5. Install to Workspace

Navigate to **OAuth & Permissions** and click **Install to Workspace**. Copy the **Bot User OAuth Token** (`xoxb-...`).

### 6. Configure Milaidy

```json
{
  "connectors": {
    "slack": {
      "botToken": "xoxb-...",
      "appToken": "xapp-..."
    }
  }
}
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `botToken` | Yes | Bot User OAuth Token (`xoxb-...`) |
| `appToken` | No | App-Level Token for Socket Mode (`xapp-...`) |
| `signingSecret` | No | Signing secret for webhook verification |
| `enabled` | No | Set `false` to disable (default: `true`) |
| `allowedChannels` | No | Array of channel IDs to respond in |

## Features

- **Slash commands** — Register and respond to `/commands`
- **@mentions** — Responds when mentioned in channels
- **DMs** — Full private conversation support
- **Threads** — Participates in threaded replies
- **Reactions** — Adds emoji reactions to messages
- **Socket Mode** — Real-time event delivery without a public URL
- **Webhook mode** — Production webhook endpoint support
- **Interactive components** — Block Kit buttons and modals

## Message Flow

```
Slack Event (via Socket Mode or webhook)
       ↓
Plugin validates event signature
       ↓
Determines response context:
  - app_mention → respond in channel thread
  - message.im → respond in DM
       ↓
AgentRuntime processes message
       ↓
Response posted to Slack channel/DM
```

## Auto-Enable

The plugin auto-enables when `connectors.slack.botToken` is set.

## Thread Behavior

By default, responses are posted as thread replies to keep channels clean. To post top-level replies:

```json
{
  "connectors": {
    "slack": {
      "botToken": "xoxb-...",
      "replyInThread": false
    }
  }
}
```

## Related

- [Discord Plugin](/plugin-registry/platform/discord) — Discord bot integration
- [Telegram Plugin](/plugin-registry/platform/telegram) — Telegram bot integration
- [Connectors Guide](/guides/connectors) — General connector documentation
