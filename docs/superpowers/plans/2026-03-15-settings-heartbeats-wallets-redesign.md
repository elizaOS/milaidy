# Settings, Heartbeats & Wallets Two-Panel Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Settings, Heartbeats, and Wallets pages from their current layouts to a consistent flat two-panel master/detail pattern matching PR #976's direction.

**Architecture:** Shared CSS foundation (`.two-panel-layout`, `.two-panel-left`, `.two-panel-right`, `.two-panel-item`) added to `anime.css`. Each page rewrites its root layout to use CSS grid `220px 1fr`. Settings renders one section at a time. Heartbeats splits trigger list (left) from form (right). Wallets moves portfolio/chain info to left panel, keeps token table in right.

**Tech Stack:** React 19, Tailwind CSS 4, CSS custom properties, Lucide React icons, Radix UI primitives via `@miladyai/ui`.

**Spec:** `docs/superpowers/specs/2026-03-15-settings-heartbeats-wallets-redesign-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| None | All changes are modifications to existing files |

### Modified Files
| File | Change |
|------|--------|
| `packages/app-core/src/styles/anime.css` | Add shared two-panel CSS classes |
| `packages/app-core/src/components/SettingsView.tsx` | Rewrite to two-panel single-section layout |
| `packages/app-core/src/components/ProviderSwitcher.tsx` | Internalize `useApp()` calls, remove prop dependency on parent |
| `packages/app-core/src/components/HeartbeatsView.tsx` | Rewrite to two-panel layout with duration picker |
| `apps/app/src/components/InventoryView.tsx` | Restructure to two-panel grid layout |
| `apps/app/src/components/inventory/PortfolioHeader.tsx` | Refactor to vertical left-panel layout |
| `apps/app/src/components/inventory/InventoryToolbar.tsx` | Remove chain filter chips |
| `apps/app/src/components/inventory/TokensTable.tsx` | Replace BEM classes with Tailwind |
| `apps/app/src/components/chainConfig.ts` | Add `color` property to chain configs |

---

## Chunk 1: Shared CSS Foundation

### Task 1: Add two-panel CSS classes to anime.css

**Files:**
- Modify: `packages/app-core/src/styles/anime.css` (append at end of file)

- [ ] **Step 1: Read current end of anime.css to find insertion point**

Read the last ~20 lines of `packages/app-core/src/styles/anime.css` to identify where to append.

- [ ] **Step 2: Append the two-panel CSS foundation**

Add the following CSS at the end of `anime.css`, after the existing `plugins-game-modal--inline` and device-layout sections:

```css
/* ── Two-panel layout foundation ─────────────────────────────────── */

.two-panel-layout {
  --tp-text: var(--text);
  --tp-muted: var(--muted);
  --tp-border: var(--border);
  --tp-card: var(--card);
  --tp-surface: var(--surface);
  --tp-accent: var(--accent, #f0b232);

  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
  align-items: flex-start;
  min-height: 0;
  color: var(--tp-text);
}

.two-panel-left,
.two-panel-right {
  border-radius: 12px;
  border: 1px solid var(--tp-border);
  background: var(--tp-card);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.two-panel-left {
  position: sticky;
  top: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  max-height: calc(100vh - 80px);
  padding: 14px;
}

.two-panel-left::-webkit-scrollbar {
  width: 4px;
}

.two-panel-left::-webkit-scrollbar-thumb {
  background: var(--tp-border);
  border-radius: 2px;
}

.two-panel-right {
  min-width: 0;
  overflow-y: auto;
  padding: 18px;
}

.two-panel-item {
  padding: 8px 10px;
  border: 1px solid var(--tp-border);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  background: transparent;
}

.two-panel-item:hover {
  background: var(--tp-surface);
}

.two-panel-item.is-selected {
  background: color-mix(in srgb, var(--tp-accent) 10%, var(--tp-surface));
  border-color: var(--tp-accent);
}

.two-panel-item:focus-visible {
  outline: 2px solid var(--tp-accent);
  outline-offset: 2px;
}

/* ── Two-panel section label ─────────────────────────────────────── */

.two-panel-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--tp-muted);
  margin-bottom: 6px;
}

/* ── Two-panel responsive ────────────────────────────────────────── */

@media (max-width: 768px) {
  .two-panel-layout {
    grid-template-columns: 1fr;
  }

  .two-panel-left {
    position: static;
    max-height: none;
  }
}
```

- [ ] **Step 3: Verify the CSS is valid**

Run: `cd /Users/pleasures/Desktop/milady && npx tailwindcss --help > /dev/null 2>&1 && echo "Tailwind available"`

Check that the app still builds:
Run: `cd /Users/pleasures/Desktop/milady && npm run build --workspace=packages/app-core 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/styles/anime.css
git commit -m "feat(ui): add shared two-panel layout CSS foundation"
```

---

## Chunk 2: Settings Page Redesign

### Task 2: Internalize useApp() in ProviderSwitcher

**Files:**
- Modify: `packages/app-core/src/components/ProviderSwitcher.tsx`

The current `ProviderSwitcher` takes 14+ props from `SettingsView`. Since we're rendering one section at a time, this prop drilling is wasteful. Move the state access inside the component.

- [ ] **Step 1: Read ProviderSwitcher.tsx**

Read the full file at `packages/app-core/src/components/ProviderSwitcher.tsx` to understand the current props interface and usage.

- [ ] **Step 2: Replace props interface with internal useApp() calls**

Change the component to destructure needed values from `useApp()` internally instead of receiving them as props. Keep the `ProviderSwitcherProps` interface but make all fields optional with defaults from `useApp()`, so existing callers don't break immediately. Or better: remove the props entirely and call `useApp()` inside.

The component already calls `useApp()` on line 85 for `t`. Expand that destructuring to include all the state it needs:

```tsx
const {
  t,
  miladyCloudEnabled,
  miladyCloudConnected,
  miladyCloudCredits,
  miladyCloudCreditsLow,
  miladyCloudCreditsCritical,
  miladyCloudTopUpUrl,
  miladyCloudUserId,
  miladyCloudLoginBusy,
  miladyCloudLoginError,
  miladyCloudDisconnecting,
  plugins,
  pluginSaving,
  pluginSaveSuccess,
  loadPlugins,
  handlePluginToggle,
  handlePluginConfigSave,
  handleCloudLogin,
  handleCloudDisconnect,
  setState,
  setTab,
} = useApp();
```

Remove the `ProviderSwitcherProps` interface and the props parameter from the function signature. Change `export function ProviderSwitcher(props: ProviderSwitcherProps)` to `export function ProviderSwitcher()`.

- [ ] **Step 3: Verify the component still renders**

Run: `cd /Users/pleasures/Desktop/milady && npx tsc --noEmit --project packages/app-core/tsconfig.json 2>&1 | head -20`

Fix any type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/components/ProviderSwitcher.tsx
git commit -m "refactor(settings): internalize useApp() in ProviderSwitcher"
```

### Task 3: Rewrite SettingsView to two-panel single-section layout

**Files:**
- Modify: `packages/app-core/src/components/SettingsView.tsx`

This is the largest change. The entire layout is rewritten.

- [ ] **Step 1: Read current SettingsView.tsx fully**

Read `packages/app-core/src/components/SettingsView.tsx` in its entirety to understand all current logic.

- [ ] **Step 2: Rewrite the SettingsSidebar component**

Replace the current `SettingsSidebar` function (lines 123-178) with a new version:

```tsx
function SettingsSidebar({
  sections,
  activeSection,
  onSectionChange,
  searchQuery,
  onSearchChange,
}: {
  sections: SettingsSectionDef[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  const { t } = useApp();

  return (
    <div className="two-panel-left">
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
        <Input
          type="text"
          placeholder={t("settings.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-full rounded-lg border-border/60 bg-bg/50 pl-8 pr-3 text-xs"
        />
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1.5">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSectionChange(section.id)}
              aria-current={isActive ? "page" : undefined}
              className={`two-panel-item flex items-center gap-2.5 w-full text-left ${
                isActive ? "is-selected" : ""
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium truncate">
                {t(section.label)}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite the main SettingsView component**

Replace the main `SettingsView` export function. Key changes:
- Remove: `shellRef`, `scrollContainerRef`, scroll-spy effect, `handleSectionChange` scroll logic, `visibleSectionIds` filtering, sticky search bar, `SectionCard` wrapping
- Keep: `activeSection` state, `searchQuery` state, `visibleSections` memo, `inModal`/`onClose`/`initialSection` props
- Add: conditional section rendering based on `activeSection`

The `sectionsContent` variable becomes a function that renders only the active section:

```tsx
function renderActiveSection(sectionId: string) {
  switch (sectionId) {
    case "ai-model":
      return <ProviderSwitcher />;
    case "cloud":
      return <CloudDashboard />;
    case "coding-agents":
      return <CodingAgentSettingsSection />;
    case "wallet-rpc":
      return <ConfigPageView embedded />;
    case "media":
      return <MediaSettingsSection />;
    case "voice":
      return <VoiceConfigView />;
    case "permissions":
      return <PermissionsSection />;
    case "updates":
      return <UpdatesSection />;
    case "advanced":
      return <AdvancedSection />;
    default:
      return null;
  }
}
```

The return JSX becomes:

```tsx
return (
  <div
    className={`two-panel-layout w-full ${
      inModal ? "p-4 sm:p-6" : ""
    }`}
  >
    <SettingsSidebar
      sections={visibleSections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    />

    <div className="two-panel-right">
      {/* Section header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-txt-strong">
            {t(activeSectionDef?.label ?? "")}
          </h2>
          {activeSectionDef?.description && (
            <p className="text-xs text-muted mt-0.5">
              {t(activeSectionDef.description)}
            </p>
          )}
        </div>
        {inModal && onClose && (
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-txt"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Active section content */}
      {renderActiveSection(activeSection)}

      {visibleSections.length === 0 && (
        <div className="py-8 text-center text-sm text-muted">
          {t("settingsview.NoMatchingSettings")}
          <button
            type="button"
            className="ml-2 text-txt hover:underline"
            onClick={() => setSearchQuery("")}
          >
            {t("settingsview.ClearSearch")}
          </button>
        </div>
      )}
    </div>
  </div>
);
```

Add `activeSectionDef` derivation:

```tsx
const activeSectionDef = SETTINGS_SECTIONS.find((s) => s.id === activeSection);
```

- [ ] **Step 4: Clean up removed imports and unused variables**

Remove imports/variables no longer needed:
- Remove `SectionCard` from the `@miladyai/ui` import
- Remove `useRef` if no longer used (check `shellRef`, `scrollContainerRef`)
- Remove the large destructuring of Milady Cloud props from `useApp()` in `SettingsView` (they were only used for prop-drilling to `ProviderSwitcher`)
- Keep `useApp()` destructuring for: `t`, `loadPlugins`, `setTab`, `setState` (only what SettingsView itself needs)

- [ ] **Step 5: Remove the ProviderSwitcher props from the call site**

In the `renderActiveSection` function, change from:
```tsx
<ProviderSwitcher
  miladyCloudEnabled={miladyCloudEnabled}
  // ...14 more props
/>
```
to:
```tsx
<ProviderSwitcher />
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/pleasures/Desktop/milady && npx tsc --noEmit --project packages/app-core/tsconfig.json 2>&1 | head -30`

Fix any type errors. Common issues: unused imports, missing `activeSectionDef` variable.

- [ ] **Step 7: Commit**

```bash
git add packages/app-core/src/components/SettingsView.tsx
git commit -m "feat(settings): rewrite to two-panel single-section layout"
```

---

## Chunk 3: Heartbeats Page Redesign

### Task 4: Rewrite HeartbeatsView to two-panel layout

**Files:**
- Modify: `packages/app-core/src/components/HeartbeatsView.tsx`

- [ ] **Step 1: Read current HeartbeatsView.tsx fully**

Read `packages/app-core/src/components/HeartbeatsView.tsx` to understand all current logic. Pay attention to:
- `TriggerFormState` interface and form state management
- `formFromTrigger`, `buildCreateRequest`, `validateForm` helpers (keep these unchanged)
- The trigger list rendering and action buttons
- The form fields

- [ ] **Step 2: Add duration picker helpers**

Add these helper functions after the existing helper functions (after `validateForm`):

```tsx
const DURATION_UNITS = [
  { label: "seconds", ms: 1000 },
  { label: "minutes", ms: 60_000 },
  { label: "hours", ms: 3_600_000 },
  { label: "days", ms: 86_400_000 },
] as const;

type DurationUnit = (typeof DURATION_UNITS)[number]["label"];

function bestFitUnit(ms: number): { value: number; unit: DurationUnit } {
  for (let i = DURATION_UNITS.length - 1; i >= 0; i--) {
    const u = DURATION_UNITS[i];
    if (ms >= u.ms && ms % u.ms === 0) {
      return { value: ms / u.ms, unit: u.label };
    }
  }
  return { value: ms / 1000, unit: "seconds" };
}

function durationToMs(value: number, unit: DurationUnit): number {
  const found = DURATION_UNITS.find((u) => u.label === unit);
  return value * (found?.ms ?? 1000);
}
```

- [ ] **Step 3: Add duration state to the form**

Add `durationValue` and `durationUnit` to `TriggerFormState`:

```tsx
interface TriggerFormState {
  // ... existing fields ...
  durationValue: string;
  durationUnit: DurationUnit;
}

const emptyForm: TriggerFormState = {
  // ... existing fields ...
  durationValue: "1",
  durationUnit: "hours",
};
```

Update `formFromTrigger` to populate duration fields:

```tsx
function formFromTrigger(trigger: TriggerSummary): TriggerFormState {
  const intervalMs = trigger.intervalMs ?? 3600000;
  const { value, unit } = bestFitUnit(intervalMs);
  return {
    // ... existing fields ...
    durationValue: String(value),
    durationUnit: unit,
  };
}
```

Update `buildCreateRequest` to compute `intervalMs` from duration fields:

```tsx
function buildCreateRequest(form: TriggerFormState): CreateTriggerRequest {
  const intervalMs = form.triggerType === "interval"
    ? durationToMs(Number(form.durationValue) || 1, form.durationUnit)
    : undefined;
  // ... rest stays the same but use computed intervalMs instead of parsePositiveInteger(form.intervalMs)
}
```

- [ ] **Step 4: Rewrite the component layout to two-panel**

Replace the return JSX. The structure becomes:

```tsx
return (
  <div ref={rootRef} className="two-panel-layout w-full">
    {/* Left panel: trigger list */}
    <div className="two-panel-left">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold">{t("nav.heartbeats")}</h2>
        <span className="text-[11px] text-muted">
          {triggersLoading ? "Loading…" : `${triggers.length} configured`}
        </span>
      </div>

      {triggers.length === 0 && !triggersLoading ? (
        <div className="py-6 text-center">
          <Clock3 className="w-6 h-6 mx-auto mb-2 text-muted" />
          <div className="text-xs text-muted">{t("triggersview.NoTriggersConfigur")}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {triggers.map((trigger) => (
            <button
              key={trigger.id}
              type="button"
              aria-selected={editingId === trigger.id}
              onClick={() => {
                setEditingId(trigger.id);
                setForm(formFromTrigger(trigger));
                setFormError(null);
              }}
              className={`two-panel-item text-left w-full ${
                editingId === trigger.id ? "is-selected" : ""
              }`}
            >
              <div className="text-xs font-bold truncate">{trigger.displayName}</div>
              <div className="text-[10px] text-muted mt-0.5">{scheduleLabel(trigger)}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    trigger.enabled ? "bg-ok" : "bg-muted"
                  }`}
                />
                <span className="text-[9px] text-muted">
                  {trigger.enabled ? "active" : "paused"}
                  {trigger.runCount > 0 && ` · ${trigger.runCount} runs`}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* New heartbeat button */}
      <button
        type="button"
        onClick={() => { clearForm(); }}
        className="mt-3 w-full py-2 border border-dashed border-border rounded-lg text-xs text-muted hover:text-txt hover:border-accent transition-colors"
      >
        + New Heartbeat
      </button>
    </div>

    {/* Right panel: create/edit form */}
    <div className="two-panel-right">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold">
          {editingId ? `Edit: ${form.displayName || "Heartbeat"}` : "New Heartbeat"}
        </h2>
        {editingId && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => void runTriggerNow(editingId)}
              title="Runs the saved version"
            >
              Run Now
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => void updateTrigger(editingId, {
                enabled: !triggers.find((t) => t.id === editingId)?.enabled,
              })}
            >
              {triggers.find((t) => t.id === editingId)?.enabled ? "Disable" : "Enable"}
            </Button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {triggerError && (
        <div className="mb-3 border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger rounded-lg">
          {triggerError}
        </div>
      )}

      {/* Form fields */}
      <div className="grid gap-3">
        {/* Name */}
        <div>
          <label className="mb-1 block text-xs text-muted">{t("triggersview.Name")}</label>
          <Input
            className="h-9 w-full text-sm"
            value={form.displayName}
            onChange={(e) => setField("displayName", e.target.value)}
            placeholder={t("triggersview.eGDailyDigestH")}
          />
        </div>

        {/* Instructions */}
        <div>
          <label className="mb-1 block text-xs text-muted">{t("triggersview.Instructions")}</label>
          <textarea
            className="min-h-[80px] w-full resize-y border border-border bg-bg rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            value={form.instructions}
            onChange={(e) => setField("instructions", e.target.value)}
            placeholder={t("triggersview.WhatShouldTheAgen")}
          />
        </div>

        {/* Schedule Type + Wake Mode */}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted">{t("triggersview.ScheduleType")}</label>
            <select
              className="w-full h-9 border border-border bg-bg rounded-lg px-3 text-sm outline-none focus:border-accent"
              value={form.triggerType}
              onChange={(e) => setField("triggerType", e.target.value as TriggerType)}
            >
              <option value="interval">{t("triggersview.RepeatingInterval")}</option>
              <option value="once">{t("triggersview.OneTime")}</option>
              <option value="cron">{t("triggersview.CronSchedule")}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">{t("triggersview.WakeMode")}</label>
            <select
              className="w-full h-9 border border-border bg-bg rounded-lg px-3 text-sm outline-none focus:border-accent"
              value={form.wakeMode}
              onChange={(e) => setField("wakeMode", e.target.value as TriggerWakeMode)}
            >
              <option value="inject_now">{t("triggersview.InjectAmpWakeIm")}</option>
              <option value="next_autonomy_cycle">{t("triggersview.QueueForNextCycle")}</option>
            </select>
          </div>
        </div>

        {/* Duration picker (interval) */}
        {form.triggerType === "interval" && (
          <div>
            <label className="mb-1 block text-xs text-muted">Interval</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                className="h-9 flex-1 text-sm"
                value={form.durationValue}
                onChange={(e) => setField("durationValue", e.target.value)}
              />
              <select
                className="h-9 border border-border bg-bg rounded-lg px-3 text-sm outline-none focus:border-accent"
                value={form.durationUnit}
                onChange={(e) => setField("durationUnit", e.target.value as DurationUnit)}
              >
                {DURATION_UNITS.map((u) => (
                  <option key={u.label} value={u.label}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Scheduled time (once) */}
        {form.triggerType === "once" && (
          <div>
            <label className="mb-1 block text-xs text-muted">{t("triggersview.ScheduledTimeISO")}</label>
            <Input
              type="datetime-local"
              className="h-9 w-full text-sm"
              value={form.scheduledAtIso}
              onChange={(e) => setField("scheduledAtIso", e.target.value)}
            />
          </div>
        )}

        {/* Cron expression */}
        {form.triggerType === "cron" && (
          <div>
            <label className="mb-1 block text-xs text-muted">{t("triggersview.CronExpression5F")}</label>
            <Input
              className="h-9 w-full font-mono text-sm"
              value={form.cronExpression}
              onChange={(e) => setField("cronExpression", e.target.value)}
              placeholder="*/15 * * * *"
            />
            <div className="mt-1 text-[10px] text-muted">{t("triggersview.minuteHourDayMont")}</div>
          </div>
        )}

        {/* Max runs */}
        <div>
          <label className="mb-1 block text-xs text-muted">{t("triggersview.MaxRunsOptional")}</label>
          <Input
            className="h-9 w-full text-sm"
            value={form.maxRuns}
            onChange={(e) => setField("maxRuns", e.target.value)}
            placeholder="∞"
          />
        </div>

        {/* Start enabled — toggle */}
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setField("enabled", e.target.checked)}
            className="accent-accent"
          />
          {t("triggersview.StartEnabled")}
        </label>

        {/* Form error */}
        {formError && (
          <div className="border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger rounded-lg">
            {formError}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="default"
            size="sm"
            className="h-9 px-4 text-sm shadow-sm"
            disabled={triggersSaving}
            onClick={() => void onSubmit()}
          >
            {triggersSaving ? "Saving…" : editingId ? "Save Changes" : "Create Heartbeat"}
          </Button>
          {editingId && (
            <Button variant="outline" size="sm" className="h-9 px-4 text-sm" onClick={clearForm}>
              {t("onboarding.cancel")}
            </Button>
          )}
          <span className="flex-1" />
          {editingId && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 text-sm text-danger hover:border-danger"
              onClick={() => {
                void (async () => {
                  const confirmed = await confirmDesktopAction({
                    title: "Delete Heartbeat",
                    message: `Delete "${form.displayName}"?`,
                    confirmLabel: "Delete",
                    cancelLabel: "Cancel",
                    type: "warning",
                  });
                  if (confirmed && editingId) {
                    await deleteTrigger(editingId);
                    clearForm();
                  }
                })();
              }}
            >
              {t("triggersview.Delete")}
            </Button>
          )}
        </div>
      </div>

      {/* Run history (editing only) */}
      {editingId && selectedRunsId === editingId && (
        <div className="mt-4 rounded-lg border border-border bg-bg p-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
            {t("triggersview.RunHistory")}
          </div>
          {selectedRuns.length === 0 ? (
            <div className="py-2 text-xs text-muted">{t("triggersview.NoRunsRecordedYet")}</div>
          ) : (
            <div className="space-y-1">
              {selectedRuns.slice().reverse().map((run) => (
                <div key={run.triggerRunId} className="flex items-start gap-2 border border-border rounded px-3 py-1.5 text-xs">
                  <StatusDot status={run.status} />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{run.status}</span>
                    <span className="text-muted"> · {formatDateTime(run.finishedAt, { fallback: "—" })} · {formatDurationMs(run.latencyMs)} · {run.source}</span>
                    {run.error && <div className="mt-0.5 text-danger">{run.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  </div>
);
```

- [ ] **Step 5: Add Clock3 import and remove unused imports**

Add `Clock3` to the lucide-react imports (for the empty state icon). Remove `accentFg` style constant (no longer needed). Remove any unused imports.

- [ ] **Step 6: Update validateForm for duration picker**

The interval validation now checks `durationValue` and `durationUnit` instead of raw `intervalMs`:

```tsx
if (form.triggerType === "interval") {
  const val = Number(form.durationValue);
  if (!Number.isFinite(val) || val <= 0) {
    return "Interval must be a positive number.";
  }
}
```

Also keep populating `intervalMs` in the form state for backward compatibility — compute it in `buildCreateRequest`:

```tsx
intervalMs: form.triggerType === "interval"
  ? durationToMs(Number(form.durationValue) || 1, form.durationUnit)
  : undefined,
```

- [ ] **Step 7: Verify build**

Run: `cd /Users/pleasures/Desktop/milady && npx tsc --noEmit --project packages/app-core/tsconfig.json 2>&1 | head -30`

- [ ] **Step 8: Commit**

```bash
git add packages/app-core/src/components/HeartbeatsView.tsx
git commit -m "feat(heartbeats): rewrite to two-panel layout with duration picker"
```

---

## Chunk 4: Wallets Page Redesign

### Task 5: Add chain colors to chainConfig.ts

**Files:**
- Modify: `apps/app/src/components/chainConfig.ts`

- [ ] **Step 1: Read chainConfig.ts**

Read the file to find the `ChainConfig` interface and `CHAIN_CONFIGS` object.

- [ ] **Step 2: Add `color` property to ChainConfig interface**

Add `color: string;` to the interface.

- [ ] **Step 3: Add color values to each chain in CHAIN_CONFIGS**

```
ethereum: color: "#627eea"
base: color: "#0052ff"
bsc: color: "#f3ba2f"
avax: color: "#e84142"
solana: color: "#9945ff"
```

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/chainConfig.ts
git commit -m "feat(wallets): add chain color property to chainConfig"
```

### Task 6: Refactor PortfolioHeader to vertical left-panel layout

**Files:**
- Modify: `apps/app/src/components/inventory/PortfolioHeader.tsx`

- [ ] **Step 1: Read current PortfolioHeader.tsx**

Read the full file.

- [ ] **Step 2: Rewrite to vertical stacked layout**

The component no longer renders inside a wide horizontal block. It renders inside the 220px left panel. Replace the horizontal flex layout with a vertical stack:

- Portfolio value block (label + big number + native balance)
- Chain selector list (new — receives `chainFocus` and `onChainChange` as props)
- Wallet addresses (vertical list)

Remove: `wt__portfolio`, `wt__portfolio-label`, `wt__portfolio-value`, `wt__bnb-sub`, `wt__network-badge`, `wt__status-row`, `wt__receive-btn`, `wt__error-inline` class usage. Replace with Tailwind.

The component props need to change — it now also receives:
- `chainFocus: string`
- `onChainChange: (chain: string) => void`
- `chainStatuses: Array<{ key: string; name: string; color: string; ready: boolean; label: string; title: string }>`

And no longer receives: `networkLabel`, `receiveAddress`, `receiveTitle` (those concepts are absorbed into the left panel).

- [ ] **Step 3: Verify build**

Run: `cd /Users/pleasures/Desktop/milady && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/inventory/PortfolioHeader.tsx
git commit -m "refactor(wallets): PortfolioHeader to vertical left-panel layout"
```

### Task 7: Refactor InventoryToolbar — remove chain chips

**Files:**
- Modify: `apps/app/src/components/inventory/InventoryToolbar.tsx`

- [ ] **Step 1: Read current InventoryToolbar.tsx**

Read the full file.

- [ ] **Step 2: Remove chain filter section**

Remove everything between `{inventoryView === "tokens" && (` that renders chain filter chips (`wt__chip`, `PRIMARY_CHAIN_KEYS.map`). Keep:
- Tokens/NFTs tab buttons
- Sort controls (Value/Chain/Name)
- Refresh button

Replace `wt__toolbar`, `wt__tab`, `wt__chip`, `wt__sep`, `wt__refresh` BEM classes with Tailwind utilities.

Remove `inventoryChainFocus` and `setState` for chain focus from the props (no longer needed here — chain selection moved to left panel).

- [ ] **Step 3: Verify build**

Run: `cd /Users/pleasures/Desktop/milady && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/inventory/InventoryToolbar.tsx
git commit -m "refactor(wallets): remove chain chips from toolbar, replace BEM with Tailwind"
```

### Task 8: Replace BEM classes in TokensTable

**Files:**
- Modify: `apps/app/src/components/inventory/TokensTable.tsx`

- [ ] **Step 1: Read current TokensTable.tsx**

Read the full file.

- [ ] **Step 2: Replace BEM classes with Tailwind**

Replace:
- `wt__row--native` → remove class (styling handled by existing Tailwind on the row)
- `wt__native-badge` → `text-[9px] bg-accent/15 text-accent px-1 py-0.5 rounded`
- `wt__row-btn is-remove` → `text-[10px] text-danger hover:underline cursor-pointer bg-transparent border-none`

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/inventory/TokensTable.tsx
git commit -m "refactor(wallets): replace BEM classes with Tailwind in TokensTable"
```

### Task 9: Rewrite InventoryView to two-panel layout

**Files:**
- Modify: `apps/app/src/components/InventoryView.tsx`

This is the largest wallet change — restructuring the vertical stack into a two-panel grid.

- [ ] **Step 1: Read current InventoryView.tsx fully**

Read the entire file.

- [ ] **Step 2: Restructure renderContent to two-panel layout**

The main content render becomes:

```tsx
return (
  <div className="two-panel-layout w-full">
    {/* Left panel: portfolio + chain selector */}
    <PortfolioHeader
      totalUsd={totalUsd}
      nativeBalance={chainFocus === "all" ? null : focusedNativeBalance}
      nativeSymbol={chainFocus === "all" ? null : focusedNativeSymbol}
      addresses={addresses}
      statuses={statusItems}
      chainFocus={chainFocus}
      onChainChange={(chain) => setState("inventoryChainFocus", chain)}
      chainStatuses={/* build from existing statusItems + CHAIN_CONFIGS */}
      inlineError={inlineError}
      warning={headerWarning}
      loadBalances={loadBalances}
      goToRpcSettings={goToRpcSettings}
    />

    {/* Right panel: toolbar + table/grid */}
    <div className="two-panel-right">
      {chainFocus === "bsc" && evmAddr && !bscHasError && (
        <BscTradePanel ... />
      )}

      <InventoryToolbar
        t={t}
        inventoryView={inventoryView}
        inventorySort={inventorySort}
        walletBalances={walletBalances}
        walletNfts={walletNfts}
        setState={setState}
        loadBalances={loadBalances}
        loadNfts={loadNfts}
      />

      {inventoryView === "tokens" ? (
        <TokensTable ... />
      ) : (
        <NftGrid ... />
      )}
    </div>
  </div>
);
```

The `PortfolioHeader` now renders as the entire left panel (it includes the `two-panel-left` class internally).

- [ ] **Step 3: Remove the `wallets-bsc` wrapper class and clean up BEM references in InventoryView**

Replace `className="wallets-bsc ..."` with just the conditional padding for modal mode.

- [ ] **Step 4: Handle the no-wallet state**

The no-wallet state (no EVM or Solana address) should still render as a centered message but without the two-panel layout — render it as a standalone card.

- [ ] **Step 5: Verify build**

Run: `cd /Users/pleasures/Desktop/milady && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/components/InventoryView.tsx
git commit -m "feat(wallets): rewrite to two-panel layout with chain selector in left panel"
```

---

## Chunk 5: Final Verification

### Task 10: Full build and visual check

- [ ] **Step 1: Run full TypeScript check**

Run: `cd /Users/pleasures/Desktop/milady && npx tsc --noEmit 2>&1 | tail -20`

Fix any remaining type errors.

- [ ] **Step 2: Run full build**

Run: `cd /Users/pleasures/Desktop/milady && npm run build 2>&1 | tail -20`

Fix any build errors.

- [ ] **Step 3: Check for unused CSS**

Grep for any `wt__portfolio`, `wt__toolbar`, `wt__tab`, `wt__chip`, `wt__status-row` references that should have been removed. These classes should only appear in BscTradePanel-related code now.

Run: Search for `wt__portfolio|wt__toolbar|wt__tab[^l]|wt__chip|wt__status-row` in `.tsx` files — should return 0 matches outside of BscTradePanel.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors from two-panel redesign"
```
