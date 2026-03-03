# Phase Execution Backlog

## Purpose

This backlog translates the dossier into an executable implementation plan with dependencies and release gates.

---

## Milestone Overview

## Milestone M1: Contract and Transport Readiness

Includes phases 1-2.

Outcome:

- mode intent reaches runtime entry points in local and cloud paths
- no behavior change yet

## Milestone M2: Core Fast-Mode Runtime Behavior

Includes phases 3-5.

Outcome:

- message-scoped fast profile drives model and capability behavior safely

## Milestone M3: Production Hardening

Includes phases 6-8.

Outcome:

- observable, tested, and safely rolled out fast mode

---

## Detailed Backlog

## Phase 1 Tasks (Contract + UI)

1. Define `processing` request schema in shared client/server types.
2. Update `ChatView` mode toggle and one-shot override flow.
3. Update `AppContext` send API and precedence logic.
4. Update `api-client` conversation send payload.
5. Add frontend unit tests for mode precedence and send serialization.

Dependencies:

- none

Gate:

- all typed/voice send paths include correct mode payload

---

## Phase 2 Tasks (API + Cloud Transport)

1. Add server-side `processing` validation and normalization.
2. Ensure room id is explicitly forwarded in cloud branch.
3. Extend cloud proxy and bridge payload contracts.
4. Extend cloud entrypoint parser and runtime call options.
5. Add integration tests for local/cloud parity in mode + room propagation.

Dependencies:

- Phase 1 contract finalized

Gate:

- transport parity tests pass for stream and non-stream paths

---

## Phase 3 Tasks (Message Pipeline Controls)

1. Extend `MessageProcessingOptions` with mode/profile/policies.
2. Implement resolved profile configuration at message-service entry.
3. Replace hardcoded generation model-size assumptions with resolved value.
4. Thread profile options into should-respond, generation, actions, evaluators.
5. Add backward-compat tests to ensure default behavior unchanged.

Dependencies:

- Phase 2 mode reaches runtime entry

Gate:

- fast and default mode unit/integration tests pass with deterministic behavior

---

## Phase 4 Tasks (Filtering Strategy)

1. Implement provider policy strict allow-list support.
2. Implement action deterministic allow-list + candidate cap.
3. Add evaluator policy support (pre/post include/skip).
4. Add metadata/tags where needed for maintainable policy mapping.
5. Add profile diagnostics (effective provider/action/evaluator sets).

Dependencies:

- Phase 3 options wiring

Gate:

- profile composition is deterministic and logged

---

## Phase 5 Tasks (Model Routing Context Safety)

1. Add request-scoped model routing context abstraction.
2. Integrate context setup in message-service entry.
3. Integrate context reads in runtime model resolution.
4. Add concurrent mixed-mode race tests.
5. Remove/forbid runtime-global per-request mode mutation.

Dependencies:

- Phase 3 pipeline controls

Gate:

- concurrency isolation tests pass consistently

---

## Phase 6 Tasks (Observability)

1. Add mode/profile tags to request and stage logs.
2. Add latency and routing metrics.
3. Add dashboards for fast vs default path comparison.
4. Add alerts for mismatch, regression, and parity divergence.
5. Validate telemetry in staging with synthetic traffic.

Dependencies:

- Phase 2 transport and Phase 3+ runtime behavior

Gate:

- dashboard and alerts are operational before canary

---

## Phase 7 Tasks (Testing Hardening)

1. Add conversation endpoint test coverage (current gap).
2. Add cloud bridge mode parity suite.
3. Add voice interruption/cancellation tests.
4. Add load/concurrency benchmark tests.
5. Add failure-injection suite.

Dependencies:

- all prior phases implemented

Gate:

- release test matrix green

---

## Phase 8 Tasks (Rollout)

1. Implement feature flags and default-off behavior.
2. Deploy in compatibility-first order.
3. Run internal canary and compare SLOs.
4. Expand rollout in staged percentages.
5. Validate rollback drills.

Dependencies:

- phases 1-7 complete

Gate:

- canary meets latency and quality thresholds with no critical incidents

---

## Cross-Phase Release Blockers

1. Any evidence of cross-request model contamination.
2. Any room-id propagation mismatch in cloud path.
3. Fast mode not measurably faster than default mode.
4. Critical evaluator/safety regression.
5. Missing rollback capability.

---

## Open Decisions (Must Resolve Early)

1. Exact fast profile capability set (providers/actions/evaluators).
2. Whether post evaluators are skipped or deferred asynchronously.
3. How profile config is stored and versioned.
4. Minimum acceptable quality delta for fast mode.
5. SLO targets (p50/p95 latency, failure rate).

---

## Suggested Delivery Cadence

- Sprint 1: Phases 1-2
- Sprint 2: Phase 3
- Sprint 3: Phases 4-5
- Sprint 4: Phases 6-7
- Sprint 5: Phase 8 rollout

Adjust cadence based on cloud/runtime deployment complexity.

