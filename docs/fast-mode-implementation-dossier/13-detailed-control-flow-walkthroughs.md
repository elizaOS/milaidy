# Detailed Control-Flow Walkthroughs

## Purpose

This appendix provides branch-level walkthroughs with:

- file/function touchpoint
- data entering and leaving each step
- failure points
- fast-mode hook points

It is written as execution trace documentation for implementation and debugging.

---

## Walkthrough A: Typed Chat -> Local Runtime (Non-Streaming)

## A1. UI event capture

- File: `apps/app/src/components/ChatView.tsx`
- Trigger: send button click or enter key submission
- Input: current text box value
- Output: call to context send function

Failure points:

- empty text not filtered in UI
- stale mode toggle state if changed during event batching

Fast-mode hook:

- capture immutable processing snapshot at send trigger

## A2. Context send orchestration

- File: `apps/app/src/AppContext.tsx`
- Function: send handler for conversation message
- Input: text + optional processing options
- Output:
  - optimistic user message append
  - API call dispatch

Failure points:

- conversation id missing and creation fails
- processing precedence resolution bug

Fast-mode hook:

- resolve effective mode from message override/conversation default/app default

## A3. API request serialization

- File: `apps/app/src/api-client.ts`
- Method: conversation send API call
- Input: conversation id, text, processing
- Output: JSON body to API route

Failure points:

- payload shape mismatch
- auth header missing

Fast-mode hook:

- include `processing` object only when defined for backward compatibility

## A4. API route parse and validation

- File: `src/api/server.ts`
- Route: `POST /api/conversations/:id/messages`
- Input: JSON body
- Output: normalized request DTO

Failure points:

- invalid mode/profile type
- empty or non-string text

Fast-mode hook:

- validate and normalize `processing.mode/profile`

## A5. Conversation and room resolution

- File: `src/api/server.ts`
- Input: conversation id from route
- Output: conversation object, room id, user id

Failure points:

- missing conversation
- user/room association mismatch

Fast-mode hook:

- none directly, but this room id must propagate for mode parity diagnostics

## A6. Local vs cloud branch decision

- File: `src/api/server.ts`
- Condition: cloud manager availability

### Branch A6-L (local runtime)

- create memory message
- invoke `runtime.messageService.handleMessage`

Fast-mode hook:

- pass resolved message processing options into `handleMessage`

### Branch A6-C (cloud proxy)

- handled in Walkthrough B

## A7. Message service entry

- File: `eliza/packages/typescript/src/services/message.ts`
- Function: `handleMessage`
- Input: runtime, memory, callback, options
- Output: processing result object

Failure points:

- options not fully propagated to internal branches
- timeout/cancel not wired end-to-end

Fast-mode hook:

- resolve processing profile and model/policy knobs once at entry

## A8. Pre-evaluator pass

- File: `eliza/packages/typescript/src/runtime.ts`
- Function: `evaluatePre`
- Input: message, optional state
- Output: `{ blocked, rewrittenText, reason }`

Failure points:

- expensive or failing validators
- blocking false positives

Fast-mode hook:

- apply evaluator policy for fast mode (keep only critical pre evaluators)

## A9. Initial state composition

- File: `eliza/packages/typescript/src/services/message.ts`
- Call: `runtime.composeState(...)`
- Output: initial provider state object

Failure points:

- expensive provider execution
- dynamic provider over-inclusion

Fast-mode hook:

- strict provider allow-list (`onlyInclude`) for deterministic latency

## A10. Should-respond evaluation

- File: `eliza/packages/typescript/src/services/message.ts`
- Function: `shouldRespond` and optional LLM-based decision

Failure points:

- unnecessary LLM call when simple rule should skip
- model selection mismatch

Fast-mode hook:

- small model for should-respond if LLM evaluation required

## A11. Core response generation

- File: `eliza/packages/typescript/src/services/message.ts`
- Branch: single-shot or multi-step

Failure points:

- hardcoded large model path
- repeated full state composition loops

Fast-mode hook:

- single-shot default
- small model size in structured generation
- reduced retries

## A12. Action processing

- File: `eliza/packages/typescript/src/runtime.ts`
- Function: `processActions`

Failure points:

- action validation and handlers add large latency
- broad action set increases prompt and decision complexity

Fast-mode hook:

- deterministic action allow-list and low action cap

## A13. Post evaluator pass

- File: `eliza/packages/typescript/src/runtime.ts`
- Function: `evaluate`

Failure points:

- post evaluators can add tail latency

Fast-mode hook:

- skip/subset post evaluators in fast profile

## A14. Response accumulation and return

- File: `src/api/server.ts`
- callback appends content text
- response JSON returned to frontend

Failure points:

- empty result on callback contract mismatch
- delayed completion from long tail actions/evaluators

Fast-mode hook:

- record mode/profile in response log envelope for debugging

---

## Walkthrough B: Typed Chat -> Cloud Proxy -> Cloud Runtime

## B1. Steps B1-B5

Identical to A1-A5.

## B6. Cloud proxy branch

- File: `src/api/server.ts`
- Call: `cloudProxy.handleChatMessage(...)`

Failure points:

- room id not forwarded
- processing object dropped

Fast-mode hook:

- forward normalized processing payload and room id together

## B7. Bridge client JSON-RPC call

- File: `src/cloud/bridge-client.ts`
- Output: RPC envelope with `text`, `roomId`, `processing`

Failure points:

- schema mismatch with cloud handler
- timeout and retry behavior inconsistency

Fast-mode hook:

- include explicit mode/profile fields

## B8. Cloud entrypoint parse

- File: `deploy/cloud-agent-entrypoint.ts`
- Parse RPC params and normalize processing

Failure points:

- unknown fields ignored silently with no telemetry
- invalid mode not rejected clearly

Fast-mode hook:

- mode normalization and strict validation

## B9. Cloud runtime message handling

- same logical pipeline as A7-A13

Failure points:

- version skew means cloud runtime misses new mode controls

Fast-mode hook:

- parity with local runtime profile application

## B10. Cloud response propagation

- response text returned via bridge -> proxy -> API -> frontend

Failure points:

- stream chunk assembly mismatch
- metadata/logging parity gaps

Fast-mode hook:

- parity logs include mode/profile and room id

---

## Walkthrough C: Voice Transcript -> Fast Mode Streaming

## C1. Voice transcript callback

- File: `apps/app/src/hooks/useVoiceChat.ts` + `ChatView.tsx`
- Output: send handler invocation

Fast-mode hook:

- voice path may default to fast profile unless user disables

## C2. Request path

- same as A2-A6 with streaming variant where applicable

## C3. Streaming callback context

- Message pipeline uses streaming context around model calls

Failure points:

- chunk filtering can stall first token output
- cancellation not propagated into in-flight model calls

Fast-mode hook:

- prioritize first-token latency and robust abort propagation

## C4. TTS playback

- assistant response chunks may trigger voice output

Failure points:

- overlap between canceled message and old stream chunks
- stale mode mismatch in UI speech behavior

Fast-mode hook:

- bind playback to response/message id and cancel stale streams aggressively

---

## Branch Comparison: Where Fast Mode Must Be Identical

1. mode parsing semantics (local vs cloud)
2. room id propagation
3. model routing outcomes
4. provider/action/evaluator profile application
5. streaming cancellation behavior

Any divergence in these five points is a release blocker.

---

## Debugging Checklist by Stage

1. Confirm frontend payload includes expected processing mode.
2. Confirm API logs normalized mode and room.
3. Confirm cloud bridge payload includes same mode/room.
4. Confirm runtime logs show expected profile and model selection.
5. Confirm provider/action/evaluator inclusion counts match profile.
6. Confirm final response mode tags in telemetry.

