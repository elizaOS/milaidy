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
  AGENT_UI_BASE_DOMAIN,
  CLOUD_BASE,
  getSameHostSandboxDiscoveryUrl,
  LOCAL_AGENT_BASE,
  rewriteAgentUiUrl,
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

interface DiscoveredSandbox {
  id: string;
  agent_name: string;
  web_ui_port: number;
  api_token?: string;
  node_id?: string;
  last_heartbeat_at?: string;
}

/** Shallow-compare two agent lists to avoid unnecessary re-renders. */
function agentsEqual(a: ManagedAgent[], b: ManagedAgent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const aa = a[i],
      bb = b[i];
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
    ) {
      return false;
    }
  }
  return true;
}

function isUuid(value: string | undefined): boolean {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    ),
  );
}

function getDerivedCloudAgentWebUiUrl(agentId: string): string {
  return rewriteAgentUiUrl(`https://${agentId}.${AGENT_UI_BASE_DOMAIN}`);
}

function getDiscoveredSandboxUrl(
  discoveryUrl: string,
  sandbox: Pick<DiscoveredSandbox, "id" | "web_ui_port">,
): string {
  try {
    const parsedDiscoveryUrl = new URL(discoveryUrl);
    parsedDiscoveryUrl.port = String(sandbox.web_ui_port);
    parsedDiscoveryUrl.pathname = "";
    parsedDiscoveryUrl.search = "";
    parsedDiscoveryUrl.hash = "";
    return parsedDiscoveryUrl.toString().replace(/\/$/, "");
  } catch {
    return isUuid(sandbox.id)
      ? getDerivedCloudAgentWebUiUrl(sandbox.id)
      : discoveryUrl;
  }
}

function normalizeAgentUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function getCloudAgentWebUiUrl(
  agentId: string,
  webUiUrl?: string,
): string | undefined {
  if (webUiUrl) return rewriteAgentUiUrl(webUiUrl);
  if (!isUuid(agentId)) return undefined;
  return getDerivedCloudAgentWebUiUrl(agentId);
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const cloudClientRef = useRef<CloudClient | null>(null);
  const cloudTokenRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // Sort agents: local first, then remote, then cloud (memoized to avoid re-creating on every render)
  const sortedAgents = useMemo(
    () =>
      [...agents].sort((a, b) => {
        const order: Record<string, number> = { local: 0, remote: 1, cloud: 2 };
        return (order[a.source] ?? 3) - (order[b.source] ?? 3);
      }),
    [agents],
  );

  const filteredAgents = useMemo(
    () =>
      sourceFilter === "all"
        ? sortedAgents
        : sortedAgents.filter((a) => a.source === sourceFilter),
    [sortedAgents, sourceFilter],
  );

  const fetchAll = useCallback(async () => {
    const results: ManagedAgent[] = [];
    const discoveredIds = new Set<string>();
    const discoveredUrls = new Set<string>();
    const sameHostDiscoveryUrl = getSameHostSandboxDiscoveryUrl();

    // 1. Cloud agents (if authenticated with Eliza Cloud)
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
            webUiUrl: getCloudAgentWebUiUrl(ca.id, ca.webUiUrl),
            billing: ca.billing,
            region: ca.region,
            createdAt: ca.createdAt,
            uptime: ca.uptime,
          });
        }
      } catch {
        // Cloud API failed — skip cloud agents and continue with local/manual agents.
      }
    } else {
      cloudClientRef.current = null;
      cloudTokenRef.current = null;
    }

    // 2. Same-host sandbox discovery only.
    // Never use the public cross-org sandbox index here.
    let sandboxes: DiscoveredSandbox[] = [];
    if (sameHostDiscoveryUrl) {
      try {
        const sandboxRes = await fetch(sameHostDiscoveryUrl, {
          signal: AbortSignal.timeout(5000),
        });
        if (sandboxRes.ok) {
          sandboxes = await sandboxRes.json();
        }
      } catch {
        // self-hosted discovery unavailable — continue without it
      }
    }

    if (sandboxes.length > 0) {
      const cloudAgentIndexById = new Map<string, number>();
      for (let i = 0; i < results.length; i++) {
        const agent = results[i];
        if (agent.source === "cloud" && agent.cloudAgentId) {
          cloudAgentIndexById.set(agent.cloudAgentId, i);
        }
      }

      for (const sb of sandboxes) {
        discoveredIds.add(sb.id);
        const url = getDiscoveredSandboxUrl(sameHostDiscoveryUrl, sb);
        discoveredUrls.add(normalizeAgentUrl(url));
        const client = new CloudApiClient({
          url,
          type: "remote",
          authToken: sb.api_token,
        });

        const matchingCloudIdx = cloudAgentIndexById.get(sb.id);
        if (matchingCloudIdx !== undefined) {
          const cloudEntry = results[matchingCloudIdx];
          cloudEntry.client = client;
          cloudEntry.nodeId = sb.node_id;
          cloudEntry.lastHeartbeat = sb.last_heartbeat_at;
          cloudEntry.webUiUrl = url;
          try {
            await client.health();
            try {
              const status = await client.getAgentStatus();
              if (status.state && status.state !== "unknown") {
                cloudEntry.status = status.state;
              }
              if (status.model && status.model !== "—") {
                cloudEntry.model = status.model;
              }
              if (status.uptime) cloudEntry.uptime = status.uptime;
              if (status.memories) cloudEntry.memories = status.memories;
            } catch {
              if (cloudEntry.status === "unknown") {
                cloudEntry.status = "running";
              }
            }
          } catch {
            // Sandbox unreachable — keep cloud data as-is
          }
          continue;
        }

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
    const remotes = getConnections().filter((c) => c.type === "remote");
    for (const remote of remotes) {
      const normalizedRemoteUrl = normalizeAgentUrl(remote.url);
      if (discoveredUrls.has(normalizedRemoteUrl)) continue;

      const isMiladyDomain = remote.url.includes(AGENT_UI_BASE_DOMAIN);
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
    setAgents((prev) => (agentsEqual(prev, results) ? prev : results));
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

  const contextValue = useMemo<AgentContextValue>(
    () => ({
      agents: sortedAgents,
      filteredAgents,
      loading,
      cloudClient: cloudClientRef.current,
      sourceFilter,
      setSourceFilter,
      refresh: fetchAll,
      addRemoteUrl,
      removeRemote,
    }),
    [
      sortedAgents,
      filteredAgents,
      loading,
      sourceFilter,
      fetchAll,
      addRemoteUrl,
      removeRemote,
    ],
  );

  return <AgentContext value={contextValue}>{children}</AgentContext>;
}

function mapCloudStatus(status: string): ManagedAgent["status"] {
  const s = status?.toLowerCase() ?? "";
  if (s === "running" || s === "active" || s === "healthy") return "running";
  if (s === "paused" || s === "suspended") return "paused";
  if (s === "stopped" || s === "terminated" || s === "deleted") {
    return "stopped";
  }
  if (s === "provisioning" || s === "creating" || s === "starting") {
    return "provisioning";
  }
  return "unknown";
}

export function useAgents() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgents must be used within AgentProvider");
  return ctx;
}
