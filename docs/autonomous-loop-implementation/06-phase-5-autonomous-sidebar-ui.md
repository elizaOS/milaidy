# Phase 5: Autonomous Sidebar UI (Monologue + Actions + Loop Visibility)

Goal: provide an operator-grade right sidebar that shows what autonomy is doing in near real-time.

## Current UI baseline

Right sidebar (`WidgetSidebar`) currently shows:

- Goals
- Tasks

No dedicated visibility into:

- thought stream
- action/evaluator/provider lifecycle
- run-level health
- heartbeat and failure/backoff state

## Proposed component architecture

Replace `WidgetSidebar` with `AutonomousPanel` composed of:

1. `AutonomyStatusCard`
2. `ThoughtStreamSection`
3. `ActionStreamSection`
4. `ProviderEvaluatorSection`
5. `LoopRunsSection`
6. `GoalsTasksSection` (carry-forward existing capability)

## Information architecture

Priority order:

1. Current loop status (am I alive?)
2. Current thought/intent (what am I trying to do?)
3. Current action chain (what am I executing?)
4. Failure and backoff indicators (am I stuck?)
5. Historical context (what happened earlier?)

## Section behavior details

## 1) AutonomyStatusCard

Displays:

- running/paused/stopped/restarting
- "thinking now" indicator from recent activity
- last heartbeat status
- last event timestamp
- reconnect status

## 2) ThoughtStreamSection

Input:

- assistant stream events with thought/plan/reflection payload categories

Behavior:

- newest-first
- compact + expanded modes
- optional "follow latest" auto-scroll
- "new" pulse marker for unseen entries

## 3) ActionStreamSection

Input:

- action stream events start/complete/error/skipped

Behavior:

- grouped by run id
- calculate and display duration if start/complete pair exists
- error rows sticky-highlighted

## 4) ProviderEvaluatorSection

Input:

- provider + evaluator streams

Behavior:

- collapse by default
- show counts and latest failures
- expand for diagnostics

## 5) LoopRunsSection

Input:

- lifecycle run_start/run_end/timeouts

Behavior:

- list latest runs with status pill
- show partial marker for sequence gaps
- allow drill-down by selecting run id

## 6) GoalsTasksSection

Existing workbench goals/todos moved under collapsible panel to keep feature parity.

## Rendering and performance policy

1. Use bounded render windows:
   - thoughts: 100 rows max visible
   - actions: 200 rows max visible
2. defer heavy formatting work to memoized selectors
3. avoid per-row expensive date formatting on every render
4. avoid rerender storm:
   - batch incoming event state updates in AppContext
   - section-level memoization

## UX controls

1. Pause stream (freeze UI updates, keep buffering)
2. Clear local view (does not mutate backend state)
3. Filter by:
   - run id
   - stream type
   - errors only
4. Search event text (optional advanced)

## Accessibility requirements

1. keyboard-navigable section headers
2. readable contrast in all themes
3. aria labels for status indicators
4. avoid color-only status encoding

## Design alternatives

## Option A: single merged feed

Pros:

- very easy to scan chronology

Cons:

- noisy
- hard to isolate thought vs action

## Option B: structured multi-section panel (recommended)

Pros:

- operator-focused clarity
- supports triage and drill-down

Cons:

- more UI code

## Option C: admin tab only

Pros:

- minimal chat layout change

Cons:

- low discoverability for day-to-day operator use

Recommendation: Option B.

## Failure modes

1. Event flood causes lag
   - mitigation: render windows + event compaction.
2. Sequence gaps confuse timeline
   - mitigation: explicit partial markers and replay status badge.
3. No event stream available
   - mitigation: fallback panel mode with clear empty-state and troubleshooting copy.

## Testing

1. component tests:
   - section toggles
   - filters
   - run-group rendering
2. performance test:
   - simulate 5k events, validate frame stability
3. visual test:
   - all themes and responsive widths

## Done criteria

1. Sidebar shows live thought/action/provider/evaluator/run visibility.
2. Goals/tasks parity preserved.
3. UI remains responsive under sustained event load.

