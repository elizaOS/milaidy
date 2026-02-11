# Critical Assessment of the First Triggers Report

This document intentionally critiques the first triggers report. The goal is not to restate directionally-correct ideas, but to identify where that report can fail during implementation.

---

## Executive Verdict

The first report was useful for framing intent, but **not implementation-safe**.  
It contained strong ideas (TaskService reuse, trigger UI, conversational task creation), but it under-modeled core runtime realities and introduced assumptions that can break delivery.

Top-level issues:

1. It treated Milaidy as if it directly used bootstrap capability wiring.
2. It under-modeled TaskService scheduling truth (especially `dueAt` and metadata semantics).
3. It did not account for action selection/execution asymmetry (`validate` at prompt-time vs execution-time).
4. It omitted route-order hazards in Milaidy's imperative HTTP router.
5. It did not define anti-spam and idempotency controls for LLM-created triggers.
6. It did not provide an operations-grade observability and rollback model.

---

## A. Incorrect or Risky Assumptions in v1

## 1) Assumption: "Modify bootstrap actions and Milaidy will get CREATE_TRIGGER"

### Why this is incomplete

Milaidy runtime startup explicitly sets:

- `process.env.IGNORE_BOOTSTRAP = "true"` in `milaidy/src/runtime/eliza.ts`

That means "auto bootstrap loading" behavior is intentionally bypassed in Milaidy's runtime stack. Milaidy also loads plugins via its own plugin resolution path and comments indicate reliance on `@elizaos/plugin-trust`.

### Impact

A pure bootstrap-only implementation risks:

- action exists in Eliza core, but Milaidy never exposes it;
- mismatched behavior between "vanilla Eliza" and "Milaidy runtime";
- false confidence from unit tests in `packages/typescript` while Milaidy behavior remains unchanged.

### Correction

Define two explicit integration targets:

- **Target A (Eliza core)**: add the action in `packages/typescript` capability stack.
- **Target B (Milaidy runtime path)**: verify which capability/plugin path Milaidy actually runs and ensure the action is reachable there.

---

## 2) Assumption: "Task scheduling can rely on dueAt/scheduledAt directly"

### Why this is wrong for current TaskService behavior

`TaskService` due checks in `services/task.ts` are currently based on:

- `tags` (`queue`, `repeat`, optional `immediate`)
- `updatedAt` / `metadata.updatedAt`
- `metadata.updateInterval`
- `metadata.blocking`

`dueAt` is present on the type, but current due evaluation in `checkTasks()` does not use it.

### Impact

If implementation stores one-off/scheduled triggers only in `dueAt`, those tasks may execute immediately or incorrectly depending on other fields.

### Correction

For v1 trigger execution, schedule against fields TaskService actually reads:

- one-off: encode delay through `metadata.updatedAt` + `metadata.updateInterval`, then non-repeat delete-on-success;
- repeat: maintain `repeat` tag + `updateInterval`;
- if introducing `dueAt`, update TaskService due logic explicitly and test migration.

---

## 3) Assumption: "Temporarily enable autonomy for one trigger cycle"

### Why this is under-specified

Current autonomy controls expose coarse methods (`enableAutonomy`, `disableAutonomy`) that create/delete recurring autonomy tasks. There is no built-in "single-cycle pulse mode".

### Impact

"Wake once and re-pause" can accidentally:

- leave autonomy running;
- race with user-triggered pause/resume;
- duplicate autonomy tasks if not guarded correctly.

### Correction

Define explicit wake semantics:

- **Inject mode**: dispatch trigger memory directly through message pipeline without toggling autonomy mode.
- **Autonomy mode**: keep recurring loop running and let trigger injection become part of next cycle.

Avoid implicit "one-cycle enable" until a dedicated API exists.

---

## 4) Assumption: "Action validate protects execution safety"

### Why this is incomplete

Action availability is filtered and validated in provider composition, but `runtime.processActions()` resolves and executes selected actions without re-running `validate()` at execution time.

### Impact

If the model emits a stale or filtered-out action name:

- execution can still proceed if resolvable;
- context-dependent safety checks may be bypassed unless duplicated in handler.

### Correction

For `CREATE_TASK`/`CREATE_TRIGGER`:

- enforce all hard constraints inside handler as well as validate;
- treat `validate` as prompt shaping, not a security boundary.

---

## 5) Assumption: "Add /api/triggers routes" without route-order strategy

### Why this is risky

`milaidy/src/api/server.ts` uses a single large imperative route chain:

- route matching is order-dependent;
- `pathname.startsWith(...)` handlers can shadow narrower routes.

### Impact

Improper placement can cause:

- `/api/triggers` falling into `/api/triggers/:id` logic;
- `/api/triggers/:id/execute` being parsed as `:id`;
- inconsistent error semantics or 404 behavior.

### Correction

Define explicit ordering:

1. exact `/api/triggers` routes (GET/POST),
2. exact suffix routes like `/api/triggers/:id/execute`,
3. generic `/api/triggers/:id` routes.

Document path parsing and add route tests for collisions.

---

## 6) Assumption: "Injecting trigger text is enough for agent behavior"

### Why this is under-modeled

Autonomy prompt creation currently has mode-specific templates and memory context assembly. Trigger messages require intentional prompt framing to avoid:

- low-priority trigger starvation,
- duplicate trigger handling,
- accidental override of current autonomy objective.

### Impact

Without explicit orchestration semantics, the model may:

- re-run completed triggers,
- ignore urgent triggers,
- blend trigger instructions into unrelated chain-of-thought in non-deterministic ways.

### Correction

Define trigger instruction contract in autonomy context:

- stable metadata fields (`triggerId`, `triggerType`, `triggerRunId`, `enqueuePolicy`);
- deterministic prompt section for pending trigger queue;
- completion protocol (`handled`, `deferred`, `ignored`, `failed`) persisted to trigger run log.

---

## 7) Assumption: "Cron can be bolted in with minimal risk"

### Why this is optimistic

Cron introduces:

- timezone correctness,
- daylight saving transitions,
- missed-run policy and backfill behavior.

TaskService is interval-based today.

### Impact

Naive cron support can silently misfire around DST or restart windows.

### Correction

Ship in stages:

1. interval + one-time first,
2. cron after schedule contract + timezone + missed-run policy are explicit.

---

## 8) Assumption: "Execution logging can be metadata-only"

### Why this is weak

Task metadata updates alone are not sufficient for:

- forensic debugging,
- per-run latency/error analysis,
- user-visible run history.

### Impact

No independent run ledger means limited observability when triggers misbehave.

### Correction

Add explicit trigger run records (even if initially stored in memory/messages/log table), with:

- run id,
- trigger id,
- scheduled time vs started time,
- completion status,
- latency,
- error payload.

---

## 9) Assumption: "UI can remain eventually-consistent via manual refresh"

### Why this is insufficient

Current frontend WS channel only updates `status`; trigger CRUD and run updates are otherwise pull-based.

### Impact

A trigger page built without refresh/polling strategy will show stale state, especially after run-now or background execution.

### Correction

Pick an explicit sync model:

- short polling while Triggers tab is active, or
- add trigger-specific WS events.

Do not leave consistency behavior implicit.

---

## 10) Assumption: "Conversational creation is harmless"

### Why this is dangerous

LLM-generated actions can produce accidental trigger spam without:

- dedupe keys,
- per-room/per-user quotas,
- "same trigger already exists" checks.

### Impact

Potential explosion of queue tasks and autonomous noise loops.

### Correction

Require anti-spam controls in handler:

- semantic dedupe window (same instruction + schedule),
- quota guards,
- confirmation path for high-frequency schedules.

---

## B. Missing Design Constraints in v1

The first report did not harden the following constraints enough:

1. **Cross-runtime concurrency**
   - `executingTasks` is process-local; overlapping execution can occur in multi-process deployments.

2. **Clock assumptions**
   - scheduler uses local `Date.now()`; no monotonic coordinator.

3. **Failure policy**
   - no clear distinction between transient vs permanent trigger errors.

4. **Permission model**
   - no policy for who can create/modify triggers via API/chat in shared rooms.

5. **Migration model**
   - no strategy for existing task records when trigger metadata evolves.

6. **Versioned API contract**
   - no schema versioning for trigger payloads and UI compatibility.

---

## C. What v1 Got Right

To keep this balanced, several v1 decisions were strong:

- Reuse TaskService instead of introducing a second scheduler immediately.
- Treat autonomy room injection as the core trigger execution primitive.
- Support both UI-driven creation and conversational creation.
- Plan a dedicated triggers page instead of burying it under Admin.

These remain valid, but require stronger invariants and control-flow detail.

---

## D. Corrected Baseline Requirements

The revised plan must satisfy all of the following:

1. **Milaidy capability path is explicit and verified**  
   (no bootstrap-only assumptions).

2. **Trigger scheduling semantics align with current TaskService reality**  
   (or TaskService is explicitly extended with migration).

3. **Action handlers enforce safety constraints independently of `validate`**.

4. **Trigger CRUD and execution APIs have deterministic route parsing and strict schema validation**.

5. **Trigger execution writes independent per-run audit records**.

6. **Frontend consistency model is explicit (polling and/or WS events)**.

7. **Rate limiting, dedupe, and quotas are enforced for conversational trigger creation**.

8. **Feature flags and rollback switches exist before rollout**.

---

## E. Outcome of This Critique

The remainder of this dossier (`01`-`10`) is designed to close each gap above:

- `01` proves current control flow and coupling.
- `02`-`05` define implementation per phase and per file.
- `06` defines operations/guardrails.
- `07` compares architecture options with hard tradeoffs.
- `08` provides explicit risk and mitigation mapping.
- `09` provides verification and rollout controls.
- `10` provides an exhaustive change catalog.

This turns the trigger effort from "good concept" into an implementation-ready plan with fewer hidden failure modes.

