import type { CloudCompatAgent } from "@milady/app-core/api";
import { Button, SectionCard } from "@milady/ui";
import {
  AlertCircle,
  CircleDollarSign,
  ExternalLink,
  History,
  LayoutDashboard,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Terminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { openExternalUrl } from "../utils/openExternalUrl";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  running: {
    label: "Running",
    className: "bg-ok/10 text-ok border-ok/20",
  },
  queued: {
    label: "Queued",
    className: "bg-warn/10 text-warn border-warn/20",
  },
  provisioning: {
    label: "Provisioning",
    className: "bg-accent/10 text-accent border-accent/20",
  },
  stopped: {
    label: "Stopped",
    className: "bg-muted/10 text-muted border-border/40",
  },
  failed: {
    label: "Failed",
    className: "bg-danger/10 text-danger border-danger/20",
  },
};

function AgentStatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.stopped;
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${badge?.className}`}
    >
      {badge?.label}
    </span>
  );
}

function CloudAgentCard({
  agent,
  onDelete,
  deleting,
  onSelect,
}: {
  agent: CloudCompatAgent;
  onDelete: (id: string) => void;
  deleting: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: cannot use button due to nested buttons
    <div
      className="rounded-2xl border border-border/50 bg-bg/30 p-4 flex flex-col justify-between gap-3 hover:border-accent/30 transition-all duration-200 cursor-pointer"
      onClick={() => onSelect?.(agent.agent_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(agent.agent_id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-accent shrink-0" />
          <span className="font-bold text-sm text-txt-strong truncate max-w-[140px]">
            {agent.agent_name || "Unnamed Agent"}
          </span>
        </div>
        <AgentStatusBadge status={agent.status} />
      </div>

      <div className="text-[11px] text-muted space-y-1">
        <div className="flex justify-between">
          <span>Node</span>
          <span className="font-mono text-txt-strong/70">
            {agent.node_id?.slice(0, 8) ?? "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Created</span>
          <span className="text-txt-strong/70">
            {new Date(agent.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="flex gap-2 mt-1">
        {agent.web_ui_url && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 rounded-xl h-8 text-xs border-border/40"
            onClick={() => void openExternalUrl(agent.web_ui_url ?? "")}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Open
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl h-8 text-xs border-danger/30 text-danger hover:bg-danger/10"
          onClick={() => onDelete(agent.agent_id)}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function CloudDashboard() {
  const {
    t,
    miladyCloudConnected,
    miladyCloudCredits,
    miladyCloudCreditsLow,
    miladyCloudCreditsCritical,
    miladyCloudTopUpUrl,
    miladyCloudUserId,
    miladyCloudLoginBusy,
    handleCloudLogin,
    handleCloudDisconnect,
    miladyCloudDisconnecting: cloudDisconnecting,
    loadDropStatus,
  } = useApp();

  const [refreshing, setRefreshing] = useState(false);
  const [cloudAgents, setCloudAgents] = useState<CloudCompatAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const selectedAgent = cloudAgents.find((a) => a.agent_id === selectedAgentId);
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [deployAgentName, setDeployAgentName] = useState("");
  const [deploying, setDeploying] = useState(false);
  const mountedRef = useRef(true);

  // We import the client lazily to avoid circular dependency issues
  const fetchCloudAgents = useCallback(async () => {
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      // Use the global api client (same pattern as AppContext)
      const res = await fetch("/api/cloud/compat/agents");
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data.success && Array.isArray(data.data)) {
        setCloudAgents(data.data);
      } else {
        setCloudAgents([]);
        if (data.error) setAgentsError(data.error);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setAgentsError(
        err instanceof Error ? err.message : "Failed to load cloud agents",
      );
      setCloudAgents([]);
    } finally {
      if (mountedRef.current) setAgentsLoading(false);
    }
  }, []);

  const handleDeleteAgent = useCallback(
    async (agentId: string) => {
      setDeletingAgentId(agentId);
      try {
        const res = await fetch(
          `/api/cloud/compat/agents/${encodeURIComponent(agentId)}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (data.success) {
          setCloudAgents((prev) => prev.filter((a) => a.agent_id !== agentId));
        }
      } catch {
        // Silently fail — user can retry
      } finally {
        setDeletingAgentId(null);
        if (selectedAgentId === agentId) setSelectedAgentId(null);
      }
    },
    [selectedAgentId],
  );

  const handleDeployAgent = useCallback(async () => {
    if (!deployAgentName.trim()) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/cloud/compat/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_name: deployAgentName.trim() }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCloudAgents((prev) => [data.data, ...prev]);
        setShowDeployForm(false);
        setDeployAgentName("");
      }
    } catch {
      // Intentionally swallow for now
    } finally {
      setDeploying(false);
    }
  }, [deployAgentName]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDropStatus(), fetchCloudAgents()]);
    setTimeout(() => setRefreshing(false), 600);
  }, [loadDropStatus, fetchCloudAgents]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (miladyCloudConnected) {
      void loadDropStatus();
      void fetchCloudAgents();
    }
  }, [miladyCloudConnected, loadDropStatus, fetchCloudAgents]);

  const creditStatusColor = miladyCloudCreditsCritical
    ? "text-danger"
    : miladyCloudCreditsLow
      ? "text-warn"
      : "text-ok";

  if (!miladyCloudConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="w-20 h-20 rounded-3xl bg-accent/10 flex items-center justify-center mb-8 shadow-inner border border-accent/20">
          <Zap className="w-10 h-10 text-accent animate-pulse" />
        </div>
        <h1 className="text-4xl font-bold text-txt-strong mb-4 tracking-tight">
          {t("miladyclouddashboard.MiladyCloud")}
        </h1>
        <p className="text-lg text-muted mb-10 leading-relaxed">
          {t("miladyclouddashboard.ScaleYourAgents")}
        </p>
        <Button
          variant="default"
          size="lg"
          className="rounded-2xl px-10 py-6 text-lg font-bold shadow-xl shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-1 transition-all duration-300"
          onClick={handleCloudLogin}
          disabled={miladyCloudLoginBusy}
        >
          {miladyCloudLoginBusy ? (
            <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
          ) : (
            <Zap className="w-5 h-5 mr-3" />
          )}
          {miladyCloudLoginBusy
            ? t("miladyclouddashboard.Connecting")
            : t("miladyclouddashboard.ConnectMiladyCloud")}
        </Button>
        <p className="mt-6 text-sm text-muted/60">
          {t("miladyclouddashboard.NewToMiladyCloud")}{" "}
          <a
            href="https://miladycloud.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent-hover transition-colors"
          >
            {t("miladyclouddashboard.LearnMore")}
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6 lg:p-10 space-y-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
              <LayoutDashboard className="w-5 h-5 text-accent-fg" />
            </div>
            <h1 className="text-3xl font-bold text-txt-strong tracking-tight">
              {t("miladyclouddashboard.CloudDashboard")}
            </h1>
          </div>
          <p className="text-muted">
            {t("miladyclouddashboard.ManageInstance")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-border/50 bg-bg/50 backdrop-blur-sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            {t("miladyclouddashboard.Refresh")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-danger/30 text-danger hover:bg-danger/10"
            onClick={handleCloudDisconnect}
            disabled={cloudDisconnecting}
          >
            {cloudDisconnecting
              ? t("miladyclouddashboard.Disconnecting")
              : t("miladyclouddashboard.Disconnect")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Resource View */}
        <div className="lg:col-span-2 space-y-8">
          {/* Active Agents Grid */}
          <SectionCard
            title={t("miladyclouddashboard.CloudAgents")}
            description={t("miladyclouddashboard.CloudAgentsDesc")}
            className="border-border/50 bg-bg/40 backdrop-blur-xl rounded-3xl overflow-hidden shadow-sm"
          >
            {agentsError && (
              <div className="mt-4 flex items-center gap-2 text-sm text-danger bg-danger/10 rounded-xl p-3 border border-danger/20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {agentsError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {agentsLoading && cloudAgents.length === 0 ? (
                <div className="col-span-full flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-accent animate-spin" />
                </div>
              ) : (
                <>
                  {cloudAgents.map((agent) => (
                    <CloudAgentCard
                      key={agent.agent_id}
                      agent={agent}
                      onDelete={handleDeleteAgent}
                      deleting={deletingAgentId === agent.agent_id}
                      onSelect={(id) => setSelectedAgentId(id)}
                    />
                  ))}
                  {/* Deploy new agent card */}
                  {showDeployForm ? (
                    <div className="aspect-[4/3] rounded-2xl border border-border/50 bg-bg/30 p-6 flex flex-col items-center justify-center text-center">
                      <div className="w-full space-y-3">
                        <input
                          placeholder={t("miladyclouddashboard.AgentName")}
                          value={deployAgentName}
                          onChange={(e) => setDeployAgentName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleDeployAgent();
                            if (e.key === "Escape") setShowDeployForm(false);
                          }}
                          disabled={deploying}
                          className="w-full h-8 px-3 rounded-xl bg-bg/50 border border-border/40 text-xs text-center focus:outline-none focus:border-accent"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 rounded-xl h-8 text-xs text-muted hover:text-txt-strong flex items-center justify-center p-0"
                            onClick={() => setShowDeployForm(false)}
                            disabled={deploying}
                          >
                            {t("miladyclouddashboard.Cancel")}
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            className="flex-1 rounded-xl h-8 text-xs font-bold"
                            onClick={handleDeployAgent}
                            disabled={deploying || !deployAgentName.trim()}
                          >
                            {deploying ? (
                              <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                            ) : (
                              t("miladyclouddashboard.Deploy")
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="aspect-[4/3] rounded-2xl border border-dashed border-border/60 flex flex-col items-center justify-center p-6 text-center group hover:border-accent/50 hover:bg-accent/5 transition-all duration-300 cursor-pointer"
                      onClick={() => setShowDeployForm(true)}
                    >
                      <div className="w-12 h-12 rounded-full bg-bg-accent flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Plus className="w-6 h-6 text-muted group-hover:text-accent" />
                      </div>
                      <h3 className="font-bold text-txt-strong mb-1">
                        {t("miladyclouddashboard.DeployNewAgent")}
                      </h3>
                      <p className="text-xs text-muted">
                        {t("miladyclouddashboard.InitializeInstance")}
                      </p>
                    </button>
                  )}
                </>
              )}
            </div>
          </SectionCard>

          {/* Cloud Usage Statistics (Placeholder) */}
          <SectionCard
            title={t("miladyclouddashboard.UsageMetrics")}
            description={t("miladyclouddashboard.UsageMetricsDesc")}
            className="border-border/50 bg-bg/40 backdrop-blur-xl rounded-3xl shadow-sm"
          >
            <div className="h-48 flex items-center justify-center text-muted italic text-sm border border-border/30 rounded-2xl bg-bg/20 mt-4">
              {t("miladyclouddashboard.MetricsPlaceholder")}
            </div>
          </SectionCard>
        </div>

        {/* Sidebar Area */}
        <div className="space-y-8">
          {selectedAgentId && selectedAgent ? (
            <AgentDetailSidebar
              agent={selectedAgent}
              onClose={() => setSelectedAgentId(null)}
            />
          ) : (
            <>
              {/* Credit Wallet Card */}
              <div className="bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-accent/10 rounded-full blur-3xl group-hover:bg-accent/20 transition-all duration-700" />

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-accent text-accent-fg flex items-center justify-center">
                      <CircleDollarSign className="w-6 h-6" />
                    </div>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-accent/80 bg-accent/10 px-2 py-1 rounded-md border border-accent/20">
                      {t("miladyclouddashboard.CreditWallet")}
                    </div>
                  </div>

                  <div className="mb-8">
                    <span className="text-[11px] text-muted uppercase font-bold tracking-wider block mb-1">
                      {t("miladyclouddashboard.AvailableBalance")}
                    </span>
                    <div
                      className={`text-4xl font-bold tracking-tight flex items-baseline gap-1 ${creditStatusColor}`}
                    >
                      <span className="text-2xl opacity-70">$</span>
                      {miladyCloudCredits !== null
                        ? miladyCloudCredits.toFixed(2)
                        : "0.00"}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Button
                      variant="default"
                      className="w-full rounded-2xl h-12 font-bold shadow-lg shadow-accent/20"
                      onClick={() => void openExternalUrl(miladyCloudTopUpUrl)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {t("miladyclouddashboard.TopUpCredits")}
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 rounded-xl h-10 border-border/50 text-xs"
                      >
                        <History className="w-3 h-3 mr-2" />
                        {t("miladyclouddashboard.History")}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 rounded-xl h-10 border-border/50 text-xs"
                      >
                        <Settings className="w-3 h-3 mr-2" />
                        {t("miladyclouddashboard.Pricing")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Account Info */}
              <SectionCard
                title={t("miladyclouddashboard.AccountDetails")}
                className="border-border/50 bg-bg/40 backdrop-blur-xl rounded-3xl shadow-sm"
              >
                <div className="space-y-4 mt-2">
                  <div className="p-3 rounded-2xl bg-bg/30 border border-border/30">
                    <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-1 block">
                      {t("miladyclouddashboard.CloudUserID")}
                    </span>
                    <code className="text-xs text-txt-strong break-all font-mono">
                      {miladyCloudUserId ||
                        t("miladyclouddashboard.NotAvailable")}
                    </code>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-ok" />
                      <span className="text-xs font-medium">
                        {t("miladyclouddashboard.SecurityStatus")}
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-ok/10 text-ok font-bold uppercase tracking-wider border border-ok/20">
                      {t("miladyclouddashboard.Secure")}
                    </span>
                  </div>

                  <Button
                    variant="link"
                    className="w-full text-xs text-accent justify-start px-3 h-auto"
                    onClick={() =>
                      void openExternalUrl("https://miladycloud.ai/dashboard")
                    }
                  >
                    {t("miladyclouddashboard.AdvancedDashboard")}
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </Button>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatusDetail {
  status?: string;
  databaseStatus?: string;
  lastHeartbeat?: string | number | Date;
}

function AgentDetailSidebar({
  agent,
  onClose,
}: {
  agent: CloudCompatAgent | undefined;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<string>("");
  const [statusDetail, setStatusDetail] = useState<StatusDetail | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!agent) return;
    let mounted = true;

    const fetchDetails = async () => {
      try {
        const [statusRes, logsRes] = await Promise.all([
          fetch(`/api/cloud/compat/agents/${agent.agent_id}/status`),
          fetch(`/api/cloud/compat/agents/${agent.agent_id}/logs?lines=100`),
        ]);
        const statusData = await statusRes.json();
        const logsData = await logsRes.json();

        if (!mounted) return;
        if (statusData.success) {
          setStatusDetail(statusData.data);
        }
        if (logsData.success) {
          setLogs(logsData.data.logs || "");
        }
      } catch {
        // Silently retry next tick
      }
    };

    void fetchDetails();
    const intId = setInterval(fetchDetails, 5000);
    return () => {
      mounted = false;
      clearInterval(intId);
    };
  }, [agent]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rerun when logs update
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  if (!agent) return null;

  return (
    <div className="space-y-4 animate-in slide-in-from-right-8 duration-300">
      <SectionCard
        title="Agent Details"
        className="border-accent/40 bg-accent/5 backdrop-blur-xl rounded-3xl shadow-sm relative overflow-hidden"
      >
        <button
          type="button"
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-bg/50 transition-colors text-muted hover:text-txt-strong"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-bg/40 border border-border/40">
              <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-1 block">
                Status
              </span>
              <AgentStatusBadge status={statusDetail?.status || agent.status} />
            </div>
            <div className="p-3 rounded-xl bg-bg/40 border border-border/40">
              <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-1 block">
                DB Status
              </span>
              <span className="text-xs font-mono">
                {statusDetail?.databaseStatus || agent.database_status || "—"}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-bg/40 border border-border/40 col-span-2">
              <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-1 block">
                Heartbeat
              </span>
              <span className="text-xs font-mono">
                {statusDetail?.lastHeartbeat
                  ? new Date(statusDetail.lastHeartbeat).toLocaleString()
                  : agent.last_heartbeat_at
                    ? new Date(agent.last_heartbeat_at).toLocaleString()
                    : "No heartbeat yet"}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-bg/80 border border-border/40">
            <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-2 flex items-center gap-2">
              <Terminal className="w-3 h-3" /> Live Logs
            </span>
            <div className="h-64 overflow-y-auto custom-scrollbar bg-black/50 rounded-lg p-3 border border-border/20">
              <pre className="text-[10px] font-mono text-txt-strong/80 whitespace-pre-wrap break-all">
                {logs || "No logs available. Deploying..."}
                <div ref={logsEndRef} />
              </pre>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
