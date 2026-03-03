# Current System Control-Flow Map (Ground Truth)

This document maps control flow across runtime, API, websocket, frontend, and onboarding using current code paths.

## A. Runtime Initialization Flow (`src/runtime/eliza.ts`)

## A1. Plugin and environment preparation

1. Loads Milady config and applies environment-derived settings.
2. Resolves plugin set from:
   - core plugins
   - provider env detection
   - connector config
   - plugin allow/entries config
3. Forces compatibility guards (example: `IGNORE_BOOTSTRAP=true` for current runtime stack assumptions).
4. Constructs runtime character from config (name/style/system/bio/etc).
5. Builds `AgentRuntime`.

## A2. Runtime startup and API server coupling

1. Runtime initializes services/plugins.
2. API server is started and passed `runtime`.
3. API server captures logs by patching logger pathways.
4. Runtime + API now share process memory (important for event bridging later).

## A3. CLI chat path (separate from web UI path)

1. Ensures deterministic CLI room/world.
2. Ensures world ownership metadata (`ownership.ownerId`).
3. Reads user input.
4. Creates message memory with `source: "client_chat"` and DM channel type.
5. Calls `runtime.messageService.handleMessage(...)`.
6. Streams callback text to terminal.

## B. API Server Flow (`src/api/server.ts`)

## B1. Server state model

`ServerState` currently includes:

- runtime pointer
- agent lifecycle state (`running`, `paused`, etc)
- in-memory `logBuffer`
- in-memory chat identity (`chatUserId`, `chatRoomId`)
- in-memory conversation map
- cloud/app manager state

Notably missing:

- explicit admin identity model
- explicit role map
- event replay buffer
- websocket subscription state per client

## B2. Conversation flow (web chat path)

### B2.1 Conversation creation

`POST /api/conversations`:

1. Generates conversation id.
2. Derives deterministic room id from `web-conv-${id}`.
3. Stores metadata in in-memory map.
4. Calls `ensureConversationRoom` if runtime exists.

### B2.2 Room ensure path

`ensureConversationRoom(conv)`:

1. Ensures `chatUserId` exists (random UUID in-memory).
2. Computes world id `"{agentName}-web-chat-world"`.
3. Calls `runtime.ensureConnection(...)` with:
   - `entityId = chatUserId`
   - `roomId = conversation room`
   - source `client_chat`
   - DM channel
   - ownership metadata
4. Reads world and repairs `world.metadata.ownership.ownerId`.

Key behavior:

- ownership is set
- roles are not initialized
- chat user identity is process-memory scoped, not durable

### B2.3 Message send path

`POST /api/conversations/:id/messages`:

1. Validates conversation and text.
2. Routes cloud path if proxy active.
3. Local runtime path:
   - ensures room/user
   - builds user memory
   - invokes `runtime.messageService.handleMessage(...)`
   - collects response text via callback + fallback return payload
4. updates conversation `updatedAt`.

Failure behavior:

- 404 when conversation missing
- 503 when runtime absent
- generic 500 on generation failures

## B3. Legacy `/api/chat` path

A separate room/user bootstrap path exists for `/api/chat`, with similar ownership repair logic, and optional SSE in cloud proxy mode.

Important risk:

- Two parallel chat entry points can drift in behavior (`/api/chat` vs `/api/conversations/:id/messages`).

## B4. Workbench overview path

`GET /api/workbench/overview`:

- collects goals and todos from plugin services if available
- returns synthetic autonomy object:
  - `enabled: true`
  - `thinking: false`

This is not currently tied to real AutonomyService state transitions.

## B5. Logs path

`GET /api/logs`:

- filters from in-memory `logBuffer`
- returns up to last 200 entries

No websocket push for logs currently; this is pull/read.

## B6. Websocket path

### B6.1 Upgrade and connection

- accepts only `/ws`
- keeps `Set<WebSocket>`
- on connect sends initial `status` message
- supports ping/pong message

### B6.2 Broadcast behavior

- status is broadcast every 5s
- no event categories beyond status/pong

Implication:

- UI cannot represent loop internals from websocket today.

## C. Frontend Control Flow

## C1. API client (`apps/app/src/api-client.ts`)

Current websocket client:

1. Computes `ws://host/ws` or `wss://`.
2. Reconnects with backoff.
3. dispatches incoming events by `data.type` string.

This already supports arbitrary event types structurally (handler map), but AppContext only subscribes to `"status"` currently.

## C2. AppContext (`apps/app/src/AppContext.tsx`)

Mount sequence:

1. Loads onboarding state + status.
2. Loads conversations and active messages.
3. Connects websocket.
4. Subscribes to `"status"` only.
5. Loads additional app surfaces (wallet/workbench/etc).

Chat send flow:

1. optimistic user message append
2. `sendConversationMessage(...)` REST call
3. assistant message append on response
4. fallback handling for 404 and reload path

There is currently no event-state store for autonomy streams.

## C3. Layout (`apps/app/src/App.tsx`)

For chat tab:

- left: `ConversationsSidebar` (`w-60`)
- center: `ChatView`
- right: `WidgetSidebar` (`w-[260px]`)

`WidgetSidebar` currently focuses on goals/todos, not autonomy event streams.

## D. Eliza Core Event and Autonomy Internals

## D1. Message service (`eliza/packages/typescript/src/services/message.ts`)

`handleMessage` path:

1. starts run (`runtime.startRun(...)`)
2. emits run lifecycle events (`RUN_STARTED`, timeouts, `RUN_ENDED`)
3. emits message sent/received events through runtime event pipeline
4. executes model/action/evaluator flow

This is the primary event source that can feed autonomy UI.

## D2. Agent event service (`eliza/packages/typescript/src/services/agentEvent.ts`)

Capabilities:

- typed event streams (`assistant`, `action`, `provider`, `evaluator`, etc.)
- run-seq ordering per run id
- listener subscription APIs
- run context registration (session key, verbosity, agent/room metadata)

Potential integration:

- Milady API can subscribe and rebroadcast to websocket clients.

## D3. Autonomy service (`eliza/packages/typescript/src/autonomy/service.ts`)

Key properties:

- deterministic autonomy room id per agent
- dedicated autonomy entity id (to avoid self-message skip)
- recurring task (`AUTONOMY_THINK`) with blocking + repeat + queue tags
- circuit breaker backoff on consecutive failures
- messageService pipeline invocation for autonomy prompts

This means autonomy operations can produce normal event streams if bridged correctly.

## E. Role and Ownership Semantics (Core)

Core role/settings logic expects:

- ownership via `world.metadata.ownership.ownerId`
- role hierarchy via `world.metadata.roles`
- DM/onboarding settings access based on owner-world lookup

Milady currently populates ownership but does not systematically populate roles.

## F. Legacy Reference Pattern (Hyperscape)

Hyperscape dashboard demonstrates:

- thought panel
- logs panel
- activity feed

but mostly via polling intervals rather than push stream.

Value for Milady:

- UI decomposition patterns are useful.
- transport/event model should be upgraded to push+replay.

## G. Key Architectural Constraint Summary

1. Event source quality already exists in core.
2. Milady transport and state management is the bottleneck.
3. Admin identity requires explicit persistent model.
4. Context blending requires token-budget discipline.
5. UI needs event-rate controls before "show everything" can be safe.

