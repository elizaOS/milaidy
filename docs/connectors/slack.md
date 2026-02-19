---
title: Slack Connector
sidebarTitle: Slack
description: Connect your Milaidy agent to Slack workspaces with channel messaging, thread support, slash commands, and event handling.
---

Connect your Milaidy agent to Slack for workplace messaging and automation.

## Overview

The Slack connector uses the Bolt framework to integrate your agent with Slack workspaces. It supports channel messaging, threads, DMs, slash commands, interactive components, and event subscriptions.

## Prerequisites

- A Slack app created at [api.slack.com](https://api.slack.com/apps)
- Bot token with required scopes
- Event subscriptions configured

## Configuration

Add to your `.env` file:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token    # for socket mode
```

Or configure in your character file:

```json
{
  "connectors": {
    "slack": {
      "enabled": true,
      "channels": ["general", "bot-channel"],
      "respondToMentions": true,
      "respondInThreads": true,
      "socketMode": true
    }
  }
}
```

## Features

### Channel Messages

The agent responds when mentioned in configured channels. It maintains context per channel and per thread.

### Thread Conversations

When a user mentions the agent in a channel, it responds in a thread to keep the main channel clean. Subsequent messages in the thread are handled as a continuous conversation.

### Direct Messages

The agent responds to all DMs without requiring a mention.

### Slash Commands

Register slash commands that map to agent actions:

| Command | Description |
|---------|-------------|
| `/ask <question>` | Ask the agent a question |
| `/status` | Show agent status and uptime |
| `/search <query>` | Search the agent's knowledge base |
| `/action <name>` | Trigger a specific action |

### Interactive Components

Support for buttons, modals, and select menus for rich interactions:

```json
{
  "connectors": {
    "slack": {
      "interactive": {
        "approvalButtons": true,
        "actionMenus": true
      }
    }
  }
}
```

### Event Subscriptions

Subscribe to workspace events:
- `message` — Channel and DM messages
- `app_mention` — Bot mentions
- `reaction_added` — Emoji reactions
- `member_joined_channel` — New member events

## Required Bot Scopes

```
chat:write
channels:history
channels:read
groups:history
groups:read
im:history
im:read
im:write
app_mentions:read
reactions:read
commands
```

## Socket Mode vs HTTP

**Socket Mode** (recommended for development):
- No public URL needed
- Uses WebSocket connection
- Set `socketMode: true`

**HTTP Mode** (recommended for production):
- Requires public URL
- Configure request URL in Slack app settings
- Better for high-traffic workspaces

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot doesn't respond | Check bot token scopes and channel membership |
| Slash commands fail | Verify signing secret and request URL |
| Socket mode disconnects | Check `SLACK_APP_TOKEN` is valid |
| Missing messages | Ensure `channels:history` scope is granted |

## Related

- [Connectors Overview](/guides/connectors) — General connector architecture
- [Custom Actions](/guides/custom-actions) — Create actions for slash commands
- [Hooks](/guides/hooks) — Set up event-driven workflows
