import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type CloudAgent, getToken } from "./auth";
import { CloudApiClient, CloudClient } from "./cloud-api";
import { addConnection, getConnections, removeConnection } from "./connections";

export type AgentSource = "cloud" | "local" | "remote";

export interface ManagedAgent {
  id: string;
  name: string;
  source: AgentSource;
  status: "running" | "paused" | "stopped" | "provisioning" | "unknown";
  model?: string;
  uptime?: number;
  memories?: number;
  sourceUrl?: string;
  cloudAgent?: CloudAgent;
  client?: CloudApiClient;
  cloudClient?: CloudClient;
  cloudAgentId?: string;
}

interface AgentContextValue {
  agents: ManagedAgent[];
  loading: boolean;
  cloudClient: CloudClient | null;
  refresh: () => Promise<void>;
  addRemoteUrl: (name: string, url: string) => void;
  removeRemote: (id: string) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

const LOCAL_PROBE_URL = "http://localhost:2138";
const CLOUD_BASE = "https://www.elizacloud.ai";

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudClientRef, setCloudClientRef] = useState<CloudClient | null>(
    null,
  );
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchAll = useCallback(async () => {
    const results: ManagedAgent[] = [];

    // 1. Cloud agents (if authenticated)
    if (getToken()) {
      const cc = new CloudClient(getToken() ?? "");
      setCloudClientRef(cc);
      try {
        const cloudAgents = await cc.listAgents();
        for (const ca of cloudAgents) {
          results.push({
            id: `cloud-${ca.id}`,
            name: ca.name || ca.id,
            source: "cloud",
            status: mapCloudStatus(ca.status),
            model: ca.model,
            cloudAgent: ca,
            cloudClient: cc,
            cloudAgentId: ca.id,
            sourceUrl: `${CLOUD_BASE}/api/v1/milady/agents/${ca.id}`,
          });
        }
      } catch {
        // Cloud API failed — skip
      }
    } else {
      setCloudClientRef(null);
    }

    // 2. Local agent (auto-probe localhost:2138)
    try {
      const localClient = new CloudApiClient({
        url: LOCAL_PROBE_URL,
        type: "local",
      });
      const health = await localClient.health();
      if (health.status) {
        try {
          const status = await localClient.getAgentStatus();
          results.push({
            id: "local-default",
            name: status.agentName || "Local Agent",
            source: "local",
            status: status.state,
            model: status.model,
            uptime: status.uptime,
            memories: status.memories,
            sourceUrl: LOCAL_PROBE_URL,
            client: localClient,
          });
        } catch {
          // Health OK but no agent status endpoint — show as running
          results.push({
            id: "local-default",
            name: "Local Agent",
            source: "local",
            status: "running",
            sourceUrl: LOCAL_PROBE_URL,
            client: localClient,
          });
        }
      }
    } catch {
      // localhost not running — skip silently
    }

    // 3. Remote agents (manually added)
    const remotes = getConnections().filter((c) => c.type === "remote");
    for (const remote of remotes) {
      const client = new CloudApiClient({ url: remote.url, type: "remote" });
      try {
        await client.health();
        try {
          const status = await client.getAgentStatus();
          results.push({
            id: `remote-${remote.id}`,
            name: status.agentName || remote.name,
            source: "remote",
            status: status.state,
            model: status.model,
            uptime: status.uptime,
            memories: status.memories,
            sourceUrl: remote.url,
            client,
          });
        } catch {
          results.push({
            id: `remote-${remote.id}`,
            name: remote.name,
            source: "remote",
            status: "unknown",
            sourceUrl: remote.url,
            client,
          });
        }
      } catch {
        results.push({
          id: `remote-${remote.id}`,
          name: remote.name,
          source: "remote",
          status: "unknown",
          sourceUrl: remote.url,
          client,
        });
      }
    }

    setAgents(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    // Poll every 30s — sources that fail are already caught silently,
    // no need to hammer them every 10s
    intervalRef.current = setInterval(fetchAll, 30000);
    return () => clearInterval(intervalRef.current);
  }, [fetchAll]);

  const addRemoteUrl = useCallback(
    (name: string, url: string) => {
      addConnection({ name, url, type: "remote" });
      fetchAll();
    },
    [fetchAll],
  );

  const removeRemote = useCallback(
    (id: string) => {
      const connId = id.replace("remote-", "");
      removeConnection(connId);
      fetchAll();
    },
    [fetchAll],
  );

  return (
    <AgentContext
      value={{
        agents,
        loading,
        cloudClient: cloudClientRef,
        refresh: fetchAll,
        addRemoteUrl,
        removeRemote,
      }}
    >
      {children}
    </AgentContext>
  );
}

function mapCloudStatus(status: string): ManagedAgent["status"] {
  const s = status?.toLowerCase() ?? "";
  if (s === "running" || s === "active" || s === "healthy") return "running";
  if (s === "paused" || s === "suspended") return "paused";
  if (s === "stopped" || s === "terminated" || s === "deleted")
    return "stopped";
  if (s === "provisioning" || s === "creating" || s === "starting")
    return "provisioning";
  return "unknown";
}

export function useAgents() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgents must be used within AgentProvider");
  return ctx;
}
