---
title: Agent Export & Import
sidebarTitle: Agent Export & Import
description: Export and import Milaidy agents as encrypted portable archives for migration between machines.
---

# Agent Export & Import

Milaidy provides an encrypted export/import system for migrating agents between machines. The entire agent state — character configuration, memories, knowledge, relationships, and more — is captured in a single password-protected binary file.

## Export

Exporting creates a `.eliza-agent` file containing a complete snapshot of your agent's state.

### What Is Included

The export payload contains:

| Data Type | Description |
|-----------|-------------|
| **Agent record** | Core agent configuration from the database |
| **Character config** | Full character definition — style, topics, adjectives, message examples, post examples, knowledge sources |
| **Entities** | All entities the agent has interacted with |
| **Memories** | Messages, facts, documents, fragments, descriptions, character modifications, and custom memories |
| **Components** | All components attached to entities |
| **Rooms** | Conversation rooms |
| **Participants** | Room membership records (entity ID, room ID, user state) |
| **Relationships** | Entity-to-entity relationships |
| **Worlds** | World definitions |
| **Tasks** | Scheduled and pending tasks |
| **Logs** (optional) | Execution logs — can be large, disabled by default |

The memory tables queried during export are: `messages`, `facts`, `documents`, `fragments`, `descriptions`, `character_modifications`, and `custom`.

### How to Export

#### Via the Dashboard

Navigate to **Settings**, expand the **Advanced** section, and find the **Export/Import** area. Enter a password and click Export.

#### Via the API

```
POST /api/agent/export
Content-Type: application/json

{
  "password": "your-password-here",
  "includeLogs": false
}
```

- **password** (required) — must be at least 4 characters.
- **includeLogs** (optional) — set to `true` to include execution logs. Defaults to `false`.

The response is a binary file with:
- `Content-Type: application/octet-stream`
- `Content-Disposition: attachment; filename="{agentname}-{timestamp}.eliza-agent"`

#### Export Size Estimate

Before downloading, you can get an estimate of the export size:

```
GET /api/agent/export/estimate
```

Returns an object with estimated byte counts for each data category.

## Encryption

The export file uses strong encryption to protect your agent data.

### Key Derivation

- **Algorithm:** PBKDF2-SHA256
- **Iterations:** 600,000 (per OWASP 2024 recommendation)
- **Salt:** 32 bytes, randomly generated per export
- **Key length:** 32 bytes (256 bits)

On import, iteration counts up to 1,200,000 (2x the default) are accepted; anything higher is rejected.

### Encryption

- **Algorithm:** AES-256-GCM
- **Nonce (IV):** 12 bytes, randomly generated per export
- **Authentication tag:** 16 bytes

### Compression

The JSON payload is compressed with **gzip** before encryption.

### File Format

The `.eliza-agent` file is a binary format:

```
Offset  Size     Field
──────  ───────  ─────────────────────────────────
0       15       Magic header: "ELIZA_AGENT_V1\n"
15      4        PBKDF2 iteration count (uint32 big-endian)
19      32       PBKDF2 salt
51      12       AES-256-GCM nonce (IV)
63      16       AES-GCM authentication tag
79      variable Ciphertext (gzip-compressed JSON, encrypted)
```

Total fixed header size: **79 bytes**.

### Security Properties

- **Password-based:** Only someone with the password can decrypt the archive.
- **Authenticated encryption:** AES-GCM ensures both confidentiality and integrity — tampering with any byte of the file will cause decryption to fail.
- **Unique per-export:** Each export generates a fresh random salt and nonce, so exporting the same agent twice with the same password produces different files.
- **Minimum password length:** 4 characters.
- **Maximum decompressed size:** 16 MiB safety cap on import to prevent decompression bombs.

## Import

Importing restores an agent from a `.eliza-agent` archive. The import merges the archived data into the running agent's database.

### How to Import

#### Via the Dashboard

Navigate to **Settings**, expand the **Advanced** section, and find the **Export/Import** area. Select the `.eliza-agent` file, enter the password used during export, and click Import.

#### Via the API

```
POST /api/agent/import
Content-Type: application/octet-stream
```

The request body uses a binary envelope format:

```
[4 bytes: password length (uint32 big-endian)]
[N bytes: password (UTF-8)]
[remaining bytes: .eliza-agent file data]
```

- **Password:** must be at least 4 characters and at most 1,024 bytes.
- **Maximum request size:** 512 MB.

### Import Result

A successful import returns:

```json
{
  "success": true,
  "agentId": "uuid-of-imported-agent",
  "agentName": "Agent Name",
  "counts": {
    "memories": 1234,
    "entities": 56,
    "components": 78,
    "rooms": 12,
    "participants": 34,
    "relationships": 5,
    "worlds": 1,
    "tasks": 8,
    "logs": 0
  }
}
```

### Requirements

- The agent must be **running** before you can export or import. If the agent is stopped, the API returns a 503 error.
- The password must match the one used during export. An incorrect password will fail with an authentication error.

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent/export` | POST | Export agent as encrypted binary file |
| `/api/agent/export/estimate` | GET | Get estimated export size |
| `/api/agent/import` | POST | Import agent from encrypted binary file |
