# Agent Dashboard Design

**Date:** 2026-03-17
**Goal:** Add a "Dashboard" tab to the main nav that gives local agent operators a single-screen overview of agent health, activity, plugins, triggers, wallet, and errors.

## Context

The Milady app has rich data endpoints (agent status, diagnostics, trigger health, plugin list, wallet) but no unified view for operators to see what their agent is doing at a glance. Existing views are either cloud-focused (ElizaCloudDashboard), developer-facing (RuntimeView), or single-purpose (HeartbeatsView).

## Layout

Two-panel layout matching the existing settings/heartbeats/wallets redesign (`packages/app-core/src/styles/base.css` shared CSS foundation).

### Left Panel — Quick Health

1. **Agent health card** (top)
   - Status badge: running (green), paused (yellow), stopped (red), error (red pulse), not_started (gray)
   - Agent name
   - Model name (e.g., "gpt-4o")
   - Uptime counter (e.g., "2h 34m")
   - Start/stop/pause controls mirroring agent-lifecycle-routes

2. **Quick stats** (below health card)
   - Loaded plugins count
   - Active connectors count
   - Active triggers count
   - Recent errors count (red badge if > 0)

3. **Wallet summary** (bottom of left panel)
   - Truncated EVM address with copy button
   - Truncated Solana address with copy button (if configured)
   - Native balances (ETH, SOL)
   - Omitted entirely if no wallets configured

### Right Panel — Scrollable Sections

1. **Activity feed**
   - Recent agent events as a timeline list
   - Each entry: timestamp, source tag, summary text
   - Pulled from `GET /api/diagnostics/logs` filtered to info+ severity
   - Shows last 50 entries, auto-refreshes every 15s
   - Click to expand full log entry

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
   - Last 10 error/critical entries from diagnostics logs
   - Red highlight for critical severity
   - Timestamp + source + message
   - "View all logs" link to full diagnostics

## Data Sources

All existing endpoints — no new backend routes needed.

| Section | Endpoint | Polling interval |
|---------|----------|-----------------|
| Agent health | `GET /api/agent/status` | 5s |
| Activity feed | `GET /api/diagnostics/logs?level=info&limit=50` | 15s |
| Trigger stats | `GET /api/triggers/health` | 15s |
| Plugin overview | `GET /api/plugins` | 30s (rarely changes) |
| Wallet summary | `GET /api/wallet/addresses` + `GET /api/wallet/balances` | 30s |
| Recent errors | `GET /api/diagnostics/logs?level=error&limit=10` | 15s |

Polling uses `setInterval` with cleanup on unmount, matching the existing pattern in HeartbeatsView and RuntimeView. No WebSocket needed.

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

## Navigation Integration

Add "Dashboard" as the first tab in the main nav. Requires modifying:
- `packages/app-core/src/components/Header.tsx` — add Dashboard nav item
- `packages/app-core/src/App.tsx` — add route/view for Dashboard
- `packages/app-core/src/components/index.ts` — export DashboardView

Dashboard becomes the default view when the app opens (replacing the current default).

## Styling

- Tailwind CSS matching existing app conventions
- Uses shared two-panel layout CSS from `packages/app-core/src/styles/base.css`
- Status colors: green (#22c55e) running, yellow (#eab308) paused, red (#ef4444) stopped/error, gray (#6b7280) not_started
- Cards use existing `bg-zinc-900 border border-zinc-800 rounded-lg` pattern
- Consistent with the miladymaker.net green aesthetic

## Testing

Unit tests for each dashboard sub-component:
- `DashboardView.test.tsx` — renders without crash, shows loading state
- `AgentHealthCard.test.tsx` — renders each status variant, uptime formatting
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
