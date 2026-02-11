# Phase 8: Rollout, Migration, and Rollback Plan

## Phase Goal

Ship fast mode safely across multi-component architecture:

- frontend client
- Milaidy API server
- cloud proxy and bridge
- cloud runtime entrypoint
- Eliza core runtime

with zero downtime and controlled risk.

---

## Rollout Constraints

1. New clients may send `processing`; old servers must not crash.
2. New servers may forward `processing`; old cloud runtime must tolerate or reject clearly.
3. Core runtime changes must preserve default mode behavior.
4. Feature enablement must be flag-driven and reversible at runtime where possible.

---

## Feature Flags

Suggested flags:

- `FAST_MODE_CONTRACT_ENABLED`
  - server accepts/forwards processing payload
- `FAST_MODE_RUNTIME_ENABLED`
  - runtime applies fast profile behavior
- `FAST_MODE_UI_ENABLED`
  - frontend toggle visible
- `FAST_MODE_CLOUD_ENFORCED`
  - cloud path required to honor mode parity

All flags default off initially.

---

## Deployment Sequence (Recommended)

## Step 1: Core compatibility release

Deploy runtime changes that can parse and ignore new mode fields safely.

## Step 2: Cloud runtime/bridge update

Deploy cloud entrypoint and bridge compatibility for processing payload + room propagation.

## Step 3: API server update

Deploy server route parsing + forwarding of processing payload.
Keep runtime flag off to preserve behavior.

## Step 4: Observability activation

Enable mode/profile logs and metrics while behavior remains default.
Confirm payload parity across local/cloud.

## Step 5: Runtime flag canary

Enable fast-mode runtime behavior for small percentage of traffic or internal cohort.

## Step 6: UI rollout

Expose frontend toggle only after backend/runtime parity is confirmed.

## Step 7: Gradual expansion

Increase traffic percentage while monitoring latency, errors, and quality indicators.

---

## Migration of Profile Config

Store processing profiles in a central config source (character settings or dedicated runtime config):

- `default` profile (implicit)
- `fast` profile (`fast-v1`)

Migration requirements:

1. startup validation of profile schemas
2. safe fallback when profile missing/invalid
3. consistent config in local and cloud deployments

---

## Rollback Strategy

## Soft rollback (preferred)

1. Disable `FAST_MODE_RUNTIME_ENABLED`.
2. Keep contract acceptance active for compatibility.
3. Continue logging incoming mode for diagnostics.

This returns behavior to default mode with minimal deploy changes.

## Hard rollback

If needed:

1. disable UI flag
2. disable API forwarding
3. revert cloud/runtime artifacts

Use only when soft rollback is insufficient.

---

## Data and State Safety

Fast mode should not require schema migration of persisted conversation data.

If mode metadata is persisted:

- treat as optional
- avoid hard dependencies in read path
- ensure old records remain valid

---

## Rollout Monitoring Gates

Do not progress rollout stage unless all gates pass:

1. no mode propagation mismatches
2. no rise in critical error rates
3. measured latency improvements in canary cohort
4. no severe quality/safety regressions

---

## Incident Playbook

## Trigger conditions

- latency regression beyond threshold
- model mismatch incidents
- cross-room/context contamination
- cloud/local parity divergence

## Immediate actions

1. disable runtime fast mode flag
2. confirm behavior returns to baseline
3. inspect logs for propagation and routing anomalies
4. file incident report with failing stage attribution

---

## Exit Criteria

Phase 8 is complete when:

1. fast mode can be enabled/disabled safely via flags
2. deployment order prevents compatibility breaks
3. rollback is tested and documented

