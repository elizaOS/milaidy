# Phase 3: Eliza Message Pipeline Fast Path

## Phase Goal

Introduce first-class **message-scoped processing profile** support in Eliza pipeline so fast mode can reliably change behavior without forking the entire MessageService.

This phase is the core inflection point where fast mode becomes real, not just a transported flag.

---

## Why This Phase Is Required

Transporting mode intent is necessary but insufficient. Current message pipeline does not expose stable knobs for:

- model-size control across all core generation calls
- deterministic provider/evaluator/action profile controls
- concurrency-safe per-message behavior

Without this phase, fast mode remains partial and fragile.

---

## Proposed New Core Types

## `eliza/packages/typescript/src/types/message-service.ts`

Add strongly typed mode/profile controls:

```ts
export type ProcessingMode = "default" | "fast";

export type ProviderPolicy = {
  onlyInclude?: string[];
  includeList?: string[];
};

export type EvaluatorPolicy = {
  skipPre?: boolean;
  skipPost?: boolean;
  preOnlyInclude?: string[];
  postOnlyInclude?: string[];
};

export type ActionPolicy = {
  disableAll?: boolean;
  allowList?: string[];
  maxActions?: number;
};

export interface MessageProcessingOptions {
  // existing fields...
  mode?: ProcessingMode;
  profile?: string;
  responseModelSize?: "small" | "large";
  providerPolicy?: ProviderPolicy;
  evaluatorPolicy?: EvaluatorPolicy;
  actionPolicy?: ActionPolicy;
}
```

Design notes:

- all new fields optional
- default behavior unchanged when omitted
- avoid loose map types; keep explicit shape for safety and readability

---

## MessageService Resolution Layer

## `eliza/packages/typescript/src/services/message.ts`

Add internal resolver at start of `handleMessage`:

```ts
type ResolvedProcessingConfig = {
  mode: "default" | "fast";
  responseModelSize: "small" | "large";
  useMultiStep: boolean;
  maxRetries: number;
  providerPolicy?: ProviderPolicy;
  evaluatorPolicy?: EvaluatorPolicy;
  actionPolicy?: ActionPolicy;
};
```

Resolution precedence:

1. explicit `handleMessage` options
2. message content metadata (if supported)
3. runtime/character defaults

This avoids hidden behavior and makes every decision auditable.

---

## Pipeline Adaptation Points

## A) Should-respond path

- keep existing shortcut rules
- when should-respond model is used, default to smaller model in fast mode unless overridden

## B) State composition call

- pass deterministic provider policy when mode is fast
- avoid implicit dynamic provider expansion if profile says strict subset

## C) Core response generation call

- replace hardcoded large model size with resolved `responseModelSize`
- ensure both single-step and multi-step branches use same resolved config

## D) Action processing

- apply action policy before invoking `runtime.processActions`
- support disable-all or allow-list in fast mode

## E) Evaluator phases

- skip or subset evaluator execution according to policy
- preserve critical safety evaluators where required by profile

---

## Backward Compatibility Rules

1. No option specified -> exact current behavior.
2. Unknown profile -> fallback to default behavior with warning log.
3. Invalid policy combinations -> reject at boundary or normalize safely.

Example normalizations:

- `disableAll=true` + `allowList` => disableAll wins
- `maxActions < 0` => treat as invalid, fallback to default

---

## Fast Profile Defaults (Initial)

Suggested default fast profile:

- `responseModelSize: "small"`
- `useMultiStep: false`
- reduced retries/timeouts
- deterministic provider allow-list
- limited action allow-list
- skip non-critical post evaluators

This should be treated as configurable profile, not hardcoded forever.

---

## File-Level Change Set

1. `types/message-service.ts`
   - add new types and option fields
2. `services/message.ts`
   - add processing config resolver
   - thread resolved config into should-respond, composeState, core generation, actions, evaluators
3. `types/generated/eliza/v1/message_service_pb.ts` (if proto source governs generated type flow)
   - add corresponding fields if gRPC/proto contract is used in these paths
4. consumer call sites
   - Milaidy server and cloud entrypoint pass mode/profile/options

---

## Risk Analysis

1. **Behavior drift in default mode**
   - Mitigation: snapshot tests and parity tests for no-options path.
2. **Profile mismatch across environments**
   - Mitigation: central profile resolver and deterministic defaults.
3. **Safety evaluator skip accidents**
   - Mitigation: evaluator categories with critical/non-critical labels.
4. **Action side-effect regressions**
   - Mitigation: strict allow-list and staged rollout.

---

## Verification Strategy

1. Unit tests for resolver precedence and normalization.
2. Pipeline tests verifying each mode branch.
3. Concurrency tests with mixed mode requests.
4. Golden response-shape tests for both modes.

---

## Exit Criteria

Phase 3 is complete when:

1. message-scoped mode deterministically changes model and pipeline behavior
2. default mode remains backward compatible
3. no runtime-global mutation is required for per-message behavior

