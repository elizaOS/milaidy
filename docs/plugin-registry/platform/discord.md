---
title: "Discord Plugin"
sidebarTitle: "Discord"
description: "Discord connector for Milaidy — bot integration, slash commands, voice support, and multi-server management."
---

The Discord plugin connects Milaidy agents to Discord as a bot, enabling message handling across servers, channels, and DMs with support for slash commands, reactions, and voice channels.

**Package:** `@elizaos/plugin-discord`

## Installation

```bash
milaidy plugins install discord
```

## Setup

### 1. Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Navigate to **Bot** → **Add Bot**
4. Under **Token**, click **Reset Token** and copy the token
5. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent**
   - **Message Content Intent**
   - **Presence Intent**

### 2. Invite the Bot to Your Server

1. Navigate to **OAuth2 → URL Generator**
2. Select scopes: `bot`, `applications.commands`
3. Select permissions: `Send Messages`, `Read Message History`, `Add Reactions`, `Connect` (for voice)
4. Copy the generated URL and open it to invite the bot

### 3. Configure Milaidy

```json
{
  "connectors": {
    "discord": {
      "botToken": "YOUR_BOT_TOKEN"
    }
  }
}
```

Or via environment variable:

```bash
export DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `botToken` | Yes | Discord bot token |
| `enabled` | No | Set `false` to disable (default: `true`) |
| `allowedChannels` | No | Array of channel IDs to respond in |
| `ignoredChannels` | No | Array of channel IDs to ignore |
| `prefix` | No | Command prefix (default: none, uses bot mentions) |

```json
{
  "connectors": {
    "discord": {
      "botToken": "YOUR_BOT_TOKEN",
      "allowedChannels": ["1234567890123456789"],
      "prefix": "!"
    }
  }
}
```

## Features

- **Message handling** — Responds to DMs and channel messages where the bot is mentioned or addressed by name
- **Slash commands** — Registers Discord slash commands for agent actions
- **Reactions** — Can add emoji reactions to messages
- **Threads** — Participates in thread conversations
- **Voice channels** — Can join voice channels (requires additional setup)
- **Multi-server** — Operates across multiple servers simultaneously
- **Role detection** — Reads member roles for permission-based responses

## Message Flow

```
Discord Message
       ↓
Plugin receives MESSAGE_CREATE event
       ↓
Determines if agent should respond:
  - DM → always respond
  - Channel → respond if mentioned or addressed
       ↓
Formats as Milaidy Memory
       ↓
AgentRuntime processes
       ↓
Response sent back to Discord channel/DM
```

## Auto-Enable

The plugin auto-enables when the `connectors.discord` block contains a `botToken`:

```json
{
  "connectors": {
    "discord": {
      "botToken": "YOUR_BOT_TOKEN"
    }
  }
}
```

## Environment Variables

The bot token can also be set via:

```bash
export DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
```

## Related

- [Telegram Plugin](/plugin-registry/platform/telegram) — Telegram bot integration
- [Slack Plugin](/plugin-registry/platform/slack) — Slack workspace integration
- [Connectors Guide](/guides/connectors) — General connector documentation
