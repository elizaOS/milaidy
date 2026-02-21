---
title: "Telegram Plugin"
sidebarTitle: "Telegram"
description: "Telegram bot connector for Milady — messaging, groups, inline queries, and media handling."
---

The Telegram plugin connects Milady agents to Telegram as a bot, handling private messages, group chats, inline queries, and media sharing.

**Package:** `@elizaos/plugin-telegram`

## Installation

```bash
milady plugins install telegram
```

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. BotFather will give you a bot token in the format `123456789:ABCdef...`

### 2. Configure Milady

```json
{
  "connectors": {
    "telegram": {
      "botToken": "123456789:ABCdef..."
    }
  }
}
```

Or via environment variable:

```bash
export TELEGRAM_BOT_TOKEN=123456789:ABCdef...
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `botToken` | Yes | Telegram bot token from BotFather |
| `enabled` | No | Set `false` to disable (default: `true`) |
| `allowedUsers` | No | Array of Telegram user IDs to accept messages from |
| `allowedGroups` | No | Array of group/channel IDs to respond in |
| `webhookUrl` | No | Use webhook instead of polling (requires HTTPS URL) |
| `webhookSecret` | No | Secret token for webhook verification |

```json
{
  "connectors": {
    "telegram": {
      "botToken": "123456789:ABCdef...",
      "allowedUsers": [123456, 789012],
      "allowedGroups": [-1001234567890]
    }
  }
}
```

## Features

- **Private messages** — 1:1 conversations with users
- **Group chats** — Responds in groups when mentioned or replied to
- **Channels** — Can post to Telegram channels
- **Inline queries** — Responds to `@botname query` inline in any chat
- **Media** — Handles photos, documents, audio, video
- **Commands** — Responds to `/command` style messages
- **Webhooks** — Supports webhook mode for production deployments
- **Long polling** — Default mode for development

## Message Flow

```
Telegram Update (via polling or webhook)
       ↓
Plugin processes update type:
  - message → route to AgentRuntime
  - callback_query → handle button press
  - inline_query → handle inline search
       ↓
Determines response target (chat_id)
       ↓
AgentRuntime processes message
       ↓
Response sent via Telegram Bot API
```

## Group Behavior

In group chats, the agent responds only when:

- The bot is mentioned (`@botname`)
- A message is a reply to the bot's message
- The message starts with a configured command

To have the bot respond to all messages in a group, set `allowedGroups` and configure the character to respond more broadly.

## Webhook Mode

For production deployments, webhook mode is more reliable than polling:

```json
{
  "connectors": {
    "telegram": {
      "botToken": "123456789:ABCdef...",
      "webhookUrl": "https://your-domain.com/webhook/telegram",
      "webhookSecret": "your-random-secret"
    }
  }
}
```

The webhook endpoint must be accessible over HTTPS.

## Auto-Enable

The plugin auto-enables when `connectors.telegram.botToken` is set.

## Related

- [Discord Plugin](/plugin-registry/platform/discord) — Discord bot integration
- [WhatsApp Plugin](/plugin-registry/platform/whatsapp) — WhatsApp integration
- [Connectors Guide](/guides/connectors) — General connector documentation
