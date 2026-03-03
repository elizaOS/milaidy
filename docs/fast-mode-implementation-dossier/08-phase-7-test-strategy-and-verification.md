# Phase 7: Test Strategy and Verification Matrix

## Phase Goal

Guarantee fast mode is:

- correct
- faster
- safe
- parity-consistent across local/cloud paths

This phase closes the current coverage gap on conversation-path behavior.

---

## Current Coverage Gap (Critical)

Existing tests emphasize runtime and `/api/chat` flows.  
Fast mode will primarily use `/api/conversations/:id/messages`, including cloud bridging and streaming paths.

Therefore new tests must center on conversation endpoints and mode propagation.

---

## Test Layers

## 1) Unit tests

### Contract validation

- request payload parsing for `processing`
- invalid mode/profile rejection behavior
- backward compatibility for missing `processing`

### Profile resolution

- mode precedence (message override > conversation default > app default)
- unknown profile fallback behavior
- normalization of invalid combinations

### Model routing context

- request-scoped context set/get semantics
- context isolation across concurrent async operations
- fallback behavior when context absent

### Filtering policy logic

- provider allow-list enforcement
- action allow-list + cap logic
- evaluator include/skip policy behavior

---

## 2) Integration tests (server + runtime)

## API route tests

- `POST /api/conversations/:id/messages` with fast/default modes
- validation errors and status codes
- mode and room propagation to runtime invocation

## Cloud bridge tests

- proxy includes processing and roomId in JSON-RPC params
- cloud entrypoint parses processing and applies same behavior

## Runtime behavior tests

- fast mode uses small model routing path
- default mode unchanged
- fast mode applies expected provider/action/evaluator policies

---

## 3) End-to-end tests

## Frontend typed chat

- toggle mode and send message
- verify response and mode telemetry markers

## Voice chat

- transcript send in fast mode
- interruption/cancel behavior with abort path

## Mixed mode sequence

- same conversation: default -> fast -> default
- verify each message respects its own mode

---

## 4) Concurrency tests (High Priority)

## Mixed-mode parallel requests

- send N fast + N default in parallel to same runtime
- assert model routing remains per request
- assert no cross-request contamination

## Room isolation tests

- concurrent requests in different rooms with cloud path
- assert room and mode integrity for each response

---

## 5) Performance tests

Measure:

- median and p95 total latency by mode
- stage-level latency deltas
- first-chunk latency for streaming

Targets:

- define explicit fast-mode improvement threshold before rollout

---

## 6) Failure-injection tests

1. Cloud bridge timeout while mode=fast.
2. Model provider transient failure and retry behavior.
3. ActionFilterService unavailable fallback.
4. Missing provider from fast profile.
5. Cancellation during generation and during action processing.

Expected:

- deterministic fallback behavior
- no stuck requests
- clear failure taxonomy in logs/metrics

---

## Test Matrix (Condensed)

| Scenario | Path | Mode | Expected |
| --- | --- | --- | --- |
| Basic conversation send | local | default | unchanged behavior |
| Fast send | local | fast | lower latency, profile applied |
| Basic conversation send | cloud | default | unchanged cloud behavior |
| Fast send | cloud | fast | parity with local fast behavior |
| Parallel mixed requests | local/cloud | mixed | no cross-mode contamination |
| Voice interruption | local/cloud | fast | timely cancel and cleanup |

---

## Regression Guardrails

Must-have regression checks before merge:

1. default mode golden-path responses still valid
2. no change to legacy clients sending `{ text }`
3. no crash when processing object omitted or partially present
4. no silent fallback to shared room ids in cloud path

---

## Test Data and Fixtures

Include fixtures for:

- default profile config
- fast profile config
- action/provider/evaluator sets with mixed criticality

Use deterministic mocks for model calls in unit/integration tests where possible.

---

## CI Gating Recommendations

Required on every PR:

- unit tests
- integration tests (local path)
- static type checks

Required before release flag enablement:

- cloud parity integration tests
- concurrency suite
- performance benchmark suite

---

## Exit Criteria

Phase 7 is complete when:

1. fast mode has dedicated automated coverage across all paths
2. concurrency safety is proven by tests
3. latency improvement is measured and reproducible
4. default mode regressions are blocked by CI gates

