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
import { type CloudAgent, CLOUD_AUTH_CHANGED_EVENT, getToken } from "./auth";
import { CloudApiClient, CloudClient } from "./cloud-api";
import { addConnection, getConnections, removeConnection } from "./connections";
import {
  AGENT_UI_BASE_DOMAIN,
  CLOUD_BASE,
  getCloudTokenStorageKey,
  getSandboxDiscoveryUrls,
  LOCAL_AGENT_BASE,
  rewriteAgentUiUrl,
  shouldAllowPublicSandboxDiscoveryFallback,
} from "./runtime-config";

// Timeouts for health probes - shorter than before to avoid long waits
const HEALTH_TIMEOUT_MS = 3000;
const STATUS_TIMEOUT_MS = 2000;
const DISCOVERY_TIMEOUT_MS = 5000;

// Max concurrent health probes to avoid overwhelming the network
const MAX_CONCURRENT_PROBES = 6;

/**
 * Simple semaphore for limiting concurrent async operations.
 */
function createSemaphore(maxConcurrent: number) {
  let current = 0;
  const queue: Array<() => void> = [];

  return {
    async acquire(): Promise<void> {
      if (current < maxConcurrent) {
        current++;
        return;
      }
      return new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    },
    release(): void {
      current--;
      const next = queue.shift();
      if (next) {
        current++;
        next();
      }
    },
  };
}

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
  /** API token for direct agent access (from sandbox discovery or manual config). */
  apiToken?: string;
}

export type SourceFilter = "all" | "local" | "cloud" | "remote";

interface AgentContextValue {
  agents: ManagedAgent[];
  filteredAgents: ManagedAgent[];
  /** True only during initial load (first fetch). */
  loading: boolean;
  /** True when any refetch is in progress (interval, manual refresh, post-mutation). */
  isRefreshing: boolean;
  /** Last error from cloud API or agent discovery. Dismissible via clearError(). */
  error: string | null;
  clearError: () => void;
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
    )
      return false;
  }
  return true;
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const cloudClientRef = useRef<CloudClient | null>(null);
  const cloudTokenRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  // Request sequencing: incremented on each fetchAll() call to prevent stale responses
  const fetchSequenceRef = useRef(0);
  // Track whether initial load has completed
  const hasLoadedOnceRef = useRef(false);

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

  const clearError = useCallback(() => setError(null), []);

  const fetchAll = useCallback(async () => {
    // Increment sequence to invalidate any in-flight requests
    const currentSequence = ++fetchSequenceRef.current;

    // Helper to check if this fetch is still current
    const isStale = () => currentSequence !== fetchSequenceRef.current;

    // Set refreshing state (but not loading if we've already loaded once)
    setIsRefreshing(true);

    const results: ManagedAgent[] = [];
    let fetchError: string | null = null;

    // Track agents that need health probes (for parallel enrichment)
    const probeTargets: Array<{
      index: number;
      client: CloudApiClient;
      isCloudEnrich?: boolean;
    }> = [];

    // 1. Cloud agents (if authenticated with Eliza Cloud)
    //    Show immediately from API response, then enrich with health probes
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
            webUiUrl: ca.webUiUrl ? rewriteAgentUiUrl(ca.webUiUrl) : undefined,
            billing: ca.billing,
            region: ca.region,
            createdAt: ca.createdAt,
            uptime: ca.uptime,
          });
        }
      } catch (err) {
        // Cloud API failed — capture error and continue with sandbox discovery
        const errMsg =
          err instanceof Error ? err.message : "Cloud API request failed";
        fetchError = `Cloud API: ${errMsg}`;
      }
    } else {
      cloudClientRef.current = null;
      cloudTokenRef.current = null;
    }

    // 2. Milady self-hosted agents (auto-discovery)
    //    The public sandbox discovery endpoint returns ALL sandboxes across orgs.
    //    On hosted milady.ai, never use that as an unauthenticated fallback.
    //    Only use discovery there to enrich already-authenticated cloud agents.
    const discoveredIds = new Set<string>();
    let sandboxes: Array<{
      id: string;
      agent_name: string;
      web_ui_port: number;
      api_token?: string;
      node_id?: string;
      last_heartbeat_at?: string;
    }> = [];
    const allowPublicSandboxFallback =
      shouldAllowPublicSandboxDiscoveryFallback();
    const shouldFetchSandboxes = cloudAuthOk || allowPublicSandboxFallback;

    if (shouldFetchSandboxes) {
      for (const url of getSandboxDiscoveryUrls()) {
        try {
          const sandboxRes = await fetch(url, {
            signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
          });
          if (sandboxRes.ok) {
            sandboxes = await sandboxRes.json();
            break; // Use first successful response
          }
        } catch {
          // try next URL
        }
      }
    }

    // Build a set of cloud agent names/ids for cross-referencing.
    // When cloud auth succeeds, sandbox discovery is only used to enrich or match
    // the authenticated user's agents. Public hosted fallback is localhost-only.
    const cloudAgentNames = new Set(
      results
        .filter((a) => a.source === "cloud")
        .map((a) => a.name.toLowerCase()),
    );
    const cloudAgentIds = new Set(
      results.filter((a) => a.source === "cloud").map((a) => a.cloudAgentId),
    );

    if (sandboxes.length > 0) {
      const ownedSandboxes = cloudAuthOk
        ? sandboxes.filter((sb) => {
            const nameMatch = cloudAgentNames.has(
              (sb.agent_name || "").toLowerCase(),
            );
            const idMatch = cloudAgentIds.has(sb.id);
            return nameMatch || idMatch;
          })
        : allowPublicSandboxFallback
          ? sandboxes
          : [];

      // Build a lookup from cloud agent name (lowercase) → index in results
      const cloudAgentIndexByName = new Map<string, number>();
      for (let i = 0; i < results.length; i++) {
        if (results[i].source === "cloud") {
          cloudAgentIndexByName.set(results[i].name.toLowerCase(), i);
        }
      }

      for (const sb of ownedSandboxes) {
        discoveredIds.add(sb.id);
        // Each sandbox is accessible at https://{uuid}.milady.ai
        const url = `https://${sb.id}.${AGENT_UI_BASE_DOMAIN}`;
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
          cloudEntry.apiToken = apiToken;
          // Set webUiUrl to the sandbox's public URL (https://{uuid}.milady.ai)
          cloudEntry.webUiUrl = url;
          // Queue for health probe enrichment (done in parallel later)
          probeTargets.push({
            index: matchingCloudIdx,
            client,
            isCloudEnrich: true,
          });
          continue;
        }

        // No matching cloud agent — add as standalone remote agent with "checking..." status
        const newIndex = results.length;
        results.push({
          id: `milady-${sb.id}`,
          name: sb.agent_name || sb.id,
          source: "remote",
          status: "unknown", // Will be enriched by health probe
          sourceUrl: url,
          webUiUrl: url,
          client,
          nodeId: sb.node_id,
          lastHeartbeat: sb.last_heartbeat_at,
          apiToken,
        });
        // Queue for health probe
        probeTargets.push({ index: newIndex, client });
      }
    }

    // 3. Prepare local agent probe (will run in parallel)
    const localClient = new CloudApiClient({
      url: LOCAL_AGENT_BASE,
      type: "local",
    });
    const localAgentIndex = results.length;
    // We'll add local agent placeholder only if probe succeeds (handled in parallel probes)

    // 4. Manually-added remote agents (via ConnectionModal)
    //    Skip any that were already auto-discovered from milady sandboxes.
    const remotes = getConnections().filter((c) => c.type === "remote");
    for (const remote of remotes) {
      // If this URL matches an auto-discovered milady agent, skip to avoid duplicates
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
      const newIndex = results.length;
      results.push({
        id: `remote-${remote.id}`,
        name: remote.name,
        source: "remote",
        status: "unknown", // Will be enriched by health probe
        sourceUrl: remote.url,
        client,
      });
      // Queue for health probe
      probeTargets.push({ index: newIndex, client });
    }

    // ===== PHASE 1: Show agents immediately (before health probes) =====
    if (isStale()) return;
    setAgents((prev) => (agentsEqual(prev, results) ? prev : [...results]));
    // Mark initial load complete so UI shows something immediately
    hasLoadedOnceRef.current = true;
    setLoading(false);

    // ===== PHASE 2: Parallel health probes with concurrency limit =====
    const semaphore = createSemaphore(MAX_CONCURRENT_PROBES);

    // Helper to probe a single agent
    const probeAgent = async (target: {
      index: number;
      client: CloudApiClient;
      isCloudEnrich?: boolean;
    }): Promise<{
      index: number;
      status?: ManagedAgent["status"];
      model?: string;
      uptime?: number;
      memories?: number;
      agentName?: string;
    } | null> => {
      await semaphore.acquire();
      try {
        const health = await target.client.health({
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        if (!health.ready && !health.status) {
          return { index: target.index, status: "unknown" };
        }
        // If health returned a synthetic response (agent is auth-gated),
        // skip the status probe — we already know it's running and won't
        // get real data without auth. This reduces network requests.
        if (health._synthetic) {
          return { index: target.index, status: "running" };
        }
        try {
          const status = await target.client.getAgentStatus({
            signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
          });
          return {
            index: target.index,
            status: status.state,
            model: status.model,
            uptime: status.uptime,
            memories: status.memories,
            agentName: status.agentName,
          };
        } catch {
          // Health OK but no detailed status
          return { index: target.index, status: "running" };
        }
      } catch {
        // Health check failed
        return target.isCloudEnrich
          ? null // Keep cloud data as-is
          : { index: target.index, status: "unknown" };
      } finally {
        semaphore.release();
      }
    };

    // Probe local agent in parallel with everything else
    const probeLocalAgent = async (): Promise<ManagedAgent | null> => {
      await semaphore.acquire();
      try {
        const health = await localClient.health({
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        if (!health.ready && !health.status) return null;
        // If health returned a synthetic response (agent is auth-gated),
        // skip the status probe — we already know it's running.
        if (health._synthetic) {
          return {
            id: "local-default",
            name: "Local Agent",
            source: "local",
            status: "running",
            sourceUrl: LOCAL_AGENT_BASE,
            client: localClient,
          };
        }
        try {
          const status = await localClient.getAgentStatus({
            signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
          });
          return {
            id: "local-default",
            name: status.agentName || "Local Agent",
            source: "local",
            status: status.state,
            model: status.model,
            uptime: status.uptime,
            memories: status.memories,
            sourceUrl: LOCAL_AGENT_BASE,
            client: localClient,
          };
        } catch {
          return {
            id: "local-default",
            name: "Local Agent",
            source: "local",
            status: "running",
            sourceUrl: LOCAL_AGENT_BASE,
            client: localClient,
          };
        }
      } catch {
        return null; // Local backend not running
      } finally {
        semaphore.release();
      }
    };

    // Run all probes in parallel
    const [probeResults, localAgentResult] = await Promise.all([
      Promise.allSettled(probeTargets.map(probeAgent)),
      probeLocalAgent(),
    ]);

    if (isStale()) return;

    // ===== PHASE 3: Merge probe results and update state =====
    const enrichedResults = [...results];

    // Apply probe results to their respective agents
    for (const result of probeResults) {
      if (result.status === "fulfilled" && result.value) {
        const { index, status, model, uptime, memories, agentName } =
          result.value;
        if (index < enrichedResults.length) {
          const agent = enrichedResults[index];
          if (status) agent.status = status;
          if (model && model !== "—") agent.model = model;
          if (uptime) agent.uptime = uptime;
          if (memories) agent.memories = memories;
          if (agentName && !agent.name) agent.name = agentName;
        }
      }
    }

    // Add local agent if probe succeeded
    if (localAgentResult) {
      enrichedResults.push(localAgentResult);
    }

    // Only update state if this is still the latest request
    if (isStale()) return;

    // Only update state if data actually changed (prevents unnecessary re-renders)
    setAgents((prev) =>
      agentsEqual(prev, enrichedResults) ? prev : enrichedResults,
    );

    // Update error state
    setError(fetchError);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 30000);
    return () => clearInterval(intervalRef.current);
  }, [fetchAll]);

  // Listen for auth changes (sign-in/sign-out) and refresh immediately
  useEffect(() => {
    const handleAuthChange = () => {
      fetchAll();
    };

    // Subscribe to custom auth changed event (same-tab)
    window.addEventListener(CLOUD_AUTH_CHANGED_EVENT, handleAuthChange);

    // Subscribe to storage events for cross-tab sync
    const handleStorage = (event: StorageEvent) => {
      const tokenKey = getCloudTokenStorageKey();
      if (event.key === tokenKey || event.key === null) {
        fetchAll();
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(CLOUD_AUTH_CHANGED_EVENT, handleAuthChange);
      window.removeEventListener("storage", handleStorage);
    };
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
      isRefreshing,
      error,
      clearError,
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
      isRefreshing,
      error,
      clearError,
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
