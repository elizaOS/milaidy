# Phase 2: API and Cloud Transport Propagation

## Phase Goal

Carry fast-mode intent through all transport layers with strict parity:

- local runtime path
- cloud proxy path
- streaming and non-streaming variants

This phase guarantees that mode intent arrives at runtime entry points before any core optimization logic is added.

---

## Required Payload Contract at API Boundary

`POST /api/conversations/:id/messages` body:

```ts
type ConversationMessageRequest = {
  text: string;
  processing?: {
    mode?: "default" | "fast";
    profile?: string;
    reason?: string;
  };
};
```

Validation policy:

- reject non-object payloads
- require non-empty `text`
- allow absent `processing`
- reject invalid mode/profile types with clear `400` errors

---

## Local API Route Changes

## `src/api/server.ts`

### Current behavior summary

- parses request JSON
- validates text
- finds conversation
- routes to cloud proxy if configured, else local runtime

### Required changes

1. Parse and validate `processing`.
2. Create normalized mode object:
   - `mode` defaults to `"default"` if absent.
3. Always preserve room identity (`conv.roomId`) in local and cloud branches.
4. Pass mode into runtime invocation options and/or message metadata.

### Suggested internal shape

```ts
type NormalizedProcessing = {
  mode: "default" | "fast";
  profile?: string;
  reason?: string;
};
```

### Critical constraint

Do not infer fast mode from text source (`client_chat`, channel type) alone. It must be explicit from request contract to avoid hidden behavior.

---

## Cloud Proxy Changes

## `src/cloud/cloud-proxy.ts`

### Required method expansion

- `handleChatMessage(text, roomId, processing?)`
- `handleChatMessageStream(text, roomId, processing?)`

Both methods must pass processing through bridge client params.

---

## Bridge Client Changes

## `src/cloud/bridge-client.ts`

### Current JSON-RPC params

- includes `text`
- includes `roomId`

### Required params extension

```json
{
  "text": "...",
  "roomId": "...",
  "processing": {
    "mode": "fast",
    "profile": "voice-fast-v1"
  }
}
```

### Compatibility strategy

- cloud runtime that does not recognize `processing` should ignore extra params (if tolerant)
- if strict schema exists server-side, deploy cloud entrypoint updates before enabling frontend fast mode toggle

---

## Cloud Runtime Entrypoint Changes

## `deploy/cloud-agent-entrypoint.ts`

### Required updates in `processMessage` and stream counterpart

1. Parse `processing` from JSON-RPC params.
2. Normalize mode and validate allowed values.
3. Preserve `roomId` exactly from params.
4. Pass normalized mode into `handleMessage` options and/or content metadata.

### Why this matters

Without this step, cloud requests silently run default behavior even if frontend and server claim fast mode enabled.

---

## Room and Conversation Isolation (Non-negotiable)

Every path must satisfy:

1. request conversation id maps to specific room id
2. room id is forwarded through cloud proxy and bridge
3. runtime message uses that room id for memory and context

If any fallback default (`"web-chat"`) is used unintentionally, mode correctness and context isolation both fail.

---

## Streaming Path Requirements

Fast mode is especially important for voice and low-latency UX, so streaming path must propagate mode too.

Required:

- stream endpoint and cloud stream RPC include identical `processing` payload
- runtime stream handler receives same mode as non-streaming path
- logs include mode field on stream start for diagnostics

---

## Error Handling Policy

## Invalid mode

- return `400` with explicit reason (`processing.mode must be "default" or "fast"`).

## Unknown fields

- ignore by default, but log at debug level for diagnostics.

## Cloud bridge mismatch

- if cloud rejects payload shape, fall back to explicit error (do not silently strip mode).

---

## Observability Additions in This Phase

For each request, log:

- `conversationId`
- `roomId`
- `processing.mode`
- `processing.profile`
- execution path (`local` or `cloud`)

This should be added before performance optimization so transport correctness can be confirmed independently.

---

## Risks in Phase 2

1. **Partial deployment mismatch**
   - Frontend sends mode before cloud/runtime can parse it.
   - Mitigation: server-side feature flag and version gating.
2. **Room fallback regression**
   - Cloud proxy default room accidentally used.
   - Mitigation: explicit required room parameter in internal methods.
3. **Behavioral divergence local vs cloud**
   - Mitigation: parity integration tests for both paths.

---

## Validation Matrix

1. Local non-streaming with fast mode.
2. Local streaming with fast mode.
3. Cloud non-streaming with fast mode.
4. Cloud streaming with fast mode.
5. All above with default mode.
6. Mixed concurrent requests with different modes and rooms.

All tests must assert mode propagation and room propagation independently.

---

## Exit Criteria

Phase 2 is complete when:

1. mode intent is preserved end-to-end in both local and cloud paths
2. room identity is preserved with no silent fallback
3. streaming and non-streaming semantics are consistent

No core pipeline reductions should be claimed until Phase 3+.

