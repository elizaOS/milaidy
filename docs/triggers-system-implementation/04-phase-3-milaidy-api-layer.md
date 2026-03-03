# Phase 3: Milady API Layer (`/api/triggers`)

Phase 3 adds a first-class Trigger API to `milady/src/api/server.ts`.

This phase translates between:

- API DTOs used by frontend and chat actions
- Eliza task records used by TaskService/worker execution

---

## 1) Phase Goal

Provide complete trigger API coverage:

- create trigger
- list triggers
- get trigger detail
- update trigger
- delete trigger
- run-now trigger
- list trigger run history

With:

- strict validation
- deterministic route matching
- stable response contracts
- consistent runtime-unavailable behavior

---

## 2) API Contract (Version 1)

## 2.1 Shared DTOs

```ts
type TriggerType = "interval" | "once" | "cron";
type TriggerWakeMode = "inject_now" | "next_autonomy_cycle";
type TriggerStatus = "active" | "paused" | "error";
type TriggerExecutionStatus = "success" | "failed" | "skipped" | "deferred";

type TriggerSummary = {
  id: string;
  displayName: string;
  instructions: string;
  triggerType: TriggerType;
  status: TriggerStatus;
  wakeMode: TriggerWakeMode;
  timezone: string;
  intervalMs?: number;
  scheduledAtIso?: string;
  cronExpression?: string;
  runCount: number;
  lastRunAtIso?: string;
  lastStatus?: TriggerExecutionStatus;
  lastError?: string;
  createdBy: "user" | "agent" | "system";
  createdAtIso?: string;
  updatedAtIso?: string;
};

type TriggerRun = {
  triggerRunId: string;
  triggerId: string;
  startedAt: number;
  finishedAt?: number;
  status: TriggerExecutionStatus;
  error?: string;
  latencyMs?: number;
};
```

## 2.2 Request payloads

```ts
type CreateTriggerRequest = {
  displayName: string;
  instructions: string;
  triggerType: TriggerType;
  wakeMode?: TriggerWakeMode;
  timezone?: string;
  intervalMs?: number;
  scheduledAtIso?: string;
  cronExpression?: string;
  maxRuns?: number;
};

type UpdateTriggerRequest = {
  displayName?: string;
  instructions?: string;
  wakeMode?: TriggerWakeMode;
  timezone?: string;
  intervalMs?: number;
  scheduledAtIso?: string;
  cronExpression?: string;
  enabled?: boolean;
  maxRuns?: number;
};
```

---

## 3) Route Definitions and Ordering

In `server.ts`, route order must be explicit:

1. `GET /api/triggers`
2. `POST /api/triggers`
3. `GET /api/triggers/:id/runs`
4. `POST /api/triggers/:id/execute`
5. `GET /api/triggers/:id`
6. `PUT /api/triggers/:id`
7. `DELETE /api/triggers/:id`

### Why this order

Avoid parsing `/api/triggers/:id/execute` and `/api/triggers/:id/runs` as generic `:id` routes.

---

## 4) Runtime Mapping Rules

Map trigger APIs to tasks using strict conventions:

1. trigger task name: `TRIGGER_DISPATCH`
2. required tags include `"trigger"`
3. execution tags include `"queue"` and usually `"repeat"`
4. trigger config stored at `task.metadata.trigger`

### Query strategy

List triggers by:

- `runtime.getTasks({ tags: ["trigger"] })`
- then filter to tasks owned/scoped for current runtime policy

### Status mapping

- queue + enabled -> `active`
- no queue + enabled false -> `paused`
- lastStatus failed and threshold exceeded -> `error` (optional)

---

## 5) Endpoint-by-Endpoint Control Flow

## 5.1 `GET /api/triggers`

Flow:

1. if runtime unavailable -> `503`
2. fetch tasks with trigger tag
3. map to `TriggerSummary[]`
4. sort (for example by updated timestamp desc)
5. return `{ triggers: TriggerSummary[] }`

## 5.2 `POST /api/triggers`

Flow:

1. parse body with `readJsonBody<CreateTriggerRequest>`
2. validate by trigger type:
   - interval requires bounded `intervalMs`
   - once requires future `scheduledAtIso`
   - cron requires valid `cronExpression`
3. normalize defaults (`timezone`, `wakeMode`)
4. build task payload via shared trigger scheduler helper
5. create task through runtime
6. map created task to `TriggerSummary`
7. return `201`

## 5.3 `GET /api/triggers/:id`

Flow:

1. parse id
2. `runtime.getTask(id)`
3. verify trigger metadata exists
4. map to summary + include recent runs
5. return `404` when missing or non-trigger task

## 5.4 `PUT /api/triggers/:id`

Flow:

1. parse id + body
2. fetch existing trigger task
3. merge and validate updates by type
4. if schedule fields changed:
   - recompute `metadata.updateInterval` and `metadata.updatedAt`
5. if enabled toggled false:
   - remove `"queue"` tag
6. if enabled toggled true:
   - ensure `"queue"` tag present
7. update task and return summary

## 5.5 `DELETE /api/triggers/:id`

Flow:

1. verify task exists and is trigger
2. delete task
3. optional: delete trigger run history records
4. return `{ ok: true }`

## 5.6 `POST /api/triggers/:id/execute`

Flow options:

### Option A: direct worker execution (preferred)

1. fetch task
2. fetch trigger worker
3. call worker execute directly with `manual=true` option
4. return run result

### Option B: synthetic immediate schedule

1. update task metadata to become immediately due
2. wait for TaskService tick
3. return accepted response

Recommendation: Option A for deterministic UX.

## 5.7 `GET /api/triggers/:id/runs`

Flow:

1. retrieve run records from chosen store
2. filter by trigger id
3. return `{ runs: TriggerRun[] }`

---

## 6) Validation Rules (Strict)

## 6.1 Interval

- `intervalMs` required
- minimum and maximum bounds
- reject ultra-high-frequency intervals unless privileged mode

## 6.2 Once

- `scheduledAtIso` required
- must parse as valid timestamp
- enforce "not too far in past" and optional max future bound

## 6.3 Cron

- `cronExpression` required
- parser validation required
- timezone must be accepted by parser/runtime

---

## 7) Error Semantics

Use consistent error codes and status mapping:

- `400 INVALID_REQUEST`
- `400 INVALID_SCHEDULE`
- `401 UNAUTHORIZED`
- `403 PERMISSION_DENIED`
- `404 TRIGGER_NOT_FOUND`
- `409 TRIGGER_CONFLICT`
- `429 TRIGGER_RATE_LIMITED`
- `500 INTERNAL_ERROR`
- `503 RUNTIME_UNAVAILABLE`

Prefer stable machine-readable fields:

```json
{
  "error": "INVALID_SCHEDULE",
  "message": "intervalMs must be between 60000 and 2592000000"
}
```

---

## 8) Permissions and Scope

At minimum:

- only authorized API callers can mutate triggers
- in multi-user contexts, enforce owner/admin scope

If room/world scoping is required:

- include `roomId` in trigger metadata and verify request context matches.

---

## 9) Observability in API Layer

For each mutating endpoint, emit structured log entries:

- action (`create|update|delete|execute`)
- trigger id
- requester identity
- outcome
- latency

This is required for audit and incident response when autonomous actions create side effects.

---

## 10) File-Level Change Plan (`server.ts`)

Add:

1. trigger DTO/type definitions near existing route-local interfaces
2. helper functions:
   - `isTriggerTask(...)`
   - `taskToTriggerSummary(...)`
   - `validateCreateTriggerRequest(...)`
   - `validateUpdateTriggerRequest(...)`
   - `normalizeTriggerPayload(...)`
3. route blocks in deterministic order
4. optional run-history helper integration

Maintain existing conventions:

- `readJsonBody<T>()`
- `json(...)`
- `error(...)`
- runtime availability checks

---

## 11) Integration with Action Layer

Action handler in phase 2 should call a shared trigger-creation helper used by API route to avoid drift.

Two acceptable integration patterns:

1. extract shared helper module in core and import in both routes and action;
2. route calls action-level internal API wrapper.

Do not duplicate normalization logic in two places.

---

## 12) Test Plan for Phase 3

## 12.1 API route tests

- route matching order tests
- validation tests for each trigger type
- runtime unavailable tests
- update enable/disable tag behavior tests

## 12.2 Integration tests

- create -> list -> update -> execute -> delete sequence
- verify created trigger is visible in UI-expected response shape

## 12.3 Regression tests

- existing `/api/skills/*`, `/api/plugins/*`, `/api/agent/*` routes unaffected

---

## 13) Exit Criteria

Phase 3 is complete when:

1. all trigger endpoints are implemented and validated;
2. route order collisions are prevented by tests;
3. action-created and API-created triggers have identical metadata shape;
4. run-now and run-history endpoints are working.

Phase 4 then focuses on frontend integration and UX consistency.

