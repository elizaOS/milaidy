---
title: Coding Agents API
sidebarTitle: Coding Agents
description: REST API endpoints for managing autonomous coding agent tasks and sessions.
---

These endpoints manage coding agent tasks orchestrated by the `AgentOrchestratorService`. They serve as fallback handlers when the coding agent plugin does not export its own route handler.

For setup, architecture, auth, and debug/benchmark guidance, see:

- [Coding Swarms (Orchestrator)](/guides/coding-swarms)

## Preflight

```
GET /api/coding-agents/preflight
```

Returns available coding agent adapters and their installation status. Use this to check which coding agents (e.g. Claude Code, Codex) are ready for use.

**Response:**
```json
[
  {
    "adapter": "eliza",
    "installed": true
  },
  {
    "adapter": "claude-code",
    "installed": false,
    "installCommand": "npm install -g @anthropic-ai/claude-code",
    "docsUrl": "https://docs.anthropic.com/en/docs/claude-code"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `adapter` | string | Coding agent adapter identifier |
| `installed` | boolean | Whether the adapter is available |
| `installCommand` | string \| undefined | Command to install the adapter (if not installed) |
| `docsUrl` | string \| undefined | Link to adapter documentation |

---

## Scratch Workspaces

```
GET /api/coding-agents/scratch
```

List temporary scratch workspaces created by coding agent sessions.

**Response:**
```json
[
  {
    "id": "scratch-uuid",
    "path": "/tmp/milady-scratch/scratch-uuid",
    "createdAt": "2026-03-19T10:00:00.000Z"
  }
]
```

---

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
