import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

export type SourceFilter = "all" | "local" | "cloud" | "remote";

interface AgentContextValue {
  agents: ManagedAgent[];
  filteredAgents: ManagedAgent[];
  loading: boolean;
  cloudClient: CloudClient | null;
  sourceFilter: SourceFilter;
  setSourceFilter: (f: SourceFilter) => void;
  refresh: () => Promise<void>;
  addRemoteUrl: (name: string, url: string, token?: string) => void;
  removeRemote: (id: string) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

// Milady self-hosted agent discovery
// Primary: the public sandbox index.
// Fallback: a same-host discovery service on port 3456 for direct dashboard access.
const MILADY_AGENT_BASE_DOMAIN = "waifu.fun";

/** Shallow-compare two agent lists to avoid unnecessary re-renders. */
function agentsEqual(a: ManagedAgent[], b: ManagedAgent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const aa = a[i], bb = b[i];
    if (
      aa.id !== bb.id ||
      aa.name !== bb.name ||
      aa.status !== bb.status ||
      aa.model !== bb.model ||
      aa.uptime !== bb.uptime ||
      aa.memories !== bb.memories ||
      aa.webUiUrl !== bb.webUiUrl ||
      aa.sourceUrl !== bb.sourceUrl ||
      aa.lastHeartbeat !== bb.lastHeartbeat
    ) return false;
  }
  return true;
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const cloudClientRef = useRef<CloudClient | null>(null);
  const cloudTokenRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // Sort agents: local first, then remote, then cloud (memoized to avoid re-creating on every render)
  const sortedAgents = useMemo(() =>
    [...agents].sort((a, b) => {
      const order: Record<string, number> = { local: 0, remote: 1, cloud: 2 };
      return (order[a.source] ?? 3) - (order[b.source] ?? 3);
    }),
    [agents],
  );

  const filteredAgents = useMemo(() =>
    sourceFilter === "all"
      ? sortedAgents
      : sortedAgents.filter((a) => a.source === sourceFilter),
    [sortedAgents, sourceFilter],
  );

  const fetchAll = useCallback(async () => {
    const results: ManagedAgent[] = [];

    // 1. Cloud agents (if authenticated with Eliza Cloud)
    let cloudAuthOk = false;
    const token = getToken();
    if (token) {
      // Reuse existing CloudClient if token hasn't changed
      if (cloudTokenRef.current !== token || !cloudClientRef.current) {
        cloudClientRef.current = new CloudClient(token);
        cloudTokenRef.current = token;
      }
      const cc = cloudClientRef.current;
      try {
        const cloudAgents = await cc.listAgents();
        cloudAuthOk = true;
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
        // Cloud API failed — skip cloud agents but continue with sandbox discovery
      }
    } else {
      cloudClientRef.current = null;
      cloudTokenRef.current = null;
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
    // When cloud auth succeeded, use cross-reference to scope sandbox agents to this user.
    // When cloud auth failed, show ALL discovered sandboxes (fallback for self-hosted setups).
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

    if (sandboxes.length > 0) {
      // When cloud auth succeeded and returned agents, filter sandboxes to only matching ones.
      // When cloud auth failed (or returned 0 agents), show all sandboxes as fallback.
      const ownedSandboxes = cloudAuthOk && cloudAgentNames.size > 0
        ? sandboxes.filter((sb) => {
            const nameMatch = cloudAgentNames.has((sb.agent_name || "").toLowerCase());
            const idMatch = cloudAgentIds.has(sb.id);
            return nameMatch || idMatch;
          })
        : sandboxes;

      // Build a lookup from cloud agent name (lowercase) → index in results
      const cloudAgentIndexByName = new Map<string, number>();
      for (let i = 0; i < results.length; i++) {
        if (results[i].source === "cloud") {
          cloudAgentIndexByName.set(results[i].name.toLowerCase(), i);
        }
      }

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

          // Check if this sandbox matches an existing cloud agent (dedup by name)
          const sbName = (sb.agent_name || "").toLowerCase();
          const matchingCloudIdx = cloudAgentIndexByName.get(sbName);

          if (matchingCloudIdx !== undefined) {
            // Merge sandbox data INTO the existing cloud agent instead of creating a duplicate.
            // Cloud agent is preferred (richer data), but sandbox provides live status + connectivity.
            const cloudEntry = results[matchingCloudIdx];
            cloudEntry.sourceUrl = url;
            cloudEntry.client = client;
            cloudEntry.nodeId = sb.node_id;
            cloudEntry.lastHeartbeat = sb.last_heartbeat_at;
            // Set webUiUrl to the sandbox's public URL (https://{uuid}.waifu.fun)
            // TODO: Integrate pairing token flow for proper auth handoff (see WEB_UI_URL_NOTES.md)
            cloudEntry.webUiUrl = url;
            // Try to enrich with live status from the sandbox
            try {
              await client.health();
              try {
                const status = await client.getAgentStatus();
                // Only override cloud fields if sandbox has real data
                if (status.state && status.state !== "unknown") cloudEntry.status = status.state;
                if (status.model && status.model !== "—") cloudEntry.model = status.model;
                if (status.uptime) cloudEntry.uptime = status.uptime;
                if (status.memories) cloudEntry.memories = status.memories;
              } catch {
                // Health OK but no detailed status — mark as running if cloud says unknown
                if (cloudEntry.status === "unknown") cloudEntry.status = "running";
              }
            } catch {
              // Sandbox unreachable — keep cloud data as-is
            }
            continue;
          }

          // No matching cloud agent — add as standalone remote agent
          try {
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
                webUiUrl: url,
                client,
                nodeId: sb.node_id,
                lastHeartbeat: sb.last_heartbeat_at,
              });
            } catch {
              results.push({
                id: `milady-${sb.id}`,
                name: sb.agent_name || sb.id,
                source: "remote",
                status: "running",
                sourceUrl: url,
                webUiUrl: url,
                client,
                nodeId: sb.node_id,
                lastHeartbeat: sb.last_heartbeat_at,
              });
            }
          } catch {
            results.push({
              id: `milady-${sb.id}`,
              name: sb.agent_name || sb.id,
              source: "remote",
              status: "unknown",
              sourceUrl: url,
              webUiUrl: url,
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

    // Only update state if data actually changed (prevents unnecessary re-renders)
    setAgents((prev) => agentsEqual(prev, results) ? prev : results);
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

  const contextValue = useMemo<AgentContextValue>(() => ({
    agents: sortedAgents,
    filteredAgents,
    loading,
    cloudClient: cloudClientRef.current,
    sourceFilter,
    setSourceFilter,
    refresh: fetchAll,
    addRemoteUrl,
    removeRemote,
  }), [sortedAgents, filteredAgents, loading, sourceFilter, fetchAll, addRemoteUrl, removeRemote]);

  return (
    <AgentContext value={contextValue}>
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
