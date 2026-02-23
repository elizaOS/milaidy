---
title: "Autonomy API"
sidebarTitle: "Autonomy"
description: "REST API endpoints for reading and controlling the agent's autonomous operation state."
---

The autonomy API controls whether the agent operates autonomously — proactively taking actions, posting, and engaging without user prompts. The autonomy state is managed by the `AUTONOMY` service in the agent runtime.

## Architecture

The autonomy system is managed by the `AUTONOMY` service registered in the agent runtime. The service creates a recurring task that the runtime's `TaskService` picks up and executes on its 1-second polling interval.

### Service Interface

The API layer interacts with the autonomy service through this interface:

| Method | Return Type | Description |
|--------|-------------|-------------|
| `enableAutonomy()` | `Promise<void>` | Start the autonomous operation loop |
| `disableAutonomy()` | `Promise<void>` | Stop the loop gracefully |
| `isLoopRunning()` | `boolean` | Whether the autonomy loop is currently executing a tick |
| `getStatus()` | `{ enabled?: boolean }` | Current enabled state |

### State Resolution

The `enabled` field in the response is resolved with this priority:

1. **Service status** — `svc.getStatus().enabled` if the service provides it (highest priority)
2. **Runtime flag** — `runtime.enableAutonomy === true` as a fallback
3. **Service existence** — `Boolean(svc)` as the final fallback (if the service is registered, autonomy is considered enabled)

The `thinking` field is always `svc.isLoopRunning()` — it indicates whether the autonomy loop is actively executing right now (processing a tick), not just whether it is enabled.

### Trigger Integration

When autonomy is enabled, the triggers system checks `runtime.enableAutonomy` as a gate before creating trigger-based actions. The autonomy service also exposes:

- `getAutonomousRoomId()` — returns the room UUID used for autonomous conversations
- `injectAutonomousInstruction(payload)` — injects a one-time instruction into the next autonomy tick

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
| `thinking` | boolean | Whether the autonomy loop is actively executing a tick right now |

---

### POST /api/agent/autonomy

Enable or disable autonomous operation.

When enabling, the autonomy task fires its first tick immediately. When disabling, the loop is stopped gracefully after the current tick (if any) completes.

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
| `autonomy` | boolean | The new autonomy enabled state after the operation |
| `thinking` | boolean | Whether the loop is currently executing a tick |

**Behavior Notes**

- If the `AUTONOMY` service is not registered in the runtime, the request body is silently ignored and the current state is returned
- The `enabled` parameter must be a boolean; non-boolean values are ignored

## Related

- [Autonomous Mode guide](/guides/autonomous-mode) — configuring autonomous behavior
- [Triggers guide](/guides/triggers) — trigger system that works with autonomy
- [API Reference overview](/api-reference)
