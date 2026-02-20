---
title: "Cloud API"
sidebarTitle: "Cloud"
description: "REST API endpoints for Eliza Cloud authentication, connection status, credit balance, and cloud agent management."
---

The cloud API connects the local Milaidy agent to Eliza Cloud for cloud-hosted inference, credits, and remote agent management. Login uses a browser-based OAuth-style flow with polling for session completion.

## Endpoints

### POST /api/cloud/login

Start the Eliza Cloud login flow. Creates a session on the cloud and returns a browser URL for the user to authenticate. Poll `GET /api/cloud/login/status` with the returned `sessionId` to check completion.

**Response**

```json
{
  "ok": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "browserUrl": "https://www.elizacloud.ai/auth/cli-login?session=550e8400-e29b-41d4-a716-446655440000"
}
```

---

### GET /api/cloud/login/status

Poll the status of a login session. When status is `"authenticated"`, the API key is automatically saved to config and applied to the process environment.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | Yes | Session ID returned by `POST /api/cloud/login` |

**Response (pending)**

```json
{
  "status": "pending"
}
```

**Response (authenticated)**

```json
{
  "status": "authenticated",
  "keyPrefix": "eca-..."
}
```

**Possible status values**

| Status | Description |
|--------|-------------|
| `"pending"` | User has not yet completed authentication |
| `"authenticated"` | Login successful — API key has been saved |
| `"expired"` | Session expired or not found |
| `"error"` | An error occurred communicating with Eliza Cloud |

---

### GET /api/cloud/status

Get cloud connection status, authentication state, and billing URL.

**Response (connected)**

```json
{
  "connected": true,
  "enabled": true,
  "hasApiKey": true,
  "userId": "user-123",
  "organizationId": "org-456",
  "topUpUrl": "https://www.elizacloud.ai/dashboard/settings?tab=billing"
}
```

**Response (not connected)**

```json
{
  "connected": false,
  "enabled": false,
  "hasApiKey": false,
  "reason": "not_authenticated"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `connected` | boolean | Whether the cloud auth service is authenticated |
| `enabled` | boolean | Whether cloud mode is enabled in config |
| `hasApiKey` | boolean | Whether an API key is present in config |
| `userId` | string | Authenticated user ID (when connected) |
| `organizationId` | string | Authenticated organization ID (when connected) |
| `topUpUrl` | string | URL to the cloud billing page |
| `reason` | string | Reason for disconnected state |

---

### GET /api/cloud/credits

Get the cloud credit balance. Returns `null` balance when not connected.

**Response**

```json
{
  "connected": true,
  "balance": 15.50,
  "low": false,
  "critical": false,
  "topUpUrl": "https://www.elizacloud.ai/dashboard/settings?tab=billing"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `balance` | number \| null | Credit balance in dollars |
| `low` | boolean | `true` when balance is below $2.00 |
| `critical` | boolean | `true` when balance is below $0.50 |

---

### POST /api/cloud/disconnect

Disconnect from Eliza Cloud. Clears the API key from config, process environment, and agent database record.

**Response**

```json
{
  "ok": true,
  "status": "disconnected"
}
```

---

### GET /api/cloud/agents

List cloud agents. Requires an active cloud connection.

**Response**

```json
{
  "ok": true,
  "agents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "My Cloud Agent",
      "status": "running",
      "createdAt": "2024-06-10T12:00:00Z"
    }
  ]
}
```

---

### POST /api/cloud/agents

Create a new cloud agent. Requires an active cloud connection.

**Request**

```json
{
  "agentName": "My Cloud Agent",
  "agentConfig": { "character": "milady" },
  "environmentVars": { "OPENAI_API_KEY": "sk-..." }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agentName` | string | Yes | Display name for the cloud agent |
| `agentConfig` | object | No | Agent configuration object |
| `environmentVars` | object | No | Environment variables to set on the cloud agent |

**Response (201 Created)**

```json
{
  "ok": true,
  "agent": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Cloud Agent",
    "status": "provisioning"
  }
}
```

---

### POST /api/cloud/agents/:id/provision

Provision a cloud agent — connect the local agent to the cloud agent instance.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Cloud agent ID |

**Response**

```json
{
  "ok": true,
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "agentName": "My Cloud Agent",
  "status": { "connected": true }
}
```

---

### POST /api/cloud/agents/:id/shutdown

Shutdown and delete a cloud agent.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Cloud agent ID |

**Response**

```json
{
  "ok": true,
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "stopped"
}
```

---

### POST /api/cloud/agents/:id/connect

Connect to an existing cloud agent (disconnecting from any currently active agent first).

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Cloud agent ID |

**Response**

```json
{
  "ok": true,
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "agentName": "My Cloud Agent",
  "status": { "connected": true }
}
```
