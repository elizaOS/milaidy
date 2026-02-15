# File Control-Flow Deep Dive

This appendix details function-level control flow for key files involved in the autonomy visibility + admin trust initiative.

## 1) `src/api/server.ts`

## Primary responsibilities

1. HTTP route multiplexer for Milaidy control APIs
2. runtime lifecycle endpoint handling
3. conversation orchestration
4. log buffering/filtering
5. websocket server bootstrap

## Critical flow groups

### A) startup flow (`startApiServer`)

1. load config and discover plugins/skills
2. initialize server state object
3. set up log capture and logger patching
4. create HTTP server with `handleRequest`
5. create websocket server and status broadcast interval
6. return `close()` and `updateRuntime()`

Coupling points:

- runtime pointer in state
- logger patching side effects across runtime/plugin logs

### B) onboarding flow (`POST /api/onboarding`)

1. validate onboarding payload
2. mutate config tree
3. apply provider/cloud/connectors/wallet data
4. persist config and report success

Gap for this initiative:

- no explicit admin role/bootstrap write here yet

### C) conversation room ensure flow

`ensureConversationRoom(conv)`:

1. ensure in-memory chat user
2. ensure runtime connection with DM metadata ownership
3. repair world ownership metadata

Gaps:

- no role map writes
- identity process-memory dependency

### D) message handling flow

1. create user memory
2. invoke runtime message service
3. collect callback text
4. return response payload

Gaps:

- no event stream broadcast integration

### E) websocket flow

1. upgrade route filter (`/ws`)
2. connection add/remove
3. initial status send
4. ping/pong support
5. periodic status broadcast

Gaps:

- status-only protocol

## 2) `apps/app/src/api-client.ts`

## Primary responsibilities

1. HTTP fetch wrapper for APIs
2. websocket connection lifecycle
3. event handler registry

## Websocket control flow

1. compute target host/protocol
2. open ws
3. parse incoming JSON message
4. dispatch to handlers by `type`
5. dispatch wildcard handlers
6. reconnect backoff on close

Gaps:

- no typed event contract for autonomy streams
- no replay API helper

## 3) `apps/app/src/AppContext.tsx`

## Primary responsibilities

1. global app state orchestration
2. startup hydration and polling hooks
3. chat conversation action handlers
4. lifecycle action handlers

## Startup control flow

1. onboarding status fetch
2. load conversations
3. connect websocket
4. subscribe to status updates
5. load additional data surfaces

Gaps:

- no event store
- no reconnect replay merge path

## Chat send flow

1. optimistic message append
2. REST message send
3. assistant append
4. fallback/recovery handling

## 4) `apps/app/src/App.tsx`

## Primary responsibilities

1. top-level route shell
2. chat-tab layout composition

Current chat layout:

- conversations sidebar + chat view + widget sidebar

Change required:

- replace widget sidebar with autonomy panel composition.

## 5) `apps/app/src/components/WidgetSidebar.tsx`

## Primary responsibilities

1. render workbench goals/todos and status placeholders

Current flow:

1. gate by agent status and loading flags
2. render collapsible goals/todos sections

Future role:

- extract goals/todos section into autonomy panel subcomponent.

## 6) `apps/app/src/components/ChatView.tsx`

## Primary responsibilities

1. chat transcript rendering
2. typewriter display for assistant responses
3. input/voice controls

Implication for initiative:

- chat remains message-centric
- autonomy stream should be adjacent, not mixed into chat transcript by default

## 7) `src/runtime/eliza.ts`

## Primary responsibilities

1. config/env bootstrap
2. plugin resolution and runtime creation
3. runtime initialization
4. API server startup integration
5. CLI fallback loop

Role/ownership behavior today:

- ownership metadata written for CLI world setup
- no systemic role-map initialization in current path

## 8) `eliza/.../autonomy/service.ts`

## Primary responsibilities

1. autonomous recurring task lifecycle
2. autonomous room/entity setup
3. periodic think cycle via message service pipeline
4. backoff/circuit breaker
5. memory pruning

Key control flow in think cycle:

1. build autonomy prompt from recent memories/context
2. create autonomous message using autonomy entity id
3. persist autonomous prompt memory
4. invoke message service for full pipeline
5. process callback outputs and errors

Implication:

- if event bridge is connected, this flow naturally emits observable runtime events.

## 9) `eliza/.../services/agentEvent.ts`

## Primary responsibilities

1. central event stream abstraction
2. run context enrichment
3. per-run sequence generation
4. listener fan-out

For Milaidy:

- the simplest robust integration is server-side subscription + websocket rebroadcast.

## 10) `eliza/.../services/message.ts`

## Primary responsibilities

1. orchestrate full message lifecycle pipeline
2. run tracking and event emission
3. action/evaluator/provider sequencing

For this initiative:

- this file is the source of run lifecycle events that drive observability UI.

## 11) `eliza/.../roles.ts` and role/settings providers

## Primary responsibilities

1. discover owner worlds via `ownership.ownerId`
2. resolve role hierarchy from `metadata.roles`

For this initiative:

- Milaidy must populate ownership and roles consistently to enable reliable admin trust behavior.

## Cross-file coupling hotspots

1. `server.ts` conversation identity <-> `roles.ts` world ownership lookup
2. websocket protocol in server <-> parser/handlers in api-client/context
3. autonomy event source in core <-> UI visualization model
4. onboarding config writes <-> runtime role/identity expectations

## Implementation caution list

1. keep `/api/chat` and `/api/conversations/*` behavior aligned or deliberately deprecate one path.
2. avoid implicit assumptions that in-memory `chatUserId` is durable identity.
3. avoid unbounded event accumulation in frontend and backend.
4. ensure feature-flagged rollout to control risk.

