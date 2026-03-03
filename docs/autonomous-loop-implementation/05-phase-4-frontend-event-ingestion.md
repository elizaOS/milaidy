# Phase 4: Frontend Event Ingestion and State Model

Goal: build a reliable, bounded, and debuggable frontend event pipeline for autonomy loop visualization.

## Existing baseline

`apps/app/src/api-client.ts`:

- websocket supports dynamic handlers by message `type`
- reconnect with backoff

`apps/app/src/AppContext.tsx`:

- only subscribes to `"status"` events
- no event history store
- no replay synchronization path

## Design requirements

1. Receive and store structured runtime events.
2. Handle reconnect/replay.
3. Dedupe safely.
4. Keep memory bounded.
5. Expose normalized selectors for UI components.

## Files in scope

- `apps/app/src/api-client.ts`
- `apps/app/src/AppContext.tsx`
- optional new types module in app source

## Event state architecture

Use normalized state:

1. `eventsById: Record<string, AgentEventEnvelope>`
2. `eventOrder: string[]` (global order window)
3. `runIndex: Record<string, string[]>` (run-specific ids)
4. `watermark: { lastEventId?: string; lastTs?: number }`

Bounded caps:

- global event window: 2000
- per-run event window: 300
- seen-id cache: 5000

## Ingestion algorithm

For each incoming/replayed event:

1. validate schema + version
2. reject if duplicate id
3. insert into stores
4. trim caps
5. update watermark
6. mark run gap if seq discontinuity

## Reconnect and replay flow

1. websocket reconnect triggers onclose/backoff already.
2. on reconnect:
   - fetch replay from `GET /api/agent/events?sinceEventId=...`
   - apply replay first
   - then continue live websocket stream

Potential race:

- live events may arrive before replay completes.
- mitigation: allow both paths with dedupe by eventId.

## Derived selectors for UI

Expose via AppContext selectors:

1. `getLatestThoughtEvents(limit)`
2. `getActionTimeline(limit, runId?)`
3. `getProviderEvents(limit, runId?)`
4. `getEvaluatorEvents(limit, runId?)`
5. `getRunHealth(runId)` (complete/partial/error)

These prevent heavy transforms in render paths.

## Alternative approaches

## Option A: store everything in one array

Pros:

- simple

Cons:

- expensive filtering/grouping
- poor scalability for live stream

## Option B: normalized + indices (recommended)

Pros:

- efficient rendering
- easy caps and dedupe
- better debugability

Cons:

- slightly more code complexity

## Option C: use external state library

Pros:

- robust patterns

Cons:

- introduces dependency/architectural surface

Recommendation: Option B inside current context architecture.

## Failure modes

1. malformed event payload
   - mitigation: strict parser + discard + telemetry counter.
2. replay endpoint unavailable
   - mitigation: continue live-only mode + show "partial history" badge.
3. memory growth in long sessions
   - mitigation: hard cap trimming.

## Testing

1. ingestion unit tests:
   - dedupe
   - gap detection
   - cap trimming
2. reconnect tests:
   - replay then live merge
3. selector tests:
   - event filtering and grouping correctness

## Done criteria

1. AppContext exposes stable event store and selectors.
2. Reconnect keeps continuity with replay.
3. Memory usage remains bounded over long sessions.

