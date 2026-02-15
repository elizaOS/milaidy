# Phase 6: Observability and Operational Readiness

## Phase Goal

Make fast mode measurable, debuggable, and safe to operate in production.

Without this phase, latency improvements and regressions cannot be reliably validated.

---

## Observability Requirements

1. Every request must record effective processing mode/profile.
2. Latency must be decomposed by pipeline stage, not only total.
3. Model selection must be observable per request.
4. Local/cloud path must be distinguishable.
5. Failure modes must be classifiable (validation, transport, model, action, evaluator).

---

## Core Metrics

## End-to-end metrics

- `chat_request_latency_ms` (p50/p95/p99), tagged by:
  - `mode`
  - `profile`
  - `path` (`local`/`cloud`)
  - `streaming` (`true`/`false`)

## Stage metrics

- `compose_state_latency_ms`
- `should_respond_latency_ms`
- `generation_latency_ms`
- `action_processing_latency_ms`
- `evaluator_latency_ms`

Each tagged by mode/profile.

## Outcome metrics

- `chat_request_success_total`
- `chat_request_failure_total` with `failure_type`
- `chat_request_cancelled_total`

## Quality/safety indicators

- `fast_mode_action_invocations_total` by action name
- `fast_mode_evaluator_skipped_total` by evaluator name and reason
- `fast_mode_provider_included_total` by provider name

---

## Model Routing Metrics

Add model routing counters:

- `model_invocation_total` by model type and provider model id
- `model_routing_override_total` by mode/profile
- `model_routing_mismatch_total` when expected profile/model differs from actual

These are required to verify that fast mode actually selects faster models.

---

## Logging Schema

All request logs should include:

- request id / trace id
- conversation id
- room id
- processing mode/profile
- local/cloud path
- selected model type/id
- stage timings
- final status

Log levels:

- info: request summary
- debug: stage internals and selected providers/actions/evaluators
- warn/error: validation failures, fallback behavior, mismatches

---

## Trace Design

Recommended span structure:

1. `chat.request`
2. `chat.transport` (frontend/API/cloud bridge)
3. `chat.pipeline`
   - `evaluate.pre`
   - `compose.state`
   - `should.respond`
   - `generate.response`
   - `process.actions`
   - `evaluate.post`

Each span carries mode/profile tags.

---

## Alerting Thresholds

Initial SLO suggestions:

- fast mode p95 latency <= defined target (set by product requirement)
- fast mode error rate <= default mode error rate + acceptable delta
- mode propagation mismatch rate = 0 in steady state

Alerts:

1. Fast mode latency regression above threshold.
2. Fast mode/model mismatch detected.
3. Cloud/local parity divergence in mode behavior.
4. Spike in cancellation failures.

---

## Operational Dashboards

Minimum dashboards:

1. Fast vs default latency and success trend.
2. Pipeline stage breakdown by mode.
3. Model usage mix over time by mode/profile.
4. Provider/action/evaluator usage in fast mode.
5. Cloud vs local parity comparison.

---

## Failure Triage Runbook (Condensed)

## Symptom: fast mode not faster

Checks:

1. Verify mode propagation at API and runtime logs.
2. Confirm model override metrics.
3. Inspect provider/evaluator/action inclusion counts.
4. Compare cloud vs local path overhead.

## Symptom: quality collapse in fast mode

Checks:

1. verify provider allow-list completeness
2. inspect skipped evaluators and blocked actions
3. compare response trace against default mode for same prompt

## Symptom: mixed-mode contamination

Checks:

1. concurrent request traces with model selection tags
2. ensure request-scoped context propagation
3. verify no runtime-global mutable mode toggles

---

## Phase Risks

1. Telemetry cardinality explosion from free-form tags.
2. Logging sensitive content.
3. Missing parity instrumentation between cloud and local.

Mitigation:

- constrain tag values (enum/profile ids)
- scrub/redact payload text
- enforce shared telemetry schema in both paths

---

## Exit Criteria

1. Mode/profile are visible in every request and stage.
2. Fast-mode model routing is measurable.
3. Dashboards and alerts can detect regressions before broad rollout.

