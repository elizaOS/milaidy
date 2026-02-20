# IMPLEMENTATION PLAN — TUI API/WebSocket Parity

## Goal
Make `milady tui` API mode behave like the frontend for chat streaming and proactive routing, so TUI can be piped into the API/websocket stack reliably.

## Background (confirmed)
- TUI already supports API transport (`LaunchTUIOptions.apiBaseUrl`) in:
  - `src/tui/index.ts`
  - `src/tui/eliza-tui-bridge.ts`
- CLI path does **not** currently pass API base to TUI:
  - `src/cli/program/register.tui.ts`
- API chat stream contract is SSE on:
  - `POST /api/conversations/:id/messages/stream`
  - events: `token`, `done`, `error` (+ legacy `{text}` fallback)
- WS upgrade/auth tightened:
  - `src/api/server.ts`, `src/api/server.websocket-auth.test.ts`
  - query-token auth is disabled by default unless `MILADY_ALLOW_WS_QUERY_TOKEN=1`
- Frontend sends WS `active-conversation` updates and keeps queued/deduped updates while reconnecting.

## Scope
In scope:
1. Wire API base into CLI TUI startup.
2. Harden TUI SSE parsing to match frontend behavior (LF + CRLF boundaries).
3. Add TUI WS plumbing in API mode for `active-conversation` routing and proactive messages.
4. Add tests for parser + WS behavior.

Out of scope:
- TUI visual redesign.
- Changing server websocket auth policy.
- Reworking runtime-direct transport path.

---

## Tasks

- [x] **Task 1 — CLI/API-base wiring for TUI mode**
  - Files:
    - `src/cli/program/register.tui.ts`
  - Changes:
    - Add `--api-base-url <url>` option for `milady tui`.
    - Fallback precedence when option is not provided:
      1. `MILADY_API_BASE_URL`
      2. `MILADY_API_BASE`
      3. undefined (runtime-direct mode)
    - Pass resolved value into `launchTUI(..., { apiBaseUrl })`.
  - Acceptance:
    - Running `milady tui --api-base-url http://127.0.0.1:31337` boots in API transport mode.

- [x] **Task 2 — Extract + harden SSE parser used by TUI API mode**
  - Files:
    - `src/tui/eliza-tui-bridge.ts`
    - (new) `src/tui/sse-parser.ts` (or equivalent shared helper)
  - Changes:
    - Replace LF-only event splitting (`\n\n`) with dual LF/CRLF handling, aligned with app client behavior.
    - Keep compatibility with legacy payload shape `{ text: "..." }`.
  - Acceptance:
    - API-mode TUI streams correctly for both `\n\n` and `\r\n\r\n` framed SSE.

- [x] **Task 3 — Add API-mode WS client for active conversation synchronization**
  - Files:
    - `src/tui/eliza-tui-bridge.ts`
    - (optional new) `src/tui/ws-client.ts`
  - Changes:
    - In API mode, connect to `${apiBaseUrl}/ws`.
    - Authenticate with `MILADY_API_TOKEN`:
      - Prefer Authorization header (Node/TUI client support).
      - Do **not** rely on query token unless explicitly required by environment policy.
    - After conversation is resolved/created, send:
      - `{ type: "active-conversation", conversationId }`
    - On reconnect, resend latest active conversation.
    - Keep small outbound queue with dedupe for `active-conversation` (same behavior as app client).
  - Acceptance:
    - Server receives active-conversation updates from TUI API mode.
    - Reconnect does not replay stale active-conversation IDs.

- [x] **Task 4 — Handle proactive WS messages in TUI API mode**
  - Files:
    - `src/tui/eliza-tui-bridge.ts`
  - Changes:
    - Handle incoming WS event:
      - `type: "proactive-message"`
    - If `conversationId` matches current conversation, append assistant message to chat.
    - Ignore mismatched conversation IDs.
    - Avoid duplicate rendering with ongoing SSE turn flow.
  - Acceptance:
    - Proactive/autonomy messages routed to active conversation appear in TUI.

- [x] **Task 5 — Test coverage for parser + ws behavior**
  - Files (new tests near source):
    - `src/tui/*.test.ts` (parser + bridge/ws focused)
  - Tests:
    - SSE parser handles LF and CRLF framing.
    - Legacy `{text}` chunk fallback still works.
    - WS queue + dedupe keeps only newest queued `active-conversation`.
    - Reconnect path resends latest active conversation.
    - Proactive message is rendered only for active conversation.
  - Acceptance:
    - Tests pass in `bun run test` (or targeted Vitest command).

- [x] **Task 6 — Validation + docs note**
  - Files:
    - `src/cli/program/register.tui.ts` (help text)
    - optional docs note under `docs/`
  - Validation:
    - Manual smoke in API mode with token enabled.
    - Verify no duplicate stream text in API mode.
  - Acceptance:
    - Clear usage guidance exists for `--api-base-url` and token expectations.

---

## Security/compat notes
- Server defaults reject query-token websocket auth unless `MILADY_ALLOW_WS_QUERY_TOKEN=1`.
- If TUI WS client cannot send headers in a specific runtime, fail clearly with actionable error.
- Preserve existing API-mode behavior where runtime `onStreamEvent` callbacks are ignored (prevents duplicate output).

## Suggested verification commands
- `bun run test src/api/server.websocket-auth.test.ts`
- `bun run test apps/app/test/app/api-client-ws.test.ts`
- `bun run test` (full, before finalizing)
- Optional targeted TUI tests once added.
