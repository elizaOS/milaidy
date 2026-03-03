# Phase 2: Autonomous State Provider

Goal: give autonomous runs bounded awareness of ongoing admin context and loop state without exploding token usage.

## Problem statement

Current autonomy loop operates in its own room and context path. That is correct for isolation, but weak for continuity:

- autonomous loop may lose admin priorities from active chat
- admin-side commitments are not always represented in autonomous turns
- no explicit context contract between admin chat and autonomy tasks

## Files in scope

Likely implementation points:

- `src/runtime/eliza.ts` (plugin/provider wiring)
- `src/api/server.ts` (state source helpers if provider depends on API state)
- new provider module in `src/providers/` (recommended)

Core dependency:

- `eliza/packages/typescript/src/autonomy/service.ts` (context usage model)

## Current control flow assumptions to preserve

1. Autonomy should keep dedicated room/entity to avoid self-message short-circuit behavior.
2. Autonomy should continue using message pipeline for actions/evaluators/memory consistency.
3. Provider injection must be deterministic and bounded.

## Provider responsibilities

`AUTONOMOUS_STATE` provider should return:

1. **Admin chat summary**
   - recent actionable statements from canonical admin conversation(s)
   - open commitments and declared identities

2. **Autonomy loop summary**
   - last successful objective/action outcomes
   - last failure reason and cooldown status (if available)

3. **Execution hints**
   - "continue", "resume", "pause", "await admin confirmation" patterns derived from state

## Context budget strategy (mandatory)

Hard budget example:

- max provider text: 1500 chars
- max admin summary segment: 900 chars
- max loop summary segment: 400 chars
- max metadata footer: 200 chars

Truncation policy:

1. keep recency-first admin items
2. keep unresolved tasks over resolved items
3. keep latest failure if present
4. drop oldest first

## Canonical admin context source options

## Option A: read directly from runtime memories (recommended)

Pros:

- source-of-truth consistent with model context
- avoids API/server in-memory mismatch

Cons:

- requires reliable identification of admin room(s)

## Option B: read from API `state.conversations`

Pros:

- easy to pick active web conversation

Cons:

- fragile across server restarts
- not authoritative for runtime memory history

## Option C: hybrid (runtime memories + API hint)

Pros:

- robust room discovery plus UX relevance

Cons:

- higher complexity

Recommendation: Option C.

## Provider activation policy

Provider should run only when:

1. run is autonomous mode (detected via room id / metadata / source tags)
2. autonomy service currently enabled

Provider should not run for every regular chat message, to avoid contaminating direct user interactions with autonomy-heavy context.

## Data model proposal

Add explicit provider output shape:

```ts
type AutonomousStatePayload = {
  mode: "autonomous";
  adminSummary: string;
  loopSummary: string;
  pendingItems: string[];
  confidence: "high" | "medium" | "low";
};
```

Even if provider returns text to model, structured data should be available in `data` for diagnostics.

## Risk analysis

1. **Context bloat**
   - mitigation: strict char/token caps and deterministic trimming.

2. **Stale admin directives**
   - mitigation: include freshness timestamps and expiry policy.

3. **Conflicting directives**
   - mitigation: last-write-wins + explicit conflict marker in summary.

4. **Leaking sensitive content from admin chat**
   - mitigation: redact known secrets before provider output.

## Failure handling

If provider fails:

- return concise fallback text:
  - "Admin context temporarily unavailable; continue with latest autonomous objective."
- never fail full message pipeline due to provider error.

## Testing requirements

1. Unit:
   - summarization and truncation determinism
   - stale item expiry logic
2. Integration:
   - autonomous run includes provider text
   - standard user chat path not polluted by autonomous summary
3. Regression:
   - no measurable token explosion under sustained autonomy loops

## Done criteria

1. Autonomous runs include bounded admin+loop state context.
2. Provider failure does not break pipeline.
3. Context budget remains stable under stress.

