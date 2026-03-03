# Critical Assessment of Prior Recommendation

## Purpose

This document critically assesses the previous recommendation (custom Milady-side MessageService wrapper/fork + optional Eliza core changes) against verified control flow in the current codebase.

It focuses on:

- assumptions that were valid
- assumptions that were incomplete or incorrect
- hidden coupling and operational risk
- what must change in the recommendation

---

## Prior Recommendation (Recap)

The prior direction was:

1. Add `fastMode` in Milady request path.
2. Use `MessageProcessingOptions` where possible.
3. For missing controls (especially main model sizing), implement custom service behavior in Milady.
4. Propose longer-term Eliza core support for per-message mode.

This was directionally correct, but there are important constraints and risks that require a more explicit staged architecture.

---

## What Was Correct

- **Need for dual mode is real:** existing code has no robust per-message fast/autonomous split.
- **`MessageProcessingOptions` is a valid extension point:** `handleMessage` already accepts options.
- **Main model override is currently incomplete:** main response generation path uses explicit large model size in key calls.
- **Runtime-global setting mutation is dangerous:** any approach that mutates runtime shared state per request introduces race risk.
- **Cloud and local parity must be solved together:** fast mode must survive both transport paths, not only local API runtime.

---

## Verified Critical Gaps

## 1) Main generation model is not controlled by existing public options

### Assumption
`shouldRespondModel` and related message options can make fast mode small-model.

### Reality
In `DefaultMessageService`, major response planning/generation calls use `dynamicPromptExecFromState` with `modelSize: "large"` in single-step and multi-step core logic.

### Impact
You can reduce some decisions and retries, but the heaviest planner path can still stay on large model, defeating latency goals.

### Consequence
A wrapper-only strategy is insufficient unless it forks large parts of core logic.

---

## 2) `LLMMode` is runtime-wide, not message-scoped

### Assumption
Set `runtime.llmMode` for one request and restore after completion.

### Reality
`getLLMMode()` resolves from runtime/character-level settings. The runtime instance is shared, and concurrent message processing is supported.

### Impact
Concurrent fast + normal requests can cross-contaminate model routing.

### Consequence
Per-request mode must be context-scoped (for example AsyncLocalStorage/request context), not runtime mutable shared field.

---

## 3) Provider/action/evaluator control is not first-class in message options

### Assumption
Fast mode can be fully expressed via existing `MessageProcessingOptions`.

### Reality
Current options do not include deterministic provider/evaluator/action profile controls. `composeState` has `includeList`/`onlyInclude`, but `processMessage` does not expose this as stable caller API knobs.

### Impact
Any fine-grained filtering requires:

- forking message pipeline logic, or
- introducing first-class options in Eliza core.

### Consequence
A robust solution requires core extension unless you accept brittle Milady-only patching.

---

## 4) Action filtering knobs are global-oriented

### Assumption
ActionFilterService can be safely tuned per request by changing config.

### Reality
Filter config is read from runtime settings and service-level state, designed as global behavior.

### Impact
Changing filter aggressiveness globally for fast requests can alter normal-mode behavior.

### Consequence
Need per-call override parameters or deterministic static profile selection for fast mode.

---

## 5) Cloud path parity had hidden room routing weakness

### Assumption
Conversation API + cloud proxy keeps conversation identity equivalent to local path.

### Reality
`CloudRuntimeProxy.handleChatMessage` defaults room id to `"web-chat"` if not passed; in conversation route, room may not be forwarded consistently.

### Impact
Cross-conversation bleed risk and reduced context separation in cloud mode.

### Consequence
Fast mode work must include strict room propagation and parity tests.

---

## 6) Conversation API test coverage is thin where this feature lives

### Assumption
Existing chat endpoint tests are enough.

### Reality
Most existing tests emphasize `/api/chat` and runtime-level e2e flows; `/api/conversations/:id/messages` coverage is limited or absent in critical fast-mode branches.

### Impact
Regression risk is high in the exact code path where fast mode is expected for UI voice/chat experiences.

### Consequence
Feature must include new tests specifically on conversation endpoints, cloud bridge params, and streaming.

---

## 7) Request context infrastructure is not yet fully exploited for settings

### Assumption
Request-context APIs already enforce per-request setting lookup everywhere.

### Reality
There is request-context scaffolding, but behavior and comments indicate partial adoption and potential mismatch with actual setting resolution in active runtime path.

### Impact
Relying on request-context implicitly without explicit integration plan can create false confidence.

### Consequence
Fast-mode implementation should explicitly wire per-request overrides where needed, not assume ambient behavior.

---

## 8) Abort/cancellation path is not fully propagated

### Assumption
`abortSignal` in message options gives full cancellation coverage.

### Reality
`dynamicPromptExecFromState` supports abort behavior, but upstream invocation does not always propagate cancellation context consistently through all message stages.

### Impact
Voice/chat interruption latency may remain poor in fast mode unless cancellation is explicitly threaded.

### Consequence
Include abort propagation as part of fast-mode performance envelope, not as optional cleanup.

---

## 9) Wrapper/fork strategy creates high drift tax

### Assumption
A Milady custom MessageService can stay close enough to upstream.

### Reality
The message pipeline is large and evolving (prompt schema handling, structured validation, autonomy integration, streaming behavior, retries, evaluator flow).

### Impact
Forking incurs continuous merge burden and subtle compatibility regressions.

### Consequence
Use wrapper only as short-lived bridge. Prefer minimal upstream core extension quickly.

---

## Assumption Audit Table

| Assumption | Verified Status | Risk |
| --- | --- | --- |
| Existing message options can enforce small models end-to-end | False (incomplete) | High latency remains |
| Runtime llm mode can be mutated safely per request | False | Concurrency race |
| Action/provider filtering can be request-specific without core changes | Mostly false | Unpredictable behavior |
| Cloud and local path are already parity-safe for room/mode | Incomplete | Context leakage |
| Existing tests will catch fast-mode regressions | False | Silent production regressions |

---

## What Is Wrong with the Prior Plan, Exactly

The prior plan underweighted three hard constraints:

1. **Control-surface mismatch:** desired controls (model, providers, actions, evaluators, retries) are not all accessible from current public options.
2. **Concurrency correctness:** global runtime mutation was treated as potentially acceptable short-term; in practice this is unsafe for parallel requests.
3. **Operational completeness:** cloud parity, room identity, cancellation, and observability were not elevated to must-have acceptance gates early enough.

---

## Corrected Recommendation

## Decision

Adopt a **hybrid staged plan** where minimal contract wiring lands first, but core per-message controls are introduced before calling the feature production-ready.

## Why this is superior

- avoids long-lived fork of message service internals
- preserves upstream compatibility
- fixes concurrency correctness early
- gives measurable latency wins with safer rollback

## Non-negotiable acceptance criteria for “fast mode complete”

1. Fast mode model routing is message-scoped and race-safe.
2. Provider/action/evaluator scope is deterministic per message.
3. Cloud and local paths have behavioral parity.
4. Conversation room identity is preserved everywhere.
5. Abort/cancel works end-to-end for voice/chat interruptions.
6. Test suite includes conversation route + cloud bridge + concurrent mixed-mode requests.

---

## Residual Weaknesses Even in Corrected Plan

- Some plugins may internally call heavy models independent of main planner setting.
- “Fast” quality can degrade if provider filtering removes context dependencies.
- If action side effects are reduced, user expectations around autonomous behavior can mismatch.
- Model provider-level queueing and remote latency may dominate after pipeline optimizations.

These are manageable only with strict observability and iterative profile tuning.

---

## Final Assessment

The previous recommendation was directionally strong but operationally under-specified.  
The corrected plan should keep its staged spirit, but it must treat per-message core controls, cloud parity, concurrency safety, and test hardening as first-class deliverables, not optional polish.

