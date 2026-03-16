# Agent Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Dashboard" tab as the default landing page showing agent health, activity, plugins, triggers, wallet, and errors in a two-panel layout.

**Architecture:** A new `DashboardView.tsx` component with 7 sub-components in a `dashboard/` folder. Data comes from existing API endpoints (`/api/agent/self-status`, `/api/logs`, `/api/triggers/health`, `/api/plugins`, `/api/wallet/balances`) via polling. Two-panel layout using Tailwind flex utilities and theme CSS variables.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest for tests

**Spec:** `docs/superpowers/specs/2026-03-17-agent-dashboard-design.md`

**Branch:** Create off `develop`

---

## Chunk 1: Navigation + Shell

### Task 1: Create branch and register the Dashboard tab

**Files:**
- Modify: `packages/app-core/src/navigation/index.ts`
- Modify: `apps/app/src/App.tsx`
- Modify: `packages/app-core/src/components/index.ts`
- Create: `packages/app-core/src/components/DashboardView.tsx`

- [ ] **Step 1: Create branch**

```bash
git checkout develop
git pull upstream develop
git checkout -b feat/agent-dashboard
```

- [ ] **Step 2: Add "dashboard" to the Tab union type**

In `packages/app-core/src/navigation/index.ts`:

Add `"dashboard"` as the first entry in the `Tab` union (line 31):
```typescript
export type Tab =
  | "dashboard"
  | "chat"
  | "companion"
  // ... rest unchanged
```

Add a Dashboard tab group as the **first** entry in `ALL_TAB_GROUPS` (line 62):
```typescript
{
  label: "Dashboard",
  tabs: ["dashboard"],
  icon: "LayoutDashboard",
  description: "Agent overview",
},
```

Add to `TAB_PATHS` (line 140):
```typescript
dashboard: "/dashboard",
```

Add to `titleForTab` switch (line 228):
```typescript
case "dashboard":
  return "Dashboard";
```

Change `tabFromPath` default (line ~195) from returning `"chat"` to `"dashboard"`:
```typescript
if (normalized === "/") return "dashboard";
```

- [ ] **Step 3: Create placeholder DashboardView**

Create `packages/app-core/src/components/DashboardView.tsx`:
```tsx
export function DashboardView() {
  return (
    <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
      Dashboard loading...
    </div>
  );
}
```

- [ ] **Step 4: Export from barrel**

Add to `packages/app-core/src/components/index.ts`:
```typescript
export { DashboardView } from "./DashboardView";
```

- [ ] **Step 5: Add route in App.tsx**

In `apps/app/src/App.tsx`, add import at the top with other app-core imports:
```typescript
import { DashboardView } from "@milady/app-core";
```

Add case in the `ViewRouter` switch (before the `"chat"` case, around line 113):
```typescript
case "dashboard":
  return (
    <TabContentView>
      <DashboardView />
    </TabContentView>
  );
```

- [ ] **Step 6: Verify app compiles**

```bash
bunx tsc --noEmit -p packages/app-core/tsconfig.json
```

- [ ] **Step 7: Commit**

```bash
git add packages/app-core/src/navigation/index.ts packages/app-core/src/components/DashboardView.tsx packages/app-core/src/components/index.ts apps/app/src/App.tsx
git commit -m "feat(dashboard): register Dashboard tab as default landing page"
```

---

## Chunk 2: Left Panel Components

### Task 2: AgentHealthCard

**Files:**
- Create: `packages/app-core/src/components/dashboard/AgentHealthCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useCallback } from "react";

type AgentState =
  | "not_started"
  | "starting"
  | "running"
  | "stopped"
  | "restarting"
  | "error";

interface AgentHealthCardProps {
  state: AgentState;
  agentName: string;
  model: string | undefined;
  startedAt: number | undefined;
  uptime: number | undefined;
  onStart?: () => void;
  onStop?: () => void;
}

const STATE_COLORS: Record<AgentState, string> = {
  running: "bg-green-500",
  starting: "bg-blue-500 animate-pulse",
  restarting: "bg-yellow-500 animate-pulse",
  stopped: "bg-red-500",
  error: "bg-red-500 animate-pulse",
  not_started: "bg-zinc-500",
};

const STATE_LABELS: Record<AgentState, string> = {
  running: "Running",
  starting: "Starting...",
  restarting: "Restarting...",
  stopped: "Stopped",
  error: "Error",
  not_started: "Not Started",
};

function formatUptime(ms: number | undefined): string {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function AgentHealthCard({
  state,
  agentName,
  model,
  startedAt,
  uptime,
  onStart,
  onStop,
}: AgentHealthCardProps) {
  const computedUptime = uptime ?? (startedAt ? Date.now() - startedAt : undefined);
  const isRunning = state === "running" || state === "starting" || state === "restarting";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${STATE_COLORS[state]}`} />
        <span className="text-sm font-medium text-[var(--text)]">
          {STATE_LABELS[state]}
        </span>
      </div>
      <div className="space-y-1">
        <div className="text-lg font-semibold text-[var(--text-strong)]">{agentName}</div>
        {model && (
          <div className="text-xs text-[var(--muted)]">{model}</div>
        )}
      </div>
      {isRunning && (
        <div className="text-xs text-[var(--muted)]">
          Uptime: {formatUptime(computedUptime)}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        {state === "not_started" || state === "stopped" || state === "error" ? (
          <button
            onClick={onStart}
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            Start
          </button>
        ) : state === "running" ? (
          <button
            onClick={onStop}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            Stop
          </button>
        ) : null}
      </div>
    </div>
  );
}

export { formatUptime };
export type { AgentHealthCardProps, AgentState };
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/src/components/dashboard/AgentHealthCard.tsx
git commit -m "feat(dashboard): add AgentHealthCard component"
```

---

### Task 3: QuickStats

**Files:**
- Create: `packages/app-core/src/components/dashboard/QuickStats.tsx`

- [ ] **Step 1: Create the component**

```tsx
interface QuickStatsProps {
  pluginCount: number;
  connectorCount: number;
  triggerCount: number;
  errorCount: number;
}

function StatItem({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span className={`text-sm font-semibold ${alert ? "text-[var(--destructive)]" : "text-[var(--text)]"}`}>
        {value}
        {alert && value > 0 && (
          <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[var(--destructive)]" />
        )}
      </span>
    </div>
  );
}

export function QuickStats({ pluginCount, connectorCount, triggerCount, errorCount }: QuickStatsProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)] mb-2">
        Quick Stats
      </div>
      <div className="divide-y divide-[var(--border)]">
        <StatItem label="Plugins" value={pluginCount} />
        <StatItem label="Connectors" value={connectorCount} />
        <StatItem label="Triggers" value={triggerCount} />
        <StatItem label="Errors" value={errorCount} alert />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/src/components/dashboard/QuickStats.tsx
git commit -m "feat(dashboard): add QuickStats component"
```

---

### Task 4: WalletSummary

**Files:**
- Create: `packages/app-core/src/components/dashboard/WalletSummary.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useCallback, useState } from "react";

interface WalletSummaryProps {
  evmAddress: string | null;
  solanaAddress: string | null;
  evmBalance: string | null;
  solanaBalance: string | null;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function AddressRow({ label, address, balance }: { label: string; address: string; balance: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [address]);

  return (
    <div className="flex items-center justify-between py-2">
      <div className="space-y-0.5">
        <div className="text-xs text-[var(--muted)]">{label}</div>
        <button
          onClick={copy}
          className="text-xs font-mono text-[var(--text)] hover:text-[var(--accent)] cursor-pointer"
          title="Copy address"
        >
          {truncateAddress(address)} {copied ? "✓" : ""}
        </button>
      </div>
      {balance && (
        <span className="text-sm font-medium text-[var(--text)]">{balance}</span>
      )}
    </div>
  );
}

export function WalletSummary({ evmAddress, solanaAddress, evmBalance, solanaBalance }: WalletSummaryProps) {
  if (!evmAddress && !solanaAddress) return null;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)] mb-2">
        Wallets
      </div>
      <div className="divide-y divide-[var(--border)]">
        {evmAddress && <AddressRow label="EVM" address={evmAddress} balance={evmBalance} />}
        {solanaAddress && <AddressRow label="Solana" address={solanaAddress} balance={solanaBalance} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/src/components/dashboard/WalletSummary.tsx
git commit -m "feat(dashboard): add WalletSummary component"
```

---

## Chunk 3: Right Panel Components

### Task 5: ActivityFeed

**Files:**
- Create: `packages/app-core/src/components/dashboard/ActivityFeed.tsx`

- [ ] **Step 1: Create the component**

```tsx
interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
  tags: string[];
}

interface ActivityFeedProps {
  entries: LogEntry[];
  onViewAll?: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const LEVEL_COLORS: Record<string, string> = {
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  critical: "text-red-500 font-bold",
  debug: "text-zinc-500",
};

export function ActivityFeed({ entries, onViewAll }: ActivityFeedProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Activity
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            View logs
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-[var(--muted)] py-4 text-center">No recent activity</div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {entries.map((entry, i) => (
            <div key={`${entry.timestamp}-${i}`} className="flex gap-2 text-xs py-1">
              <span className="text-[var(--muted)] shrink-0 font-mono">
                {formatTime(entry.timestamp)}
              </span>
              <span className={`shrink-0 ${LEVEL_COLORS[entry.level] ?? "text-[var(--text)]"}`}>
                [{entry.source}]
              </span>
              <span className="text-[var(--text)] truncate">{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/src/components/dashboard/ActivityFeed.tsx
git commit -m "feat(dashboard): add ActivityFeed component"
```

---

### Task 6: TriggerStats

**Files:**
- Create: `packages/app-core/src/components/dashboard/TriggerStats.tsx`

- [ ] **Step 1: Create the component**

```tsx
interface TriggerStatsProps {
  triggersEnabled: boolean;
  activeTriggers: number;
  totalExecutions: number;
  totalFailures: number;
  totalSkipped: number;
  lastExecutionAt?: number;
  onViewAll?: () => void;
}

export function TriggerStats({
  triggersEnabled,
  activeTriggers,
  totalExecutions,
  totalFailures,
  totalSkipped,
  lastExecutionAt,
  onViewAll,
}: TriggerStatsProps) {
  const failureRate = totalExecutions > 0 ? (totalFailures / totalExecutions) * 100 : 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Triggers
        </div>
        {onViewAll && (
          <button onClick={onViewAll} className="text-xs text-[var(--accent)] hover:underline">
            View all
          </button>
        )}
      </div>
      {!triggersEnabled ? (
        <div className="text-xs text-[var(--muted)] py-2">Triggers disabled</div>
      ) : (
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-lg font-semibold text-[var(--text)]">{activeTriggers}</div>
            <div className="text-xs text-[var(--muted)]">Active</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-[var(--text)]">{totalExecutions}</div>
            <div className="text-xs text-[var(--muted)]">Runs</div>
          </div>
          <div>
            <div className={`text-lg font-semibold ${failureRate > 10 ? "text-[var(--destructive)]" : "text-[var(--text)]"}`}>
              {totalFailures}
            </div>
            <div className="text-xs text-[var(--muted)]">Failed</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-[var(--text)]">{totalSkipped}</div>
            <div className="text-xs text-[var(--muted)]">Skipped</div>
          </div>
        </div>
      )}
      {lastExecutionAt && (
        <div className="text-xs text-[var(--muted)] mt-2">
          Last run: {new Date(lastExecutionAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/src/components/dashboard/TriggerStats.tsx
git commit -m "feat(dashboard): add TriggerStats component"
```

---

### Task 7: PluginOverview

**Files:**
- Create: `packages/app-core/src/components/dashboard/PluginOverview.tsx`

- [ ] **Step 1: Create the component**

```tsx
interface PluginItem {
  name: string;
  isActive: boolean;
  loadError?: string | null;
  enabled: boolean;
}

interface PluginOverviewProps {
  plugins: PluginItem[];
  onManage?: () => void;
}

export function PluginOverview({ plugins, onManage }: PluginOverviewProps) {
  const active = plugins.filter((p) => p.isActive);
  const errors = plugins.filter((p) => p.loadError);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Plugins
          <span className="ml-2 text-[var(--text)]">
            {active.length} loaded{errors.length > 0 && `, ${errors.length} errors`}
          </span>
        </div>
        {onManage && (
          <button onClick={onManage} className="text-xs text-[var(--accent)] hover:underline">
            Manage
          </button>
        )}
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {plugins.length === 0 ? (
          <div className="text-xs text-[var(--muted)] py-2 text-center">No plugins loaded</div>
        ) : (
          plugins.map((plugin) => (
            <div key={plugin.name} className="flex items-center gap-2 text-xs py-1">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  plugin.loadError
                    ? "bg-red-500"
                    : plugin.isActive
                      ? "bg-green-500"
                      : "bg-zinc-500"
                }`}
              />
              <span className="text-[var(--text)] truncate">{plugin.name}</span>
              {plugin.loadError && (
                <span className="text-[var(--destructive)] truncate ml-auto">
                  {plugin.loadError}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/src/components/dashboard/PluginOverview.tsx
git commit -m "feat(dashboard): add PluginOverview component"
```

---

### Task 8: RecentErrors

**Files:**
- Create: `packages/app-core/src/components/dashboard/RecentErrors.tsx`

- [ ] **Step 1: Create the component**

```tsx
interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
}

interface RecentErrorsProps {
  entries: LogEntry[];
  onViewAll?: () => void;
}

export function RecentErrors({ entries, onViewAll }: RecentErrorsProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Recent Errors
          {entries.length > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-[var(--destructive)] px-1.5 py-0.5 text-[10px] text-white">
              {entries.length}
            </span>
          )}
        </div>
        {onViewAll && (
          <button onClick={onViewAll} className="text-xs text-[var(--accent)] hover:underline">
            View all logs
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-[var(--ok)] py-2 text-center">No recent errors</div>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {entries.map((entry, i) => (
            <div
              key={`${entry.timestamp}-${i}`}
              className={`text-xs py-1.5 px-2 rounded ${
                entry.level === "critical"
                  ? "bg-red-500/10 border border-red-500/20"
                  : ""
              }`}
            >
              <div className="flex gap-2">
                <span className="text-[var(--muted)] shrink-0 font-mono">
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[var(--destructive)] shrink-0">[{entry.source}]</span>
              </div>
              <div className="text-[var(--text)] mt-0.5 truncate">{entry.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-core/src/components/dashboard/RecentErrors.tsx
git commit -m "feat(dashboard): add RecentErrors component"
```

---

## Chunk 4: Wire It All Together

### Task 9: Full DashboardView with data fetching

**Files:**
- Modify: `packages/app-core/src/components/DashboardView.tsx`

- [ ] **Step 1: Replace the placeholder with the full implementation**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../api";
import type {
  AgentSelfStatusSnapshot,
  LogEntry,
  PluginInfo,
  TriggerHealthSnapshot,
  WalletBalancesResponse,
} from "../api/client";
import { useApp } from "../state";
import { AgentHealthCard } from "./dashboard/AgentHealthCard";
import { QuickStats } from "./dashboard/QuickStats";
import { WalletSummary } from "./dashboard/WalletSummary";
import { ActivityFeed } from "./dashboard/ActivityFeed";
import { TriggerStats } from "./dashboard/TriggerStats";
import { PluginOverview } from "./dashboard/PluginOverview";
import { RecentErrors } from "./dashboard/RecentErrors";

export function DashboardView() {
  const { setTab } = useApp();
  const [status, setStatus] = useState<AgentSelfStatusSnapshot | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [triggerHealth, setTriggerHealth] = useState<TriggerHealthSnapshot | null>(null);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [balances, setBalances] = useState<WalletBalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiClient.getAgentSelfStatus();
      if (mounted.current) setStatus(data);
    } catch {
      // Agent may not be running
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await apiClient.getLogs();
      if (mounted.current) setLogs(data.logs ?? []);
    } catch {
      // Logs unavailable
    }
  }, []);

  const fetchTriggers = useCallback(async () => {
    try {
      const data = await apiClient.getTriggerHealth();
      if (mounted.current) setTriggerHealth(data);
    } catch {
      // Triggers unavailable
    }
  }, []);

  const fetchPlugins = useCallback(async () => {
    try {
      const data = await apiClient.getPlugins();
      if (mounted.current) setPlugins(data.plugins ?? []);
    } catch {
      // Plugins unavailable
    }
  }, []);

  const fetchBalances = useCallback(async () => {
    try {
      const data = await apiClient.getWalletBalances();
      if (mounted.current) setBalances(data);
    } catch {
      // Wallet unavailable
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const init = async () => {
      await Promise.all([fetchStatus(), fetchLogs(), fetchTriggers(), fetchPlugins(), fetchBalances()]);
      if (mounted.current) setLoading(false);
    };
    init();

    const statusInterval = setInterval(fetchStatus, 5000);
    const logsInterval = setInterval(fetchLogs, 15000);
    const triggersInterval = setInterval(fetchTriggers, 15000);
    const pluginsInterval = setInterval(fetchPlugins, 30000);
    const balancesInterval = setInterval(fetchBalances, 30000);

    return () => {
      mounted.current = false;
      clearInterval(statusInterval);
      clearInterval(logsInterval);
      clearInterval(triggersInterval);
      clearInterval(pluginsInterval);
      clearInterval(balancesInterval);
    };
  }, [fetchStatus, fetchLogs, fetchTriggers, fetchPlugins, fetchBalances]);

  const activityEntries = logs.slice(-50);
  const errorEntries = logs
    .filter((e) => e.level === "error" || e.level === "critical")
    .slice(-10);

  const evmAddr = status?.wallet?.addresses?.evm ?? null;
  const solAddr = status?.wallet?.addresses?.solana ?? null;

  // Extract native balances from wallet response
  let evmBalance: string | null = null;
  let solBalance: string | null = null;
  if (balances?.evm?.chains) {
    const eth = balances.evm.chains.find((c: any) => c.chain === "ethereum" || c.chain === "eth");
    if (eth) evmBalance = `${Number(eth.nativeBalance).toFixed(4)} ${eth.nativeSymbol ?? "ETH"}`;
  }
  if (balances?.solana) {
    const sol = (balances.solana as any);
    if (sol.nativeBalance) solBalance = `${Number(sol.nativeBalance).toFixed(4)} SOL`;
  }

  const handleStart = useCallback(async () => {
    try {
      await apiClient.startAgent();
      fetchStatus();
    } catch { /* ignore */ }
  }, [fetchStatus]);

  const handleStop = useCallback(async () => {
    try {
      await apiClient.stopAgent();
      fetchStatus();
    } catch { /* ignore */ }
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left Panel */}
      <div className="w-72 shrink-0 border-r border-[var(--border)] overflow-y-auto p-4 space-y-4">
        <AgentHealthCard
          state={(status?.state as any) ?? "not_started"}
          agentName={status?.agentName ?? "Agent"}
          model={status?.model}
          startedAt={undefined}
          uptime={undefined}
          onStart={handleStart}
          onStop={handleStop}
        />
        <QuickStats
          pluginCount={status?.plugins?.totalActive ?? plugins.length}
          connectorCount={status?.plugins?.connectors?.length ?? 0}
          triggerCount={triggerHealth?.activeTriggers ?? 0}
          errorCount={errorEntries.length}
        />
        <WalletSummary
          evmAddress={evmAddr}
          solanaAddress={solAddr}
          evmBalance={evmBalance}
          solanaBalance={solBalance}
        />
      </div>

      {/* Right Panel */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ActivityFeed
          entries={activityEntries}
          onViewAll={() => setTab("logs")}
        />
        <TriggerStats
          triggersEnabled={triggerHealth?.triggersEnabled ?? false}
          activeTriggers={triggerHealth?.activeTriggers ?? 0}
          totalExecutions={triggerHealth?.totalExecutions ?? 0}
          totalFailures={triggerHealth?.totalFailures ?? 0}
          totalSkipped={triggerHealth?.totalSkipped ?? 0}
          lastExecutionAt={triggerHealth?.lastExecutionAt}
          onViewAll={() => setTab("triggers")}
        />
        <PluginOverview
          plugins={plugins.map((p) => ({
            name: p.name,
            isActive: p.isActive ?? false,
            loadError: p.loadError,
            enabled: p.enabled ?? false,
          }))}
          onManage={() => setTab("plugins")}
        />
        <RecentErrors
          entries={errorEntries}
          onViewAll={() => setTab("logs")}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bunx tsc --noEmit -p packages/app-core/tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add packages/app-core/src/components/DashboardView.tsx
git commit -m "feat(dashboard): wire DashboardView with data fetching and all sub-components"
```

---

## Chunk 5: Tests + Final PR

### Task 10: Unit tests

**Files:**
- Create: `packages/app-core/src/components/dashboard/__tests__/AgentHealthCard.test.tsx`
- Create: `packages/app-core/src/components/dashboard/__tests__/QuickStats.test.tsx`
- Create: `packages/app-core/src/components/dashboard/__tests__/RecentErrors.test.tsx`

- [ ] **Step 1: Write AgentHealthCard tests**

```tsx
import { describe, test, expect } from "vitest";
import { formatUptime } from "../AgentHealthCard";

describe("AgentHealthCard", () => {
  describe("formatUptime", () => {
    test("returns dash for undefined", () => {
      expect(formatUptime(undefined)).toBe("—");
    });
    test("returns dash for zero", () => {
      expect(formatUptime(0)).toBe("—");
    });
    test("formats seconds", () => {
      expect(formatUptime(5000)).toBe("5s");
    });
    test("formats minutes and seconds", () => {
      expect(formatUptime(125000)).toBe("2m 5s");
    });
    test("formats hours and minutes", () => {
      expect(formatUptime(3_660_000)).toBe("1h 1m");
    });
    test("formats days and hours", () => {
      expect(formatUptime(90_000_000)).toBe("1d 1h");
    });
  });
});
```

- [ ] **Step 2: Write QuickStats tests**

```tsx
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { QuickStats } from "../QuickStats";

describe("QuickStats", () => {
  test("renders all stat values", () => {
    const { getByText } = render(
      <QuickStats pluginCount={5} connectorCount={3} triggerCount={2} errorCount={1} />,
    );
    expect(getByText("5")).toBeDefined();
    expect(getByText("3")).toBeDefined();
    expect(getByText("2")).toBeDefined();
    expect(getByText("1")).toBeDefined();
  });
});
```

- [ ] **Step 3: Write RecentErrors tests**

```tsx
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { RecentErrors } from "../RecentErrors";

describe("RecentErrors", () => {
  test("shows no errors message when empty", () => {
    const { getByText } = render(<RecentErrors entries={[]} />);
    expect(getByText("No recent errors")).toBeDefined();
  });

  test("renders error entries", () => {
    const entries = [
      { timestamp: Date.now(), level: "error", message: "Something broke", source: "runtime" },
    ];
    const { getByText } = render(<RecentErrors entries={entries as any} />);
    expect(getByText("Something broke")).toBeDefined();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
bunx vitest run packages/app-core/src/components/dashboard/__tests__/
```

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/components/dashboard/__tests__/
git commit -m "test(dashboard): add unit tests for AgentHealthCard, QuickStats, RecentErrors"
```

---

### Task 11: Push and create PR

- [ ] **Step 1: Run full typecheck**

```bash
bunx tsc --noEmit -p packages/app-core/tsconfig.json
```

- [ ] **Step 2: Push branch**

```bash
git push origin feat/agent-dashboard -u
```

- [ ] **Step 3: Create PR**

```bash
gh pr create \
  --repo milady-ai/milady \
  --base develop \
  --head hellopleasures:feat/agent-dashboard \
  --title "feat: add Agent Dashboard as default landing page" \
  --body "$(cat <<'EOF'
## Summary
- Adds a new **Dashboard** tab as the default view when the app opens
- Two-panel layout: left panel shows agent health, quick stats, wallet; right panel shows activity feed, trigger stats, plugins, errors
- Data from existing endpoints (`/api/agent/self-status`, `/api/logs`, `/api/triggers/health`, `/api/plugins`, `/api/wallet/balances`)
- No backend changes needed — all frontend
- 7 focused sub-components in `packages/app-core/src/components/dashboard/`
- Unit tests for key components

## Components
- **AgentHealthCard** — status badge, name, model, uptime, start/stop controls
- **QuickStats** — plugin/connector/trigger/error counts
- **WalletSummary** — truncated addresses with copy, native balances
- **ActivityFeed** — recent log entries as timeline
- **TriggerStats** — execution stats with failure rate indicator
- **PluginOverview** — loaded plugins with status dots
- **RecentErrors** — error/critical log entries with severity highlight

## Test plan
- [ ] Dashboard loads as default view
- [ ] Agent health card shows correct state
- [ ] Quick stats reflect real data
- [ ] Activity feed populates with log entries
- [ ] Wallet summary shows addresses when configured
- [ ] Navigation links ("View logs", "Manage", "View all") work
- [ ] Unit tests pass: `bunx vitest run packages/app-core/src/components/dashboard/__tests__/`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
