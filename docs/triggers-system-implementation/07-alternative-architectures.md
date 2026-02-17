# Alternative Architectures and Tradeoffs

This document compares multiple trigger architectures before locking implementation.

The purpose is to avoid accidental commitment to a path that looks simple early but fails on reliability, scaling, or maintainability later.

---

## 1) Evaluation Criteria

Each option is scored against:

1. implementation complexity
2. correctness risk
3. Milady integration effort
4. observability quality
5. migration complexity
6. long-term maintainability

Scores:

- 1 = poor
- 5 = excellent

---

## 1.1 Reference Pattern Extraction (OpenClaw + NanoClaw)

The external reference systems suggest concrete patterns:

### OpenClaw patterns worth borrowing

1. wake coalescing for near-simultaneous scheduler events
2. busy-lane suppression (skip or defer when main execution lane is saturated)
3. explicit separation between cadence loop (heartbeat) and schedule loop (cron)
4. clear one-shot cleanup semantics

### NanoClaw patterns worth borrowing

1. durable run logs with per-run status and duration
2. scheduler loop + queue boundary for backpressure
3. retry strategy with bounded exponential backoff
4. container/task timeout handling to avoid endless stuck execution

### Patterns to avoid over-copying

1. introducing isolated session/container orchestration before core trigger value is shipped
2. duplicating full scheduler infrastructure while TaskService already exists
3. adding heavy cross-component complexity before observability and controls are in place

---

## 2) Option A — Minimal Task Metadata Adaptation (Recommended v1)

## Design

- use existing TaskService tick loop
- represent triggers as tasks with `"trigger"` tag and trigger metadata
- one-time and cron behavior encoded via `updateInterval` strategy
- worker handles reschedule/delete policies

## Control flow

1. API/action creates trigger task
2. TaskService checks due tasks
3. Trigger worker injects instruction into autonomy
4. worker updates trigger metadata and run status

## Pros

- fastest path to production
- minimal core scheduler changes
- low migration risk

## Cons

- cron and one-time semantics are adapted, not native
- due computation remains interval-centric
- process-local overlap protection only

## Best fit

- immediate feature delivery with manageable complexity.

---

## 3) Option B — Extend TaskService with Native `dueAt` Semantics

## Design

- modify TaskService due logic to honor `dueAt` for one-time/scheduled tasks
- keep repeat interval semantics for recurring tasks

## Control flow

1. task has explicit due timestamp
2. TaskService checks current time vs due timestamp
3. execute and delete one-time tasks natively

## Pros

- cleaner one-time scheduling semantics
- less metadata adaptation in worker

## Cons

- broader regression surface for existing task users
- adapter compatibility and tests required
- still does not solve cron policy alone

## Best fit

- medium-term cleanup after v1, once trigger behavior is stable.

---

## 4) Option C — Dedicated TriggerService Over Task Primitive

## Design

- keep TaskService for generic tasks
- add TriggerService that manages trigger schedule policies and dispatches task executions

## Control flow

1. TriggerService selects due triggers
2. TriggerService dispatches to trigger worker/runtime
3. TriggerService writes run records and next schedule state
4. TaskService remains generic

## Pros

- clearer domain boundaries
- easier to add rich trigger policies (coalescing, priorities, active hours)

## Cons

- new scheduler surface to own
- larger code and ops footprint
- additional coordination with TaskService

## Best fit

- post-v1 evolution if trigger complexity grows quickly.

---

## 5) Option D — Separate Trigger Table + Scheduler Loop (NanoClaw-style)

## Design

- triggers persisted in dedicated table
- scheduler loop polls due rows
- task run history in dedicated table

## Control flow

1. scheduler query `where next_run <= now`
2. claim and execute
3. write run log row
4. recompute next run

## Pros

- strongest scheduling clarity
- native run-history model
- straightforward reporting queries

## Cons

- significant schema and migration effort
- diverges from existing TaskService abstraction
- dual scheduling systems to maintain

## Best fit

- larger platform build where scheduling is a core product area.

---

## 6) Option E — Heartbeat + Cron Dual Loop (OpenClaw-style)

## Design

- heartbeat loop for cadence-driven autonomous turns
- separate cron scheduler for timed jobs
- explicit wake/coalesce policies

## Control flow

1. heartbeat loop manages base autonomous turns
2. cron loop schedules jobs and wakes heartbeat on demand
3. execution can target main or isolated context

## Pros

- very expressive scheduling model
- robust for mixed cadence + exact-time workloads

## Cons

- highest conceptual and implementation complexity
- may overfit current Milady needs
- difficult to ship safely in one cycle

## Best fit

- mature orchestration platform with multi-agent runtime priorities.

---

## 7) Comparative Scoring Matrix

| Option | Complexity | Correctness Risk | Milady Integration | Observability | Migration Cost | Maintainability | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| A: minimal metadata adaptation | 4 | 3 | 5 | 3 | 5 | 4 | 24 |
| B: TaskService dueAt extension | 3 | 2 | 4 | 3 | 3 | 4 | 19 |
| C: TriggerService over tasks | 3 | 4 | 3 | 4 | 3 | 4 | 21 |
| D: dedicated trigger table | 2 | 4 | 2 | 5 | 2 | 3 | 18 |
| E: heartbeat + cron dual loop | 1 | 3 | 2 | 4 | 2 | 2 | 14 |

Interpretation:

- Option A is strongest for short-term delivery.
- Option C is strongest evolution path if Option A becomes strained.

---

## 7.1 Applicability Matrix for External Patterns

| Pattern | Source | Applicability to v1 | Notes |
|---|---|---|---|
| Wake coalescing | OpenClaw | Medium | Useful for run-now bursts; can be added later without architecture rewrite |
| Busy suppression | OpenClaw | High | Directly relevant to autonomy-loop saturation protection |
| Dual heartbeat/cron loops | OpenClaw | Low (v1) | Too much complexity early; revisit if trigger volume grows |
| Run log table | NanoClaw | High | Strong observability value and low conceptual risk |
| Retry with backoff | NanoClaw | High | Needed for transient autonomy/runtime failures |
| Dedicated scheduler table | NanoClaw | Medium (v2+) | Powerful but migration-heavy for v1 |

---

## 8) Recommended Path

## 8.1 Immediate (v1)

Adopt **Option A** with strict guardrails:

- trigger metadata namespace
- idempotent creation
- run records
- governance flags and quotas

## 8.2 Near-term upgrade (v1.5 / v2)

Adopt selected parts of **Option C**:

- introduce TriggerService as policy coordinator
- keep TaskService as execution primitive

## 8.3 Deferred / optional

- Option B partial improvements (`dueAt`) after regression coverage
- Option D/E only if product needs justify major complexity jump

---

## 9) Decision Risks and Mitigations

## Risk: Option A accrues policy complexity in worker

Mitigation:

- keep scheduling helpers isolated
- define clear migration boundary toward TriggerService

## Risk: Mixed capability paths in Milady cause action availability drift

Mitigation:

- explicitly verify runtime action list at startup
- add health/debug endpoint listing registered actions and workers

## Risk: Cron behavior edge cases (timezone/DST)

Mitigation:

- gate cron behind feature flag initially
- validate with timezone-focused tests before default-on rollout

---

## 10) Exit Decision

Proceed with:

1. Option A for first implementation,
2. explicit migration hooks toward Option C,
3. deferred reconsideration of B/D/E after telemetry from production usage.

This balances delivery speed with architectural safety.

