---
title: "Mattermost Plugin"
sidebarTitle: "Mattermost"
description: "Mattermost connector for Milady — self-hosted team messaging with bot token auth, mention filtering, and chat mode configuration."
---

The Mattermost plugin connects Milady agents to a Mattermost server as a bot, supporting channel messages and DMs with configurable mention requirements and chat modes.

**Package:** `@elizaos/plugin-mattermost`

## Installation

```bash
milady plugins install mattermost
```

## Setup

### 1. Create a Bot Account

1. Open your Mattermost instance
2. Navigate to **System Console → Integrations → Bot Accounts**
3. Click **Add Bot Account**
4. Fill in the display name and description
5. Copy the generated **Bot Token**

### 2. Configure Milady

```json
{
  "connectors": {
    "mattermost": {
      "enabled": true,
      "botToken": "YOUR_BOT_TOKEN",
      "baseUrl": "https://chat.example.com"
    }
  }
}
```

Or via environment variables:

```bash
export MATTERMOST_BOT_TOKEN=YOUR_BOT_TOKEN
export MATTERMOST_BASE_URL=https://chat.example.com
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `botToken` | Yes | Bot token from Mattermost System Console |
| `baseUrl` | Yes | Base URL for your Mattermost server |
| `chatmode` | No | Chat mode: `dm-only`, `channel-only`, or `all` (default: `all`) |
| `requireMention` | No | Only respond when @mentioned (default: `false`) |
| `oncharPrefixes` | No | Custom command prefixes for triggering responses |
| `configWrites` | No | Allow config writes from channel events (default: `true`) |
| `enabled` | No | Set `false` to disable (default: `true`) |

## Features

- **Channel messages** — Monitor and respond in public and private channels
- **DMs** — Full private conversation support
- **Chat modes** — Restrict to DMs only, channels only, or all
- **Mention filtering** — Optionally require @mentions before responding
- **Command prefixes** — Custom prefix triggers for agent responses
- **Self-hosted** — Works with any Mattermost server deployment

## Auto-Enable

The plugin auto-enables when the `connectors.mattermost` block contains a `botToken`:

```json
{
  "connectors": {
    "mattermost": {
      "botToken": "YOUR_BOT_TOKEN",
      "baseUrl": "https://chat.example.com"
    }
  }
}
```

## Troubleshooting

### Bot Not Responding in Channels

Ensure the bot account has been added to the channels where it should respond. By default, bots must be explicitly invited to channels.

### Connection Refused

Verify the `baseUrl` is correct and the Mattermost server is reachable from the Milady host. For self-hosted instances, check firewall rules.

### Bot Token Invalid

Bot tokens can be regenerated from **System Console → Integrations → Bot Accounts**. Update the token in your Milady configuration after regeneration.

## Related

- [Slack Plugin](/plugin-registry/platform/slack) — Slack workspace integration
- [Discord Plugin](/plugin-registry/platform/discord) — Discord bot integration
- [Connectors Guide](/guides/connectors) — General connector documentation
