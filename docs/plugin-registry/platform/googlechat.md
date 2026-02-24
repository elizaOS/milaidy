---
title: "Google Chat Plugin"
sidebarTitle: "Google Chat"
description: "Google Chat connector for Milady — service account integration with webhook delivery, typing indicators, and per-space configuration."
---

The Google Chat plugin connects Milady agents to Google Chat via a Google Cloud service account, supporting spaces, DMs, and group conversations with webhook-based event delivery.

**Package:** `@elizaos/plugin-google-chat`

## Installation

```bash
milady plugins install googlechat
```

## Setup

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the **Google Chat API**

### 2. Create a Service Account

1. Navigate to **IAM & Admin → Service Accounts**
2. Create a new service account
3. Grant the **Chat Bot** role
4. Create a JSON key and download it

### 3. Configure the Chat App

1. Go to the [Google Chat API configuration](https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat)
2. Set the **App URL** to your webhook endpoint:
   ```
   https://your-milady-host/google-chat
   ```
3. Note the **Project Number** for audience configuration

### 4. Configure Milady

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

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `serviceAccountFile` | Yes* | Path to service account JSON key file |
| `serviceAccountJson` | Yes* | Inline service account JSON (alternative to file) |
| `audienceType` | Yes | `app-url` or `project-number` |
| `audience` | Yes | App URL or project number (matches `audienceType`) |
| `webhookPath` | No | Webhook endpoint path (default: `/google-chat`) |
| `webhookUrl` | No | Full webhook URL override |
| `typingIndicator` | No | `none`, `message`, or `reaction` (default: `none`) |
| `dmPolicy` | No | DM handling policy |

\* Provide either `serviceAccountFile` or `serviceAccountJson`.

## Features

- **Service account auth** — Authenticate via JSON key file or inline JSON
- **Webhook delivery** — Receive events via configurable webhook endpoint
- **Typing indicators** — Configurable indicator modes (none, message, reaction)
- **Per-space configuration** — Override mention requirements and tools per space
- **DM support** — Private conversation handling with configurable policy
- **Group chats** — Respond in spaces with optional mention requirements
- **Multi-account** — Supports multiple accounts via `accounts` map

## Auto-Enable

The plugin auto-enables when the `connectors.googlechat` block contains a `serviceAccountFile` or `serviceAccountJson`:

```json
{
  "connectors": {
    "googlechat": {
      "serviceAccountFile": "./service-account.json",
      "audienceType": "project-number",
      "audience": "123456789"
    }
  }
}
```

## Troubleshooting

### Webhook Not Receiving Events

Ensure the webhook URL is publicly accessible and matches the URL configured in the Google Chat API console.

### Authentication Failed

Verify the service account JSON key is valid and the service account has the Chat Bot role assigned.

## Related

- [Slack Plugin](/plugin-registry/platform/slack) — Slack workspace integration
- [MS Teams Plugin](/plugin-registry/platform/msteams) — Microsoft Teams integration
- [Connectors Guide](/guides/connectors) — General connector documentation
