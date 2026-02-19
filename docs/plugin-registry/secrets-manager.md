---
title: "Secrets Manager Plugin"
sidebarTitle: "Secrets Manager"
description: "Secure secret storage, environment variable mapping, runtime secret injection, and encryption for Milaidy agents."
---

The Secrets Manager plugin provides secure, encrypted storage for API keys and other sensitive configuration values. It is loaded early in the startup sequence — before any connector or provider plugins — so secrets are available at plugin initialization time.

**Package:** `@elizaos/plugin-secrets-manager` (core plugin — always loaded)

## Overview

Secrets stored through the Secrets Manager are:

- Encrypted at rest using AES-256-GCM
- Decrypted only at runtime when requested by an authorized plugin
- Audited — all secret access is logged (key name only, never the value)
- Scoped per agent — secrets do not leak across agents

## Setting Secrets

### Via the Admin Panel

Navigate to **Agent → Settings → Secrets** and add key-value pairs.

### Via the CLI

```bash
milaidy config set secrets.OPENAI_API_KEY sk-...
```

### Via Configuration File

Secrets can be included in `milaidy.json` (not recommended for production — use environment variables instead):

```json
{
  "secrets": {
    "OPENAI_API_KEY": "sk-...",
    "TELEGRAM_BOT_TOKEN": "123456:ABC..."
  }
}
```

### Via Environment Variables

Any environment variable present at startup is automatically available as a secret. Plugins access them through `runtime.getSetting()` which checks both stored secrets and `process.env`.

```bash
OPENAI_API_KEY=sk-... TELEGRAM_BOT_TOKEN=123456:ABC... milaidy start
```

## Accessing Secrets in Plugins

Plugins should always use `runtime.getSetting()` rather than reading `process.env` directly. The Secrets Manager ensures the correct value is returned regardless of storage backend.

```typescript
import type { Plugin } from "@elizaos/core";

const myPlugin: Plugin = {
  name: "my-plugin",
  description: "Plugin demonstrating secret access",

  init: async (_config, runtime) => {
    const apiKey = runtime.getSetting("MY_API_KEY");

    if (!apiKey) {
      throw new Error("[my-plugin] MY_API_KEY is required but not set");
    }

    runtime.logger?.info("[my-plugin] API key loaded (length: " + apiKey.length + ")");
  },
};
```

## Secret Resolution Order

When `runtime.getSetting("KEY")` is called, the Secrets Manager resolves in this order:

1. Agent-specific secrets stored in the database (highest priority)
2. Character file `settings.secrets` object
3. `process.env` environment variables
4. Global secrets from `~/.milaidy/secrets`

## Environment Variable Mapping

The Secrets Manager maps environment variable names to plugin requirements. When a plugin declares `requiredSecrets` in its manifest, the admin panel prompts for those values and stores them securely.

```json
{
  "requiredSecrets": ["OPENAI_API_KEY"],
  "optionalSecrets": ["OPENAI_ORG_ID"]
}
```

## Encryption

Secrets at rest are encrypted using:

- Algorithm: AES-256-GCM
- Key derivation: PBKDF2-SHA256
- Salt: Per-agent random salt stored separately from the encrypted values

The encryption key is derived from a master key that is never stored on disk.

## Audit Logging

All secret access is logged at the `debug` level:

```
[secrets-manager] Secret accessed: OPENAI_API_KEY (by: plugin-openai)
```

The actual secret value is never logged.

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `secrets.encryption` | Enable encryption at rest | `true` |
| `secrets.auditLog` | Enable access audit logging | `true` |

## Related

- [SQL Plugin](/plugin-registry/sql) — Database backend for encrypted secret storage
- [Configuration Guide](/configuration) — Full configuration reference
- [Plugin Architecture](/plugins/architecture) — How secrets are injected at startup
