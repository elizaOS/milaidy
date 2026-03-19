---
title: "Agents API"
sidebarTitle: "Agents"
description: "REST API endpoints for agent lifecycle, administration, and transfer (export/import)."
---

All agent endpoints require the agent runtime to be initialized. The API server runs on port **2138** by default and all paths are prefixed with `/api/`. When `MILADY_API_TOKEN` is set, include it as a `Bearer` token in the `Authorization` header.

## Endpoints

### POST /api/agent/start

Start the agent and enable autonomous operation. Sets the agent state to `running`, records the start timestamp, and enables the autonomy task so the first tick fires immediately.

**Response**

```json
{
  "ok": true,
  "status": {
    "state": "running",
    "agentName": "Milady",
    "model": "@elizaos/plugin-anthropic",
    "uptime": 0,
    "startedAt": 1718000000000
  }
}
```

---

### POST /api/agent/stop

Stop the agent and disable autonomy. Sets the agent state to `stopped` and clears uptime tracking.

**Response**

```json
{
  "ok": true,
  "status": {
    "state": "stopped",
    "agentName": "Milady"
  }
}
```

---

### POST /api/agent/pause

Pause the agent while keeping uptime intact. Disables autonomy but preserves the `startedAt` timestamp and model info.

**Response**

```json
{
  "ok": true,
  "status": {
    "state": "paused",
    "agentName": "Milady",
    "model": "@elizaos/plugin-anthropic",
    "uptime": 34200000,
    "startedAt": 1718000000000
  }
}
```

---

### POST /api/agent/resume

Resume a paused agent and re-enable autonomy. The first tick fires immediately.

**Response**

```json
{
  "ok": true,
  "status": {
    "state": "running",
    "agentName": "Milady",
    "model": "@elizaos/plugin-anthropic",
    "uptime": 34200000,
    "startedAt": 1718000000000
  }
}
```

---

### POST /api/agent/restart

Restart the agent runtime. Returns `409` if a restart is already in progress and `501` if restart is not supported in the current mode.

**Response**

```json
{
  "ok": true,
  "pendingRestart": false,
  "status": {
    "state": "running",
    "agentName": "Milady",
    "startedAt": 1718000000000
  }
}
```

---

### POST /api/agent/reset

Wipe config, workspace (memory), oauth tokens, and return to onboarding state. Stops the runtime, deletes the `~/.milady/` state directory (with safety checks to prevent deletion of system paths), and resets all server state.

**Response**

```json
{
  "ok": true
}
```

---

### POST /api/agent/export

Export the entire agent as a password-encrypted `.eliza-agent` binary file. The agent must be running. Returns an `application/octet-stream` file download.

**Request**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `password` | string | Yes | Encryption password — minimum 4 characters |
| `includeLogs` | boolean | No | Whether to include log files in the export |

**Response**

Binary file download with `Content-Disposition: attachment; filename="agentname-YYYY-MM-DDTHH-MM-SS.eliza-agent"`.

---

### GET /api/agent/export/estimate

Estimate the export file size before downloading. The agent must be running.

**Response**

```json
{
  "estimatedBytes": 1048576,
  "estimatedMb": 1.0
}
```

---

### POST /api/agent/import

Import an agent from a password-encrypted `.eliza-agent` file. The request body is a binary envelope: `[4 bytes password length (big-endian uint32)][password bytes][file data]`. Maximum import size is 512 MB.

**Request**

Raw binary body — not JSON. The first 4 bytes encode the password length as a big-endian unsigned 32-bit integer, followed by the UTF-8 password, followed by the file data.

**Response**

```json
{
  "ok": true
}
```

## Agent Self-Status

### GET /api/agent/self-status

Returns a comprehensive snapshot of the agent's current capabilities, wallet state, plugin health, and self-awareness summary. Used internally by action handlers to evaluate permissions and by the self-awareness system to compose a unified view of the agent's operational status.

**Response**

```json
{
  "generatedAt": "2026-03-19T10:00:00.000Z",
  "state": "running",
  "agentName": "Milady",
  "model": "claude-sonnet-4-20250514",
  "provider": "anthropic",
  "automationMode": "connectors-only",
  "tradePermissionMode": "user-sign-only",
  "shellEnabled": true,
  "wallet": {
    "hasWallet": true,
    "hasEvm": true,
    "hasSolana": false,
    "evmAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "evmAddressShort": "0xd8dA...6045",
    "solanaAddress": null,
    "solanaAddressShort": null,
    "localSignerAvailable": true,
    "managedBscRpcReady": true
  },
  "plugins": {
    "totalActive": 12,
    "active": ["@elizaos/plugin-anthropic", "..."],
    "aiProviders": ["@elizaos/plugin-anthropic"],
    "connectors": ["@elizaos/plugin-discord"]
  },
  "capabilities": {
    "canTrade": true,
    "canLocalTrade": true,
    "canAutoTrade": false,
    "canUseBrowser": false,
    "canUseComputer": false,
    "canRunTerminal": true,
    "canInstallPlugins": true,
    "canConfigurePlugins": true,
    "canConfigureConnectors": true
  },
  "registrySummary": "Agent is running with 12 plugins..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `generatedAt` | string | ISO 8601 timestamp of when the snapshot was generated |
| `state` | string | Current agent state (`running`, `stopped`, `paused`, `error`) |
| `agentName` | string | Agent display name |
| `model` | string \| null | Active model identifier |
| `provider` | string \| null | AI provider label derived from model |
| `automationMode` | string | `"connectors-only"` or `"full"` |
| `tradePermissionMode` | string | Trade permission level (`user-sign-only`, `local-key`, etc.) |
| `shellEnabled` | boolean | Whether shell access is enabled |
| `wallet` | object | Wallet state summary |
| `plugins` | object | Active plugins grouped by category |
| `capabilities` | object | Boolean capability flags for trade, browser, terminal, etc. |
| `registrySummary` | string \| null | Composed self-awareness summary from the awareness registry (omitted when unavailable) |

---

## Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_REQUEST` | Request body is malformed or missing required fields |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication token |
| 404 | `NOT_FOUND` | Requested resource does not exist |
| 409 | `STATE_CONFLICT` | Agent is in an invalid state for this operation |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 500 | `AGENT_NOT_FOUND` | Agent runtime not found or not initialized |
