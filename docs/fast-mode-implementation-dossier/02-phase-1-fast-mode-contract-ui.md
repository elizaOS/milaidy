# Phase 1: Fast-Mode Contract and UI Integration

## Phase Goal

Introduce a stable, explicit contract that allows:

- per-message fast mode (`message override`)
- per-conversation default mode (`session default`)
- optional profile name (for future tuning)

without changing response semantics yet.

This phase is about **intent plumbing and correctness**, not deep optimization.

---

## Design Requirements

1. Must be backward compatible with clients that send only `{ text }`.
2. Must support toggling fast mode in voice and typed chat paths.
3. Must avoid ambiguous implicit state (for example hidden global mode).
4. Must be serializable through local and cloud transport.
5. Must be observable in logs and analytics.

---

## Proposed Request Contract

Use explicit optional processing object:

```ts
type ChatProcessingMode = "default" | "fast";

type ChatProcessingOptions = {
  mode?: ChatProcessingMode;
  profile?: string; // e.g. "voice-fast-v1"
  reason?: string; // optional diagnostics/user intent tag
};

type SendConversationMessageBody = {
  text: string;
  processing?: ChatProcessingOptions;
};
```

Rationale:

- extensible for future fields (timeouts, action policy, model hints)
- avoids proliferating top-level booleans
- clear evolution path to richer per-message controls

---

## UX Model

## Mode precedence

1. Explicit per-message override (highest).
2. Conversation-level default mode.
3. App-level default mode (fallback).

## Suggested UI behavior

- Toggle in chat header for conversation default mode.
- Quick-send modifier for one-off fast message (optional follow-up).
- Voice chat auto-sets mode to fast unless user opts out.

---

## File-Level Changes

## `apps/app/src/components/ChatView.tsx`

Add UI and dispatch fields:

- local state for current mode toggle
- pass `processing` option into `handleChatSend`
- ensure voice transcript send path also passes mode

Key controls:

- visual indicator of active mode
- mode lock during pending request (to avoid accidental mismatch mid-send)

## `apps/app/src/AppContext.tsx`

Extend `handleChatSend` signature:

- old: `(text: string)`
- new: `(text: string, processing?: ChatProcessingOptions)`

Responsibilities:

- merge conversation default + message override
- include resolved processing in optimistic message metadata
- pass to API client

## `apps/app/src/api-client.ts`

Extend request body for conversations:

- old: `{ text }`
- new: `{ text, processing }`

Important:

- preserve compatibility with server expecting old payload
- omit `processing` when undefined

---

## Data Shape and State Ownership

## Suggested frontend state split

- `conversationDefaults[conversationId].mode`
- transient `pendingMessageProcessing` for one-off overrides
- derived `effectiveProcessing` at send time

Why:

- prevents race conditions where UI toggle changes while request is in flight
- gives deterministic attribution in telemetry

---

## Risks in Phase 1

1. **State drift between UI and send payload**
   - Mitigation: derive payload from immutable snapshot at send trigger.
2. **Backward compatibility regression**
   - Mitigation: optional `processing`, no server hard requirement in this phase.
3. **Voice path inconsistency**
   - Mitigation: centralize send API signature so typed/voice call same function.
4. **User confusion over mode source**
   - Mitigation: show whether response used conversation default or one-off override.

---

## Validation Checklist

1. Typed send with no mode still works.
2. Typed send with fast mode includes processing payload.
3. Voice send includes processing payload when toggle enabled.
4. Conversation switch preserves per-conversation default.
5. Reload/app restart behavior for default mode is deterministic (if persisted).

---

## Alternative Approaches Considered

## A) Top-level `fastMode: boolean`

Pros:

- simple
- minimal wire bytes

Cons:

- not extensible
- difficult to version and reason about future controls

## B) Mode encoded in text metadata

Pros:

- no API schema change

Cons:

- brittle
- pollutes prompt/content
- hard to audit and validate

Decision: avoid.

---

## Exit Criteria

Phase 1 is complete when:

1. every send path can carry explicit processing mode intent
2. payload contract is backward compatible
3. logs can confirm mode intent for each outbound request

No performance claims should be made yet until later phases are completed.

