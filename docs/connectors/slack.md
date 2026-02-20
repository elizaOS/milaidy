---
title: Slack Connector
sidebarTitle: Slack
description: Connect your agent to Slack workspaces using the @elizaos/plugin-slack package.
---

## Overview

The Slack connector is an external ElizaOS plugin that bridges your agent to Slack workspaces. It supports two transport modes (Socket Mode and HTTP webhooks), per-channel configuration, DM policies, slash commands, multi-account support, and fine-grained action permissions. The connector is auto-enabled by the runtime when a valid token is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-slack` |
| Config key | `connectors.slack` |
| Auto-enable trigger | `botToken`, `token`, or `apiKey` is truthy in connector config |

## Minimal Configuration

In your character file:

```json
{
  "connectors": {
    "slack": {
      "botToken": "xoxb-your-bot-token"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when a token is present:

```json
{
  "connectors": {
    "slack": {
      "botToken": "xoxb-your-bot-token",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.slack` in your character config. If any of the fields `botToken`, `token`, or `apiKey` is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-slack`.

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Environment Variables

When the connector is loaded, the runtime pushes the following secrets from your config into `process.env` for the plugin to consume:

| Variable | Source | Description |
|----------|--------|-------------|
| `SLACK_BOT_TOKEN` | `botToken` | Bot token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | `appToken` | App-level token (`xapp-...`) for Socket Mode |
| `SLACK_USER_TOKEN` | `userToken` | User token (`xoxp-...`) for user-scoped actions |

## Transport Modes

Slack supports two transport modes:

### Socket Mode (default)

Uses WebSocket via Slack's Socket Mode API. Requires an app-level token (`xapp-...`).

```json
{
  "connectors": {
    "slack": {
      "mode": "socket",
      "botToken": "xoxb-...",
      "appToken": "xapp-..."
    }
  }
}
```

### HTTP Mode

Receives events via HTTP webhooks. Requires a signing secret for request verification.

```json
{
  "connectors": {
    "slack": {
      "mode": "http",
      "botToken": "xoxb-...",
      "signingSecret": "your-signing-secret",
      "webhookPath": "/slack/events"
    }
  }
}
```

When `mode` is `"http"`, `signingSecret` is required (validated by the schema).

## Full Configuration Reference

All fields under `connectors.slack`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `botToken` | string | — | Bot token (`xoxb-...`) |
| `appToken` | string | — | App-level token (`xapp-...`) for Socket Mode |
| `userToken` | string | — | User token (`xoxp-...`) for user-scoped API calls |
| `userTokenReadOnly` | boolean | `true` | Restrict user token to read-only operations |
| `mode` | `"socket"` \| `"http"` | `"socket"` | Transport mode |
| `signingSecret` | string | — | Signing secret for HTTP mode (required when mode is `"http"`) |
| `webhookPath` | string | `"/slack/events"` | HTTP webhook endpoint path |
| `name` | string | — | Account display name |
| `enabled` | boolean | — | Explicitly enable/disable |
| `capabilities` | string[] | — | Capability flags |
| `allowBots` | boolean | `false` | Allow bot messages to trigger responses |
| `requireMention` | boolean | — | Only respond when @mentioned |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | Group/channel join policy |
| `historyLimit` | integer >= 0 | — | Max messages in conversation context |
| `dmHistoryLimit` | integer >= 0 | — | History limit for DMs |
| `dms` | Record\<string, \{historyLimit?\}\> | — | Per-DM history overrides |
| `textChunkLimit` | integer > 0 | — | Max characters per message chunk |
| `chunkMode` | `"length"` \| `"newline"` | — | Long message splitting strategy |
| `blockStreaming` | boolean | — | Disable streaming responses |
| `blockStreamingCoalesce` | object | — | Coalescing: `minChars`, `maxChars`, `idleMs` |
| `mediaMaxMb` | number > 0 | — | Max media file size in MB |
| `replyToMode` | `"off"` \| `"first"` \| `"all"` | — | Reply threading mode |
| `configWrites` | boolean | `true` | Allow config writes from Slack events |
| `markdown` | object | — | Table rendering: `tables` can be `"off"`, `"bullets"`, or `"code"` |
| `commands` | object | — | `native` and `nativeSkills` toggles |

### Reply-To Mode by Chat Type

Override `replyToMode` per chat type:

```json
{
  "connectors": {
    "slack": {
      "replyToModeByChatType": {
        "direct": "all",
        "group": "first",
        "channel": "off"
      }
    }
  }
}
```

### Actions

| Field | Type | Description |
|-------|------|-------------|
| `actions.reactions` | boolean | Add reactions |
| `actions.messages` | boolean | Send messages |
| `actions.pins` | boolean | Pin messages |
| `actions.search` | boolean | Search messages |
| `actions.permissions` | boolean | Manage permissions |
| `actions.memberInfo` | boolean | View member info |
| `actions.channelInfo` | boolean | View channel info |
| `actions.emojiList` | boolean | List available emoji |

### Reaction Notifications

| Field | Type | Description |
|-------|------|-------------|
| `reactionNotifications` | `"off"` \| `"own"` \| `"all"` \| `"allowlist"` | Which reactions trigger notifications |
| `reactionAllowlist` | (string\|number)[] | Reaction names to notify on (when using `"allowlist"`) |

### DM Policy

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dm.enabled` | boolean | — | Enable/disable DMs |
| `dm.policy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy |
| `dm.allowFrom` | (string\|number)[] | — | Allowed user IDs. Must include `"*"` for `"open"` policy |
| `dm.groupEnabled` | boolean | — | Enable group DMs |
| `dm.groupChannels` | (string\|number)[] | — | Allowed group DM channel IDs |
| `dm.replyToMode` | `"off"` \| `"first"` \| `"all"` | — | DM-specific reply threading |

### Thread Configuration

| Field | Type | Description |
|-------|------|-------------|
| `thread.historyScope` | `"thread"` \| `"channel"` | `"thread"` isolates history per thread. `"channel"` reuses channel conversation history |
| `thread.inheritParent` | boolean | Whether thread sessions inherit the parent channel transcript (default: false) |

### Slash Commands

```json
{
  "connectors": {
    "slack": {
      "slashCommand": {
        "enabled": true,
        "name": "agent",
        "sessionPrefix": "slash",
        "ephemeral": true
      }
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `slashCommand.enabled` | boolean | Enable slash command handling |
| `slashCommand.name` | string | Slash command name (e.g., `/agent`) |
| `slashCommand.sessionPrefix` | string | Session ID prefix for slash command conversations |
| `slashCommand.ephemeral` | boolean | Send responses as ephemeral (visible only to invoker) |

### Channel Configuration

Per-channel settings under `channels.<channel-id>`:

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable/disable this channel |
| `allow` | boolean | Allow bot in this channel |
| `requireMention` | boolean | Only respond when @mentioned |
| `tools` | ToolPolicySchema | Tool access policy |
| `toolsBySender` | Record\<string, ToolPolicySchema\> | Per-sender tool policies |
| `allowBots` | boolean | Allow bot messages in this channel |
| `users` | (string\|number)[] | Allowed user IDs |
| `skills` | string[] | Allowed skills |
| `systemPrompt` | string | Channel-specific system prompt |

### Heartbeat

```json
{
  "connectors": {
    "slack": {
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

```json
{
  "connectors": {
    "slack": {
      "accounts": {
        "workspace-1": { "botToken": "xoxb-...", "appToken": "xapp-..." },
        "workspace-2": { "botToken": "xoxb-...", "appToken": "xapp-..." }
      }
    }
  }
}
```

## Related

- [Slack plugin reference](/plugin-registry/platform/slack)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
