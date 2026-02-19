---
title: Discord Connector
sidebarTitle: Discord
description: Connect your Milaidy agent to Discord servers with slash commands, reactions, voice channel support, and multi-guild management.
---

Connect your Milaidy agent to Discord for real-time messaging in servers and DMs.

## Overview

The Discord connector bridges your agent to Discord using the `discord.js` library. It supports text channels, DMs, slash commands, reactions, thread conversations, and voice channel integration.

## Prerequisites

- A Discord bot application from the [Discord Developer Portal](https://discord.com/developers/applications)
- Bot token with the `MESSAGE_CONTENT` privileged intent enabled
- Server invite with appropriate permissions

## Configuration

Add the following to your `.env` file:

```bash
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_GUILD_ID=your-server-id        # optional, restrict to one server
```

Or configure in your character file:

```json
{
  "connectors": {
    "discord": {
      "enabled": true,
      "guildId": "123456789",
      "channels": ["general", "bot-chat"],
      "prefix": "!",
      "allowDMs": true
    }
  }
}
```

## Features

### Text Channels

The agent responds to mentions and prefix commands in configured channels. It maintains conversation context per channel using thread-based memory.

### Slash Commands

Register custom slash commands that map to your agent's actions:

| Command | Description |
|---------|-------------|
| `/ask <question>` | Direct question to the agent |
| `/status` | Show agent status and uptime |
| `/knowledge <query>` | Search the agent's knowledge base |
| `/action <name>` | Trigger a specific action |

### Thread Conversations

When a user starts a thread, the agent maintains separate context for that thread, enabling focused multi-turn conversations without polluting the main channel.

### Reactions

The agent can react to messages and respond to reaction events, enabling reaction-based workflows like approval systems or sentiment tracking.

### Voice Channels

With TTS and STT plugins enabled, the agent can join voice channels, listen to speech, and respond with synthesized voice.

## Message Routing

```
Discord Gateway → Connector → Message Router → Agent Runtime
                                                    ↓
Discord API    ← Connector ← Response Router ← Agent Response
```

Messages are routed based on:
1. Channel allowlist (if configured)
2. Mention detection
3. DM detection
4. Prefix matching

## Multi-Guild Support

Run a single agent across multiple Discord servers. Each guild maintains its own:
- Channel configuration
- Permission overrides
- Conversation history

## Rate Limiting

The connector respects Discord's rate limits automatically. For high-traffic servers, configure message batching:

```json
{
  "connectors": {
    "discord": {
      "batchMessages": true,
      "batchInterval": 2000
    }
  }
}
```

## Permissions

The bot requires these Discord permissions:
- `Send Messages`
- `Read Message History`
- `Add Reactions`
- `Use Slash Commands`
- `Connect` and `Speak` (for voice)
- `Manage Threads` (for thread support)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot doesn't respond | Check `MESSAGE_CONTENT` intent is enabled |
| Slash commands missing | Run `milaidy setup` to register commands |
| Rate limited | Enable `batchMessages` in config |
| Voice not working | Ensure TTS/STT plugins are installed |

## Related

- [Connectors Overview](/guides/connectors) — General connector architecture
- [Custom Actions](/guides/custom-actions) — Create actions the bot can trigger
- [Autonomous Mode](/guides/autonomous-mode) — Let the agent act proactively
