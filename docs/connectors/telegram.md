---
title: Telegram Connector
sidebarTitle: Telegram
description: Connect your Milaidy agent to Telegram with bot commands, inline queries, group chat support, and media handling.
---

Connect your Milaidy agent to Telegram for messaging in private chats and groups.

## Overview

The Telegram connector uses the Bot API to bridge your agent to Telegram. It supports private chats, group conversations, inline queries, media messages, and bot commands.

## Prerequisites

- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Bot privacy mode disabled (for group chats)

## Configuration

Add to your `.env` file:

```bash
TELEGRAM_BOT_TOKEN=your-bot-token
```

Or configure in your character file:

```json
{
  "connectors": {
    "telegram": {
      "enabled": true,
      "allowGroups": true,
      "allowPrivate": true,
      "adminUsers": ["your-telegram-id"]
    }
  }
}
```

## Features

### Private Chats

The agent responds to all messages in private (1:1) chats. Each user gets a separate conversation context with full memory persistence.

### Group Chats

In groups, the agent responds to:
- Direct mentions (`@your_bot message`)
- Reply-to-bot messages
- Bot commands (`/ask`, `/status`)

Configure whether the agent should respond to all messages or only when mentioned:

```json
{
  "connectors": {
    "telegram": {
      "groupMode": "mention-only"
    }
  }
}
```

### Bot Commands

Register commands with BotFather that map to agent actions:

| Command | Description |
|---------|-------------|
| `/start` | Initialize conversation |
| `/ask <question>` | Ask the agent a question |
| `/status` | Show agent status |
| `/clear` | Reset conversation context |
| `/help` | Show available commands |

### Inline Queries

Users can invoke your agent from any chat using inline mode:

```
@your_bot what is the weather today
```

### Media Handling

The connector processes:
- **Photos**: Sent to vision-capable models for analysis
- **Voice messages**: Transcribed via STT plugin
- **Documents**: Parsed and added to conversation context
- **Stickers**: Interpreted as emoji-based sentiment

## Message Flow

```
Telegram Bot API → Connector → Message Router → Agent Runtime
                                                      ↓
Telegram Bot API ← Connector ← Response Router ← Agent Response
```

## Webhook vs Polling

By default, the connector uses long polling. For production, configure a webhook:

```json
{
  "connectors": {
    "telegram": {
      "webhook": {
        "url": "https://your-domain.com/telegram/webhook",
        "port": 8443
      }
    }
  }
}
```

## Rate Limiting

Telegram enforces limits of ~30 messages/second to different chats and ~20 messages/minute to the same chat. The connector handles throttling automatically.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot doesn't respond in groups | Disable privacy mode via BotFather |
| Webhook not receiving | Check SSL certificate and port |
| Media not processed | Ensure relevant plugins (TTS, vision) are installed |
| Rate limited | Reduce autonomous message frequency |

## Related

- [Connectors Overview](/guides/connectors) — General connector architecture
- [WhatsApp Connector](/guides/whatsapp) — WhatsApp integration guide
- [Media Generation](/guides/media-generation) — Generate and send media
