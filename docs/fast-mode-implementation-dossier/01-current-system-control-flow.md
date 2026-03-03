# Current System Control Flow

## Objective

This document maps current behavior from UI input to final model response, with explicit branch points in local and cloud execution paths. It is the baseline needed to design fast mode without breaking existing autonomous mode.

---

## File Inventory and Responsibilities

## Frontend

- `apps/app/src/components/ChatView.tsx`
  - Chat input capture
  - Voice transcript handoff
  - Send trigger and UI feedback
  - Streaming/render behavior
- `apps/app/src/hooks/useVoiceChat.ts`
  - Voice lifecycle and transcript emission
- `apps/app/src/AppContext.tsx`
  - Conversation state orchestration
  - Message send orchestration and optimistic UI
  - Error retry behavior for missing conversations
- `apps/app/src/api-client.ts`
  - HTTP request shape and auth headers
  - Endpoint-specific methods for conversations and agent APIs

## Milady API / Runtime Bridge

- `src/api/server.ts`
  - HTTP route parsing
  - Conversation lookup and user binding
  - Local runtime dispatch or cloud proxy dispatch
- `src/cloud/cloud-proxy.ts`
  - Local API to cloud bridge abstraction
- `src/cloud/bridge-client.ts`
  - JSON-RPC envelope to cloud bridge endpoint
- `deploy/cloud-agent-entrypoint.ts`
  - Cloud-side JSON-RPC handler and runtime invocation

## Eliza Core

- `eliza/packages/typescript/src/services/message.ts`
  - Main message pipeline (`handleMessage`, `processMessage`)
  - should-respond evaluation
  - single-step and multi-step response flows
- `eliza/packages/typescript/src/runtime.ts`
  - Provider composition, action execution, evaluator execution
  - Model invocation and model type routing
  - dynamic prompt structured execution
- `eliza/packages/typescript/src/services/action-filter.ts`
  - Relevance filtering for actions/providers
- `eliza/packages/typescript/src/autonomy/service.ts`
  - Goal update and autonomy-related side effects

---

## End-to-End Path A: Frontend Typed Message -> Local Runtime

## Sequence

1. User enters text in `ChatView`.
2. `ChatView` calls `handleChatSend` from context.
3. `AppContext.handleChatSend`:
   - validates local state
   - ensures or creates conversation id
   - appends optimistic user message
   - calls `client.sendConversationMessage(conversationId, text)`
4. `api-client` sends `POST /api/conversations/:id/messages` with JSON body.
5. `server.ts` route handler:
   - parses body and validates text
   - finds conversation and associated room
   - if cloud manager active: forwards to proxy
   - else: builds memory message and calls `runtime.messageService.handleMessage`
6. `DefaultMessageService.handleMessage` orchestrates message pipeline.
7. Callback appends outgoing text chunks into server response accumulator.
8. API returns `{ text, agentName }`.
9. Frontend appends assistant response and updates UI state.

---

## End-to-End Path B: Voice Transcript -> Local Runtime

The path is mostly identical to typed message, with additional voice pipeline states:

1. Voice hook emits transcript callback.
2. `ChatView` receives transcript and triggers send path.
3. Message follows same context and API path as typed input.
4. Assistant response text can trigger TTS playback based on mute/voice settings.

Fast-mode implication: voice route often needs stricter latency/cancellation than typed route, so fast mode should be first-class in this path.

---

## End-to-End Path C: Frontend -> Cloud Proxy

When cloud manager/proxy is active in `server.ts`:

1. Conversation route receives message.
2. Route branches to cloud proxy.
3. Proxy calls bridge client (`sendMessage` or stream equivalent) with JSON-RPC method (for example `message.send`).
4. Cloud bridge endpoint forwards to cloud-agent entrypoint runtime.
5. Cloud entrypoint creates message memory and calls `runtime.messageService.handleMessage`.
6. Cloud response text is returned back through bridge to Milady server to frontend.

Critical observation: cloud parity requires preserving room/conversation identity and any new fast-mode fields through every layer.

---

## Control Flow Inside `DefaultMessageService`

High-level pipeline segments:

1. **Entry and option normalization**
   - read defaults from runtime settings
   - merge explicit `MessageProcessingOptions`
2. **Pre-flight checks**
   - self-message skip checks
   - room/mute checks
3. **Pre-evaluator pass**
   - run evaluators configured for pre-phase
4. **Memory persistence**
   - persist incoming memory for context continuity
5. **State composition**
   - build initial state via providers (`runtime.composeState`)
6. **Attachment/media handling**
   - add attachment context if present
7. **Should-respond decision**
   - shortcut for DM/client_chat/mention cases
   - optional model-based should-respond prompt path
8. **Response generation core**
   - single-shot or multi-step branches
   - dynamic structured prompt execution and parsing
9. **Action execution**
   - process selected actions and callbacks
10. **Post-evaluator pass**
    - evaluate final response and run follow-up evaluator behavior
11. **Result packaging**
    - return mode and side-effect metadata

---

## Control Flow Inside `runtime.composeState`

`composeState` has multiple inclusion channels:

- always-run providers
- explicit `includeList`
- `onlyInclude` strict subset mode
- dynamic relevance inclusion via keywords and ActionFilterService provider filtering

Fast-mode implication:

- deterministic low-latency profiles require predictable provider subset behavior
- if `onlyInclude` is not used, dynamic inclusion may still pull in expensive providers

---

## Control Flow Inside `runtime.processActions`

Main behavior:

- chooses action planning strategy (single vs planning-enabled)
- validates action eligibility
- invokes action handlers
- emits callback responses and side effects

Fast-mode implication:

- action planning and execution can dominate latency
- filtering strategy must be deterministic and safe for side effects

---

## Control Flow Inside Evaluator Execution

There are two evaluator phases:

- `evaluatePre`: before response generation
- `evaluate`: after response generation

Each evaluator can include validation logic and `alwaysRun` behavior.

Fast-mode implication:

- full evaluator set can add significant latency
- skipping evaluators can alter safety, quality, and side-effect guarantees

---

## Model Selection Control Flow Today

There are two separate model-routing axes:

1. **Explicit modelType/modelSize choices in call sites**
   - some message pipeline calls directly choose large text model for core structured generation
2. **Runtime-level LLM mode override (`DEFAULT`, `SMALL`, `LARGE`)**
   - applies broadly through `runtime.useModel` path

Key issue:

- there is no robust message-scoped, concurrency-safe way to apply model override across all relevant calls today.

---

## Branch Conditions That Matter for Fast Mode

## A) Should-respond skip path

- DM and client-chat messages may bypass expensive should-respond model call.
- This already helps latency in some contexts.
- It does not solve main generation path latency.

## B) Single-shot vs multi-step

- `useMultiStep` affects depth and potential retries.
- Even single-shot still invokes heavy structured generation path by default.

## C) Cloud vs local runtime branch

- Fast-mode contract must pass through both routes.
- Any mismatch produces inconsistent user experience.

## D) Action filter service availability

- If action filter service is missing or disabled, action set behavior changes.
- Fast mode should not silently depend on optional service behavior unless explicitly required.

---

## Latency Hotspots (Current State)

Top likely contributors:

1. Main structured prompt generation + large model call.
2. Provider composition when expensive providers execute.
3. Action filtering/validation and action handlers with external calls.
4. Pre/post evaluator execution.
5. Cloud network overhead and bridge serialization.

This ordering can vary by plugin mix and model provider.

---

## Control-Flow Weaknesses Relevant to Fast Mode

1. **No first-class mode in message contract:** fast vs autonomous intent is implicit, not standardized.
2. **Split behavior surfaces:** model, provider, action, evaluator controls are spread across unrelated APIs.
3. **Cloud/local divergence risk:** no guarantee all fields propagate over bridge paths.
4. **Cancellation propagation gap:** interruption handling is not uniformly enforced across full pipeline.

---

## What This Means for Design

To make fast mode predictable and safe, architecture must provide:

- one explicit mode contract (per message)
- deterministic control profile resolution (not implicit global state)
- local/cloud parity by design
- observability to verify mode application at runtime

The following phase documents define exactly how to implement this.

