# Phase 5: Model Routing and Concurrency Safety

## Phase Goal

Provide message-scoped model selection that is:

- fast-mode aware
- concurrency-safe
- cloud/local consistent
- backward compatible

This is the most critical correctness phase.

---

## Current Risk Summary

Today, model routing mixes:

1. explicit call-site model size choices
2. runtime/global LLM mode overrides

This creates a correctness gap for per-message fast mode under concurrency.

---

## Why Runtime-Global Mutation Is Unsafe

If request A sets runtime mode to `SMALL` and request B expects `DEFAULT`:

1. A starts and mutates runtime mode.
2. B starts before A restores mode.
3. B inherits A mode accidentally.
4. Responses become nondeterministic and hard to debug.

Given parallel request handling is normal, this is not an edge case.

---

## Proposed Model Routing Context

Introduce request-scoped routing context:

```ts
type ModelRoutingContext = {
  llmModeOverride?: "DEFAULT" | "SMALL" | "LARGE";
  explicitModelByType?: Partial<Record<ModelType, string>>;
  profile?: string;
};
```

Use AsyncLocalStorage context pattern (already used in streaming context).

---

## Integration Points

## A) MessageService entry

At message handling start:

- resolve processing config
- derive `ModelRoutingContext`
- run pipeline inside context wrapper

## B) Runtime model invocation

In `runtime.useModel` resolution path:

1. check message-scoped context override
2. apply override for text generation model types
3. fall back to existing runtime/character behavior if no override

This keeps old behavior intact for calls not in context.

## C) Structured prompt execution

Where `dynamicPromptExecFromState` currently uses fixed large defaults, replace with resolved per-message size.

---

## Interaction with Existing Context Systems

Eliza already has:

- streaming context
- trajectory context
- request context scaffolding

Model routing context should follow same design principles:

- explicit `runWith...Context`
- internal `get...Context`
- no shared mutable global request state

---

## Compatibility with Non-Message Paths

Some model calls happen outside `handleMessage` (actions/services/background tasks).
Design must preserve defaults there.

Rules:

- if no model routing context, existing behavior remains exactly unchanged
- background/autonomy tasks may optionally set their own context later

---

## Profile-to-Model Mapping

Recommended initial mapping:

- default profile -> no override
- fast profile -> `llmModeOverride = SMALL`

Optional extension:

- profile-specific explicit model aliases by model type

Example:

- `TEXT_SMALL` -> ultra-low-latency conversational model
- `TEXT_LARGE` remains available for default mode only

---

## Cancellation and Voice UX

Fast mode for voice should pair with robust cancellation:

- propagate abort signal into dynamic prompt and model calls
- ensure interrupted calls release resources quickly

Model routing and cancellation should be validated together in load tests.

---

## File-Level Changes

Potential core files:

1. `runtime.ts`
   - read model routing context in `useModel`
2. `services/message.ts`
   - establish context at request start
   - pass response model size through generation branches
3. context module (new)
   - `model-routing-context.ts` or extension of request context
4. types
   - add explicit message option fields for model routing profile

---

## Alternative Implementation Options

## Option A: mutate runtime mode in try/finally

Pros:

- minimal code change

Cons:

- race-prone under concurrency
- hard to prove safe

Decision: reject.

## Option B: duplicate message pipeline and call model types directly

Pros:

- no runtime changes required

Cons:

- high maintenance drift
- difficult parity with upstream changes

Decision: avoid as long-term architecture.

## Option C: request-scoped model context (recommended)

Pros:

- concurrency-safe
- minimal behavior change outside message path
- scalable to future per-request controls

Cons:

- requires core runtime integration

---

## Risks

1. Missing context propagation in nested async path.
2. Incomplete override coverage for all generation call sites.
3. Accidental override of non-text model types.
4. Cloud and local running different core versions.

Mitigation:

- context unit tests
- call-site audit checklist
- model-type guardrails
- version gating in deployment

---

## Verification Plan

1. Concurrent mixed-mode tests (fast + default in parallel).
2. Assert model type selected for each request using logs/metrics.
3. Chaos test with interleaved latency delays to expose race conditions.
4. Validate identical behavior on local and cloud runtime builds.

---

## Exit Criteria

1. Per-message model routing is deterministic under concurrency.
2. No runtime-global mutation required.
3. Default behavior unchanged when no fast mode specified.

