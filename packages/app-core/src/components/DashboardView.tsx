import { useCallback } from "react";
import { client } from "../api/client";
import { useApp } from "../state";
import { AgentHealthCard } from "./dashboard/AgentHealthCard";
import { QuickStats } from "./dashboard/QuickStats";
import { WalletSummary } from "./dashboard/WalletSummary";
import { ActivityFeed } from "./dashboard/ActivityFeed";
import { TriggerStats } from "./dashboard/TriggerStats";
import { PluginOverview } from "./dashboard/PluginOverview";
import { RecentErrors } from "./dashboard/RecentErrors";

export function DashboardView() {
  const {
    agentStatus,
    plugins,
    logs,
    triggerHealth,
    walletAddresses,
    walletBalances,
    setTab,
  } = useApp();

  const handleStart = useCallback(async () => {
    try {
      await client.startAgent();
    } catch {
      /* ignore */
    }
  }, []);

  const handleStop = useCallback(async () => {
    try {
      await client.stopAgent();
    } catch {
      /* ignore */
    }
  }, []);

  const activityEntries = logs.slice(-50);
  const errorEntries = logs
    .filter((e) => e.level === "error" || e.level === "critical")
    .slice(-10);

  const evmAddr = walletAddresses?.evmAddress ?? null;
  const solAddr = walletAddresses?.solanaAddress ?? null;

  let evmBalance: string | null = null;
  let solBalance: string | null = null;
  if (walletBalances?.evm?.chains) {
    const eth = walletBalances.evm.chains.find(
      (c) => c.chain === "ethereum" || c.chain === "eth",
    );
    if (eth)
      evmBalance = `${Number(eth.nativeBalance).toFixed(4)} ${eth.nativeSymbol ?? "ETH"}`;
  }
  if (walletBalances?.solana) {
    const sol = walletBalances.solana as { nativeBalance?: string };
    if (sol.nativeBalance)
      solBalance = `${Number(sol.nativeBalance).toFixed(4)} SOL`;
  }

  const connectorCount =
    plugins.filter(
      (p) => p.category === "connector" && (p.isActive || p.enabled),
    ).length ?? 0;

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left Panel */}
      <div className="w-72 shrink-0 border-r border-[var(--border)] overflow-y-auto p-4 space-y-4">
        <AgentHealthCard
          state={(agentStatus?.state as any) ?? "not_started"}
          agentName={agentStatus?.agentName ?? "Agent"}
          model={agentStatus?.model}
          startedAt={agentStatus?.startedAt}
          uptime={agentStatus?.uptime}
          onStart={handleStart}
          onStop={handleStop}
        />
        <QuickStats
          pluginCount={plugins.filter((p) => p.isActive).length}
          connectorCount={connectorCount}
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
