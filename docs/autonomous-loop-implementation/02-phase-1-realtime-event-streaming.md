# Phase 1: Real-Time Event Streaming Backbone

Goal: expose structured autonomous and message-loop events from runtime to frontend with reliability guarantees.

## Why this phase is first

Without an event backbone, all later phases (autonomy panel, admin/autonomy blending visibility, rolodex trust auditability) are blind.

## Files in scope

Primary:

- `src/api/server.ts`
- `apps/app/src/api-client.ts`
- `apps/app/src/AppContext.tsx`

Core integration points (read-only dependence):

- `eliza/packages/typescript/src/services/agentEvent.ts`
- `eliza/packages/typescript/src/types/agentEvent.ts`

## Current control flow (baseline)

1. Runtime emits events internally.
2. Milaidy API websocket sends only status heartbeat messages.
3. Frontend consumes only `status`.

Therefore: no structured event observability exists in UI.

## Target control flow

1. Runtime emits event to `AgentEventService`.
2. API server subscribes to service listeners.
3. API server:
   - normalizes to websocket envelope
   - appends to bounded replay buffer
   - broadcasts to live clients
4. Frontend:
   - receives event envelope
   - applies dedupe + ordering rules
   - updates in-memory event store
5. On reconnect:
   - client requests replay since last event id/ts
   - server returns missing events

## Event Contract (must be explicit)

Recommended envelope:

```json
{
  "type": "agent_event",
  "version": 1,
  "eventId": "evt_...",
  "runId": "run_...",
  "seq": 42,
  "ts": 1739200000000,
  "stream": "action",
  "agentId": "uuid",
  "roomId": "uuid",
  "payload": { "type": "start", "actionName": "..." }
}
```

For heartbeat stream:

```json
{
  "type": "heartbeat_event",
  "version": 1,
  "eventId": "evt_...",
  "ts": 1739200000000,
  "payload": { "status": "ok-token", "indicatorType": "ok", ... }
}
```

## Ordering and dedupe rules

Client rules:

1. Dedupe by `eventId` (global) and fallback `(runId, seq, stream)`.
2. Per-run ordering by `seq`.
3. If gap detected (`seq` jump), request replay.
4. If replay still missing, mark run as partial in UI.

Server rules:

1. Keep replay buffer bounded (example 2000 events).
2. Expose replay route: `GET /api/agent/events?sinceTs=...` or `?sinceEventId=...`.
3. Include monotonic server timestamp.

## Three implementation options

## Option A (Recommended): websocket + replay endpoint

Server:

- Add `eventBuffer` ring in `ServerState`.
- Subscribe to `AgentEventService`.
- Broadcast event envelopes.
- Add replay endpoint.

Pros:

- fast integration with existing websocket infra
- resilient reconnect recovery
- no change to runtime internals

Cons:

- needs careful memory bound management
- requires client replay logic

## Option B: SSE-only stream endpoint

Server:

- add `GET /api/agent/events/stream` SSE
- no websocket event payload expansion

Pros:

- simple one-direction stream
- easy browser semantics

Cons:

- conflicts with existing websocket model in app
- less natural for multi-message type reuse
- reconnect + replay still needed

## Option C: poll logs + poll event snapshots

Pros:

- minimal protocol changes

Cons:

- high latency
- poor fidelity under rapid autonomy loops
- does not satisfy live observability goal

Conclusion: Option A.

## Proposed server modifications (`src/api/server.ts`)

## 1) Extend server state

Add:

- `eventBuffer: AgentEventEnvelope[]`
- `eventBufferMax: number`
- `eventSeqGlobal: number` (optional diagnostic)

## 2) Add event broadcaster helper

Single helper to:

1. append to buffer (drop oldest when full)
2. `JSON.stringify` once
3. broadcast to all open clients

## 3) Subscribe to runtime event service at startup

During `startApiServer` after runtime availability:

1. `runtime.getService("AGENT_EVENT")`
2. if found:
   - subscribe to agent events
   - subscribe to heartbeat events
3. register unsubs for cleanup on server close

## 4) Add replay endpoint

`GET /api/agent/events`:

- filters by `sinceTs` or `sinceEventId`
- optional `limit`
- returns stable ordered list

## 5) Wire replay on websocket connect

On client connect:

- send status
- optionally send last N events snapshot (`type: "agent_events_bootstrap"`)

## Proposed frontend modifications

## 1) `apps/app/src/api-client.ts`

Add:

- `getAgentEventsSince(...)` API method
- websocket type handlers for:
  - `agent_event`
  - `heartbeat_event`
  - optional `agent_events_bootstrap`

## 2) `apps/app/src/AppContext.tsx`

Add event reducer/store:

- `autonomyEvents: AgentEventEnvelope[]`
- `lastEventIdByRun: Map<string, number>`
- `seenEventIds: Set<string>` (bounded)

On websocket reconnect:

- fetch replay since watermark
- apply dedupe and merge

## Failure modes and mitigations

1. **Service absent** (`AGENT_EVENT` not found)
   - mitigation: keep status websocket behavior and emit warning log/tag.

2. **Event flood saturates UI**
   - mitigation: buffer cap + frontend event window cap + compaction strategy.

3. **Reconnect gaps**
   - mitigation: replay endpoint + gap detection + partial-run markers.

4. **Protocol drift**
   - mitigation: `version` field and strict parser with fallback handling.

## Security and privacy concerns

1. Event payloads might include sensitive tool input/output.
2. Reasoning payload may expose secrets or internal prompt details.
3. Must define redaction policy before exposing raw payloads to UI.

Recommendation:

- redact known secret fields server-side before emit.
- optionally gate verbose payloads behind config toggle.

## Testing matrix for this phase

## Unit tests

- event envelope transformation
- ring buffer append/evict
- replay filtering by timestamp/event id

## Integration tests

- runtime emits -> websocket client receives
- reconnect + replay returns missing events only
- client dedupe prevents duplicates

## Soak test

- synthetic high-frequency action/provider events
- validate memory stability and UI responsiveness

## Definition of done

1. Live websocket stream includes structured agent events.
2. Reconnect replay works with no major gaps.
3. Frontend stores and dedupes events safely.
4. No regression in existing status flow.
5. Tests cover event contract and replay semantics.

