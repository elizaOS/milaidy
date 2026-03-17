# Test Milady 0.88 — Bug Fix Design Spec

**Date:** 2026-03-17
**Source:** QA test report from Notion (Test Milady 0.88)
**Scope:** Full sweep — 18 items across critical fixes, UI, connectors, backend, and i18n

---

## Section 1: Critical Fixes

### 1.1 Bot Token Hide/Show Clears Value

**File:** `packages/app-core/src/config/config-field.tsx:111`

**Problem:** The password visibility toggle calls `input.value = ""` when hiding, erasing the credential entirely. This affects all sensitive fields (bot tokens, API keys) across all connectors and settings.

**Fix:** Remove `input.value = ""` from the hide branch of `handleToggle`. Only call `setVisible(false)` — the input's value stays intact, just masked by `type="password"`.

**Acceptance:** Toggling show/hide on any sensitive field preserves the value. Verify with Telegram bot token and API key fields.

### 1.2 Embedding Disposal Race Condition

**File:** `src/runtime/embedding-manager.ts`

**Problem:** `dispose()` sets `this.disposed = true` and immediately calls `releaseResources()` without waiting for in-flight `generateEmbedding()` calls. In-flight calls then crash with "Object is disposed".

**Fix:** Make `dispose()` drain `inFlightCount` before releasing resources:

```typescript
async dispose(): Promise<void> {
  if (this.disposed) return;
  this.disposed = true;
  // Wait for in-flight calls (max 5s)
  const deadline = Date.now() + 5000;
  while (this.inFlightCount > 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await this.releaseResources();
}
```

**Acceptance:** No "Object is disposed" errors during shutdown or idle unload while embeddings are being generated.

---

## Section 2: Conversation & Chat Fixes

### 2.1 Conversation Load Timeout

**File:** `src/api/server.ts` — `getConversationWithRestore()` + `runtime.getMemories()`

**Problem:** `waitForConversationRestore()` can block indefinitely, and `getMemories()` for large conversations is slow, leading to client-side 10s timeout.

**Fix:**
- Wrap `waitForConversationRestore()` with a 5s timeout — if restore hasn't completed, return a clear error rather than hanging.
- If `getMemories()` is slow, the root cause is likely missing DB indexes on `(roomId, createdAt)` — add them if absent.

**Acceptance:** Conversations load within 5s or return a user-visible error. No silent 10s hangs.

### 2.2 Empty "New Chat" Conversations Saved

**File:** `packages/app-core/src/state/AppContext.tsx:2164`

**Problem:** `handleNewConversation` immediately creates and persists a conversation on click before any user message, creating orphaned empty chats.

**Fix:** Lazy creation — track a pending conversation locally in state. Only call `client.createConversation()` when the user sends their first message. The sidebar shows the pending conversation optimistically but doesn't persist until first message.

**Acceptance:** Clicking "New Chat" then clicking away does not leave an empty conversation in the sidebar. Conversations only persist after first message.

### 2.3 Cannot Delete or Rename Conversations

**File:** `packages/app-core/src/state/AppContext.tsx` (handlers exist), `apps/app/src/components/ConversationListItem.tsx` (UI)

**Problem:** The handlers `handleDeleteConversation` and `handleRenameConversation` exist and look correct, but the QA tester reports they don't work. Likely the UI doesn't expose the actions or event handlers aren't wired.

**Fix:** Verify `ConversationListItem` renders rename/delete action buttons and that click handlers are properly connected. Add missing UI affordances (context menu, swipe actions, or inline buttons) if absent.

**Acceptance:** User can right-click or long-press a conversation to rename or delete it. Deletion removes it from the list. Rename updates the title inline.

---

## Section 3: UI/Visual Fixes

### 3.1 Button Padding Inconsistency

**Files:** `packages/ui/src/components/ui/button.tsx`, `packages/ui/src/lib/button-styles.ts`

**Problem:** CVA `sm` and `lg` sizes omit explicit `py-*` values, creating visual inconsistency with string-based button styles.

**Fix:** Add `py-1.5` to `sm` and `py-2.5` to `lg` size variants. Audit places mixing `btnGhost`/`btnPrimary` strings with `<Button>` to ensure visual parity.

**Acceptance:** Buttons of the same logical size have consistent vertical padding regardless of which styling approach is used.

### 3.2 Dark Mode Text/Background Conflict

**File:** `packages/app-core/src/styles/base.css` (theme vars) + specific components

**Problem:** Global CSS contrast ratios are fine, but specific components use hardcoded colors that bypass theme variables, causing unreadable text in dark mode.

**Fix:** Audit components visible in QA screenshots (header tabs, chat view, companion overlay text). Replace hardcoded color values with CSS variable references (`var(--text)`, `var(--bg)`, `text-foreground`, `bg-background`, etc.).

**Acceptance:** All text is readable in dark mode. No hardcoded colors in affected components.

### 3.3 Text Color Misuse on Buttons/Tabs (Dark Mode)

**Problem:** Voice/Character toggle buttons show wrong text colors in dark mode (visible in QA screenshot).

**Fix:** Find the tab/toggle component used in the companion/voice area. Replace hardcoded light-mode text colors with theme-aware classes (`text-foreground`, `text-muted-foreground`).

**Acceptance:** Tab/toggle buttons are readable and correctly styled in both light and dark modes.

### 3.4 Collapse/Off Not Working

**File:** `packages/ui/src/components/ui/section-card.tsx` (logic correct), parent components

**Problem:** `SectionCard` collapse logic is correct, but parent components may not pass `collapsible={true}`.

**Fix:** Find where `SectionCard` is used in connector/plugin settings views. Ensure `collapsible` prop is passed where collapse behavior is expected. If a different collapse mechanism is used, investigate and fix that instead.

**Acceptance:** Collapsible sections in plugin/connector settings toggle open/closed on click.

---

## Section 4: Connector & Config Fixes

### 4.1 Connector Search Bar Won't Clear (Chrome Autofill)

**File:** `packages/app-core/src/components/PluginsView.tsx:2718`

**Problem:** Chrome's password autofill detects the input near credential fields and keeps refilling it after clearing.

**Fix:** Add `autoComplete="off"` and `data-1p-ignore` to the connector search input. Apply same treatment to other search inputs near sensitive fields.

**Acceptance:** Clearing the search bar stays cleared. No autofill interference.

### 4.2 Settings Show "Eliza Cloud" Despite Different Config

**File:** `packages/app-core/src/components/ConfigPageView.tsx:209-218`

**Problem:** The `tFallback` function checks for a key that never matches `provider.id`. The RPC provider display may not reflect actual saved config.

**Fix:** Remove or fix the broken `tFallback` check. Ensure the wallet/RPC settings page reads from actual persisted config and displays correct provider labels matching what the user selected.

**Acceptance:** If user configured Alchemy/Helius/custom RPC in onboarding, the settings page shows those providers — not "Eliza Cloud".

### 4.3 Bot Token Toggle / "Bot Token Not Enough"

**Problem:** Same root cause as 1.1 — value erased on hide toggle. After the value clears, connector sees empty token.

**Fix:** Resolved by fix 1.1. Additionally: check Telegram connector's token validation — if it checks length/format, ensure valid tokens pass.

**Acceptance:** Bot token persists through show/hide toggles. Valid tokens are accepted.

---

## Section 5: Backend & Runtime Fixes

### 5.1 Trajectory Logger Index Creation Failure

**File:** `src/runtime/trajectory-persistence.ts:707-730`

**Problem:** The `trajectories` table has no `scenario_id` column, yet code tries to create an index on it.

**Fix:** Two paths depending on investigation:
- **If scenario_id is needed:** Add `scenario_id TEXT` column to the CREATE TABLE schema, then add `CREATE INDEX IF NOT EXISTS idx_trajectories_scenario_id ON trajectories(scenario_id)`.
- **If scenario_id is not needed:** Find and remove the code referencing it.

**Acceptance:** No index creation errors in logs on startup.

### 5.2 Auth Timeout During Setup

**File:** `src/api/auth-routes.ts` (handler), client-side boot sequence

**Problem:** The handler is trivial/fast. The 10s timeout means the server isn't ready yet when the UI makes the call during boot.

**Fix:** Add a startup readiness mechanism — the UI should poll with exponential backoff during boot rather than a single call that times out. Alternatively, add a `/api/health` readiness probe the UI waits on before making other API calls.

**Acceptance:** No auth timeout errors during normal startup. UI gracefully waits for server readiness.

### 5.3 Telegram Plugin Init "Failed to parse JSON"

**File:** `src/plugins/telegram-enhanced/service.ts` (wraps upstream `@elizaos/plugin-telegram`)

**Problem:** Error originates in upstream package. Cascading failures cause "Object is disposed" embedding errors.

**Fix (workaround):** Wrap Telegram plugin initialization in `TelegramEnhancedService.start()` with better error handling:
- Catch JSON parse errors from base plugin
- Log a clear diagnostic ("Invalid bot token or malformed Telegram config")
- Short-circuit plugin activation on init failure — don't let it cascade into embedding errors
- Set plugin status to inactive/errored so the UI can surface the problem

**Acceptance:** Telegram init failure produces a single clear error log and doesn't cascade. UI shows connector as errored.

---

## Section 6: i18n & UX Polish

### 6.1 One-Time Error Hint Repeats

**File:** `packages/app-core/src/state/AppContext.tsx:964-980`

**Problem:** `setActionNotice` is timer-based auto-dismiss with no dedup. Same error can fire repeatedly.

**Fix:** Add a `shownNotices` Set (session-scoped, in-memory) that tracks notice message hashes. Before displaying, check if already shown. Add an optional `once: true` parameter to `setActionNotice` for errors that should only show once per session.

**Acceptance:** Errors marked as `once` only display the first time. Repeated identical errors within a session are suppressed.

### 6.2 i18n Voice Reads Numbers in Chinese

**Problem:** Not in translation files — `en.json` is clean English. Likely TTS/voice engine defaults to Chinese locale for number pronunciation.

**Fix:** In the voice/TTS initialization code, explicitly set language/locale to match the user's `uiLanguage` setting. Find where TTS is configured and pass `lang: "en-US"` (or appropriate locale) when English is selected, rather than relying on system default.

**Acceptance:** When UI language is English, TTS reads numbers in English.

### 6.3 Dev Mode Blockchain Popup

**Problem:** "BLOCKCHAIN ACCESS" page appears with error about `eliza.cloud` resolving to a blocked internal address during dev mode onboarding.

**Fix:** In the RpcStep, add a dev-mode guard that either:
- Skips DNS/URL validation for cloud URLs when `NODE_ENV=development`
- Uses `localhost` or dev-specific URLs instead of production `eliza.cloud`

**Acceptance:** Dev mode onboarding doesn't show blocked-address errors for cloud URLs.

---

## Out of Scope

- Upstream `@elizaos/plugin-telegram` JSON parsing fix (tracked as workaround in 5.3)
- Full TTS engine locale system (tracked as config fix in 6.2)
- Visual redesigns (per AGENTS.md: "Reject aesthetic/UI redesigns")

## Testing Strategy

- Unit tests for embedding manager dispose drain logic
- Unit tests for lazy conversation creation
- Manual QA pass through onboarding flow (local + cloud + dev mode)
- Manual QA pass through dark mode on all affected views
- Manual QA for bot token show/hide cycle
- Manual QA for conversation create/rename/delete
