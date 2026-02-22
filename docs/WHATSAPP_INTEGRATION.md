# WhatsApp Connector Integration Guide

This guide explains how to use the WhatsApp connector in Milady with Baileys (QR code) authentication.

## Overview

As of `@milady/plugin-whatsapp`, the plugin supports two authentication methods:
- **Cloud API**: For business accounts using the WhatsApp Business API
- **Baileys**: For personal accounts using QR code authentication (like WhatsApp Web)

## Quick Start with Baileys (QR Code)

### 1. Configuration

Add the WhatsApp connector to your character configuration file. Each account is defined under the `accounts` key:

```json
{
  "name": "Your Bot Name",
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
      "selfChatMode": false
    }
  }
}
```

### 2. Start Milady

```bash
npm start -- --character=./whatsapp-test.character.json
```

### 3. Scan QR Code

When Milady starts, a QR code will appear in your terminal:

1. Open WhatsApp on your phone
2. Go to **Settings** > **Linked Devices**
3. Tap **Link a Device**
4. Scan the QR code

### 4. Connection Established

Once scanned you'll see:

```
[WhatsApp] ✅ Connected to WhatsApp!
```

Your session is saved in `authDir` and reused on restart — no re-scanning needed.

## Configuration Reference

### Top-Level WhatsApp Config

These fields apply to all accounts:

| Field | Type | Default | Description |
|---|---|---|---|
| `accounts` | object | — | Named account configs (see below) |
| `dmPolicy` | string | `"pairing"` | DM acceptance policy |
| `sendReadReceipts` | boolean | — | Send read receipts |
| `selfChatMode` | boolean | — | Respond to own messages (avoid `true` in production) |
| `messagePrefix` | string | — | Prefix added to all outgoing messages |
| `groupPolicy` | string | `"allowlist"` | Group message policy |
| `historyLimit` | number | — | Max messages to load from history |
| `debounceMs` | number | `0` | Debounce delay before responding |
| `mediaMaxMb` | number | `50` | Max media size in MB |

### Per-Account Config (`accounts.<name>`)

| Field | Type | Description |
|---|---|---|
| `enabled` | boolean | Enable/disable this account |
| `authDir` | string | Directory to store Baileys session files |
| `dmPolicy` | string | Override DM policy for this account |
| `sendReadReceipts` | boolean | Override read receipts for this account |
| `allowFrom` | string[] | Allowlist of phone numbers (required when `dmPolicy: "open"`) |

### Cloud API Config

For the WhatsApp Business API, configure via environment variables:

```bash
WHATSAPP_ACCESS_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token
WHATSAPP_BUSINESS_ACCOUNT_ID=your_account_id
```

## Session Persistence

Baileys saves session state to `authDir`. This includes credentials, encryption keys, and device info. Keep this directory secure:

- Never commit it to version control (`auth/` is in `.gitignore`)
- Back it up if you want to avoid re-scanning on a new machine

## Reconnection

Milady automatically reconnects using saved session files on restart. A new QR code is only needed if:
- The session files are deleted
- Your phone revokes the linked device
- The session expires

## Troubleshooting

### Plugin Not Loading

If the WhatsApp plugin does not start, ensure your config has at least one account defined under `accounts` with `enabled: true` and a valid `authDir`. The auto-enable logic activates the plugin when it detects a configured account.

### QR Code Expires

QR codes have a short TTL. Milady automatically generates a new one if the previous expires. Ensure your phone has internet access when scanning.

### Session Expired

Delete the contents of `authDir` and restart to re-link your device.

### `dmPolicy: "open"` Error

When using `dmPolicy: "open"`, you must also set `allowFrom: ["*"]` in your config, otherwise validation will fail.

## Testing Checklist

From issue [#147](https://github.com/milady-ai/milady/issues/147):

### Setup & Authentication
- [ ] QR code authentication flow
- [ ] Session persistence (`authDir`)
- [ ] Reconnection after restart
- [ ] Error messaging on auth failures

### Message Handling
- [ ] Text message receive/send
- [ ] Long message handling
- [ ] Message formatting

### Platform Features
- [ ] Group messaging
- [ ] Reply quoting
- [ ] Read receipts
- [ ] Typing indicators

### Media
- [ ] Image/voice/document reception
- [ ] Image/document sending

### Error Handling
- [ ] Session expiration
- [ ] Network resilience
- [ ] Rate limit compliance

## Related

- [WhatsApp Plugin Repository](https://github.com/elizaos-plugins/plugin-whatsapp)
- [Baileys Library](https://github.com/WhiskeySockets/Baileys)
- [Issue #147](https://github.com/milady-ai/milady/issues/147)
