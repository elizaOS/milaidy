---
title: Discord Connector
sidebarTitle: Discord
description: Connect your agent to Discord using the @elizaos/plugin-discord package.
---

Connect your agent to Discord servers and DMs.

## Overview

The Discord connector is an external ElizaOS plugin that bridges your agent to Discord. It is auto-enabled by the runtime when a valid token is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-discord` |
| Config key | `connectors.discord` |
| Auto-enable trigger | `botToken`, `token`, or `apiKey` is truthy in connector config |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "discord": {
      "botToken": "your-discord-bot-token"
    }
  }
}
```

## Disabling the Connector

To explicitly disable the connector even when a token is present:

```json
{
  "connectors": {
    "discord": {
      "botToken": "your-discord-bot-token",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.discord` in your character config. If any of the fields `botToken`, `token`, or `apiKey` is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-discord`.

No environment variable is required to trigger auto-enable -- it is driven entirely by the connector config object.

## Environment Variables

When loaded, secrets are pushed to `process.env` for the plugin to consume:

| Variable | Source | Description |
|----------|--------|-------------|
| `DISCORD_API_TOKEN` | `botToken` or `token` | Primary bot token (always set) |
| `DISCORD_BOT_TOKEN` | `botToken` or `token` | Mirror of `DISCORD_API_TOKEN` (both always set) |
| `DISCORD_APPLICATION_ID` | `applicationId` | Application ID. Auto-resolved via Discord OAuth2 API if not set |

Note: If `DISCORD_APPLICATION_ID` is not configured, the runtime automatically resolves it by calling `https://discord.com/api/v10/oauth2/applications/@me` with the bot token.

## Full Configuration Reference

All fields are set under `connectors.discord` in the character config.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `token` | string | — | Bot token (legacy field name) |
| `name` | string | — | Account display name |
| `enabled` | boolean | — | Explicitly enable/disable |
| `capabilities` | string[] | — | Capability flags |
| `allowBots` | boolean | — | Allow bot-authored messages to trigger responses |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | How the bot joins group conversations |
| `historyLimit` | integer >= 0 | — | Max messages to include in conversation context |
| `dmHistoryLimit` | integer >= 0 | — | History limit for DM conversations |
| `dms` | object | — | Per-DM history overrides keyed by DM ID. Each value: `{historyLimit?: int}` |
| `textChunkLimit` | integer > 0 | — | Max characters per message chunk |
| `chunkMode` | `"length"` \| `"newline"` | — | How to split long messages |
| `blockStreaming` | boolean | — | Disable streaming responses |
| `blockStreamingCoalesce` | object | — | Coalescing settings: `minChars`, `maxChars`, `idleMs` |
| `maxLinesPerMessage` | integer > 0 | 17 | Max lines per Discord message |
| `mediaMaxMb` | number > 0 | — | Max media file size in MB |
| `replyToMode` | `"off"` \| `"first"` \| `"all"` | — | When to use Discord reply threading |
| `configWrites` | boolean | true | Allow config writes from Discord events |
| `markdown` | object | — | Markdown rendering: `tables` can be `"off"`, `"bullets"`, or `"code"` |
| `commands` | object | — | `native` and `nativeSkills` slash command toggles (boolean or `"auto"`) |

### Retry Configuration

| Field | Type | Description |
|-------|------|-------------|
| `retry.attempts` | integer | Max retry attempts |
| `retry.minDelayMs` | integer | Minimum delay between retries |
| `retry.maxDelayMs` | integer | Maximum delay between retries |
| `retry.jitter` | number | Jitter factor for retry backoff |

### Actions

Toggle individual Discord actions under `actions`:

| Field | Type | Description |
|-------|------|-------------|
| `actions.reactions` | boolean | Send reactions |
| `actions.stickers` | boolean | Send stickers |
| `actions.emojiUploads` | boolean | Upload custom emoji |
| `actions.stickerUploads` | boolean | Upload custom stickers |
| `actions.polls` | boolean | Create polls |
| `actions.permissions` | boolean | Manage permissions |
| `actions.messages` | boolean | Send messages |
| `actions.threads` | boolean | Create/manage threads |
| `actions.pins` | boolean | Pin messages |
| `actions.search` | boolean | Search messages |
| `actions.memberInfo` | boolean | View member info |
| `actions.roleInfo` | boolean | View role info |
| `actions.roles` | boolean | Manage roles |
| `actions.channelInfo` | boolean | View channel info |
| `actions.voiceStatus` | boolean | Voice channel status |
| `actions.events` | boolean | Manage server events |
| `actions.moderation` | boolean | Moderation actions |
| `actions.channels` | boolean | Manage channels |
| `actions.presence` | boolean | Presence updates |

### DM Policy

Configure DM behavior under the `dm` key:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dm.enabled` | boolean | — | Enable/disable DMs |
| `dm.policy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy. `"pairing"` requires the pairing flow. `"open"` requires `allowFrom` to include `"*"` |
| `dm.allowFrom` | (string\|number)[] | — | User IDs allowed to DM. Must include `"*"` when policy is `"open"` |
| `dm.groupEnabled` | boolean | — | Enable group DMs |
| `dm.groupChannels` | (string\|number)[] | — | Allowed group DM channel IDs |

### Guild Configuration

Per-guild settings under `guilds.<guild-id>`:

| Field | Type | Description |
|-------|------|-------------|
| `slug` | string | Guild display name |
| `requireMention` | boolean | Only respond when @mentioned |
| `tools` | ToolPolicySchema | Tool access policy |
| `toolsBySender` | object | Per-sender tool policies (keyed by sender ID) |
| `reactionNotifications` | `"off"` \| `"own"` \| `"all"` \| `"allowlist"` | Reaction notification filter |
| `users` | (string\|number)[] | Allowed user IDs |

### Channel Configuration

Per-channel settings under `guilds.<guild-id>.channels.<channel-id>`:

| Field | Type | Description |
|-------|------|-------------|
| `allow` | boolean | Allow bot in this channel |
| `enabled` | boolean | Enable/disable channel |
| `requireMention` | boolean | Only respond when @mentioned |
| `tools` | ToolPolicySchema | Tool access policy for this channel |
| `toolsBySender` | object | Per-sender tool policies (keyed by sender ID) |
| `skills` | string[] | Skills allowed in this channel |
| `users` | (string\|number)[] | Allowed user IDs |
| `systemPrompt` | string | Channel-specific system prompt override |
| `autoThread` | boolean | Auto-create threads for conversations |

### Advanced Features

#### Privileged Intents

```json
{
  "connectors": {
    "discord": {
      "intents": {
        "presence": true,
        "guildMembers": true
      }
    }
  }
}
```

These must also be enabled in the Discord Developer Portal.

#### PluralKit Integration

```json
{
  "connectors": {
    "discord": {
      "pluralkit": {
        "enabled": true,
        "token": "pk-token"
      }
    }
  }
}
```

Resolves PluralKit proxy messages to their original authors.

#### Exec Approvals

```json
{
  "connectors": {
    "discord": {
      "execApprovals": {
        "enabled": true,
        "approvers": ["user-id-1"],
        "agentFilter": "pattern",
        "sessionFilter": "pattern"
      }
    }
  }
}
```

Requires human approval for certain agent actions.

#### Heartbeat

```json
{
  "connectors": {
    "discord": {
      "heartbeat": {
        "showOk": true,
        "showAlerts": true,
        "useIndicator": true
      }
    }
  }
}
```

### Multi-Account Support

The `accounts` field allows running multiple Discord bot accounts:

```json
{
  "connectors": {
    "discord": {
      "accounts": {
        "bot-1": { "token": "...", "guilds": { } },
        "bot-2": { "token": "...", "guilds": { } }
      }
    }
  }
}
```

Each account inherits the base config and can override any field.

## Related

- [Discord plugin reference](/plugin-registry/platform/discord)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
