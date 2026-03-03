---
title: Coding Agents API
sidebarTitle: Coding Agents
description: REST API endpoints for managing autonomous coding agent tasks and sessions.
---

These endpoints manage coding agent tasks orchestrated by the `AgentOrchestratorService`. They serve as fallback handlers when the coding agent plugin does not export its own route handler.

## Coordinator Status

```
GET /api/coding-agents/coordinator/status
```

Returns the supervision level and list of all active/completed coding agent tasks.

**Response:**
```json
{
  "supervisionLevel": "autonomous",
  "taskCount": 2,
  "pendingConfirmations": 0,
  "tasks": [
    {
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "agentType": "eliza",
      "label": "Refactor auth module",
      "originalTask": "Refactor the auth module to use JWT",
      "workdir": "/home/user/project",
      "status": "active",
      "decisionCount": 5,
      "autoResolvedCount": 3
    }
  ]
}
```

Returns an empty task list (not an error) if the orchestrator service is unavailable.

**Task status mapping:**

| Orchestrator State | API Status |
|-------------------|------------|
| `running`, `pending` | `active` |
| `completed` | `completed` |
| `failed`, `error` | `error` |
| `cancelled` | `stopped` |
| `paused` | `blocked` |

## Stop Task

```
POST /api/coding-agents/:sessionId/stop
```

Cancels a specific coding agent task by its session ID.

**Path params:**

| Param | Type | Description |
|-------|------|-------------|
| `sessionId` | string | The task UUID |

**Response:**
```json
{ "ok": true }
```

**Errors:** `503` if the orchestrator service is unavailable; `500` on cancellation failure.
