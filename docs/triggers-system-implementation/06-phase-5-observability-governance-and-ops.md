# Phase 5: Observability, Governance, and Operations

Phase 5 hardens triggers for real-world operation.  
Without this phase, trigger correctness may still degrade under load, model drift, or misuse.

---

## 1) Phase Goal

Add production-grade controls for:

- visibility (what happened)
- governance (who can do what)
- reliability (what happens when things fail)
- rollback (how to stop damage quickly)

---

## 2) Observability Requirements

## 2.1 Metrics (minimum set)

Collect and expose:

1. `trigger_created_total`
2. `trigger_updated_total`
3. `trigger_deleted_total`
4. `trigger_executed_total`
5. `trigger_failed_total`
6. `trigger_skipped_total`
7. `trigger_execution_latency_ms` (distribution)
8. `trigger_due_lag_ms` (actual start minus scheduled start)
9. `trigger_active_count`
10. `trigger_disabled_count`

These can initially live in structured logs and be aggregated later.

---

## 2.2 Structured run records

Each trigger run should produce a structured record:

- trigger id
- task id
- run id
- scheduled timestamp
- start timestamp
- completion timestamp
- status
- error
- latency
- trigger source (`api`, `action`, `system`)

---

## 2.3 Operator visibility endpoint

Add an API endpoint for aggregated trigger health:

- `/api/triggers/health`

Response example fields:

- active trigger count
- failed run count in last N minutes
- oldest due lag
- top failing trigger ids

---

## 3) Governance and Safety Controls

## 3.1 Permission model

Minimum:

- authenticated API users only
- owner/admin-only mutating operations in multi-user contexts

Action-level:

- conversational trigger creation gated by role and autonomy state

---

## 3.2 Quota policy

Recommended defaults:

- max active triggers per runtime
- max trigger creations per user per hour
- min interval for repeating triggers

Violation behavior:

- reject with stable error codes
- include remediation message

---

## 3.3 Abuse prevention

1. duplicate trigger suppression
2. high-frequency interval suppression
3. kill switch for conversational trigger creation
4. optional manual approval gate for external-side-effect triggers

---

## 4) Feature Flags and Kill Switches

Add explicit toggles:

1. `TRIGGERS_ENABLED`
2. `TRIGGER_ACTION_ENABLED`
3. `TRIGGER_RUN_NOW_ENABLED`
4. `TRIGGER_CRON_ENABLED`
5. `TRIGGER_UI_ENABLED`
6. `TRIGGER_POLLING_ENABLED`

Emergency controls:

- `TRIGGER_EXECUTION_PAUSED` (stops worker execution while preserving data)
- `TRIGGER_CREATE_PAUSED` (blocks new creation from API and action)

---

## 5) Reliability Policies

## 5.1 Retry policy

Not all failures are equal:

- transient failures (temporary autonomy unavailable): retry with backoff
- permanent failures (invalid metadata): mark failed, do not retry infinitely

Store retry counters in trigger metadata or run records.

## 5.2 Stuck run detection

Define threshold for in-flight trigger run duration and mark as stuck.

For stuck runs:

1. emit alert log
2. mark run failed with reason `RUN_TIMEOUT`
3. optionally disable trigger after repeated stuck runs

## 5.3 Drift detection

Alert when `due_lag_ms` grows beyond threshold repeatedly.  
This indicates scheduler saturation or autonomy bottlenecks.

---

## 6) Operational Runbooks

## 6.1 Runbook: Trigger storm

Symptoms:

- sudden high `trigger_executed_total`
- autonomy queue saturation

Actions:

1. set `TRIGGER_EXECUTION_PAUSED=true`
2. identify high-frequency triggers from health endpoint
3. disable offending triggers
4. resume execution incrementally

## 6.2 Runbook: Repeated trigger failures

Symptoms:

- sustained `trigger_failed_total`
- same trigger failing repeatedly

Actions:

1. inspect run records
2. determine transient/permanent failure
3. patch metadata or disable trigger
4. replay manually via run-now

## 6.3 Runbook: Stale UI state incidents

Symptoms:

- trigger list does not reflect backend state

Actions:

1. force reload triggers from API
2. verify polling lifecycle active
3. check API errors and auth token state

---

## 7) Data Retention and Cleanup

Define retention for run records:

- keep last N runs per trigger or
- keep records for M days

Add cleanup job strategy:

- periodic prune
- preserve failed run records longer for diagnostics

---

## 8) Change Management and Auditability

For each trigger mutation, write audit events:

- actor id
- operation
- previous state hash (optional)
- new state hash (optional)
- timestamp

This supports incident review and unauthorized-change detection.

---

## 9) Testing for Ops Layer

## 9.1 Reliability tests

- simulate autonomy service unavailable and recovery
- simulate high trigger volume
- simulate repeated failures and verify disable policy

## 9.2 Governance tests

- unauthorized mutate requests rejected
- quota violations rejected
- kill-switch enforcement verified

## 9.3 Observability tests

- run records written for success/failure
- health endpoint reflects expected counters

---

## 10) Exit Criteria

Phase 5 is complete when:

1. trigger behavior is observable with structured records;
2. governance controls (permissions, quotas, flags) are active;
3. operators have documented runbooks and emergency switches;
4. reliability policy is tested under stress/failure scenarios.

This phase is the difference between "feature works in dev" and "feature is survivable in production."

