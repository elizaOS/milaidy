# Test Strategy, Rollout Plan, and Backout Procedure

This document defines how triggers are verified and safely rolled out.

---

## 1) Testing Principles

1. test control flow, not only happy paths
2. test schedule semantics with deterministic clocks
3. test policy enforcement (permissions, quota, dedupe)
4. test recovery from partial failures
5. gate rollout on observable signal quality

---

## 2) Test Matrix by Phase

| Phase | Unit | Integration | E2E | Reliability/Chaos |
|---|---|---|---|---|
| 1 Core runtime | required | required | optional | required |
| 2 Action layer | required | required | optional | recommended |
| 3 API layer | required | required | required | recommended |
| 4 Frontend | required | recommended | required | optional |
| 5 Ops/governance | required | required | recommended | required |

---

## 3) Core Runtime Test Plan (Phase 1)

## 3.1 Unit tests

Target:

- trigger scheduling helpers
- metadata normalization
- cron next-run computation
- once-trigger delay computation

Key cases:

1. interval trigger with immediate tag
2. interval trigger with normal cadence
3. once trigger in future
4. once trigger in past (reject)
5. cron valid/invalid expression
6. cron with timezone

## 3.2 Worker tests

Target:

- trigger worker validate + execute
- run status updates
- once-trigger self-delete
- cron reschedule mutation

Key cases:

1. autonomy service available -> inject success
2. autonomy service unavailable -> deferred/failure path
3. maxRuns reached
4. disabled trigger handling

## 3.3 Integration tests

Target:

- TaskService + TriggerWorker + Runtime interaction

Key cases:

1. task due executes worker
2. non-due task does not execute
3. repeat interval scheduling accuracy (within tolerance)
4. blocking semantics under long-running worker

---

## 4) Action Layer Test Plan (Phase 2)

## 4.1 Validate path tests

1. autonomy disabled -> action unavailable
2. missing schedule intent -> action unavailable
3. explicit schedule intent -> action available

## 4.2 Handler path tests

1. parse success creates trigger task
2. parse failure returns structured error
3. dedupe returns existing trigger
4. quota exceeded returns error and no creation
5. permission denied path

## 4.3 Prompt extraction resilience tests

Use varied natural-language prompts:

- "every 12 hours"
- "tomorrow at 9am"
- "every Monday at 09:00 UTC"
- intentionally ambiguous phrasing

Ensure ambiguous requests either:

- ask for clarification, or
- fail safely without creation.

---

## 5) API Layer Test Plan (Phase 3)

## 5.1 Route and contract tests

1. `GET /api/triggers`
2. `POST /api/triggers`
3. `GET /api/triggers/:id`
4. `PUT /api/triggers/:id`
5. `DELETE /api/triggers/:id`
6. `POST /api/triggers/:id/execute`
7. `GET /api/triggers/:id/runs`

Validate:

- status codes
- error codes
- response DTO shape
- route ordering correctness

## 5.2 Runtime unavailability tests

For each endpoint, verify `503` + stable error payload when runtime missing.

## 5.3 Policy tests

1. invalid schedule rejected
2. quota policy enforced
3. unauthorized mutate requests rejected
4. non-trigger task id rejected by trigger endpoints

---

## 6) Frontend Test Plan (Phase 4)

## 6.1 Component tests (`TriggersView`)

1. list rendering
2. empty state
3. form validation by trigger type
4. loading/disabled states for actions
5. run history rendering

## 6.2 Context tests (`AppContext`)

1. `loadTriggers` success/failure
2. create/update/delete/execute flows
3. active tab load and poll lifecycle
4. error notice mapping

## 6.3 E2E tests

1. open `/triggers` tab
2. create interval trigger
3. edit schedule
4. run now
5. pause/resume
6. delete

---

## 7) Reliability and Chaos Tests (Phase 5)

## 7.1 Load tests

Scenarios:

1. create 100+ triggers and observe scheduler behavior
2. simultaneous due triggers to evaluate backlog and due lag
3. high-frequency trigger rejection behavior

Metrics assertions:

- bounded due lag
- no uncontrolled failure growth
- no API timeout cascade

## 7.2 Failure injection

1. force autonomy service unavailable
2. simulate worker throw
3. simulate API transient errors
4. simulate websocket disconnects during trigger operations

Expected outcomes:

- graceful degradation
- clear error statuses
- no data corruption

---

## 8) Rollout Strategy

## 8.1 Stage 0 (dark launch)

- deploy code with triggers disabled via feature flags
- verify registration, health endpoints, and metrics wiring

## 8.2 Stage 1 (internal enablement)

- enable API and runtime execution for internal users only
- keep conversational action disabled
- monitor run success/failure and due lag

## 8.3 Stage 2 (limited user rollout)

- enable UI tab for a small cohort
- enable conversational action with tight quotas
- monitor duplicate creation and abuse patterns

## 8.4 Stage 3 (general availability)

- enable all features
- retain kill switches and active monitoring

---

## 9) Backout Plan

## 9.1 Soft backout (preferred)

1. set `TRIGGER_CREATE_PAUSED=true`
2. set `TRIGGER_EXECUTION_PAUSED=true`
3. hide trigger UI tab (`TRIGGER_UI_ENABLED=false`)

This preserves trigger records while stopping mutations/execution.

## 9.2 Hard backout

If severe incident persists:

1. disable trigger worker registration
2. disable trigger routes
3. optionally archive/disable all trigger tasks by removing queue tags

---

## 10) Go/No-Go Criteria

Go to next stage only when:

1. no unresolved S1 risks
2. success ratio above target for staged period
3. due-lag within acceptable threshold
4. no unresolved auth/policy defects
5. kill switch tested successfully

No-Go if:

- trigger storms are observed without suppression,
- route collisions produce incorrect behavior,
- runtime path mismatch causes action availability drift,
- run records are incomplete or inconsistent.

---

## 11) Deliverables Checklist

Before final rollout:

- [ ] unit tests for schedule/action/api/UI layers
- [ ] integration tests for task worker + API
- [ ] E2E smoke for full CRUD + run-now
- [ ] reliability tests under load/failure
- [ ] rollout flags documented
- [ ] runbooks validated by drill

This checklist is mandatory for production confidence.

