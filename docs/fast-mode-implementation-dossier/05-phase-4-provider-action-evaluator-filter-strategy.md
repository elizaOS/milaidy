# Phase 4: Provider, Action, and Evaluator Filtering Strategy

## Phase Goal

Define deterministic low-latency filtering for fast mode across:

- providers
- actions
- evaluators

without breaking autonomous/default behavior.

---

## Problem Statement

Fast mode fails if only model size is reduced while orchestration remains heavy.
Current pipeline still spends latency budget in:

- repeated provider composition
- action candidate validation/filtering
- evaluator passes

Therefore, this phase designs the **capability surface** for fast mode, not only model routing.

---

## Strategy Principles

1. Deterministic first, adaptive second.
2. Allow-list over deny-list for fast mode safety.
3. Preserve critical safety checks even in fast mode.
4. Keep default mode behavior unchanged.
5. Support profile evolution by config, not hardcoded branches.

---

## A) Provider Filtering Design

## Current constraints

- `composeState` can enforce strict provider subset only with `onlyInclude=true`.
- if `onlyInclude=false`, dynamic providers and alwaysRun behavior may add overhead.
- message pipeline currently mixes strict and non-strict compose calls.

## Fast-mode design

Introduce profile provider policy:

```ts
type ProviderPolicy = {
  onlyInclude?: string[];
  includeList?: string[];
  strict?: boolean; // maps to onlyInclude=true
};
```

For fast profile:

- use strict mode with a minimal provider allow-list
- avoid dynamic provider auto-inclusion unless explicitly requested

Suggested starter allow-list:

- `CHARACTER`
- `RECENT_MESSAGES`
- `ACTIONS` (if actions remain enabled)
- one lightweight identity/context provider if required

Avoid heavyweight providers by default in fast mode unless proven necessary.

---

## B) Action Filtering Design

## Current constraints

- `actionsProvider` uses ActionFilterService if present, else validates all actions.
- ActionFilterService config is global-oriented.
- ToolPolicyService exists but is not central in message generation path today.

## Fast-mode design (staged)

1. **Deterministic allow-list gate**
   - before dynamic filtering, enforce action allow-list per profile.
2. **Optional relevance ranking inside allow-list**
   - ActionFilterService ranks only remaining allowed actions.
3. **Action count cap**
   - max actions surfaced to prompt in fast mode.

This gives predictable behavior and lower validation cost.

## File candidates

- `bootstrap/providers/actions.ts`
  - apply allow-list before filter/validate path
- `services/action-filter.ts`
  - add optional per-call override for final top-K and threshold
- `services/message.ts`
  - pass resolved action policy from message options/profile

---

## C) Evaluator Filtering Design

## Current constraints

- `evaluatePre` and `evaluate` iterate runtime evaluators directly.
- no message-level evaluator profile argument in runtime methods.
- evaluator provider can validate all evaluators for prompt context.

## Fast-mode design

Add evaluator policy:

```ts
type EvaluatorPolicy = {
  skipPre?: boolean;
  skipPost?: boolean;
  preOnlyInclude?: string[];
  postOnlyInclude?: string[];
};
```

Policy recommendations:

- keep mandatory security pre-evaluators
- skip non-critical reflective post evaluators in fast mode
- optionally run post evaluators asynchronously after response emission if needed

---

## D) Capability Metadata Extensions

To avoid fragile name-based policies, add optional tags/classification.

Potential type additions:

- provider tags (`latency:high`, `mode:default-only`, `safety:critical`)
- evaluator tags (`phase:pre`, `critical`, `analytics`)
- action tags already exist and can be leveraged immediately

This improves maintainability of profile policies at scale.

---

## E) Suggested Fast Profile v1

## Providers

- strict allow-list of lightweight providers

## Actions

- allow only conversational and essential utility actions
- disable broad autonomy actions
- cap action candidates to low single digits

## Evaluators

- keep mandatory pre safety checks
- skip most post evaluators

## Runtime knobs

- single-shot mode
- lower retry count
- smaller model

---

## Critical Tradeoffs

1. **Latency vs capability**
   - fewer providers/actions means faster responses but less autonomous depth.
2. **Safety vs throughput**
   - skipping evaluators risks missing moderation/security signals.
3. **Determinism vs adaptability**
   - strict lists improve predictability but can reduce contextual intelligence.

The profile must be treated as product policy, not only engineering optimization.

---

## Alternative Architectures

## Option A: Name-based policy only

Pros:

- quick to implement

Cons:

- brittle as plugins evolve
- high maintenance overhead

## Option B: Tag-driven policy (recommended medium-term)

Pros:

- scalable, composable profile definitions

Cons:

- requires metadata hygiene

## Option C: Pure relevance filtering

Pros:

- adaptive behavior

Cons:

- less deterministic
- harder to guarantee latency/safety envelope

---

## Implementation Sequence (Within Phase)

1. Add profile policy types.
2. Enforce deterministic allow-list gate.
3. Add per-call action filter overrides.
4. Add evaluator inclusion controls.
5. Add metadata tags for future policy evolution.

---

## Risks

1. Missing required provider causes response quality collapse.
2. Action allow-list excludes critical fallback action.
3. Skipped evaluator leads to compliance/safety regression.
4. Policy config drift between local and cloud deployments.

Mitigation:

- config validation
- safe defaults
- startup diagnostics showing effective profile composition
- integration tests asserting profile content

---

## Exit Criteria

1. Fast profile capability set is deterministic and auditable.
2. Default profile behavior remains unchanged.
3. Measurable latency reduction is observed without unacceptable quality/safety regression.

