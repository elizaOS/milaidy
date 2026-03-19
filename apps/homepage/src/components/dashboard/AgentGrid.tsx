import { useCallback, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { isAuthenticated } from "../../lib/auth";
import { openWebUI } from "../../lib/open-web-ui";
import { AgentCard } from "./AgentCard";
import { AgentDetail } from "./AgentDetail";
import { CreateAgentForm } from "./CreateAgentForm";

export function AgentGrid() {
  const { filteredAgents: agents, loading, refresh } = useAgents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const handleAction = useCallback(
    async (agentId: string, action: "play" | "resume" | "pause" | "stop") => {
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) return;
      try {
        if (
          agent.source === "cloud" &&
          agent.cloudClient &&
          agent.cloudAgentId
        ) {
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
    // Prefer the webUiUrl set by AgentProvider (from cloud API or sandbox URL)
    if (agent.webUiUrl) return agent.webUiUrl;
    // For self-hosted/remote, sourceUrl IS the web UI
    // TODO: Integrate pairing token flow for proper auth handoff (see WEB_UI_URL_NOTES.md)
    return agent.sourceUrl;
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-up">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl h-32 animate-shimmer" />
        ))}
      </div>
    );
  }

  const selected = selectedId ? agents.find((a) => a.id === selectedId) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-light">Your Agents</h2>
          <p className="text-sm text-text-muted mt-1">
            {agents.length === 0
              ? "No agents discovered yet"
              : `${agents.length} agent${agents.length !== 1 ? "s" : ""} across all sources`}
          </p>
        </div>
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-3 bg-brand text-dark font-medium text-sm rounded-xl
              hover:bg-brand-hover active:scale-[0.98] transition-all duration-150
              shadow-[0_0_16px_rgba(240,185,11,0.12)]"
          >
            <svg
              aria-hidden="true"
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Agent
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateAgentForm
          onAuthenticated={() => refresh()}
          onCreated={() => {
            setShowCreate(false);
            refresh();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Agent list */}
      {agents.length === 0 && !showCreate ? (
        <EmptyState onCreateClick={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent, i) => (
            <div
              key={agent.id}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
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
                onSelect={() =>
                  setSelectedId(selectedId === agent.id ? null : agent.id)
                }
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

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  const authed = isAuthenticated();

  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-up">
      <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center mb-6">
        <svg
          aria-hidden="true"
          className="w-8 h-8 text-text-muted/30"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-text-light mb-2">
        No agents discovered
      </h3>
      <p className="text-sm text-text-muted text-center max-w-sm mb-6 leading-relaxed">
        Start Milady locally to see your agents here. You can also connect to a
        remote instance or{" "}
        {authed ? "manage cloud agents" : "sign in to Eliza Cloud"} for hosted
        options.
      </p>
      <div className="flex w-full max-w-sm flex-col sm:flex-row items-stretch gap-3">
        <a
          href="/#install"
          className="flex items-center justify-center gap-2 px-5 py-3 bg-brand text-dark font-medium text-sm rounded-xl
            hover:bg-brand-hover active:scale-[0.98] transition-all duration-150"
        >
          Get the Desktop App
        </a>
        <button
          type="button"
          onClick={onCreateClick}
          className="flex items-center justify-center gap-2 px-5 py-3 text-text-muted text-sm font-medium rounded-xl border border-border
            hover:text-text-light hover:border-text-muted hover:bg-surface transition-all duration-150"
        >
          <svg
            aria-hidden="true"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Cloud Agent
        </button>
      </div>
    </div>
  );
}
