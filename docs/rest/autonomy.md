---
title: "Autonomy API"
sidebarTitle: "Autonomy"
description: "REST API endpoints for reading and controlling the agent's autonomous operation state."
---

The autonomy API controls whether the agent operates autonomously — proactively taking actions, posting, and engaging without user prompts. The autonomy state is managed by the `AUTONOMY` service in the agent runtime.

## Endpoints

### GET /api/agent/autonomy

Get the current autonomy state.

**Response**

```json
{
  "enabled": true,
  "thinking": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Whether autonomous operation is currently enabled |
| `thinking` | boolean | Whether the agent's autonomy loop is actively executing right now |

---

### POST /api/agent/autonomy

Enable or disable autonomous operation. When enabling, the autonomy task fires its first tick immediately (with `updatedAt: 0`). When disabling, the loop is stopped gracefully.

**Request**

```json
{
  "enabled": true
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `enabled` | boolean | Yes | `true` to enable autonomy, `false` to disable |

**Response**

```json
{
  "ok": true,
  "autonomy": true,
  "thinking": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Always `true` on success |
| `autonomy` | boolean | The new autonomy enabled state |
| `thinking` | boolean | Whether the loop is currently executing |
