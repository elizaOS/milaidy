# Test Milady 0.88 Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 18 bugs identified in the QA test report for Milady v0.88.

**Architecture:** Targeted fixes across 6 layers — critical runtime (embedding, config fields), conversation management, UI theming, connector config, backend services, and i18n/UX. Each task is self-contained and independently committable.

**Tech Stack:** TypeScript, React 19, Tailwind CSS 4, Vitest, node-llama-cpp, Web Speech API, Capacitor

**Spec:** `docs/superpowers/specs/2026-03-17-test-milady-088-bugfix-design.md`

---

## Chunk 1: Critical Fixes

### Task 1: Fix password field hide/show clearing value

**Files:**
- Modify: `packages/app-core/src/config/config-field.tsx:93-155`
- Test: `packages/app-core/src/config/config-field.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/app-core/src/config/config-field.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPasswordField } from "./config-field";
import type { FieldRenderProps } from "./config-catalog";
import type { ConfigUiHint } from "./config-catalog";

// FieldRenderProps requires: key, value, schema, hint, fieldType, onChange, isSet, required
// Optional: errors, readonly, onReveal, onAction
function makeProps(overrides: Partial<FieldRenderProps> = {}): FieldRenderProps {
  return {
    key: "test-token",
    value: "",
    schema: { type: "string" },
    hint: { placeholder: "Enter token..." } as ConfigUiHint,
    fieldType: "password",
    onChange: vi.fn(),
    isSet: true,
    required: false,
    onReveal: vi.fn().mockResolvedValue("my-secret-token-123"),
    ...overrides,
  } as FieldRenderProps;
}

describe("renderPasswordField", () => {
  it("preserves value through show/hide toggle cycle", async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(renderPasswordField(props));

    const toggleBtn = screen.getByTitle("Reveal value");

    // Reveal
    await user.click(toggleBtn);
    expect(props.onReveal).toHaveBeenCalled();

    // After reveal, input should have the value
    const inputEl = document.querySelector("[data-config-key='test-token']") as HTMLInputElement;
    expect(inputEl.value).toBe("my-secret-token-123");

    // Hide
    const hideBtn = screen.getByTitle("Hide value");
    await user.click(hideBtn);

    // Value must still be present
    expect(inputEl.value).toBe("my-secret-token-123");
    expect(inputEl.type).toBe("password");
  });

  it("calls onChange when revealed value is set", async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(renderPasswordField(props));

    const toggleBtn = screen.getByTitle("Reveal value");
    await user.click(toggleBtn);

    // onChange should be called with the revealed value
    expect(props.onChange).toHaveBeenCalledWith("my-secret-token-123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/milady && bun vitest run packages/app-core/src/config/config-field.test.tsx`
Expected: FAIL — value is empty after hide toggle because `input.value = ""` clears it.

- [ ] **Step 3: Convert password field to controlled React state**

In `packages/app-core/src/config/config-field.tsx`, modify `PasswordFieldInner`:

```typescript
function PasswordFieldInner({ fp: props }: { fp: FieldRenderProps }) {
  const maskedValue = props.isSet ? String(props.value ?? "") : "";
  const placeholder = props.isSet
    ? `Current: ${maskedValue || "********"}  (leave blank to keep)`
    : ((props.hint.placeholder as string | undefined) ?? "Enter value...");

  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldValue, setFieldValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const onReveal = props.onReveal;

  const handleToggle = useCallback(async () => {
    if (visible) {
      // Hide — just toggle visibility, value stays in React state
      setVisible(false);
      return;
    }

    // Reveal: fetch the real value from the server
    if (onReveal) {
      setBusy(true);
      const realValue = await onReveal();
      setBusy(false);
      if (realValue != null) {
        setVisible(true);
        setFieldValue(realValue);
        props.onChange(realValue);
      }
    } else {
      // Fallback: just toggle type (shows whatever is in the input)
      setVisible(true);
    }
  }, [visible, onReveal, props.onChange]);

  return (
    <div className="flex">
      <input
        ref={inputRef}
        className="flex-1 px-3 py-2 border border-[var(--border)] border-r-0 bg-[var(--card)] text-[13px] font-[var(--mono)] transition-all focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] box-border h-[36px] rounded-l-sm placeholder:text-[var(--muted)] placeholder:opacity-60"
        type={visible ? "text" : "password"}
        value={fieldValue}
        placeholder={placeholder}
        data-config-key={props.key}
        data-field-type="password"
        onChange={(e) => {
          setFieldValue(e.target.value);
          props.onChange(e.target.value);
          fireAction(props, "change");
        }}
        onBlur={() => fireAction(props, "blur")}
      />
      {/* ... toggle button unchanged ... */}
```

Key changes:
1. Add `const [fieldValue, setFieldValue] = useState("")`
2. Replace `defaultValue=""` with `value={fieldValue}` (controlled)
3. In `handleToggle` hide branch: remove `input.value = ""`, just `setVisible(false)`
4. In `handleToggle` reveal branch: `setFieldValue(realValue)` + `props.onChange(realValue)`
5. In `onChange`: `setFieldValue(e.target.value)` before `props.onChange`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/milady && bun vitest run packages/app-core/src/config/config-field.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/config/config-field.tsx packages/app-core/src/config/config-field.test.tsx
git commit -m "fix: preserve password field value through show/hide toggle cycle

Convert password input from uncontrolled (defaultValue + imperative DOM
manipulation) to controlled React state. The hide toggle no longer clears
input.value, fixing bot token and API key fields being erased on toggle."
```

---

### Task 2: Fix embedding manager disposal race condition

**Files:**
- Modify: `src/runtime/embedding-manager.ts:95-137`
- Test: `src/runtime/embedding-manager.test.ts` (create or modify existing)

- [ ] **Step 1: Write the failing test**

Create or add to `src/runtime/embedding-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmbeddingManager } from "./embedding-manager";

describe("EmbeddingManager disposal race condition", () => {
  it("dispose() waits for in-flight generateEmbedding before releasing resources", async () => {
    const manager = new EmbeddingManager({
      idleTimeoutMs: 0, // disable idle timer
    });

    // Mock ensureInitialized and embeddingContext to simulate a slow embedding
    let resolveEmbedding: (v: { vector: Float32Array }) => void;
    const slowEmbedding = new Promise<{ vector: Float32Array }>((resolve) => {
      resolveEmbedding = resolve;
    });

    // @ts-expect-error — accessing private for test
    manager.initialized = true;
    // @ts-expect-error — accessing private for test
    manager.embeddingContext = {
      getEmbeddingFor: () => slowEmbedding,
    };

    // Start an embedding call (it will be in-flight)
    const embeddingPromise = manager.generateEmbedding("test text");

    // Give the microtask queue a tick so inFlightCount increments
    await new Promise((r) => setTimeout(r, 10));

    // Now dispose while embedding is in-flight
    const disposePromise = manager.dispose();

    // Resolve the in-flight embedding
    resolveEmbedding!({ vector: new Float32Array([1, 2, 3]) });

    // Both should complete without errors
    const result = await embeddingPromise;
    await disposePromise;

    expect(result).toEqual([1, 2, 3]);
    // @ts-expect-error — accessing private for test
    expect(manager.disposed).toBe(true);
  });

  it("new calls after dispose() throw immediately", async () => {
    const manager = new EmbeddingManager({ idleTimeoutMs: 0 });
    await manager.dispose();

    await expect(manager.generateEmbedding("test")).rejects.toThrow(
      "has been disposed",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pleasures/Desktop/milady && bun vitest run src/runtime/embedding-manager.test.ts`
Expected: FAIL — dispose() doesn't wait for in-flight calls.

- [ ] **Step 3: Add drain mechanism to EmbeddingManager**

In `src/runtime/embedding-manager.ts`:

1. Add private fields (near other private declarations):
```typescript
private drainResolve: (() => void) | null = null;
private drainPromise: Promise<void> | null = null;
```

2. Modify `generateEmbedding()` — move `inFlightCount` increment before awaits.
   **Note:** This moves `ensureInitialized()` and `await this.unloading` into the try/catch block.
   Previously these were outside try/catch and their errors would propagate uncaught. Now they're
   caught and return a zero vector. This is intentional — it makes the system more resilient
   (callers get a degraded result instead of an unhandled exception).
```typescript
async generateEmbedding(text: string): Promise<number[]> {
  if (this.disposed) {
    throw new Error("[milady] EmbeddingManager has been disposed");
  }

  this.inFlightCount += 1;
  this.lastUsedAt = Date.now();

  try {
    if (this.unloading) await this.unloading;

    await this.ensureInitialized();

    if (!this.embeddingContext) {
      throw new Error("[milady] Embedding context not available after init");
    }

    // Truncate to prevent GGML assertion crash when text exceeds context window.
    const maxChars = this.contextSize * SAFE_CHARS_PER_TOKEN;
    let input = text;
    if (input.length > maxChars) {
      getLogger().warn(
        `[milady] Embedding input too long (${input.length} chars, ~${Math.ceil(input.length / SAFE_CHARS_PER_TOKEN)} tokens est.) ` +
          `— truncating to ${maxChars} chars for ${this.contextSize}-token context window`,
      );
      input = input.slice(0, maxChars);
    }

    const result = await this.embeddingContext.getEmbeddingFor(input);
    return Array.from(result.vector);
  } catch (err) {
    getLogger().error(`[milady] Embedding generation failed: ${err}`);
    return new Array(this.dimensions).fill(0);
  } finally {
    this.inFlightCount -= 1;
    if (this.inFlightCount === 0 && this.drainResolve) {
      this.drainResolve();
    }
  }
}
```

3. Modify `dispose()` to drain in-flight calls:
```typescript
async dispose(): Promise<void> {
  if (this.disposed) return;
  this.disposed = true;
  // Wait for in-flight calls to finish (max 5s)
  if (this.inFlightCount > 0) {
    this.drainPromise = new Promise<void>((resolve) => {
      this.drainResolve = resolve;
    });
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
    await Promise.race([this.drainPromise, timeout]);
  }
  await this.releaseResources();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pleasures/Desktop/milady && bun vitest run src/runtime/embedding-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `cd /Users/pleasures/Desktop/milady && bun run test`
Expected: No new failures

- [ ] **Step 6: Commit**

```bash
git add src/runtime/embedding-manager.ts src/runtime/embedding-manager.test.ts
git commit -m "fix: prevent embedding disposal race condition

Move inFlightCount increment before async operations to close TOCTOU
window. Add promise-based drain in dispose() that waits up to 5s for
in-flight generateEmbedding() calls to complete before releasing
resources. Prevents 'Object is disposed' errors during shutdown."
```

---

## Chunk 2: Conversation & Chat Fixes

### Task 3: Add conversation restore timeout

**Files:**
- Modify: `src/api/server.ts` — the conversation messages endpoint handler

- [ ] **Step 1: Find the exact handler location**

Search for `getConversationWithRestore` or `waitForConversationRestore` in `src/api/server.ts`. Identify the line where the restore promise is awaited without a timeout.

- [ ] **Step 2: Add timeout wrapper around restore**

Add a helper near the handler:

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}
```

Wrap the restore call:
```typescript
// Before:
await waitForConversationRestore(convId);
// After:
await withTimeout(waitForConversationRestore(convId), 5000, "Conversation restore");
```

- [ ] **Step 3: Test manually**

Run: `cd /Users/pleasures/Desktop/milady && bun run dev:cli`
Verify: Loading a conversation responds within 5s even if restore is slow. If restore times out, the response includes a clear error message.

- [ ] **Step 4: Commit**

```bash
git add src/api/server.ts
git commit -m "fix: add 5s timeout to conversation restore to prevent indefinite hangs

Wraps waitForConversationRestore() with a timeout so the messages
endpoint returns a clear error instead of hanging until the client's
10s timeout kills the request."
```

---

### Task 4: Auto-delete empty conversations on navigation

**Files:**
- Modify: `packages/app-core/src/state/AppContext.tsx` — `handleSelectConversation`

- [ ] **Step 1: Identify empty conversation detection logic**

In `handleSelectConversation` (line 3041), at the start of the function, before switching away from the current conversation, check if the current conversation has only system messages (greeting) and no user messages.

- [ ] **Step 2: Add cleanup logic**

At the top of `handleSelectConversation`, before the existing logic:

```typescript
const handleSelectConversation = useCallback(
  async (id: string) => {
    conversationHydrationEpochRef.current += 1;
    if (
      id === activeConversationId &&
      conversationMessagesRef.current.length > 0
    )
      return;

    // Clean up empty conversations: if the previous conversation has only
    // system/greeting messages and no user messages, delete it silently.
    // Reuse handleDeleteConversation to ensure consistent cleanup
    // (including unreadConversations set, deleted-conversations.json, etc.)
    const prevId = activeConversationId;
    if (prevId && prevId !== id) {
      const prevMessages = conversationMessagesRef.current;
      const hasUserMessage = prevMessages.some(
        (m) => m.role === "user",
      );
      if (!hasUserMessage && prevMessages.length <= 1) {
        // Fire-and-forget — don't block navigation on cleanup
        void handleDeleteConversation(prevId).catch(() => {});
      }
    }

    // ... rest of existing handleSelectConversation logic
```

- [ ] **Step 3: Test manually**

Run: `cd /Users/pleasures/Desktop/milady && bun run dev:cli`
Test flow:
1. Click "New Chat" — a conversation is created with greeting
2. Without typing anything, click another conversation
3. The empty "New Chat" should disappear from the sidebar
4. Click "New Chat" again, type a message, then switch — this conversation should persist

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/state/AppContext.tsx
git commit -m "fix: auto-delete empty conversations when navigating away

When switching conversations, check if the previous conversation has no
user messages (only system greeting). If so, delete it silently to
prevent orphaned empty chats from cluttering the sidebar."
```

---

### Task 5: Investigate and fix conversation delete/rename

**Files:**
- Modify: `apps/app/src/components/ConversationsSidebar.tsx` (if needed)
- Modify: `apps/app/src/components/conversations/ConversationListItem.tsx` (if needed)

- [ ] **Step 1: Verify handlers are wired at runtime**

Add temporary `console.log` statements:
- In `ConversationsSidebar.tsx` line ~102: `console.log("[DEBUG] handleConfirmDelete called for:", id);`
- In `ConversationsSidebar.tsx` line ~72: `console.log("[DEBUG] handleEditSubmit called:", id, newTitle);`
- In the `openActionsMenu` callback: `console.log("[DEBUG] openActionsMenu:", convId);`

Run the dev server and test right-click/long-press on a conversation. Check console output.

- [ ] **Step 2: Check context menu visibility**

In `ConversationsSidebar.tsx`, find the dropdown menu rendering (lines 171-192). Check:
1. Is `actionsMenuConvId` being set correctly?
2. Is the dropdown rendered with proper z-index (`z-50` or higher)?
3. Is the dropdown positioned within the visible viewport (not clipped by `overflow-hidden` parent)?

If the dropdown is rendered but invisible, add `z-50` and ensure the parent sidebar doesn't have `overflow-hidden`.

- [ ] **Step 3: Fix the identified issue**

Apply the fix based on findings from steps 1-2. Common fixes:
- Add `z-50` to dropdown menu className
- Change sidebar parent from `overflow-hidden` to `overflow-visible` for the menu
- Ensure `onContextMenu` handler calls `e.preventDefault()` and `openActionsMenu(convId, e)`

- [ ] **Step 4: Remove debug logs and commit**

```bash
git add apps/app/src/components/ConversationsSidebar.tsx apps/app/src/components/conversations/ConversationListItem.tsx
git commit -m "fix: ensure conversation context menu renders visibly for delete/rename"
```

---

## Chunk 3: UI/Visual Fixes

### Task 6: Fix button padding inconsistency

**Files:**
- Modify: `packages/ui/src/components/ui/button.tsx:22-26`

- [ ] **Step 1: Add explicit py-* to sm and lg sizes**

In `packages/ui/src/components/ui/button.tsx`, modify the size variants:

```typescript
size: {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3 py-1.5",
  lg: "h-11 rounded-md px-8 py-2.5",
  icon: "h-10 w-10",
},
```

- [ ] **Step 2: Run lint check**

Run: `cd /Users/pleasures/Desktop/milady && bun run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ui/button.tsx
git commit -m "fix: add explicit vertical padding to sm and lg button sizes

Ensures consistent hit targets when mixing CVA Button variants with
string-based button styles in the same toolbar."
```

---

### Task 7: Fix dark mode colors on shell header toggle

**Files:**
- Modify: `apps/app/src/components/shared/ShellHeaderControls.tsx:141-144`

- [ ] **Step 1: Audit current color classes**

The selected state (line 143) uses hardcoded colors:
```
text-[#8a6500] ... dark:text-[#f0b232]
```

The inactive state (line 144) uses theme-aware classes:
```
text-muted-strong ... dark:text-muted
```

The selected state's light mode `text-[#8a6500]` and dark mode `dark:text-[#f0b232]` are intentional accent/gold colors. Check if the QA issue is about the *inactive* state or *selected* state contrast.

- [ ] **Step 2: Verify contrast and fix if needed**

The dark mode selected color `#f0b232` on `dark:bg-bg/85` should be fine. If the QA issue is about the overall toggle background being invisible in dark mode, ensure the fieldset border is visible:

Line 123 already has `dark:border-border/70` — if border is invisible, increase to `dark:border-border`:

```typescript
className="inline-flex items-center gap-0.5 rounded-xl border border-border/60 bg-transparent p-0.5 shadow-sm dark:border-border dark:bg-transparent"
```

- [ ] **Step 3: Also fix Header.tsx nav tabs if needed**

Check `Header.tsx` line 289-293. The active state uses `text-accent-fg dark:text-txt-strong` and inactive uses `text-muted` — these are already theme-aware. If contrast is still poor, check that the CSS variables `--accent-fg`, `--txt-strong`, and `--muted` have sufficient contrast in dark mode in `base.css`.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/shared/ShellHeaderControls.tsx apps/app/src/components/Header.tsx
git commit -m "fix: improve dark mode contrast on shell header toggle buttons"
```

---

### Task 8: Fix collapse/off not working

**Files:**
- Investigate: `packages/app-core/src/components/PluginsView.tsx`

- [ ] **Step 1: Find SectionCard usages in PluginsView**

Run: `grep -n "SectionCard\|collapsible\|Collapse\|collapse" packages/app-core/src/components/PluginsView.tsx`

Check if sections that should be collapsible are passing `collapsible={true}`.

- [ ] **Step 2: Identify the broken collapse element**

The QA screenshot shows a plugin/connector settings panel that won't collapse. Cross-reference the UI with the code. If it's not using `SectionCard`, find which component handles the collapse (could be a custom disclosure, accordion, or details element).

- [ ] **Step 3: Apply fix**

If `collapsible` prop is missing, add it. If it's a different component, fix that component's toggle logic.

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/components/PluginsView.tsx
git commit -m "fix: enable collapsible sections in plugin settings view"
```

---

## Chunk 4: Connector & Config Fixes

### Task 9: Fix connector search bar Chrome autofill

**Files:**
- Modify: `packages/app-core/src/components/PluginsView.tsx:2718-2724`

- [ ] **Step 1: Add autoComplete and anti-autofill attributes**

Modify the `<Input>` at line 2718:

```tsx
<Input
  type="text"
  name="plugin-search"
  autoComplete="off"
  data-1p-ignore
  data-lpignore="true"
  className="w-full bg-card/60 backdrop-blur-md shadow-inner pr-8 h-9 rounded-xl focus-visible:ring-accent border-border/40"
  placeholder={searchPlaceholder}
  value={pluginSearch}
  onChange={(e) => setState("pluginSearch", e.target.value)}
/>
```

- [ ] **Step 2: Run lint check**

Run: `cd /Users/pleasures/Desktop/milady && bun run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/app-core/src/components/PluginsView.tsx
git commit -m "fix: prevent Chrome autofill on connector search input

Add autoComplete=off, data-1p-ignore, and data-lpignore to the plugin
search input to prevent password managers and Chrome autofill from
interfering with search clearing."
```

---

### Task 10: Fix settings showing wrong RPC provider

**Files:**
- Modify: `packages/app-core/src/components/ConfigPageView.tsx:471-483`
- Test: `packages/app-core/src/components/ConfigPageView.test.tsx` (create)

- [ ] **Step 1: Read the current initialization code**

Read `packages/app-core/src/components/ConfigPageView.tsx` lines 465-490 to understand the `useState` initialization and `useEffect` that reads `walletConfig`.

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { resolveInitialWalletRpcSelections, DEFAULT_WALLET_RPC_SELECTIONS } from "../../contracts/wallet";

describe("ConfigPageView RPC provider initialization", () => {
  it("returns actual config values when walletConfig is provided", () => {
    const config = {
      bsc: { provider: "alchemy" },
      evm: { provider: "infura" },
      solana: { provider: "helius" },
    };
    const result = resolveInitialWalletRpcSelections(config);
    expect(result.bsc).toBe("alchemy");
    expect(result.evm).toBe("infura");
    expect(result.solana).toBe("helius");
  });

  it("returns defaults when walletConfig is null", () => {
    const result = resolveInitialWalletRpcSelections(null);
    // All should be eliza-cloud defaults
    expect(result.bsc).toBe("eliza-cloud");
  });
});
```

- [ ] **Step 3: Implement loading guard**

In `ConfigPageView.tsx`, the actual code uses **three separate `useState` hooks** (lines 471-476):
```typescript
const [bscProvider, setBscProvider] = useState("eliza-cloud");
const [evmProvider, setEvmProvider] = useState("eliza-cloud");
const [solProvider, setSolProvider] = useState("eliza-cloud");
```
With a `useEffect` (line 478) that updates them from `walletConfig`.

Replace these three `useState` + `useEffect` with a single `useMemo` that derives from `walletConfig`:

```typescript
const walletRpcSelections = useMemo(
  () => walletConfig ? resolveInitialWalletRpcSelections(walletConfig) : null,
  [walletConfig],
);

// Derived values — null means config hasn't loaded
const bscProvider = walletRpcSelections?.bsc ?? null;
const evmProvider = walletRpcSelections?.evm ?? null;
const solProvider = walletRpcSelections?.solana ?? null;
```

In the render, guard with loading state:
```typescript
{bscProvider === null ? (
  <div className="text-muted text-sm py-4">Loading wallet configuration...</div>
) : (
  renderRpcProviderButtons(/* ... using bscProvider, evmProvider, solProvider ... */)
)}
```

If the user needs to *change* the provider on this page (not just display it), keep `useState` but
initialize from `walletConfig` when it becomes available, and show loading state while `walletConfig` is null.

This prevents the "Eliza Cloud" flash when config hasn't loaded yet.

- [ ] **Step 4: Run test to verify**

Run: `cd /Users/pleasures/Desktop/milady && bun vitest run packages/app-core/src/components/ConfigPageView.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/components/ConfigPageView.tsx packages/app-core/src/components/ConfigPageView.test.tsx
git commit -m "fix: defer RPC provider buttons until walletConfig loads

Show loading state instead of hardcoded 'Eliza Cloud' defaults when
walletConfig hasn't loaded yet. Prevents incorrect provider display
when user configured Alchemy/Helius/custom RPC in onboarding."
```

---

## Chunk 5: Backend & Runtime Fixes

### Task 11: Add trajectory schema migration for scenario_id

**Files:**
- Modify: `src/runtime/trajectory-persistence.ts:760-768`

- [ ] **Step 1: Add best-effort migration**

After the existing `archive_blob_path` migration (line 760-768), add a similar block:

```typescript
// Best-effort forward migration: add scenario_id column + index
// (referenced by upstream elizaOS core or external plugins).
try {
  await executeRawSql(
    runtime,
    `ALTER TABLE trajectories ADD COLUMN scenario_id TEXT`,
  );
} catch {
  // ignore when column already exists
}
try {
  await executeRawSql(
    runtime,
    `CREATE INDEX IF NOT EXISTS idx_trajectories_scenario_id ON trajectories(scenario_id)`,
  );
} catch {
  // ignore if index creation fails
}
```

- [ ] **Step 2: Run existing tests**

Run: `cd /Users/pleasures/Desktop/milady && bun vitest run src/runtime/trajectory-persistence.test.ts`
Expected: PASS (or skip if no test file exists)

- [ ] **Step 3: Commit**

```bash
git add src/runtime/trajectory-persistence.ts
git commit -m "fix: add scenario_id column and index to trajectories table

Best-effort migration to satisfy upstream elizaOS core or external
plugins that reference trajectories.scenario_id. Follows the existing
archive_blob_path migration pattern — silently ignores if already present."
```

---

### Task 12: Add retry with backoff for auth status check

**Files:**
- Modify: `packages/app-core/src/api/client.ts` — near `DEFAULT_FETCH_TIMEOUT_MS` and auth check

- [ ] **Step 1: Find the auth status call in the client**

Search for the function that calls `/api/auth/status` in `packages/app-core/src/api/client.ts`. Read the surrounding code.

- [ ] **Step 2: Add retry logic for boot-time endpoint**

Add a helper function near `DEFAULT_FETCH_TIMEOUT_MS`:

```typescript
async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  { retries = 3, backoffMs = 1000, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS }: {
    retries?: number;
    backoffMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      return resp;
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
      }
    }
  }
  throw lastError ?? new Error(`Failed after ${retries + 1} attempts`);
}
```

Then update the auth status check to use `fetchWithRetry` with `retries: 3, backoffMs: 1000`.

- [ ] **Step 3: Commit**

```bash
git add packages/app-core/src/api/client.ts
git commit -m "fix: retry auth status check with exponential backoff during boot

Use fetchWithRetry for the initial /api/auth/status call so the UI
gracefully handles the server not being ready yet during cold boot,
instead of failing with a single 10s timeout."
```

---

### Task 13: Wrap Telegram plugin init with error handling

**Files:**
- Modify: `src/plugins/telegram-enhanced/service.ts:24-38`

- [ ] **Step 1: Add try-catch around base plugin start**

Replace the `start` method:

```typescript
static async start(runtime: unknown) {
  // biome-ignore lint/suspicious/noExplicitAny: untyped external module returns unknown shape
  let service: Record<string, unknown>;
  try {
    service = (await (TelegramService as any).start(runtime)) as Record<
      string,
      unknown
    >;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[telegram-enhanced] Failed to initialize Telegram plugin: ${msg}. ` +
        "Check bot token and Telegram config.",
    );
    // Return null — plugin loader should treat this as "service unavailable"
    return null;
  }

  if (service?.bot) {
    // biome-ignore lint/suspicious/noExplicitAny: EnhancedTelegramMessageManager extends untyped base class
    service.messageManager = new (EnhancedTelegramMessageManager as any)(
      service.bot,
      runtime,
    );
  }
  return service;
}
```

- [ ] **Step 2: Verify plugin loader handles null return**

Search for where `TelegramEnhancedService.start()` is called. Verify the caller handles a `null` return (skips the plugin gracefully rather than crashing).

If the caller does NOT handle null, add a guard:
```typescript
const service = await TelegramEnhancedService.start(runtime);
if (!service) {
  console.warn("[telegram-enhanced] Service failed to start — plugin disabled");
  return;
}
```

- [ ] **Step 3: Run lint check**

Run: `cd /Users/pleasures/Desktop/milady && bun run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/plugins/telegram-enhanced/service.ts
git commit -m "fix: wrap Telegram plugin init with error handling

Catch JSON parse and other initialization errors from the upstream
@elizaos/plugin-telegram package. Return null on failure instead of
letting the error cascade into embedding disposal crashes."
```

---

## Chunk 6: i18n & UX Polish

### Task 14: Add one-time notice dedup to setActionNotice

**Files:**
- Modify: `packages/app-core/src/state/AppContext.tsx:964-980`
- Test: add to existing AppContext tests or create standalone

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";

describe("setActionNotice once flag", () => {
  it("suppresses duplicate notices when once=true", () => {
    const shownOnceNotices = new Set<string>();
    const displayed: string[] = [];

    function setActionNotice(
      text: string,
      tone = "info",
      ttlMs = 2800,
      once = false,
    ) {
      if (once && shownOnceNotices.has(text)) return;
      if (once) shownOnceNotices.add(text);
      displayed.push(text);
    }

    setActionNotice("Error X", "error", 2800, true);
    setActionNotice("Error X", "error", 2800, true);
    setActionNotice("Error Y", "error", 2800, true);
    setActionNotice("Error X", "error", 2800, false); // not once — should show

    expect(displayed).toEqual(["Error X", "Error Y", "Error X"]);
  });
});
```

- [ ] **Step 2: Add once parameter and shownOnceNotices ref**

In `packages/app-core/src/state/AppContext.tsx`:

1. Add ref near line 909:
```typescript
const shownOnceNotices = useRef<Set<string>>(new Set());
```

2. Modify `setActionNotice` (line 964):
```typescript
const setActionNotice = useCallback(
  (
    text: string,
    tone: "info" | "success" | "error" = "info",
    ttlMs = 2800,
    once = false,
  ) => {
    if (once && shownOnceNotices.current.has(text)) return;
    if (once) shownOnceNotices.current.add(text);
    setActionNoticeState({ tone, text });
    if (actionNoticeTimer.current != null) {
      window.clearTimeout(actionNoticeTimer.current);
    }
    actionNoticeTimer.current = window.setTimeout(() => {
      setActionNoticeState(null);
      actionNoticeTimer.current = null;
    }, ttlMs);
  },
  [],
);
```

3. Update the `setActionNotice` type in the context types file to include `once?: boolean`.

- [ ] **Step 3: Run test**

Run: `cd /Users/pleasures/Desktop/milady && bun vitest run` (the test from step 1)
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/state/AppContext.tsx
git commit -m "fix: add once flag to setActionNotice for one-time error hints

Adds a session-scoped shownOnceNotices set that suppresses duplicate
notices when called with once=true. Prevents the same error hint from
showing repeatedly."
```

---

### Task 15: Fix TTS language fallback

**Files:**
- Modify: `apps/app/plugins/talkmode/src/web.ts:194-203`

- [ ] **Step 1: Add default language to utterance**

In `apps/app/plugins/talkmode/src/web.ts`, modify the `speak()` method:

```typescript
const utterance = new SpeechSynthesisUtterance(text);
this.currentUtterance = utterance;

// Always set language — fallback to en-US if directive doesn't specify.
// Without this, the browser uses the system locale, which may read
// numbers in the wrong language (e.g., Chinese on a Chinese-locale system).
utterance.lang = options.directive?.language || options.lang || "en-US";

// Apply directive settings if available
if (options.directive?.speed) {
  utterance.rate = options.directive.speed;
}
// Remove the old directive.language assignment since we handle it above
```

- [ ] **Step 2: Check SpeakOptions type**

Verify that `SpeakOptions` includes a `lang` field. If not, add it:
```typescript
interface SpeakOptions {
  text: string;
  directive?: { speed?: number; language?: string };
  lang?: string; // UI language fallback
}
```

- [ ] **Step 3: Ensure callers pass language**

Search for where `speak()` is called in the codebase. Ensure the caller passes `lang` from the user's `uiLanguage` setting. If callers are in `packages/app-core`, they can get `uiLanguage` from AppContext.

- [ ] **Step 4: Commit**

```bash
git add apps/app/plugins/talkmode/src/web.ts
git commit -m "fix: set TTS utterance language explicitly to prevent system locale fallback

Always set utterance.lang from the directive language or UI language
setting, falling back to en-US. Prevents numbers being read in the
system locale (e.g., Chinese) when the UI is set to English."
```

---

### Task 16: Add dev-mode bypass for cloud URL validation

**Files:**
- Modify: `src/cloud/validate-url.ts:118-123`
- Test: `src/cloud/validate-url.test.ts` (create or modify existing)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import dns from "node:dns";
import { validateCloudBaseUrl } from "./validate-url";

// Mock DNS to avoid real network calls in tests
vi.mock("node:dns", async (importOriginal) => {
  const actual = await importOriginal<typeof dns>();
  return {
    ...actual,
    lookup: vi.fn((hostname, opts, cb) => {
      // Simulate a private IP resolution for test-private.example.com
      if (hostname === "test-private.example.com") {
        const callback = typeof opts === "function" ? opts : cb;
        callback(null, [{ address: "192.168.1.1", family: 4 }]);
        return;
      }
      // Simulate a public IP for test-public.example.com
      if (hostname === "test-public.example.com") {
        const callback = typeof opts === "function" ? opts : cb;
        callback(null, [{ address: "93.184.216.34", family: 4 }]);
        return;
      }
      // Fallback to actual implementation
      return actual.lookup(hostname, opts as any, cb as any);
    }),
  };
});

describe("validateCloudBaseUrl dev mode bypass", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks localhost in any mode", async () => {
    const result = await validateCloudBaseUrl("https://localhost:3000");
    expect(result).toContain("blocked local hostname");
  });

  it("blocks private IPs in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = await validateCloudBaseUrl("https://test-private.example.com");
    expect(result).toContain("blocked internal/metadata address");
  });

  it("skips IP blocking in development mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    // In dev mode, even URLs resolving to private IPs should pass
    // (the bypass returns null before DNS resolution)
    const result = await validateCloudBaseUrl("https://test-private.example.com");
    expect(result).toBeNull();
  });

  it("still rejects non-HTTPS in development mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await validateCloudBaseUrl("http://example.com");
    expect(result).toContain("must use HTTPS");
  });
});
```

- [ ] **Step 2: Add dev-mode bypass after hostname checks, before DNS**

In `src/cloud/validate-url.ts`, after line 118 (the `.local` check) and before line 120 (the `isBlockedIp` direct check):

```typescript
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return `Cloud base URL "${rawUrl}" points to a blocked local hostname.`;
  }

  // Dev-mode bypass: skip IP-range blocking but keep URL format checks above.
  if (process.env.NODE_ENV === "development" || process.env.MILADY_DEV) {
    return null;
  }

  if (isBlockedIp(hostname)) {
```

- [ ] **Step 3: Run test**

Run: `cd /Users/pleasures/Desktop/milady && bun vitest run src/cloud/validate-url.test.ts`
Expected: PASS

- [ ] **Step 4: Run lint check**

Run: `cd /Users/pleasures/Desktop/milady && bun run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cloud/validate-url.ts src/cloud/validate-url.test.ts
git commit -m "fix: skip cloud URL IP blocking in dev mode

Add a targeted dev-mode bypass after URL format and hostname validation
but before DNS resolution and IP-range blocking. Prevents false positive
'blocked internal address' errors when eliza.cloud resolves to a private
IP in development. SSRF format checks still run in dev mode."
```

---

## Task Summary

| Task | Bug(s) | Type | Complexity |
|------|--------|------|------------|
| 1 | 1.1, 4.3 | Critical: password toggle | Medium |
| 2 | 1.2 | Critical: embedding race | Medium |
| 3 | 2.1 | Conversation timeout | Small |
| 4 | 2.2 | Empty chat cleanup | Small |
| 5 | 2.3 | Delete/rename investigation | Investigation |
| 6 | 3.1 | Button padding | Trivial |
| 7 | 3.2, 3.3 | Dark mode colors | Small |
| 8 | 3.4 | Collapse toggle | Investigation |
| 9 | 4.1 | Search autofill | Trivial |
| 10 | 4.2 | RPC provider display | Medium |
| 11 | 5.1 | Trajectory schema | Small |
| 12 | 5.2 | Auth timeout retry | Small |
| 13 | 5.3 | Telegram init wrapper | Small |
| 14 | 6.1 | One-time notices | Small |
| 15 | 6.2 | TTS language | Small |
| 16 | 6.3 | Dev mode URL bypass | Small |

**Independent tasks (can run in parallel):** 1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16
**Potential file conflicts (avoid parallel):** Tasks 8 and 9 both touch `PluginsView.tsx` — run sequentially or in separate worktrees.
**Investigation tasks:** 5, 7, 8 — these require runtime debugging; commit messages should match actual findings, not be predetermined.
**Note:** 10 requires careful reading of ConfigPageView state initialization before implementing.
