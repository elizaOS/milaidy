import { useCallback, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { AgentCard } from "./AgentCard";
import { AgentDetail } from "./AgentDetail";

export function AgentGrid() {
  const { agents, loading, refresh } = useAgents();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
          } else if (action === "pause") {
            await agent.cloudClient.suspendAgent(agent.cloudAgentId);
          } else if (action === "stop") {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-brand font-mono text-sm animate-pulse">
          Discovering agents...
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <div className="text-text-muted/30 text-4xl">{"\u25C9"}</div>
        <div className="text-text-muted font-mono text-sm">No agents found</div>
        <div className="text-text-muted/50 font-mono text-xs text-center max-w-md">
          Log in with Eliza Cloud to see your hosted agents, or start a local
          Milady agent on port 2138.
        </div>
      </div>
    );
  }

  const selected = selectedId ? agents.find((a) => a.id === selectedId) : null;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={{
              agentName: agent.name,
              state: agent.status,
              model: agent.model ?? "\u2014",
              uptime: agent.uptime,
              memories: agent.memories,
            }}
            connectionName={agent.source}
            onPlay={() => handleAction(agent.id, "play")}
            onResume={() => handleAction(agent.id, "resume")}
            onPause={() => handleAction(agent.id, "pause")}
            onStop={() => handleAction(agent.id, "stop")}
            onSelect={() =>
              setSelectedId(selectedId === agent.id ? null : agent.id)
            }
            selected={selectedId === agent.id}
          />
        ))}
      </div>

      {selected && (
        <div className="mt-6">
          <AgentDetail
            agent={{
              agentName: selected.name,
              state: selected.status,
              model: selected.model ?? "\u2014",
              uptime: selected.uptime,
              memories: selected.memories,
            }}
            connectionId={selected.id}
          />
        </div>
      )}
    </div>
  );
}
