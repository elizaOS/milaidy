# Fast Mode Risk Register

## Usage

This register tracks implementation and operational risks for fast mode.
It should be reviewed at each rollout gate.

Scale:

- Probability: Low / Medium / High
- Severity: Low / Medium / High / Critical

---

## Risk Table

| ID | Risk | Phase(s) | Probability | Severity | Detection | Mitigation |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | Main planner still uses large model in fast mode due incomplete override coverage | 3,5 | Medium | Critical | model routing metrics mismatch | audit all generation call sites; add tests asserting effective model per mode |
| R-002 | Cross-request mode contamination from runtime-global mutation | 3,5 | Medium | Critical | concurrent mixed-mode tests | use request-scoped model routing context; forbid runtime mutable mode toggles |
| R-003 | Cloud path drops `processing` fields | 2,8 | Medium | High | transport parity tests | enforce schema at each bridge layer; add structured logs |
| R-004 | Cloud path uses fallback room id causing context leakage | 2,8 | Medium | High | room-id parity assertions | require explicit room in proxy calls; reject missing room where needed |
| R-005 | Fast provider allow-list removes critical context and degrades quality | 4,7 | High | High | response quality regression suite | iterative profile tuning; profile versioning; staged rollout |
| R-006 | Action allow-list blocks essential capabilities unexpectedly | 4,7 | Medium | High | action invocation distribution monitoring | keep safe fallback actions; explicit allow-list review |
| R-007 | Skipping evaluators removes needed safety/compliance checks | 4,7 | Medium | Critical | safety incident metrics and audits | classify evaluators by criticality; always-run critical pre evaluators |
| R-008 | Default mode behavior regresses due shared pipeline refactor | 3,7 | Medium | High | default-mode golden tests | strict backward-compat tests; feature flag gating |
| R-009 | Version skew between API, cloud entrypoint, and core runtime | 2,8 | High | High | deployment health checks | ordered deployment plan with compatibility window |
| R-010 | Cancellation path incomplete causing poor voice interruption UX | 5,7 | Medium | Medium | cancel latency metrics | propagate abort signal end-to-end; add interruption tests |
| R-011 | Insufficient observability hides mismatch bugs | 6,8 | Medium | High | inability to attribute issues | require mode/profile tags in all request logs and metrics |
| R-012 | Telemetry cardinality explosion from free-form profile/reason fields | 6 | Medium | Medium | monitoring backend warnings | restrict tags to enums/known IDs; sample verbose fields |
| R-013 | Fork/wrapper strategy drifts from upstream message service updates | 0,3 | Medium | High | merge conflicts and bug drift | keep wrapper temporary; converge to core-first controls |
| R-014 | ActionFilterService global config changes affect default mode unexpectedly | 4 | Medium | Medium | default mode action distribution drift | add per-call overrides; avoid global changes for fast policy |
| R-015 | Request-context assumptions do not hold in all execution paths | 5 | Medium | Medium | context mismatch diagnostics | explicit context setup where needed; avoid implicit reliance |
| R-016 | Partial frontend rollout exposes toggle before backend ready | 8 | Medium | Medium | runtime validation errors | gate UI with backend capability flag |
| R-017 | Stream and non-stream mode handling diverge | 2,7 | Medium | High | parity tests | enforce identical processing contract for both paths |
| R-018 | Fast mode quality variability across model providers | 5,7 | Medium | Medium | provider-specific latency/quality dashboards | provider-specific profile tuning and fallback mapping |
| R-019 | Security-sensitive logs expose message content while debugging | 6 | Low | High | log review/security scans | redact payloads, secrets, and PII; sanitize debug fields |
| R-020 | No clear rollback causes prolonged incident impact | 8 | Low | Critical | incident drill outcomes | soft rollback flag tested in staging and production canary |

---

## Top Priority Risks

Priority order:

1. `R-001` planner model override coverage
2. `R-002` concurrency contamination
3. `R-007` evaluator safety regression
4. `R-009` multi-component version skew
5. `R-003`/`R-004` cloud transport parity and room identity

These should be treated as release blockers.

---

## Review Cadence

Recommended:

- weekly during implementation
- at every rollout stage gate
- after any production incident involving mode routing or latency regression

