# Trigger System Risk Register

This register enumerates concrete failure modes for triggers across runtime, API, and UI.

Scale:

- Severity: `S1` (critical) to `S4` (low)
- Likelihood: `L1` (high) to `L4` (low)

---

## 1) Runtime and Scheduler Risks

| ID | Risk | Severity | Likelihood | Detection | Mitigation | Rollback |
|---|---|---|---|---|---|---|
| R-001 | Trigger task created without registered worker | S1 | L2 | health endpoint + logs "No worker found" | startup asserts worker registration before enabling trigger APIs | disable trigger creation endpoint |
| R-002 | One-time trigger executes immediately due to wrong tag mapping | S1 | L2 | integration tests + due-lag anomalies | encode once via repeat+delay and self-delete | block once creation with flag |
| R-003 | Cron reschedule computes wrong interval around DST | S2 | L2 | cron timezone tests + run history drift | timezone-aware parser + explicit policy | disable cron via flag |
| R-004 | Repeating trigger overlap due to multi-process runtimes | S1 | L3 | duplicate run ids in logs | add lease token / distributed claim policy | single-runtime mode until fix |
| R-005 | `blocking=false` misused causing trigger storm | S2 | L2 | high run-rate alerts | enforce `blocking=true` for trigger tasks | patch metadata and disable offender |
| R-006 | Disabled trigger remains queued and wastes scheduler cycles | S3 | L1 | high validate skips | remove `"queue"` tag on disable | background cleanup script |
| R-007 | Trigger worker exception loops indefinitely | S1 | L2 | repeated failures for same trigger id | retry cap + disable after threshold | auto-pause failing trigger family |
| R-008 | Trigger executes but run record not persisted | S2 | L2 | mismatch between run count and logs | write run record before and after execution | mark unknown outcome + replay option |
| R-009 | Trigger instruction injection bypasses autonomy context invariants | S1 | L3 | malformed autonomy memories | centralize injection in autonomy service helper | disable inject-now mode |
| R-010 | due ordering nondeterminism for simultaneous triggers | S3 | L2 | flaky order-dependent tests | deterministic sorting before execution | accept nondeterministic mode with warning |

---

## 2) Action and Capability Risks

| ID | Risk | Severity | Likelihood | Detection | Mitigation | Rollback |
|---|---|---|---|---|---|---|
| A-001 | Action added in wrong capability path, unavailable in Milaidy | S1 | L2 | action list diagnostics at runtime | dual-path registration or dedicated plugin | disable feature and fallback to API-only |
| A-002 | `validate` passes but handler fails hard due missing runtime deps | S2 | L2 | handler error telemetry | enforce dependency checks in handler | hide action via config |
| A-003 | Model false-positive selects CREATE_TASK too often | S2 | L1 | high create attempts with low confirmations | tighten validate keywords and prompt examples | temporary action disable |
| A-004 | Duplicate trigger creation from repeated user phrasing | S2 | L1 | dedupe collision metrics | deterministic dedupe key and idempotent create | one-time dedupe migration pass |
| A-005 | Abusive high-frequency schedules via conversation | S1 | L2 | quota breach logs | rate limits + min interval guard | block action for session |
| A-006 | Action filter excludes CREATE_TASK when needed | S3 | L2 | filter miss metrics | mark action always-include in certain contexts | disable action filter for trigger intents |
| A-007 | Ambiguous schedule extraction creates wrong trigger type | S2 | L2 | parse failure and post-create edits spike | stricter schema and clarification response path | force structured params mode |
| A-008 | Permission check mismatch between API and action | S1 | L2 | unauthorized creation incidents | shared auth/policy helper for both paths | action hard-disable |

---

## 3) API Layer Risks

| ID | Risk | Severity | Likelihood | Detection | Mitigation | Rollback |
|---|---|---|---|---|---|---|
| P-001 | Route collision due startsWith ordering | S1 | L2 | endpoint test failures | strict route order and explicit tests | remove conflicting routes quickly |
| P-002 | Runtime unavailable path returns inconsistent status codes | S3 | L2 | client error mismatch | standardize `503 RUNTIME_UNAVAILABLE` | central helper for runtime checks |
| P-003 | Trigger update allows invalid schedule mutation | S2 | L2 | update errors followed by run failures | full revalidation on update | reject risky update fields temporarily |
| P-004 | Run-now endpoint races with scheduler tick | S2 | L3 | duplicate run records close in time | direct worker execution with manual flag | temporarily disable run-now |
| P-005 | Trigger detail endpoint leaks non-trigger tasks | S2 | L2 | unexpected payloads | enforce `isTriggerTask` check | tighten filter logic and redeploy |
| P-006 | Excessive trigger list payload slows UI | S3 | L1 | API latency metrics | pagination/limit fields | cap list size and add cursor |
| P-007 | Missing audit logs for mutating endpoints | S2 | L2 | incident reviews lack actor trail | mandatory audit event writing | temporary API write freeze |
| P-008 | Auth bypass due inconsistent middleware path | S1 | L3 | security review findings | reuse global auth checks + endpoint tests | emergency token rotation and API pause |

---

## 4) Frontend Risks

| ID | Risk | Severity | Likelihood | Detection | Mitigation | Rollback |
|---|---|---|---|---|---|---|
| F-001 | Tab added in navigation but filtered out in Nav validTabs | S3 | L2 | UI smoke tests | update both files in same PR | quick follow-up patch |
| F-002 | ViewRouter missing case causes fallback to chat | S3 | L2 | routing tests | explicit router case test | quick patch |
| F-003 | Trigger list stale after background execution | S2 | L1 | user reports, stale timestamps | active-tab polling or WS events | manual refresh fallback |
| F-004 | Optimistic updates diverge from normalized server values | S2 | L2 | post-create mismatch | prefer server-confirmed updates | disable optimism for triggers |
| F-005 | Form accepts invalid schedules client-side | S3 | L1 | frequent server rejections | client + server validation | rely on server errors only temporarily |
| F-006 | Loading states not scoped per-trigger causing accidental double-clicks | S3 | L2 | duplicate requests | per-id action loading state | global disable in degraded mode |
| F-007 | Run-history panel expensive for large datasets | S4 | L2 | render performance traces | page runs + lazy load | limit to latest N runs |
| F-008 | Accessibility regressions in modal interactions | S3 | L2 | accessibility audit | focus trap + keyboard tests | disable modal shortcuts |

---

## 5) Operations and Governance Risks

| ID | Risk | Severity | Likelihood | Detection | Mitigation | Rollback |
|---|---|---|---|---|---|---|
| O-001 | Trigger storm saturates autonomy loop | S1 | L2 | due-lag spike + queue growth | quotas + min interval + pause flag | set `TRIGGER_EXECUTION_PAUSED=true` |
| O-002 | No emergency kill switch for trigger execution | S1 | L3 | incident response delay | add runtime flag checks in worker | immediate hotfix flag |
| O-003 | Run record retention grows unbounded | S3 | L1 | storage growth monitoring | retention policy + prune job | emergency prune script |
| O-004 | Inadequate runbook causes slow incident recovery | S2 | L2 | MTTR growth | publish and drill runbooks | feature freeze until trained |
| O-005 | Governance mismatch in shared worlds (owner/admin confusion) | S1 | L2 | permission bug reports | explicit role model checks | restrict mutating APIs to owner only |
| O-006 | Cron timezone misconfiguration by users | S3 | L1 | support incidents | timezone selector + validation | default UTC fallback |
| O-007 | Trigger metrics absent in production | S2 | L2 | blind incidents | minimum metric set required before GA | hold rollout |
| O-008 | Feature flags missing, forcing full rollback deployments | S2 | L2 | risky hotfixes | granular flags from phase 5 | add temporary env gate quickly |

---

## 6) Top 10 Priority Risks (Immediate Focus)

Prioritize these before broad rollout:

1. R-001 worker registration correctness
2. R-002 one-time schedule correctness
3. R-004 multi-process overlap
4. A-001 capability path mismatch in Milaidy
5. A-005 abusive schedule creation
6. P-001 route collision
7. P-004 run-now race
8. F-003 stale frontend state
9. O-001 trigger storm
10. O-002 missing kill switch

---

## 7) Risk Monitoring Dashboard Requirements

At minimum dashboard should show:

- active trigger count
- run success/failure ratio
- top failing triggers
- due-lag percentile
- creations per hour
- quota rejections per hour

---

## 8) Acceptance Criteria for Risk Closure

A risk is considered "closed for rollout" only when:

1. mitigation is implemented,
2. detection path exists,
3. test coverage confirms behavior,
4. rollback step is documented and rehearsed.

---

## 9) Residual Risk Statement

Even after mitigations, residual risks remain in:

- timezone correctness for cron edge cases,
- multi-runtime overlap unless distributed claiming is added,
- model-level behavior variance in conversational schedule extraction.

These are acceptable for staged rollout only with feature flags and active monitoring.

