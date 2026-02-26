---
title: "Platform Connectors"
sidebarTitle: "Connectors"
description: "Platform bridges for Discord, Telegram, Slack, WhatsApp, Signal, iMessage, BlueBubbles, MS Teams, Google Chat, and Twitter."
---

Connectors are platform bridges that allow your agent to communicate across messaging platforms and social networks. Each connector handles authentication, message routing, session management, and platform-specific features.

## Table of Contents

1. [Supported Platforms](#supported-platforms)
2. [General Configuration](#general-configuration)
3. [Discord](#discord)
4. [Telegram](#telegram)
5. [Slack](#slack)
6. [WhatsApp](#whatsapp)
7. [Signal](#signal)
8. [iMessage](#imessage)
9. [BlueBubbles](#bluebubbles)
10. [Microsoft Teams](#microsoft-teams)
11. [Google Chat](#google-chat)
12. [Twitter](#twitter)
13. [Connector Lifecycle](#connector-lifecycle)
14. [Multi-Account Support](#multi-account-support)
15. [Session Management](#session-management)

---

## Supported Platforms

| Platform | Auth Method | DM Support | Group Support | Multi-Account |
|----------|------------|------------|---------------|---------------|
| Discord | Bot token | Yes | Yes (guilds/channels) | Yes |
| Telegram | Bot token | Yes | Yes (groups/topics) | Yes |
| Slack | Bot + App tokens | Yes | Yes (channels/threads) | Yes |
| WhatsApp | QR code (Baileys) or Cloud API | Yes | Yes | Yes |
| Signal | signal-cli HTTP API | Yes | Yes | Yes |
| iMessage | Native CLI (macOS) | Yes | Yes | Yes |
| BlueBubbles | Server URL + password | Yes | Yes | Yes |
| Microsoft Teams | App ID + password | Yes | Yes (teams/channels) | No |
| Google Chat | Service account | Yes | Yes (spaces) | Yes |
| Twitter | API keys + tokens | DMs | N/A | No |

---

## General Configuration

Connectors are configured in the `connectors` section of `milady.json`. Common fields shared across most connectors:

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable or disable the connector |
| `dmPolicy` | string | DM acceptance: `"pairing"` (default), `"open"`, or `"closed"` |
| `allowFrom` | string[] | Allowlist of user IDs (required when `dmPolicy: "open"`) |
| `groupPolicy` | string | Group message policy: `"allowlist"` (default) or `"open"` |
| `groupAllowFrom` | string[] | Allowlist of group IDs |
| `historyLimit` | number | Max messages to load from conversation history |
| `dmHistoryLimit` | number | Max messages for DM history |
| `textChunkLimit` | number | Max characters per message chunk |
| `chunkMode` | string | `"length"` or `"newline"` -- how to split long messages |
| `blockStreaming` | boolean | Disable streaming responses |
| `mediaMaxMb` | number | Max media attachment size in MB |
| `configWrites` | boolean | Allow the agent to modify its own config |
| `capabilities` | string[] | Feature flags for this connector |
| `markdown` | object | Markdown rendering settings |
| `heartbeat` | object | Channel heartbeat visibility settings |

---

## Discord

### Setup Requirements

- Discord bot token (from Discord Developer Portal)
- Bot must be invited to target servers with appropriate permissions

### Key Configuration

```json
{
  "connectors": {
    "discord": {
      "enabled": true,
      "token": "BOT_TOKEN",
      "groupPolicy": "allowlist",
      "guilds": {
        "SERVER_ID": {
          "requireMention": true,
          "channels": {
            "CHANNEL_ID": {
              "allow": true,
              "requireMention": false
            }
          }
        }
      },
      "dm": {
        "enabled": true,
        "policy": "pairing"
      }
    }
  }
}
```

### Features

- Per-guild and per-channel configuration
- DM policy with allowlists
- Reaction notifications (`off`, `own`, `all`, `allowlist`)
- Execution approvals with designated approver users
- PluralKit integration
- Reply-to mode configuration
- Intent configuration (presence, guild members)
- Actions: reactions, stickers, emoji uploads, polls, permissions, messages, threads, pins, search, member/role/channel info, voice status, events, moderation, presence

---

## Telegram

### Setup Requirements

- Bot token from @BotFather

### Key Configuration

```json
{
  "connectors": {
    "telegram": {
      "enabled": true,
      "botToken": "BOT_TOKEN",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "groups": {
        "GROUP_ID": {
          "requireMention": true,
          "topics": {
            "TOPIC_ID": {
              "enabled": true
            }
          }
        }
      }
    }
  }
}
```

### Features

- Per-group and per-topic configuration
- Custom slash commands with validation
- Inline buttons (scope: `off`, `dm`, `group`, `all`, `allowlist`)
- Webhook mode (with webhook URL, secret, and path)
- Stream mode (`off`, `partial`, `block`)
- Reaction notifications and reaction levels
- Link preview control
- Network configuration (auto-select family)
- Proxy support

---

## Slack

### Setup Requirements

- Bot token (`xoxb-...`)
- App token (`xapp-...`) for Socket Mode
- Signing secret (for HTTP mode)

### Key Configuration

```json
{
  "connectors": {
    "slack": {
      "enabled": true,
      "mode": "socket",
      "botToken": "xoxb-...",
      "appToken": "xapp-...",
      "groupPolicy": "allowlist",
      "channels": {
        "CHANNEL_ID": {
          "allow": true,
          "requireMention": true
        }
      }
    }
  }
}
```

### Features

- Socket Mode or HTTP mode
- Per-channel configuration with allowlists
- Thread-aware history (thread or channel scope)
- User token support (read-only by default)
- Slash command integration (with ephemeral response option)
- Reply-to mode by chat type (direct, group, channel)
- DM group channels support
- Actions: reactions, messages, pins, search, permissions, member info, channel info, emoji list

---

## WhatsApp

### Setup Requirements

- Baileys: No external credentials needed (QR code scan)
- Cloud API: WhatsApp Business API access token and phone number ID

### Key Configuration

```json
{
  "connectors": {
    "whatsapp": {
      "accounts": {
        "default": {
          "enabled": true,
          "authDir": "./auth/whatsapp"
        }
      },
      "dmPolicy": "pairing",
      "sendReadReceipts": true,
      "debounceMs": 0
    }
  }
}
```

### Features

- Per-account auth directory for Baileys session persistence
- Self-chat mode for testing
- Message prefix for outgoing messages
- Acknowledgment reactions (configurable emoji, DM/group behavior)
- Debounce for rapid messages
- Per-group configuration with mention requirements
- Actions: reactions, send message, polls

See the [WhatsApp Integration Guide](/guides/whatsapp) for detailed setup instructions.

---

## Signal

### Setup Requirements

- signal-cli running in HTTP/JSON-RPC mode
- Registered Signal account

### Key Configuration

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

### Features

- HTTP URL or host/port configuration
- CLI path with optional auto-start
- Startup timeout configuration (1-120 seconds)
- Receive mode (`on-start` or `manual`)
- Attachment and story handling options
- Read receipt support
- Reaction notifications and levels

---

## iMessage

### Setup Requirements

- macOS with iMessage configured
- CLI tool for iMessage access (e.g., `imessage-exporter`)

### Key Configuration

```json
{
  "connectors": {
    "imessage": {
      "enabled": true,
      "service": "auto",
      "dmPolicy": "pairing"
    }
  }
}
```

### Features

- Service selection: `imessage`, `sms`, or `auto`
- CLI path and database path configuration
- Remote host support
- Region configuration
- Attachment inclusion toggle
- Per-group mention and tool configuration

---

## BlueBubbles

### Setup Requirements

- BlueBubbles server running
- Server URL and password

### Key Configuration

```json
{
  "connectors": {
    "bluebubbles": {
      "enabled": true,
      "serverUrl": "http://localhost:1234",
      "password": "your-password",
      "dmPolicy": "pairing"
    }
  }
}
```

### Features

- iMessage bridge via BlueBubbles server
- Webhook path configuration
- Read receipt support
- Actions: reactions, edit, unsend, reply, send with effect, group management (rename, set icon, add/remove participants, leave), send attachment

---

## Microsoft Teams

### Setup Requirements

- Azure Bot registration (App ID and App Password)
- Tenant ID

### Key Configuration

```json
{
  "connectors": {
    "msteams": {
      "enabled": true,
      "appId": "APP_ID",
      "appPassword": "APP_PASSWORD",
      "tenantId": "TENANT_ID",
      "dmPolicy": "pairing"
    }
  }
}
```

### Features

- Per-team and per-channel configuration
- Reply style configuration
- Webhook port and path settings
- Media host allowlists (for downloading and auth)
- SharePoint site ID for file uploads in group chats
- Up to 100MB media support (OneDrive upload)

---

## Google Chat

### Setup Requirements

- Google Cloud service account with Chat API access
- Service account JSON key file or inline config

### Key Configuration

```json
{
  "connectors": {
    "googlechat": {
      "enabled": true,
      "serviceAccountFile": "./service-account.json",
      "audienceType": "project-number",
      "audience": "123456789",
      "webhookPath": "/google-chat"
    }
  }
}
```

### Features

- Service account auth (file path or inline JSON)
- Audience type configuration (`app-url` or `project-number`)
- Webhook path and URL configuration
- Per-group configuration with mention requirements
- Typing indicator modes (`none`, `message`, `reaction`)
- DM policy with group chat support

---

## Twitter

### Setup Requirements

- Twitter API v2 credentials (API key, API secret key, access token, access token secret)

### Key Configuration

```json
{
  "connectors": {
    "twitter": {
      "enabled": true,
      "apiKey": "...",
      "apiSecretKey": "...",
      "accessToken": "...",
      "accessTokenSecret": "...",
      "postEnable": true,
      "postIntervalMin": 90,
      "postIntervalMax": 180
    }
  }
}
```

### Features

- Automated posting with configurable intervals and variance
- Post immediately option
- Search and mention monitoring
- Timeline algorithm selection (`weighted` or `latest`)
- Auto-respond to mentions
- Action processing toggle
- Dry run mode for testing
- Configurable max tweet length (default: 4000)

---

## Connector Lifecycle

The typical connector lifecycle follows this pattern:

1. **Install plugin** -- Connector plugins are installed as `@elizaos/plugin-{platform}` packages
2. **Configure** -- Add the platform configuration to the `connectors` section of `milady.json`
3. **Enable** -- Set `enabled: true` in the connector config
4. **Authenticate** -- Provide credentials (tokens, keys) or complete auth flow (QR code scan)
5. **Run** -- The runtime starts the connector, establishes connections, and begins message handling
6. **Monitor** -- Status probes verify connectivity; reconnection happens automatically on failures

---

## Multi-Account Support

Most connectors support multiple accounts via the `accounts` key. Each account has its own configuration, authentication, and session state:

```json
{
  "connectors": {
    "telegram": {
      "dmPolicy": "pairing",
      "accounts": {
        "main-bot": {
          "enabled": true,
          "botToken": "TOKEN_1"
        },
        "support-bot": {
          "enabled": true,
          "botToken": "TOKEN_2",
          "dmPolicy": "open",
          "allowFrom": ["*"]
        }
      }
    }
  }
}
```

Account-level settings override the base connector settings. Each account runs independently with its own connection, credentials, and session state.

---

## Session Management

All connectors manage sessions that track conversation state across platforms:

- **DM sessions** -- one session per user, governed by `dmPolicy`
- **Group sessions** -- one session per group/channel, governed by `groupPolicy`
- **History** -- configurable message history depth per session type (`historyLimit`, `dmHistoryLimit`)
- **DM configurations** -- per-user DM overrides via the `dms` record

The `dmPolicy` options are:

| Policy | Behavior |
|--------|----------|
| `pairing` | Default. Agent responds after a pairing/onboarding flow. |
| `open` | Agent responds to all DMs. Requires `allowFrom: ["*"]`. |
| `closed` | Agent does not respond to DMs. |

---

## Connector Operations Runbook

### Setup Checklist

1. Configure connector credentials under `connectors.<name>`.
2. Enable connector plugin loading via connector config or plugin allow-list.
3. Validate DM/group policy values and allow-lists before enabling `open` policies.
4. For each connector, confirm the platform bot/app is created and tokens are valid (see platform-specific notes below).
5. Test connectivity in `pairing` mode before switching to `open` mode.

### Failure Modes

**General connector failures:**

- Connector plugin not loading:
  Check connector ID mapping in `src/config/plugin-auto-enable.ts`, plugin availability, and `plugins.entries` overrides. The auto-enable layer maps connector config keys to plugin package names — a mismatch means the plugin is silently skipped.
- Auth succeeds but no messages arrive:
  Check platform webhook/socket settings and policy gates (`dmPolicy`, `groupPolicy`). For webhook-based connectors, confirm the callback URL is publicly reachable.
- Misrouted connector secrets:
  Confirm expected env vars are populated from config and not overwritten by stale env. The config schema merges env vars with file config — env takes precedence.

**Discord:**

- Bot token rejected (`401 Unauthorized`):
  Regenerate the bot token in the Discord Developer Portal. Tokens are invalidated if the bot's password is reset or the token is leaked and auto-revoked.
- Bot is online but does not respond in channels:
  Check that the bot has `MESSAGE_CONTENT` intent enabled in the Developer Portal and the `groupPolicy` is not `closed`. Confirm the bot has `Send Messages` permission in the target channel.
- Rate limited (`429 Too Many Requests`):
  Discord rate limits are per-route. The connector should back off automatically. If persistent, reduce message frequency or check for message loops (bot replying to itself).

**Telegram:**

- Webhook not receiving updates:
  Telegram requires HTTPS with a valid certificate. Use `getWebhookInfo` to check status. If using long polling, confirm no other process is polling the same bot token (Telegram allows only one consumer).
- Bot token expired or revoked:
  Re-create the bot via BotFather and update `TELEGRAM_BOT_TOKEN`. Telegram tokens do not expire automatically but can be revoked.
- Messages delayed or missing:
  Telegram buffers updates for up to 24 hours if the webhook is unreachable. After restoring connectivity, a burst of backlogged messages may arrive.

**Slack:**

- `invalid_auth` or `token_revoked`:
  Reinstall the Slack app to the workspace. Bot tokens are revoked when the app is uninstalled or workspace permissions change.
- Events not arriving:
  Confirm the Events API subscription includes the required event types (`message.im`, `message.channels`). Check the Slack app's Request URL is verified and receiving challenge responses.

**WhatsApp:**

- QR pairing fails or session drops:
  WhatsApp Web sessions expire after extended inactivity. Re-pair by scanning a new QR code via `POST /api/whatsapp/pair`. The `whatsapp-pairing` service manages session state.
- Messages not delivered:
  WhatsApp enforces strict anti-spam policies. If the number is flagged, messages are silently dropped. Confirm the business account is in good standing.
- Multi-account auth directory issues:
  Each WhatsApp account requires its own `authDir` (Baileys multi-file auth state). If multiple accounts share a directory, sessions corrupt each other.

**Signal:**

- Signal CLI not found:
  The connector requires `signal-cli` in PATH or a `cliPath` configured. For HTTP mode, set `httpUrl` or `httpHost`/`httpPort` to point to a running signal-cli REST API.
- Account registration fails:
  Signal requires a verified phone number. Use `signal-cli register` or provide a pre-registered account number via `connectors.signal.account`.
- Multi-account configuration:
  Signal supports multiple accounts via the `accounts` map. Each account must have `account`, `httpUrl`, or `cliPath` set and must not be `enabled: false`.

**Twitter:**

- API key rejected:
  Confirm `connectors.twitter.apiKey` is a valid Twitter/X API key. Free-tier keys have strict rate limits.
- Tweet fetch failures:
  The FxTwitter API (`api.fxtwitter.com`) is used for tweet verification. If rate-limited, verification requests fail silently.

**BlueBubbles:**

- Connection refused:
  Requires `serverUrl` pointing to a running BlueBubbles server AND the server `password`. Confirm both are set under `connectors.bluebubbles`.
- macOS-only:
  BlueBubbles is a macOS iMessage bridge. It will not work on Linux or Windows.

**iMessage (direct):**

- CLI path not found:
  Requires `cliPath` pointing to a valid iMessage CLI tool. macOS-only — Accessibility permissions are required.

**Farcaster:**

- API key invalid:
  Confirm `connectors.farcaster.apiKey` is set. Farcaster hub access requires a valid API key.

**Lens:**

- API key invalid:
  Confirm `connectors.lens.apiKey` is set and the Lens API is reachable.

**MS Teams:**

- Bot token rejected:
  Teams bots require Azure AD registration. Confirm the bot token is valid and the app has the required permissions in the Azure portal.

**Mattermost:**

- Token authentication fails:
  Confirm `connectors.mattermost.token` is a valid personal access token or bot token. Check that the Mattermost server URL is configured.

**Google Chat / Feishu:**

- Token authentication fails:
  Both require service account or bot tokens. Confirm the token is valid and has the required chat API scopes.

**Matrix:**

- Homeserver connection fails:
  Confirm the Matrix homeserver URL is reachable and the access token under `connectors.matrix.token` is valid.

**Nostr:**

- Relay connection fails:
  Nostr connectors communicate via relays. Confirm relay URLs are configured and reachable. API key authentication varies by relay.

**Retake / Blooio:**

- Authentication fails:
  Retake uses `accessToken` or `enabled: true` for configuration detection. Blooio uses `apiKey`. Confirm credentials are set under the respective connector config.

### Recovery Procedures

1. **Stale connector session:** Restart the agent. Connectors re-initialize their platform connections on startup. For WebSocket-based connectors (Discord, Slack), this forces a fresh handshake.
2. **Token rotation:** Update the token in `milady.json` under `connectors.<name>` and restart. Do not edit env vars in a running process — the config is read at startup.
3. **Rate limit recovery:** The agent automatically backs off on 429 responses. If the connector is fully blocked, wait for the rate limit window to expire (typically 1–60 seconds for Discord, varies by platform) and restart.

### Verification Commands

```bash
# Connector auto-enable and runtime loading
bunx vitest run src/config/plugin-auto-enable.test.ts src/runtime/eliza.test.ts

# Platform-specific connector tests
bunx vitest run src/connectors/discord-connector.test.ts

# Connector e2e tests
bunx vitest run --config vitest.e2e.config.ts test/discord-connector.e2e.test.ts test/signal-connector.e2e.test.ts

# WhatsApp pairing
bunx vitest run src/services/__tests__/whatsapp-pairing.test.ts src/api/__tests__/whatsapp-routes.test.ts

bun run typecheck
```
