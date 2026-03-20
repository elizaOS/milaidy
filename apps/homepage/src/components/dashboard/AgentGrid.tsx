import { useCallback, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { useAuth } from "../../lib/useAuth";
import { openWebUI } from "../../lib/open-web-ui";
import { AgentCard } from "./AgentCard";
import { AgentDetail } from "./AgentDetail";
import { CreateAgentForm } from "./CreateAgentForm";

export function AgentGrid() {
  const {
    filteredAgents: agents,
    loading,
    isRefreshing,
    error,
    clearError,
    refresh,
  } = useAgents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleAction = useCallback(
    async (agentId: string, action: "play" | "resume" | "pause" | "stop") => {
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) return;
      try {
        if (agent.source === "cloud" && agent.cloudClient && agent.cloudAgentId) {
          if (action === "play" || action === "resume") {
            await agent.cloudClient.resumeAgent(agent.cloudAgentId);
          } else if (action === "pause" || action === "stop") {
            await agent.cloudClient.suspendAgent(agent.cloudAgentId);
          }
        } else if (agent.client) {
          if (action === "play") await agent.client.playAgent();
          else if (action === "resume") await agent.client.resumeAgent();
          else if (action === "pause") await agent.client.pauseAgent();
          else if (action === "stop") await agent.client.stopAgent();
        }
        await refresh();
      } catch (err) {
        console.error(`Failed to ${action} agent:`, err);
      }
    },
    [agents, refresh],
  );

  const getWebUIUrl = useCallback((agent: (typeof agents)[0]) => {
    if (agent.webUiUrl) return agent.webUiUrl;
    return agent.sourceUrl;
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-6 w-28 bg-surface animate-shimmer" />
            <div className="h-4 w-44 bg-surface animate-shimmer mt-2" />
          </div>
          <div className="h-10 w-28 bg-surface animate-shimmer" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <AgentCardSkeleton key={i} delay={i * 60} />
          ))}
        </div>
      </div>
    );
  }

  const selected = selectedId ? agents.find((a) => a.id === selectedId) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-mono text-lg font-medium text-text-light tracking-wide">
            AGENTS
          </h2>
          <p className="font-mono text-xs text-text-muted mt-1 tracking-wide">
            {agents.length === 0
              ? "No agents discovered"
              : `${agents.length} agent${agents.length !== 1 ? "s" : ""} across all sources`}
          </p>
        </div>
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 
              bg-brand text-dark font-mono text-xs font-semibold tracking-wide
              hover:bg-brand-hover active:scale-[0.98] transition-all duration-150"
          >
            + NEW AGENT
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 
          border border-red-500/30 bg-red-500/5 animate-fade-up">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="font-mono text-xs text-red-400">{error}</span>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="text-red-400/60 hover:text-red-400 transition-colors p-1"
          >
            <svg
              aria-hidden="true"
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Refreshing indicator */}
      {(isRefreshing || isCreating) && agents.length > 0 && (
        <div className="flex items-center gap-2 font-mono text-[10px] text-text-subtle animate-fade-up">
          <svg
            aria-hidden="true"
            className="w-3 h-3 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {isCreating ? "CREATING AGENT..." : "SYNCING..."}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <CreateAgentForm
          onAuthenticated={() => refresh()}
          onCreated={async () => {
            setShowCreate(false);
            setIsCreating(true);
            await refresh();
            setIsCreating(false);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Agent list or empty state */}
      {agents.length === 0 && !showCreate ? (
        <EmptyState onCreateClick={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent, i) => (
            <div
              key={agent.id}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <AgentCard
                agent={{
                  agentName: agent.name,
                  state: agent.status,
                  model: agent.model,
                  uptime: agent.uptime,
                  memories: agent.memories,
                }}
                source={agent.source}
                sourceUrl={agent.sourceUrl}
                webUiUrl={getWebUIUrl(agent)}
                nodeId={agent.nodeId}
                lastHeartbeat={agent.lastHeartbeat}
                billing={agent.billing}
                createdAt={agent.createdAt}
                region={agent.region}
                onPlay={() => handleAction(agent.id, "play")}
                onResume={() => handleAction(agent.id, "resume")}
                onPause={() => handleAction(agent.id, "pause")}
                onStop={() => handleAction(agent.id, "stop")}
                onSelect={() => setSelectedId(selectedId === agent.id ? null : agent.id)}
                onOpenUI={() => {
                  const url = getWebUIUrl(agent);
                  if (!url) return;
                  openWebUI(url, agent.source);
                }}
                selected={selectedId === agent.id}
              />
            </div>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="animate-fade-up">
          <AgentDetail
            agent={{
              agentName: selected.name,
              state: selected.status,
              model: selected.model,
              uptime: selected.uptime,
              memories: selected.memories,
            }}
            managedAgent={selected}
            connectionId={selected.id}
            webUIUrl={getWebUIUrl(selected)}
          />
        </div>
      )}
    </div>
  );
}

/** Skeleton matching AgentCard layout */
function AgentCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="border border-border bg-surface animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Left accent */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-text-muted/20" />

      <div className="p-4 pb-0">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-surface-elevated animate-shimmer" />
          <div className="flex-1">
            <div className="h-4 w-28 bg-surface-elevated animate-shimmer" />
            <div className="h-3 w-20 bg-surface-elevated animate-shimmer mt-1.5" />
          </div>
          <div className="h-7 w-16 bg-surface-elevated animate-shimmer" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-px mt-4 bg-border-subtle">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface px-3 py-2.5">
            <div className="h-2 w-8 bg-surface-elevated animate-shimmer mb-1" />
            <div className="h-4 w-10 bg-surface-elevated animate-shimmer" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 p-3 bg-dark-secondary/50">
        <div className="h-7 w-16 bg-surface-elevated animate-shimmer" />
        <div className="h-7 w-20 bg-surface-elevated animate-shimmer" />
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  const { isAuthenticated: authed } = useAuth();

  return (
    <div className="border border-border bg-surface animate-fade-up">
      {/* Terminal header */}
      <div className="px-4 py-2.5 bg-dark-secondary border-b border-border">
        <span className="font-mono text-xs text-text-muted">
          $ milady agents --list
        </span>
      </div>

      <div className="p-8 text-center">
        {/* Decorative agent preview */}
        <div className="max-w-sm mx-auto mb-8">
          <div className="border border-border-subtle bg-dark-secondary/30 p-4">
            <div className="flex items-start gap-4 opacity-30">
              <div className="w-12 h-12 border border-text-muted/20 bg-surface flex items-center justify-center">
                <span className="font-mono text-sm text-text-muted">??</span>
              </div>
              <div className="flex-1 text-left">
                <div className="h-4 w-24 bg-text-muted/10 mb-2" />
                <div className="h-3 w-16 bg-text-muted/10" />
              </div>
              <div className="h-6 w-16 bg-text-muted/10" />
            </div>
            <div className="grid grid-cols-4 gap-2 mt-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-surface/50 p-2">
                  <div className="h-2 w-6 bg-text-muted/10 mb-1" />
                  <div className="h-3 w-8 bg-text-muted/10" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <h3 className="font-mono text-sm text-text-light mb-2">
          NO AGENTS FOUND
        </h3>
        <p className="font-mono text-xs text-text-muted max-w-sm mx-auto leading-relaxed mb-6">
          Start Milady locally to see your agents here.
          <br />
          {authed 
            ? "Or create a cloud agent for hosted infrastructure." 
            : "Sign in to Eliza Cloud for hosted options."}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/#install"
            className="flex items-center justify-center gap-2 px-5 py-2.5 
              bg-brand text-dark font-mono text-xs font-semibold tracking-wide
              hover:bg-brand-hover transition-all duration-150"
          >
            DOWNLOAD APP
          </a>
          <button
            type="button"
            onClick={onCreateClick}
            className="flex items-center justify-center gap-2 px-5 py-2.5 
              border border-border text-text-muted font-mono text-xs tracking-wide
              hover:text-text-light hover:border-text-muted hover:bg-surface 
              transition-all duration-150"
          >
            + CREATE CLOUD AGENT
          </button>
        </div>
      </div>

      {/* Bottom hint */}
      <div className="px-4 py-2 bg-dark-secondary border-t border-border">
        <span className="font-mono text-[10px] text-text-subtle">
          TIP: Use the Connect button to add a remote agent URL
        </span>
      </div>
    </div>
  );
}
