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
import {
  CLOUD_BASE,
  getSandboxDiscoveryUrls,
  LOCAL_AGENT_BASE,
} from "./runtime-config";

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
  webUiUrl?: string;
  cloudAgent?: CloudAgent;
  client?: CloudApiClient;
  cloudClient?: CloudClient;
  cloudAgentId?: string;
  billing?: {
    plan?: string;
    costPerHour?: number;
    totalCost?: number;
    currency?: string;
  };
  region?: string;
  createdAt?: string;
  nodeId?: string;
  lastHeartbeat?: string;
}

interface AgentContextValue {
  agents: ManagedAgent[];
  loading: boolean;
  cloudClient: CloudClient | null;
  refresh: () => Promise<void>;
  addRemoteUrl: (name: string, url: string, token?: string) => void;
  removeRemote: (id: string) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

// Milady self-hosted agent discovery
// Primary: the public sandbox index.
// Fallback: a same-host discovery service on port 3456 for direct dashboard access.
const MILADY_AGENT_BASE_DOMAIN = "waifu.fun";

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudClientRef, setCloudClientRef] = useState<CloudClient | null>(
    null,
  );
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchAll = useCallback(async () => {
    const results: ManagedAgent[] = [];

    // 1. Cloud agents (if authenticated with Eliza Cloud)
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
            webUiUrl: ca.webUiUrl,
            billing: ca.billing,
            region: ca.region,
            createdAt: ca.createdAt,
            uptime: ca.uptime,
          });
        }
      } catch {
        // Cloud API failed — skip
      }
    } else {
      setCloudClientRef(null);
    }

    // 2. Milady self-hosted agents (auto-discovery)
    //    The sandbox discovery endpoint (sandboxes.waifu.fun/agents) returns ALL
    //    sandboxes across all orgs — it does NOT support auth-based filtering.
    //    To scope to the current user, we cross-reference with the Cloud API
    //    (/api/v1/milady/agents) which IS org-scoped. Only sandboxes whose
    //    agent_name matches a cloud agent name (or whose id matches) are shown.
    const discoveredIds = new Set<string>();
    let sandboxes: Array<{
      id: string;
      agent_name: string;
      web_ui_port: number;
      api_token?: string;
      node_id?: string;
      last_heartbeat_at?: string;
    }> = [];
    const authToken = getToken();
    for (const url of getSandboxDiscoveryUrls()) {
      try {
        const sandboxRes = await fetch(url, {
          signal: AbortSignal.timeout(5000),
        });
        if (sandboxRes.ok) {
          sandboxes = await sandboxRes.json();
          break; // Use first successful response
        }
      } catch {
        // try next URL
      }
    }

    // Build a set of cloud agent names/ids for cross-referencing.
    // Only sandbox agents that match a cloud agent belong to this user.
    const cloudAgentNames = new Set(
      results
        .filter((a) => a.source === "cloud")
        .map((a) => a.name.toLowerCase()),
    );
    const cloudAgentIds = new Set(
      results
        .filter((a) => a.source === "cloud")
        .map((a) => a.cloudAgentId),
    );

    // Only show discovered sandboxes when the user is authenticated
    // AND filter to only those matching cloud agents (org-scoped).
    if (sandboxes.length > 0 && authToken) {
      // Filter sandboxes to only those belonging to the current user
      const ownedSandboxes = sandboxes.filter((sb) => {
        const nameMatch = cloudAgentNames.has((sb.agent_name || "").toLowerCase());
        const idMatch = cloudAgentIds.has(sb.id);
        return nameMatch || idMatch;
      });
      for (const sb of ownedSandboxes) {
          discoveredIds.add(sb.id);
          // Each sandbox is accessible at https://{uuid}.waifu.fun
          const url = `https://${sb.id}.${MILADY_AGENT_BASE_DOMAIN}`;
          const apiToken = sb.api_token;
          const client = new CloudApiClient({
            url,
            type: "remote",
            authToken: apiToken,
          });
          try {
            // health() won't throw if the agent is reachable + auth OK
            await client.health();
            try {
              const status = await client.getAgentStatus();
              results.push({
                id: `milady-${sb.id}`,
                name: status.agentName || sb.agent_name || sb.id,
                source: "remote",
                status: status.state,
                model: status.model,
                uptime: status.uptime,
                memories: status.memories,
                sourceUrl: url,
                client,
                nodeId: sb.node_id,
                lastHeartbeat: sb.last_heartbeat_at,
              });
            } catch {
              // Health OK but no status detail — show as running
              results.push({
                id: `milady-${sb.id}`,
                name: sb.agent_name || sb.id,
                source: "remote",
                status: "running",
                sourceUrl: url,
                client,
                nodeId: sb.node_id,
                lastHeartbeat: sb.last_heartbeat_at,
              });
            }
          } catch {
            // Agent unreachable
            results.push({
              id: `milady-${sb.id}`,
              name: sb.agent_name || sb.id,
              source: "remote",
              status: "unknown",
              sourceUrl: url,
              client,
              nodeId: sb.node_id,
              lastHeartbeat: sb.last_heartbeat_at,
            });
          }
        }
    }

    // 3. Local agent (auto-probe configured local backend)
    try {
      const localClient = new CloudApiClient({
        url: LOCAL_AGENT_BASE,
        type: "local",
      });
      const health = await localClient.health();
      if (health.ready || health.status) {
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
            sourceUrl: LOCAL_AGENT_BASE,
            client: localClient,
          });
        } catch {
          results.push({
            id: "local-default",
            name: "Local Agent",
            source: "local",
            status: "running",
            sourceUrl: LOCAL_AGENT_BASE,
            client: localClient,
          });
        }
      }
    } catch {
      // Local backend not running — skip silently
    }

    // 4. Manually-added remote agents (via ConnectionModal)
    //    Skip any that were already auto-discovered from milady sandboxes.
    const remotes = getConnections().filter((c) => c.type === "remote");
    for (const remote of remotes) {
      // If this URL matches an auto-discovered milady agent, skip to avoid duplicates
      const isMiladyDomain = remote.url.includes(MILADY_AGENT_BASE_DOMAIN);
      if (isMiladyDomain) {
        const uuidMatch = remote.url.match(
          /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/,
        );
        if (uuidMatch && discoveredIds.has(uuidMatch[1])) continue;
      }

      const client = new CloudApiClient({
        url: remote.url,
        type: "remote",
        authToken: remote.authToken,
      });
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
    intervalRef.current = setInterval(fetchAll, 30000);
    return () => clearInterval(intervalRef.current);
  }, [fetchAll]);

  const addRemoteUrl = useCallback(
    (name: string, url: string, token?: string) => {
      addConnection({ name, url, type: "remote", authToken: token });
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
