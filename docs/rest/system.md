---
title: "System API"
sidebarTitle: "System"
description: "REST API endpoints for system status, runtime introspection, provider switching, process restart, configuration management, and TTS proxy."
---

The system API covers core server operations that don't belong to a specific domain: health checks, runtime debugging, AI provider switching, process restart, configuration CRUD, and the ElevenLabs TTS proxy.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Agent status and health check |
| GET | `/api/health` | Structured subsystem health check |
| GET | `/api/runtime` | Deep runtime introspection |
| POST | `/api/provider/switch` | Switch the active AI provider |
| POST | `/api/restart` | Restart the server process |
| GET | `/api/config` | Get the full configuration (redacted) |
| GET | `/api/config/schema` | Get the configuration JSON schema |
| PUT | `/api/config` | Update configuration |
| POST | `/api/tts/elevenlabs` | ElevenLabs text-to-speech proxy |
| POST | `/api/terminal/run` | Execute a shell command |
| POST | `/api/ingest/share` | Submit shared content for ingestion |
| GET | `/api/ingest/share` | Retrieve the share ingest queue |

---

### GET /api/status

Returns the agent's current state, name, model, uptime, cloud connection status, and whether a restart is pending.

**Response**

```json
{
  "state": "running",
  "agentName": "Milady",
  "model": "@elizaos/plugin-anthropic",
  "uptime": 3600000,
  "startup": {
    "phase": "ready",
    "attempt": 1
  },
  "cloud": {
    "connectionStatus": "disconnected",
    "activeAgentId": null
  },
  "pendingRestart": false,
  "pendingRestartReasons": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `state` | string | `not_started`, `starting`, `running`, `paused`, `stopped`, `restarting`, or `error` |
| `agentName` | string | Current agent display name |
| `model` | string\|undefined | Active model/plugin identifier |
| `uptime` | number\|undefined | Milliseconds since the agent started |
| `startup` | object | Startup diagnostics with `phase`, `attempt`, and optional error fields |
| `pendingRestart` | boolean | Whether configuration changes require a restart |
| `pendingRestartReasons` | string[] | Descriptions of what changed |

---

### GET /api/health

Structured health check endpoint that returns the status of each subsystem. The `ready` field indicates whether the agent has finished starting and is available to serve requests.

**Response**

```json
{
  "ready": true,
  "runtime": "ok",
  "database": "ok",
  "plugins": {
    "loaded": 12,
    "failed": 0
  },
  "coordinator": "ok",
  "connectors": {
    "discord": "connected",
    "telegram": "configured"
  },
  "uptime": 3600,
  "agentState": "running",
  "startup": {
    "phase": "ready",
    "attempt": 1
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ready` | boolean | `false` while agent state is `starting` or `restarting`, `true` otherwise |
| `runtime` | string | `"ok"` if the runtime is initialized, `"not_initialized"` otherwise |
| `database` | string | `"ok"` if the runtime is initialized, `"unknown"` otherwise |
| `plugins.loaded` | number | Count of enabled plugins |
| `plugins.failed` | number | Count of plugins that failed to load |
| `coordinator` | string | `"ok"` if the swarm coordinator service is available, `"not_wired"` otherwise |
| `connectors` | object | Map of connector name to status string |
| `uptime` | number | Seconds since the agent started |
| `agentState` | string | Current agent state (`not_started`, `starting`, `running`, `paused`, `stopped`, `restarting`, `error`) |
| `startup` | object | Startup diagnostics with `phase`, `attempt`, and optional `lastError`, `lastErrorAt`, `nextRetryAt` fields |

---

### GET /api/runtime

Deep runtime introspection endpoint for advanced debugging. Returns detailed information about plugins, actions, providers, evaluators, and services registered in the runtime.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `depth` | number | 3 | Max object nesting depth |
| `maxArrayLength` | number | 20 | Max array elements to include |
| `maxObjectEntries` | number | 50 | Max object entries to include |
| `maxStringLength` | number | 500 | Max string truncation length |

**Response**

```json
{
  "runtimeAvailable": true,
  "generatedAt": 1718000000000,
  "settings": { "maxDepth": 3, "..." : "..." },
  "meta": {
    "agentId": "uuid",
    "agentState": "running",
    "agentName": "Milady",
    "model": "@elizaos/plugin-anthropic",
    "pluginCount": 12,
    "actionCount": 45,
    "providerCount": 8,
    "evaluatorCount": 3,
    "serviceTypeCount": 6,
    "serviceCount": 10
  },
  "order": {
    "plugins": ["@elizaos/plugin-trust", "..."],
    "actions": ["CHAT", "..."],
    "providers": ["..."],
    "evaluators": ["..."],
    "services": { "MODEL": ["..."] }
  },
  "sections": {
    "runtime": { "..." : "..." },
    "plugins": [ "..." ],
    "actions": [ "..." ],
    "providers": [ "..." ],
    "evaluators": [ "..." ],
    "services": { "..." : "..." }
  }
}
```

---

### POST /api/provider/switch

Atomically switch the active AI provider. Clears competing credentials and env vars, sets the new provider key, and triggers a restart.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string | Yes | Provider ID |
| `apiKey` | string | Conditional | Required for direct API key providers (see below). Max 512 characters. |

Valid providers: `elizacloud`, `pi-ai`, `openai-codex`, `openai-subscription`, `anthropic-subscription`, `openai`, `anthropic`, `deepseek`, `google`, `groq`, `xai`, `openrouter`.

The `apiKey` field is required for direct API key providers: `openai`, `anthropic`, `deepseek`, `google`, `groq`, `xai`, and `openrouter`. It is optional for managed providers (`elizacloud`, `pi-ai`, `openai-codex`, `openai-subscription`, `anthropic-subscription`).

When switching to `elizacloud`, cloud inference is enabled and `cloud.services.inference` is set to `true`. When switching away from `elizacloud` to any other provider, cloud inference is disabled but the cloud connection remains active for other services (RPC, media, TTS, embeddings). See [granular cloud service toggles](/guides/cloud#granular-cloud-service-toggles) for details.

**Response**

```json
{
  "ok": true,
  "provider": "anthropic",
  "requiresRestart": true
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing or invalid provider |
| 400 | API key is required for this provider |
| 400 | API key is too long (max 512 characters) |
| 409 | Provider switch already in progress |

---

### POST /api/restart

Restart the server process. Sets the agent state to `restarting`, broadcasts a status update, responds immediately, and exits after a 1-second delay.

**Response**

```json
{
  "ok": true,
  "message": "Restarting...",
  "restarting": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Always `true` |
| `message` | string | Human-readable status message |
| `restarting` | boolean | Confirms the server is entering a restart cycle |

---

### GET /api/config

Returns the full Milady configuration with secret values redacted.

**Response**

The full config object — structure varies based on what has been configured. Secrets are replaced with redacted placeholders.

---

### GET /api/config/schema

Returns the JSON schema for the Milady configuration file. Useful for building dynamic configuration UIs.

**Response**

A JSON Schema object describing all config keys, types, and defaults.

---

### PUT /api/config

Update one or more configuration keys. Uses a deep-merge strategy — provided keys are merged recursively without wiping sibling keys. Protected against prototype pollution.

**Request Body**

Partial config object. Only provided keys are updated:

```json
{
  "ui": {
    "theme": "haxor"
  },
  "models": {
    "small": "openai/gpt-5-mini"
  }
}
```

**Response**

```json
{
  "ok": true
}
```

---

### POST /api/tts/elevenlabs

Proxy endpoint for ElevenLabs text-to-speech. Forwards the request to the ElevenLabs API and returns the audio stream. Resolves the API key from the request body, config, or `ELEVENLABS_API_KEY` env var.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to synthesize |
| `voiceId` | string | No | ElevenLabs voice ID (default: `EXAVITQu4vr4xnSDxMaL`) |
| `modelId` | string | No | Model ID (default: `eleven_flash_v2_5`) |
| `outputFormat` | string | No | Output format (default: `mp3_22050_32`) |
| `apiKey` | string | No | Override API key |
| `apply_text_normalization` | string | No | `auto`, `on`, or `off` |
| `voice_settings` | object | No | `{ stability?, similarity_boost?, speed? }` |

**Response**

Binary audio stream with `Content-Type: audio/mpeg`.

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing text or API key not available |
| 429 | ElevenLabs rate limit |
| 502 | ElevenLabs request failed |

---

### POST /api/terminal/run

Execute a shell command on the server and stream output via WebSocket. Responds immediately — output is broadcast as `terminal-output` WebSocket events.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | Yes | Shell command to execute |
| `clientId` | string | Conditional | WebSocket client ID to receive output. Required if not provided via header. |
| `terminalToken` | string | Conditional | Required when `MILADY_TERMINAL_RUN_TOKEN` is configured |

The `clientId` can alternatively be sent via the `X-Milady-Client-Id` header.

**Constraints**

- Max 4096 characters
- Single line only (no newlines or control characters)
- Concurrent runs are rate-limited

**Response**

```json
{
  "ok": true
}
```

Output is streamed via WebSocket:

```json
{ "type": "terminal-output", "runId": "run-...", "event": "stdout", "data": "..." }
{ "type": "terminal-output", "runId": "run-...", "event": "exit", "code": 0 }
```

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing client ID (provide `clientId` in body or `X-Milady-Client-Id` header) |
| 400 | Missing or empty command |
| 403 | Shell access is disabled |
| 403 | Terminal authorization required (invalid `terminalToken`) |
| 429 | Too many concurrent terminal runs |

---

### POST /api/ingest/share

Submit external content (URLs, text, articles) to the agent's share ingest queue for processing.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | string | No | Content source identifier |
| `title` | string | No | Content title |
| `url` | string | No | Content URL |
| `text` | string | No | Content body text |

**Response**

```json
{
  "ok": true,
  "item": {
    "id": "uuid",
    "source": "chrome-extension",
    "title": "Article Title",
    "url": "https://example.com/article",
    "suggestedPrompt": "What do you think about \"Article Title\"?",
    "receivedAt": 1718000000000
  }
}
```

---

### GET /api/ingest/share

Retrieve the share ingest queue.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `consume` | string | Set to `1` to consume (clear) the queue after reading |

**Response**

```json
{
  "items": [
    {
      "id": "uuid",
      "source": "chrome-extension",
      "title": "...",
      "receivedAt": 1718000000000
    }
  ]
}
```
