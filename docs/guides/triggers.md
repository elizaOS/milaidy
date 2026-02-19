---
title: Triggers & Scheduled Tasks
sidebarTitle: Triggers
description: Schedule tasks that wake the agent on intervals, at specific times, or via cron expressions.
---

# Triggers & Scheduled Tasks

Triggers are scheduled tasks that wake the Milaidy agent at defined times or intervals. They allow the agent to perform recurring work, one-time future tasks, or cron-scheduled operations without manual intervention.

## Trigger Types

There are three trigger types, set via the `triggerType` field:

### `interval`

Executes repeatedly at a fixed interval. Requires `intervalMs` (milliseconds between runs).

- Minimum interval: 60,000 ms (1 minute)
- Maximum interval: 2,678,400,000 ms (31 days)
- Values outside this range are clamped automatically.

### `once`

Executes a single time at a specific timestamp. Requires `scheduledAtIso` (ISO 8601 timestamp). The task is automatically deleted after execution.

### `cron`

Executes on a standard 5-field cron schedule. Requires `cronExpression` (e.g., `*/15 * * * *` for every 15 minutes). Supports an optional `timezone` field for timezone-aware scheduling (IANA timezone names like `America/New_York`). Without a timezone, cron expressions are evaluated in UTC.

Cron fields: `minute hour dayOfMonth month dayOfWeek`

## Wake Modes

Each trigger has a `wakeMode` that controls how it activates the agent:

| Mode | Description |
|------|-------------|
| `inject_now` | Immediately injects the trigger's instructions into the agent, waking it if idle. The agent processes the instructions right away. |
| `next_autonomy_cycle` | Queues the instructions to be picked up on the next autonomous reasoning cycle. Does not interrupt the agent's current work. |

## TriggerConfig Fields

The full trigger configuration (stored in task metadata):

| Field | Type | Description |
|-------|------|-------------|
| `version` | `1` | Schema version (always 1) |
| `triggerId` | `UUID` | Unique identifier for the trigger |
| `displayName` | `string` | Human-readable name |
| `instructions` | `string` | Text instructions the agent receives when the trigger fires |
| `triggerType` | `"interval" \| "once" \| "cron"` | Schedule type |
| `enabled` | `boolean` | Whether the trigger is active |
| `wakeMode` | `"inject_now" \| "next_autonomy_cycle"` | How the agent is activated |
| `createdBy` | `string` | Creator identifier (entity ID or "api") |
| `timezone` | `string?` | IANA timezone for cron expressions |
| `intervalMs` | `number?` | Interval in milliseconds (for `interval` type) |
| `scheduledAtIso` | `string?` | ISO timestamp (for `once` type) |
| `cronExpression` | `string?` | 5-field cron expression (for `cron` type) |
| `maxRuns` | `number?` | Maximum number of executions before auto-deletion |
| `runCount` | `number` | How many times the trigger has fired |
| `dedupeKey` | `string?` | Hash key to prevent duplicate triggers |
| `nextRunAtMs` | `number?` | Computed timestamp of the next scheduled run |
| `lastRunAtIso` | `string?` | ISO timestamp of last execution |
| `lastStatus` | `"success" \| "error" \| "skipped"` | Result of last execution |
| `lastError` | `string?` | Error message from last failed execution |

## API Endpoints

All trigger endpoints are under `/api/triggers`. Triggers must be enabled via the `MILAIDY_TRIGGERS_ENABLED` setting (defaults to `true`).

### List Triggers

**GET `/api/triggers`**

Returns all triggers sorted alphabetically by display name.

```json
{
  "triggers": [
    {
      "id": "uuid",
      "taskId": "uuid",
      "displayName": "Check prices",
      "instructions": "Check the latest crypto prices and report",
      "triggerType": "interval",
      "enabled": true,
      "wakeMode": "inject_now",
      "intervalMs": 300000,
      "runCount": 42,
      "nextRunAtMs": 1706000000000
    }
  ]
}
```

### Create Trigger

**POST `/api/triggers`**

Create a new trigger. Request body fields:

```json
{
  "displayName": "Market Check",
  "instructions": "Check current market conditions and summarize",
  "triggerType": "interval",
  "wakeMode": "inject_now",
  "enabled": true,
  "intervalMs": 300000,
  "maxRuns": 100,
  "createdBy": "api"
}
```

Returns `201` with the created trigger summary. Returns `409` if an equivalent trigger already exists (based on dedupe key). Returns `429` if the active trigger limit is reached.

### Get Trigger

**GET `/api/triggers/:id`**

Returns a single trigger by its trigger ID or task ID.

### Update Trigger

**PUT `/api/triggers/:id`**

Update a trigger's configuration. Accepts any `UpdateTriggerRequest` fields:

```json
{
  "displayName": "Updated Name",
  "enabled": false,
  "intervalMs": 600000
}
```

### Delete Trigger

**DELETE `/api/triggers/:id`**

Permanently removes a trigger and its associated task.

### Execute Trigger

**POST `/api/triggers/:id/execute`**

Manually execute a trigger immediately, regardless of its schedule. Forces execution even if the trigger is disabled.

### Get Run History

**GET `/api/triggers/:id/runs`**

Returns the execution history for a trigger (up to the last 100 runs).

```json
{
  "runs": [
    {
      "triggerRunId": "uuid",
      "triggerId": "uuid",
      "taskId": "uuid",
      "startedAt": 1706000000000,
      "finishedAt": 1706000001500,
      "status": "success",
      "latencyMs": 1500,
      "source": "scheduler"
    }
  ]
}
```

### Health Snapshot

**GET `/api/triggers/health`**

Returns aggregate health metrics for the trigger system. This endpoint works even when triggers are disabled.

```json
{
  "triggersEnabled": true,
  "activeTriggers": 5,
  "disabledTriggers": 2,
  "totalExecutions": 150,
  "totalFailures": 3,
  "totalSkipped": 10,
  "lastExecutionAt": 1706000000000
}
```

## Creating Triggers from Chat

The `CREATE_TRIGGER` action allows users to create triggers through natural language in the chat. The action responds to phrases like:

- "create trigger"
- "schedule task"
- "run every hour"
- "run at 3pm tomorrow"

When triggered, the action:

1. Sends the user's message to a small language model to extract trigger parameters (type, name, instructions, interval, cron expression, etc.)
2. Validates the extracted parameters
3. Checks for duplicates using dedupe keys
4. Creates the trigger task in the runtime

The action requires autonomy mode to be enabled (`runtime.enableAutonomy`) and triggers to be enabled in configuration.

## Run History and Monitoring

Each trigger maintains a run history of up to 100 records (`MAX_TRIGGER_RUN_HISTORY`). Each `TriggerRunRecord` tracks:

- `triggerRunId` -- unique ID for the run
- `startedAt` / `finishedAt` -- execution timestamps
- `status` -- "success", "error", or "skipped"
- `error` -- error message (if status is "error")
- `latencyMs` -- execution duration
- `source` -- "scheduler" (automatic) or "manual" (via API)

In-memory metrics (total executions, failures, skipped) are also tracked per agent for the `/api/triggers/health` endpoint. These reset on process restart, but durable counts are reconstructed from persisted run records.

## Trigger Limits and Quotas

- **Active trigger limit** -- configurable via `MILAIDY_TRIGGERS_MAX_ACTIVE` (setting or environment variable). Default: 100 active triggers per creator.
- **Feature toggle** -- triggers can be disabled entirely via `MILAIDY_TRIGGERS_ENABLED=false` (setting or environment variable).
- **Duplicate detection** -- triggers with identical instructions, type, interval, and wake mode are detected via a dedupe key hash and rejected.
- **Max runs** -- set `maxRuns` to automatically delete a trigger after a fixed number of executions.
- **Once triggers** -- automatically deleted after their single execution.
