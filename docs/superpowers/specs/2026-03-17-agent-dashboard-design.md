# Agent Dashboard Design

**Date:** 2026-03-17
**Goal:** Add a "Dashboard" tab to the main nav that gives local agent operators a single-screen overview of agent health, activity, plugins, triggers, wallet, and errors.

## Context

The Milady app has rich data endpoints (agent status, diagnostics, trigger health, plugin list, wallet) but no unified view for operators to see what their agent is doing at a glance. Existing views are either cloud-focused (ElizaCloudDashboard), developer-facing (RuntimeView), or single-purpose (HeartbeatsView).

## Layout

Two-panel layout using Tailwind flex/grid utilities, matching the visual pattern of the existing settings/heartbeats/wallets redesign.

### Left Panel — Quick Health

1. **Agent health card** (top)
   - Status badge: running (green), starting (blue), stopped (red), error (red pulse), restarting (yellow), not_started (gray)
   - Agent name
   - Model name (e.g., "gpt-4o")
   - Uptime counter computed from `startedAt` field (e.g., "2h 34m"), falls back to server `uptime` field
   - Start/stop controls mirroring agent-lifecycle-routes

2. **Quick stats** (below health card)
   - Loaded plugins count (from `AgentSelfStatusSnapshot.plugins.totalActive`)
   - Active connectors count (from `AgentSelfStatusSnapshot.plugins.connectors.length`)
   - Active triggers count
   - Recent errors count (red badge if > 0)

3. **Wallet summary** (bottom of left panel)
   - Truncated EVM address with copy button (from `AgentSelfStatusSnapshot.wallet`)
   - Truncated Solana address with copy button (if configured)
   - Native balances from `GET /api/wallet/balances`
   - Omitted entirely if no wallets configured

### Right Panel — Scrollable Sections

1. **Activity feed**
   - Recent agent events as a timeline list
   - Each entry: timestamp, source tag, summary text
   - Pulled from `GET /api/logs` filtered to info+ severity, truncated client-side to last 50 entries
   - Auto-refreshes every 15s
   - "View in logs" link navigates to full log view (no inline expand for v1)

2. **Trigger stats**
   - Compact stats row: total executions, failures, skipped, last execution time
   - Visual indicator if failure rate > 10%
   - "View all" link navigates to HeartbeatsView

3. **Plugin overview**
   - List of loaded plugins with status indicator (green dot = active, red = load error, gray = disabled)
   - Load errors shown inline as red text
   - Shows count: "12 loaded, 2 errors"
   - "Manage" link navigates to PluginsView

4. **Recent errors**
   - Last 10 error/critical entries, filtered client-side from the same logs fetch as the activity feed (single API call, two views)
   - Red highlight for critical severity
   - Timestamp + source + message
   - "View all logs" link to full diagnostics

## Data Sources

All existing endpoints — no new backend routes needed. Logs are fetched once and filtered client-side for both activity feed and error display.

| Section | Endpoint | Polling interval |
|---------|----------|-----------------|
| Agent health + Quick stats + Wallet addresses | `GET /api/agent/self-status` | 5s |
| Activity feed + Recent errors | `GET /api/logs` (single fetch, client-side filter + truncate) | 15s |
| Trigger stats | `GET /api/triggers/health` | 15s |
| Plugin overview | `GET /api/plugins` | 30s (rarely changes) |
| Wallet balances | `GET /api/wallet/balances` | 30s |

Polling uses `setInterval` with cleanup on unmount, matching the existing pattern in HeartbeatsView and RuntimeView. No WebSocket needed.

**Note:** `GET /api/logs` has no server-side `limit` parameter (only `source`, `level`, `tag`, `since`). We fetch all logs and truncate client-side with `.slice(-50)` for activity and `.filter(e => e.level === 'error' || e.level === 'critical').slice(-10)` for errors.

## Component Structure

```
packages/app-core/src/components/
├── DashboardView.tsx              (main view — two-panel layout, data fetching, polling)
├── dashboard/
│   ├── AgentHealthCard.tsx        (status badge, name, model, uptime, controls)
│   ├── QuickStats.tsx             (plugin/connector/trigger/error counts)
│   ├── WalletSummary.tsx          (addresses + native balances)
│   ├── ActivityFeed.tsx           (timeline list of recent events)
│   ├── TriggerStats.tsx           (execution stats compact row)
│   ├── PluginOverview.tsx         (loaded plugins with status dots)
│   └── RecentErrors.tsx           (error/critical log entries)
```

### Loading and error states

- **Loading:** Skeleton placeholders for each card while data loads (matching existing app patterns)
- **API error:** Card shows "Unable to load" with a retry button. Dashboard does not crash if one section fails.
- **Agent not started:** Left panel shows "Agent not running" with a start button. Right panel sections show empty states.

## Navigation Integration

Add "Dashboard" as the first tab in the main nav. Requires modifying:
- `packages/app-core/src/navigation/index.ts` — add `"dashboard"` to `Tab` union type, add entry to `ALL_TAB_GROUPS` as first item, add `dashboard: "/dashboard"` to `TAB_PATHS`, add case to `titleForTab`, change `tabFromPath` default from `"chat"` to `"dashboard"`
- `packages/app-core/src/App.tsx` (or equivalent shell) — add route/view for Dashboard
- `packages/app-core/src/components/index.ts` — export DashboardView

Dashboard becomes the default view when the app opens.

## Styling

- Tailwind CSS flex/grid for two-panel layout (no custom CSS classes needed)
- Theme-aware colors using CSS variables: `bg-[var(--card)]`, `border-[var(--border)]`, `text-[var(--foreground)]`
- Status colors: green (running), blue (starting), red (stopped/error), yellow (restarting), gray (not_started)
- Rounded cards with `rounded-lg` and subtle border
- Consistent with existing app dark theme

## Testing

Unit tests for each dashboard sub-component:
- `DashboardView.test.tsx` — renders without crash, shows loading state, handles API error
- `AgentHealthCard.test.tsx` — renders each status variant (running/stopped/error/not_started/starting/restarting), uptime formatting
- `QuickStats.test.tsx` — renders counts, error badge visibility
- `WalletSummary.test.tsx` — renders addresses, hides when no wallet
- `ActivityFeed.test.tsx` — renders timeline entries, empty state
- `TriggerStats.test.tsx` — renders stats, failure rate indicator
- `PluginOverview.test.tsx` — renders plugin list, error indicators
- `RecentErrors.test.tsx` — renders error entries, empty state

Mock API responses for all tests. No e2e tests for v1.

## What we are NOT building

- No historical metrics or time-series charts (v2)
- No persistent analytics storage
- No cloud agent management (ElizaCloudDashboard handles that)
- No custom dashboard configuration/widget arrangement
- No notification system for errors
- No inline log entry expansion (navigate to logs view instead)
