# Test Milady 0.88 — Bug Fix Design Spec

**Date:** 2026-03-17
**Source:** QA test report from Notion (Test Milady 0.88)
**Scope:** Full sweep — 18 items across critical fixes, UI, connectors, backend, and i18n

---

## Section 1: Critical Fixes

### 1.1 Bot Token Hide/Show Clears Value

**File:** `packages/app-core/src/config/config-field.tsx:104-128`

**Problem:** The password visibility toggle calls `input.value = ""` (line 111) when hiding, erasing the credential. This is an uncontrolled input (`defaultValue=""`, line 136) manipulated imperatively via `inputRef`. On reveal, `onReveal()` fetches the real value from the server and sets it via `input.value = realValue` (line 122). On hide, `input.value = ""` clears it — but the user's unsaved edits are also lost.

**Why the clearing exists:** Likely a security measure to avoid leaving plaintext in the DOM. However, `type="password"` already masks the value, and the plaintext is equally accessible via DevTools whether in the input or in React state.

**Fix:** Convert the password field from uncontrolled to controlled React state:
- Add `const [fieldValue, setFieldValue] = useState("")` to track the input value.
- On reveal: `setFieldValue(realValue)` instead of `input.value = realValue`.
- On hide: `setVisible(false)` only — do not clear `fieldValue`.
- The `<input>` becomes `value={fieldValue}` with an `onChange` handler.
- This ensures the value persists through show/hide cycles and is managed by React, not imperative DOM manipulation.

**Tests:** Unit test that mounts the config field, simulates reveal → value appears → hide → value preserved in controlled state.

**Acceptance:** Toggling show/hide on any sensitive field preserves the value. Verify with Telegram bot token and API key fields.

### 1.2 Embedding Disposal Race Condition

**File:** `src/runtime/embedding-manager.ts:95-137`

**Problem:** `dispose()` (line 133) sets `this.disposed = true` and immediately calls `releaseResources()`. Meanwhile, `generateEmbedding()` (line 95) checks `this.disposed` at line 96, then awaits `this.unloading` at line 100, then calls `ensureInitialized()` at line 102, and only increments `inFlightCount` at line 104. There's a TOCTOU window: `dispose()` can fire between the disposed check (line 96) and the inFlightCount increment (line 104), so the in-flight guard never kicks in.

**Fix:** Use a promise-based drain and close the TOCTOU window:

1. **Close the TOCTOU gap:** Move `inFlightCount` increment *before* any async operations in `generateEmbedding()`, so any call that passes the disposed check is immediately counted:
   ```typescript
   async generateEmbedding(text: string): Promise<number[]> {
     if (this.disposed) throw new Error("...");
     this.inFlightCount += 1; // increment BEFORE any awaits
     try {
       if (this.unloading) await this.unloading;
       await this.ensureInitialized();
       // ... rest of embedding logic
     } catch (err) {
       getLogger().error(`[milady] Embedding generation failed: ${err}`);
       return new Array(this.dimensions).fill(0);
     } finally {
       this.inFlightCount -= 1;
       if (this.inFlightCount === 0 && this.drainResolve) this.drainResolve();
     }
   }
   ```

2. **Promise-based drain in dispose():**
   - Add `private drainResolve: (() => void) | null = null` and `private drainPromise: Promise<void> | null = null`.
   ```typescript
   async dispose(): Promise<void> {
     if (this.disposed) return;
     this.disposed = true;
     // New calls will throw immediately (line 96-98).
     // Wait for already-in-flight calls to finish.
     if (this.inFlightCount > 0) {
       this.drainPromise = new Promise(resolve => { this.drainResolve = resolve; });
       const timeout = new Promise<void>(resolve => setTimeout(resolve, 5000));
       await Promise.race([this.drainPromise, timeout]);
     }
     await this.releaseResources();
   }
   ```

This avoids busy-wait polling, closes the TOCTOU window, and cleanly signals when all in-flight work completes.

**Tests:** Unit test that starts an embedding generation, calls dispose() concurrently, and verifies no "Object is disposed" error — the in-flight call completes, then resources are released.

**Acceptance:** No "Object is disposed" errors during shutdown or idle unload while embeddings are being generated.

---

## Section 2: Conversation & Chat Fixes

### 2.1 Conversation Load Timeout

**File:** `src/api/server.ts` — `getConversationWithRestore()` (line ~13310) + `runtime.getMemories()` (line ~13321)

**Problem:** `waitForConversationRestore()` awaits `state.conversationRestorePromise` which can block indefinitely if the restore hangs. Then `runtime.getMemories()` fetches up to 200 records — slow if the DB lacks indexes on `(roomId, createdAt)`.

**Fix:**
- Wrap `waitForConversationRestore()` with `Promise.race([restorePromise, timeoutPromise(5000)])`. On timeout, reject with a clear error that the client can surface ("Conversation restore timed out — try again").
- Verify the messages table has an index on `(roomId, createdAt)` in the schema setup. If missing, add `CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(roomId, createdAt)`.

**Acceptance:** Conversations load within 5s or return a user-visible error. No silent 10s hangs.

### 2.2 Empty "New Chat" Conversations Saved

**File:** `packages/app-core/src/state/AppContext.tsx:2164`

**Problem:** `handleNewConversation` immediately calls `client.createConversation()` (line 2164) which persists server-side, even before the user sends any message.

**Fix (descoped to cleanup approach):** Full lazy creation would require reworking the greeting system (`bootstrapGreeting: true`), WebSocket `active-conversation` messages, and `conversationHydrationEpochRef` — too much complexity for a bug fix. Instead:
- On navigation away from a conversation that has zero user messages (only the system greeting), auto-delete it via `handleDeleteConversation`.
- Add a check in `handleSelectConversation`: if the previous conversation has no user messages, delete it silently.
- This preserves the existing creation flow while preventing orphaned empty chats.

**Acceptance:** Switching away from a "New Chat" with no user messages removes it from the sidebar. Conversations with at least one user message persist normally.

### 2.3 Cannot Delete or Rename Conversations

**Files:**
- `apps/app/src/components/ConversationsSidebar.tsx` — lines 102-111 (`handleConfirmDelete`), lines 72-79 (`handleEditSubmit`), lines 171-192 (dropdown context menu)
- `apps/app/src/components/conversations/ConversationListItem.tsx` — line 170-171 (delete confirmation), lines 28-35 (props)

**Problem:** The code appears fully wired: `ConversationsSidebar` passes `onConfirmDelete` and `onOpenActions` to `ConversationListItem` (lines 256-282). The dropdown menu (lines 171-192) shows Rename and Delete options triggered by `openActionsMenu`. Since the code looks correct, this is likely a runtime issue — possible causes:
- The context menu may not render due to a portal/z-index issue in dark mode
- The `openActionsMenu` state may not trigger the dropdown visibility
- Touch/long-press detection (lines 70-77 in ConversationListItem) may not fire on the tester's device

**Fix:** Investigate at runtime by:
1. Adding `console.log` guards in `handleConfirmDelete` and `openActionsMenu` to confirm they fire
2. Checking if the dropdown menu (lines 171-192) renders in the DOM but is invisible (z-index, overflow hidden)
3. Testing right-click and long-press separately to isolate which interaction path fails
4. If the dropdown is not rendering, check the conditional rendering logic and ensure the `actionsMenuConvId` state matches

**Acceptance:** User can right-click (desktop) or long-press (mobile) a conversation to see rename/delete options. Both operations work and update the sidebar.

---

## Section 3: UI/Visual Fixes

### 3.1 Button Padding Inconsistency

**Files:** `packages/ui/src/components/ui/button.tsx:23-26`, `packages/ui/src/lib/button-styles.ts:9-16`

**Problem:** CVA `sm` size uses `h-9 rounded-md px-3` with no `py-*`, while `btnGhost` uses `px-3 py-1.5`. The fixed height (`h-9`) centers content vertically, but when buttons overflow their height (e.g., multi-line text) or are displayed inline with `btnGhost`-styled elements, the padding mismatch is visible. This is a functional consistency issue — mixed button styles in the same toolbar/row have inconsistent hit targets.

**Fix:** Add explicit `py-*` to CVA size variants for consistency:
- `sm`: `"h-9 rounded-md px-3 py-1.5"`
- `lg`: `"h-11 rounded-md px-8 py-2.5"`

**Acceptance:** Buttons of the same logical size have consistent vertical padding. Visual regression check on toolbars that mix button styles.

### 3.2 Dark Mode Text/Background Conflict

**Files:**
- `apps/app/src/components/Header.tsx:280-312` — desktop navigation tab rendering
- `apps/app/src/components/shared/ShellHeaderControls.tsx:75-193` — shell view toggle buttons

**Problem:** Global CSS variables in `base.css` have proper contrast, but specific components in the header/nav area may use hardcoded colors or Tailwind classes that don't reference theme variables, causing poor contrast in dark mode.

**Fix:** Audit `Header.tsx` tab rendering (lines 280-312) and `ShellHeaderControls.tsx` button rendering (lines 128-154). Replace any hardcoded color classes (e.g., `text-gray-800`, `bg-white`) with theme-aware alternatives (`text-foreground`, `bg-background`, `text-muted-foreground`). Check inline styles for hardcoded hex values.

**Acceptance:** All header tabs and shell controls are readable in dark mode. No hardcoded color values in these components.

### 3.3 Text Color Misuse on Buttons/Tabs (Dark Mode)

**File:** `apps/app/src/components/shared/ShellHeaderControls.tsx:99-154`

**Problem:** The Voice/Character/Desktop toggle buttons (shell options, lines 99-115) likely use hardcoded text colors that don't adapt to dark mode. The QA screenshot shows these specific buttons with wrong contrast.

**Fix:** In the button rendering (lines 128-154), ensure active and inactive states use theme variables:
- Active: `text-foreground` or `text-accent`
- Inactive: `text-muted-foreground`
- Background: `bg-card` or `bg-muted`

**Acceptance:** Shell toggle buttons are correctly styled in both light and dark modes.

### 3.4 Collapse/Off Not Working

**File:** `packages/ui/src/components/ui/section-card.tsx` (logic correct)

**Problem:** The `SectionCard` collapse logic is correct (lines 33, 54, 80). The issue is in how parent components use it.

**Fix:** Search for all `<SectionCard` usages in `packages/app-core/src/components/PluginsView.tsx` and connector settings views. For sections that should be collapsible, ensure `collapsible={true}` is passed. If the QA report refers to a different collapsible element (not SectionCard), identify and fix that component instead.

**Acceptance:** Collapsible sections toggle on click. Chevron indicator rotates correctly.

---

## Section 4: Connector & Config Fixes

### 4.1 Connector Search Bar Won't Clear (Chrome Autofill)

**File:** `packages/app-core/src/components/PluginsView.tsx:2718-2735`

**Problem:** The search `<Input>` has no `autoComplete` attribute. Chrome detects it near credential fields and autofills/refills it.

**Fix:** Add `autoComplete="off"` and `data-1p-ignore` attributes to the search input at line 2718. Also add `name="plugin-search"` to give Chrome a non-credential semantic hint.

**Acceptance:** Clearing the search bar stays cleared. No autofill interference.

### 4.2 Settings Show "Eliza Cloud" Despite Different Config

**File:** `packages/app-core/src/components/ConfigPageView.tsx:209-271`

**Problem (corrected from review):** The `tFallback` logic (line 216) and the provider button rendering (lines 268-271) are functionally correct — when `provider.id === "eliza-cloud"`, it displays "Eliza Cloud". The real bug is likely that `selectedProvider` is initialized to a default value (e.g., `"eliza-cloud"`) regardless of what the user configured during onboarding. The QA tester configured BSC/EVM/Alchemy/Solana/Helius but the settings page shows "Eliza Cloud" buttons for all chains.

**Root cause (refined):** `ConfigPageView` initializes `useState` for provider selections with hardcoded `"eliza-cloud"` defaults (lines 472-476). A `useEffect` (line 478) updates them from `walletConfig`, but if `walletConfig` is null/undefined on initial mount (still fetching from server), `resolveInitialWalletRpcSelections(null)` falls through to `DEFAULT_WALLET_RPC_SELECTIONS` — all `"eliza-cloud"` (see `src/contracts/wallet.ts:114-118`). The user sees "Eliza Cloud" flash (or persist if config never loads).

**Fix:** Defer rendering the provider buttons until `walletConfig` is loaded:
1. Add a loading guard: if `walletConfig` is null/undefined, show a loading state instead of the provider buttons.
2. Initialize `useState` values from `walletConfig` directly when available at mount time, rather than using a `useEffect` to update after the fact.
3. Verify the onboarding RPC selections are saved to the same config key that `ConfigPageView` reads — if there's a mismatch, unify them.

**Tests:** Unit test that verifies when RPC config is set to "alchemy", the settings page renders "Alchemy" as the selected provider, not "Eliza Cloud". Also test that when `walletConfig` is null, a loading state is shown instead of default "Eliza Cloud" buttons.

**Acceptance:** If user configured Alchemy/Helius/custom RPC in onboarding, the settings page shows those providers correctly.

### 4.3 Bot Token Toggle / "Bot Token Not Enough"

**Problem:** Same root cause as 1.1 — value erased on hide toggle. Resolved by fix 1.1.

Additionally: check Telegram connector's token validation — if it checks length/format after the field value is cleared, it would report "bot token not enough" for a now-empty string.

**Acceptance:** Bot token persists through show/hide toggles. Valid tokens are accepted.

---

## Section 5: Backend & Runtime Fixes

### 5.1 Trajectory Logger Index Creation Failure

**File:** `src/runtime/trajectory-persistence.ts:707-730`

**Problem (corrected from review):** `scenario_id` does not exist as a column in the `trajectories` table, and no code in this repo references `scenario_id` at all (confirmed via repo-wide grep). The error `CREATE INDEX IF NOT EXISTS idx_trajectories_scenario_id ON trajectories(scenario_id)` must originate from:
- The upstream `@elizaos/core` runtime
- An external plugin's migration script
- A database migration that was applied manually or from a different version

**Fix:** This is an upstream/external issue. Workaround:
- Add a defensive `try/catch` around the `ensureTrajectoriesTable()` call (if not already present) so that a failed index creation doesn't crash the trajectory logger.
- Log the error as a non-fatal warning (the QA report already shows it's logged as `Warn`).
- If the error persists and is disruptive, add `CREATE INDEX IF NOT EXISTS idx_trajectories_scenario_id ON trajectories(scenario_id)` to `ensureTrajectoriesTable()` — but only after adding the column: `ALTER TABLE trajectories ADD COLUMN IF NOT EXISTS scenario_id TEXT`.

**Acceptance:** No index creation errors in logs on startup, or errors are clearly logged as non-fatal and don't affect functionality.

### 5.2 Auth Timeout During Setup

**File:** `src/api/auth-routes.ts` (handler), `packages/app-core/src/api/client.ts:1955` (`DEFAULT_FETCH_TIMEOUT_MS = 10_000`)

**Problem:** The `/api/auth/status` handler is trivial (reads env vars, returns JSON). The 10s timeout means the server isn't ready when the UI makes the initial call during boot.

**Fix (scoped down per review):** Rather than adding a new health endpoint (too much scope for a bug fix), increase the timeout for boot-time API calls:
- In the client's initial auth check, use a longer timeout (e.g., 30s) or retry with exponential backoff (1s, 2s, 4s) on timeout errors.
- Add a `retryOnTimeout` option to the fetch wrapper for boot-critical endpoints.

**Acceptance:** No auth timeout errors during normal startup (cold boot up to 30s).

### 5.3 Telegram Plugin Init "Failed to parse JSON"

**File:** `src/plugins/telegram-enhanced/service.ts:24-38`

**Problem:** `TelegramEnhancedService.start()` calls `TelegramService.start(runtime)` (line 26) with zero error handling. JSON parse failures in the upstream plugin cascade into embedding errors.

**Fix:** Wrap the base plugin `start()` call in a try-catch:
```typescript
async start(runtime: IAgentRuntime): Promise<void> {
  try {
    await (TelegramService as any).start(runtime);
  } catch (err) {
    getLogger().error(
      `[telegram-enhanced] Failed to initialize Telegram plugin: ${err.message}. ` +
      `Check bot token and Telegram config.`
    );
    // Mark service as failed — don't cascade into embedding errors
    this.failed = true;
    return; // Return without throwing — plugin loader treats this as disabled
  }
  // ... rest of enhanced setup (message manager wrapping, etc.)
}
```
The service should expose a `failed` flag so the UI can show the connector as errored rather than active.

**Acceptance:** Telegram init failure produces a single clear error log. No cascading "Object is disposed" embedding errors. UI shows connector status as errored.

---

## Section 6: i18n & UX Polish

### 6.1 One-Time Error Hint Repeats

**File:** `packages/app-core/src/state/AppContext.tsx:964-980`

**Problem:** `setActionNotice` uses `setTimeout` for auto-dismiss (2.8s default) with no dedup tracking.

**Fix:** Add a `shownOnceNotices` ref (`useRef<Set<string>>`) in AppContext. Extend `setActionNotice` with an optional `once` parameter:
```typescript
const setActionNotice = useCallback(
  (text: string, tone = "info", ttlMs = 2800, once = false) => {
    if (once && shownOnceNotices.current.has(text)) return;
    if (once) shownOnceNotices.current.add(text);
    // ... existing display logic
  }, []
);
```

**Tests:** Unit test that calls `setActionNotice("error", "error", 2800, true)` twice and verifies the second call is suppressed.

**Acceptance:** Errors marked as `once` only display the first time per session.

### 6.2 i18n Voice Reads Numbers in Chinese

**File:** `apps/app/plugins/talkmode/src/web.ts:174-224`

**Problem:** The `speak()` method (line 174) creates a `SpeechSynthesisUtterance` (line 194) and applies voice directives (lines 198-203). If the `lang` property on the utterance is not explicitly set to match the user's UI language, the browser's `speechSynthesis` falls back to the system locale — which may be Chinese.

**Fix:** In the `speak()` method, explicitly set `utterance.lang` based on the user's language preference:
```typescript
const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = options.lang || "en-US"; // Ensure language is always set
```
Ensure the calling code passes the user's `uiLanguage` setting (from AppContext) through to the `SpeakOptions`.

**Acceptance:** When UI language is English, TTS reads numbers in English pronunciation.

### 6.3 Dev Mode Blockchain Popup

**File:** `src/cloud/validate-url.ts:93-137`

**Problem:** `validateCloudBaseUrl()` (line 93) resolves the hostname via DNS and checks against `BLOCKED_IPV4_CIDRS` (lines 17-41), which includes `10.0.0.0/8` and `192.168.0.0/16`. In dev mode, `eliza.cloud` may resolve to a local/private IP, triggering the error: "Cloud base URL resolves to {ip}, which is a blocked internal/metadata address" (lines 134-135).

**Fix:** Add a targeted dev-mode bypass in `validateCloudBaseUrl()`. The function returns `string | null` (string = error message, null = valid). Place the bypass *after* the HTTPS and hostname format checks (line ~118) but *before* DNS resolution (line ~124) — this keeps basic URL validation intact while skipping IP-range blocking:
```typescript
// After URL format validation, before DNS resolution:
if (process.env.NODE_ENV === "development" || process.env.MILADY_DEV) {
  return null; // Skip IP blocking in dev mode — allow private IPs
}
```
This avoids completely disabling SSRF protection — format and protocol checks still run.

**Acceptance:** Dev mode onboarding completes without blocked-address errors for cloud URLs.

---

## Out of Scope

- Upstream `@elizaos/plugin-telegram` JSON parsing fix (tracked as workaround in 5.3)
- Full lazy conversation creation redesign (descoped to cleanup approach in 2.2)
- Visual redesigns beyond theme-variable fixes (per AGENTS.md: "Reject aesthetic/UI redesigns")

## Testing Strategy

**Unit tests required:**
- 1.1: Config field password toggle preserves value through show/hide cycle
- 1.2: Embedding manager dispose waits for in-flight calls before releasing resources
- 4.2: Settings page displays correct provider based on persisted config
- 6.1: `setActionNotice` with `once: true` suppresses duplicate notices

**Integration/manual QA:**
- 2.1: Conversation loading under various sizes (small, large, during restore)
- 2.2: New Chat cleanup on navigation away
- 2.3: Conversation delete/rename via context menu on desktop and mobile
- 3.1-3.4: Visual regression check across light/dark modes
- 4.1: Search bar clearing with Chrome autofill enabled
- 5.2: Cold boot startup with auth check timing
- 5.3: Telegram init with invalid/missing bot token
- 6.2: TTS number reading in English locale
- 6.3: Dev mode onboarding with cloud URL
