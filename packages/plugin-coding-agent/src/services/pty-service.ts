/** @module services/pty-service */

import { type IAgentRuntime, logger } from "@elizaos/core";
import {
  type AdapterType,
  type AgentFileDescriptor,
  type ApprovalConfig,
  type ApprovalPreset,
  type BaseCodingAdapter,
  checkAdapters,
  createAdapter,
  generateApprovalConfig,
  type PreflightResult,
  type WriteMemoryOptions,
} from "coding-agent-adapters";
import { PTYConsoleBridge } from "pty-console";
import type {
  BunCompatiblePTYManager,
  PTYManager,
  SessionFilter,
  SessionHandle,
  SessionMessage,
  SpawnConfig,
  StallClassification,
  WorkerSessionHandle,
} from "pty-manager";
import { AgentMetricsTracker } from "./agent-metrics.js";
import {
  handleGeminiAuth as handleGeminiAuthFlow,
  pushDefaultRules as pushDefaultAutoResponseRules,
} from "./pty-auto-response.js";
import { initializePTYManager } from "./pty-init.js";
import {
  getSessionOutput as getSessionOutputIO,
  type SessionIOContext,
  sendKeysToSession as sendKeysToSessionIO,
  sendToSession as sendToSessionIO,
  stopSession as stopSessionIO,
  subscribeToOutput as subscribeToOutputIO,
} from "./pty-session-io.js";
import {
  buildSpawnConfig,
  setupDeferredTaskDelivery,
  setupOutputBuffer,
} from "./pty-spawn.js";
import type {
  CodingAgentType,
  PTYServiceConfig,
  SessionEventCallback,
  SessionInfo,
  SpawnSessionOptions,
} from "./pty-types.js";
import { isPiAgentType, toPiCommand } from "./pty-types.js";
import { classifyStallOutput } from "./stall-classifier.js";
import { SwarmCoordinator } from "./swarm-coordinator.js";

export type {
  CodingAgentType,
  PTYServiceConfig,
  SessionEventName,
  SessionInfo,
  SpawnSessionOptions,
} from "./pty-types.js";
// Re-export for backward compatibility
export { normalizeAgentType } from "./pty-types.js";

/**
 * Retrieve the SwarmCoordinator from the PTYService registered on the runtime.
 * Returns undefined if PTYService or coordinator is not available.
 */
export function getCoordinator(
  runtime: IAgentRuntime,
): SwarmCoordinator | undefined {
  const ptyService = runtime.getService("PTY_SERVICE") as unknown as
    | PTYService
    | undefined;
  return ptyService?.coordinator ?? undefined;
}

export class PTYService {
  static serviceType = "PTY_SERVICE";
  capabilityDescription = "Manages PTY sessions for CLI coding agents";

  private runtime: IAgentRuntime;
  private manager: PTYManager | BunCompatiblePTYManager | null = null;
  private usingBunWorker: boolean = false;
  private serviceConfig: PTYServiceConfig;
  private sessionMetadata: Map<string, Record<string, unknown>> = new Map();
  private sessionWorkdirs: Map<string, string> = new Map();
  private eventCallbacks: SessionEventCallback[] = [];
  private outputUnsubscribers: Map<string, () => void> = new Map();
  private sessionOutputBuffers: Map<string, string[]> = new Map();
  private adapterCache: Map<string, BaseCodingAdapter> = new Map();
  /** Tracks the buffer index when a task was sent, so we can capture the response on completion */
  private taskResponseMarkers: Map<string, number> = new Map();
  /** Captures "Task completion trace" log entries from worker stderr (rolling, capped at 200) */
  private traceEntries: Array<string | Record<string, unknown>> = [];
  private static readonly MAX_TRACE_ENTRIES = 200;
  /** Lightweight per-agent-type metrics for observability */
  private metricsTracker = new AgentMetricsTracker();
  /** Console bridge for terminal output streaming and buffered hydration */
  consoleBridge: PTYConsoleBridge | null = null;
  /** Swarm coordinator instance (if active). Accessed via getCoordinator(runtime). */
  coordinator: SwarmCoordinator | null = null;

  constructor(runtime: IAgentRuntime, config: PTYServiceConfig = {}) {
    this.runtime = runtime;
    this.serviceConfig = {
      maxLogLines: config.maxLogLines ?? 1000,
      debug: config.debug ?? false,
      registerCodingAdapters: config.registerCodingAdapters ?? true,
      maxConcurrentSessions: config.maxConcurrentSessions ?? 8,
      defaultApprovalPreset: config.defaultApprovalPreset ?? "permissive",
    };
  }

  static async start(runtime: IAgentRuntime): Promise<PTYService> {
    const config = runtime.getSetting("PTY_SERVICE_CONFIG") as
      | PTYServiceConfig
      | null
      | undefined;
    const service = new PTYService(runtime, config ?? {});
    await service.initialize();

    // Wire the SwarmCoordinator — done here instead of plugin init()
    // because ElizaOS calls Service.start() reliably but may not call
    // plugin.init() depending on the registration path.
    try {
      const coordinator = new SwarmCoordinator(runtime);
      coordinator.start(service);
      service.coordinator = coordinator;
      logger.info("[PTYService] SwarmCoordinator wired and started");
    } catch (err) {
      logger.error(`[PTYService] Failed to wire SwarmCoordinator: ${err}`);
    }

    return service;
  }

  static async stopRuntime(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService("PTY_SERVICE") as unknown as
      | PTYService
      | undefined;
    if (service) {
      await service.stop();
    }
  }

  private async initialize(): Promise<void> {
    const result = await initializePTYManager({
      serviceConfig: this.serviceConfig,
      classifyStall: (id, out) => this.classifyStall(id, out),
      emitEvent: (id, event, data) => this.emitEvent(id, event, data),
      handleGeminiAuth: (id) => this.handleGeminiAuth(id),
      sessionOutputBuffers: this.sessionOutputBuffers,
      taskResponseMarkers: this.taskResponseMarkers,
      metricsTracker: this.metricsTracker,
      traceEntries: this.traceEntries,
      maxTraceEntries: PTYService.MAX_TRACE_ENTRIES,
      log: (msg) => this.log(msg),
    });
    this.manager = result.manager;
    this.usingBunWorker = result.usingBunWorker;

    // Wire console bridge for terminal output streaming / hydration
    try {
      this.consoleBridge = new PTYConsoleBridge(this.manager, {
        maxBufferedCharsPerSession: 100_000,
      });
      this.log("PTYConsoleBridge wired");
    } catch (err) {
      this.log(`Failed to wire PTYConsoleBridge: ${err}`);
    }

    this.log("PTYService initialized");
  }

  async stop(): Promise<void> {
    // Stop the coordinator if one was wired to this service
    if (this.coordinator) {
      this.coordinator.stop();
      this.coordinator = null;
    }

    if (this.consoleBridge) {
      this.consoleBridge.close();
      this.consoleBridge = null;
    }

    for (const unsubscribe of this.outputUnsubscribers.values()) {
      unsubscribe();
    }
    this.outputUnsubscribers.clear();

    if (this.manager) {
      await this.manager.shutdown();
      this.manager = null;
    }
    this.sessionMetadata.clear();
    this.sessionWorkdirs.clear();
    this.sessionOutputBuffers.clear();
    this.log("PTYService shutdown complete");
  }

  private generateSessionId(): string {
    return `pty-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  }

  /** Build a SessionIOContext from current instance state. */
  private ioContext(): SessionIOContext {
    return {
      manager: this.manager as PTYManager | BunCompatiblePTYManager,
      usingBunWorker: this.usingBunWorker,
      sessionOutputBuffers: this.sessionOutputBuffers,
      taskResponseMarkers: this.taskResponseMarkers,
      outputUnsubscribers: this.outputUnsubscribers,
    };
  }

  /**
   * Spawn a new PTY session for a coding agent
   */
  async spawnSession(options: SpawnSessionOptions): Promise<SessionInfo> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const piRequested = isPiAgentType(options.agentType);
    const resolvedAgentType: CodingAgentType = piRequested
      ? "shell"
      : options.agentType;
    const resolvedInitialTask = piRequested
      ? toPiCommand(options.initialTask)
      : options.initialTask;

    const maxSessions = this.serviceConfig.maxConcurrentSessions ?? 8;
    const activeSessions = (await this.listSessions()).length;
    if (activeSessions >= maxSessions) {
      throw new Error(`Concurrent session limit reached (${maxSessions})`);
    }

    const sessionId = this.generateSessionId();
    const workdir = options.workdir ?? process.cwd();

    // Store workdir for later retrieval
    this.sessionWorkdirs.set(sessionId, workdir);

    // Write memory content before spawning so the agent reads it on startup
    if (options.memoryContent && resolvedAgentType !== "shell") {
      try {
        const writtenPath = await this.writeMemoryFile(
          resolvedAgentType as AdapterType,
          workdir,
          options.memoryContent,
        );
        this.log(`Wrote memory file for ${resolvedAgentType}: ${writtenPath}`);
      } catch (err) {
        this.log(
          `Failed to write memory file for ${resolvedAgentType}: ${err}`,
        );
      }
    }

    // Write approval config files to workspace before spawn
    if (options.approvalPreset && resolvedAgentType !== "shell") {
      try {
        const written = await this.getAdapter(
          resolvedAgentType as AdapterType,
        ).writeApprovalConfig(workdir, {
          name: options.name,
          type: resolvedAgentType,
          workdir,
          adapterConfig: { approvalPreset: options.approvalPreset },
        } as SpawnConfig);
        this.log(
          `Wrote approval config (${options.approvalPreset}) for ${resolvedAgentType}: ${written.join(", ")}`,
        );
      } catch (err) {
        this.log(`Failed to write approval config: ${err}`);
      }
    }

    const spawnConfig = buildSpawnConfig(
      sessionId,
      {
        ...options,
        agentType: resolvedAgentType,
        initialTask: resolvedInitialTask,
      },
      workdir,
    );
    const session = await this.manager.spawn(spawnConfig);

    // Store metadata separately (always include agentType for stall classification)
    this.sessionMetadata.set(session.id, {
      ...options.metadata,
      requestedType: options.metadata?.requestedType ?? options.agentType,
      agentType: resolvedAgentType,
    });

    // Build spawn context for delegating to extracted spawn modules
    const ctx = {
      manager: this.manager as PTYManager | BunCompatiblePTYManager,
      usingBunWorker: this.usingBunWorker,
      serviceConfig: this.serviceConfig,
      sessionMetadata: this.sessionMetadata,
      sessionWorkdirs: this.sessionWorkdirs,
      sessionOutputBuffers: this.sessionOutputBuffers,
      outputUnsubscribers: this.outputUnsubscribers,
      taskResponseMarkers: this.taskResponseMarkers,
      getAdapter: (t: AdapterType) => this.getAdapter(t),
      sendToSession: (id: string, input: string) =>
        this.sendToSession(id, input),
      sendKeysToSession: (id: string, keys: string | string[]) =>
        this.sendKeysToSession(id, keys),
      pushDefaultRules: (id: string, type: string) =>
        this.pushDefaultRules(id, type),
      toSessionInfo: (s: SessionHandle | WorkerSessionHandle, w?: string) =>
        this.toSessionInfo(s, w),
      log: (msg: string) => this.log(msg),
    };

    // Buffer output for Bun worker path (no logs() method available)
    if (this.usingBunWorker) {
      setupOutputBuffer(ctx, session.id);
    }

    // Defer initial task until session is ready.
    // IMPORTANT: Set up the listener BEFORE pushDefaultRules (which has a 1500ms sleep),
    // otherwise session_ready fires during pushDefaultRules and the listener misses it.
    if (resolvedInitialTask) {
      setupDeferredTaskDelivery(
        ctx,
        session,
        resolvedInitialTask,
        resolvedAgentType,
      );
    }

    await this.pushDefaultRules(session.id, resolvedAgentType);
    this.metricsTracker.get(resolvedAgentType).spawned++;
    this.log(`Spawned session ${session.id} (${resolvedAgentType})`);
    return this.toSessionInfo(session, workdir);
  }

  private autoResponseContext() {
    return {
      manager: this.manager as PTYManager | BunCompatiblePTYManager,
      usingBunWorker: this.usingBunWorker,
      runtime: this.runtime,
      log: (msg: string) => this.log(msg),
    };
  }

  private async pushDefaultRules(
    sessionId: string,
    agentType: string,
  ): Promise<void> {
    if (!this.manager) return;
    await pushDefaultAutoResponseRules(
      this.autoResponseContext(),
      sessionId,
      agentType,
    );
  }

  private async handleGeminiAuth(sessionId: string): Promise<void> {
    await handleGeminiAuthFlow(
      this.autoResponseContext(),
      sessionId,
      (id, keys) => this.sendKeysToSession(id, keys),
    );
  }

  async sendToSession(
    sessionId: string,
    input: string,
  ): Promise<SessionMessage | undefined> {
    if (!this.manager) throw new Error("PTYService not initialized");
    return sendToSessionIO(this.ioContext(), sessionId, input);
  }

  async sendKeysToSession(
    sessionId: string,
    keys: string | string[],
  ): Promise<void> {
    if (!this.manager) throw new Error("PTYService not initialized");
    return sendKeysToSessionIO(this.ioContext(), sessionId, keys);
  }

  async stopSession(sessionId: string): Promise<void> {
    if (!this.manager) throw new Error("PTYService not initialized");
    return stopSessionIO(
      this.ioContext(),
      sessionId,
      this.sessionMetadata,
      this.sessionWorkdirs,
      (msg) => this.log(msg),
    );
  }

  /** Default approval preset — runtime env var takes precedence over config. */
  get defaultApprovalPreset(): ApprovalPreset {
    const fromEnv = this.runtime.getSetting(
      "PARALLAX_DEFAULT_APPROVAL_PRESET",
    ) as string | undefined;
    if (
      fromEnv &&
      ["readonly", "standard", "permissive", "autonomous"].includes(fromEnv)
    ) {
      return fromEnv as ApprovalPreset;
    }
    return this.serviceConfig.defaultApprovalPreset ?? "permissive";
  }

  getSession(sessionId: string): SessionInfo | undefined {
    if (!this.manager) return undefined;
    const session = this.manager.get(sessionId);
    if (!session) return undefined;
    return this.toSessionInfo(session, this.sessionWorkdirs.get(sessionId));
  }

  async listSessions(filter?: SessionFilter): Promise<SessionInfo[]> {
    if (!this.manager) return [];
    const sessions = this.usingBunWorker
      ? await (this.manager as BunCompatiblePTYManager).list()
      : (this.manager as PTYManager).list(filter);
    return sessions.map((s) =>
      this.toSessionInfo(s, this.sessionWorkdirs.get(s.id)),
    );
  }

  subscribeToOutput(
    sessionId: string,
    callback: (data: string) => void,
  ): () => void {
    if (!this.manager) throw new Error("PTYService not initialized");
    return subscribeToOutputIO(this.ioContext(), sessionId, callback);
  }

  async getSessionOutput(sessionId: string, lines?: number): Promise<string> {
    if (!this.manager) throw new Error("PTYService not initialized");
    return getSessionOutputIO(this.ioContext(), sessionId, lines);
  }

  isSessionBlocked(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    return session?.status === "authenticating";
  }

  async checkAvailableAgents(
    types?: AdapterType[],
  ): Promise<PreflightResult[]> {
    const agentTypes =
      types ?? (["claude", "gemini", "codex", "aider"] as AdapterType[]);
    return checkAdapters(agentTypes);
  }

  getSupportedAgentTypes(): CodingAgentType[] {
    return ["shell", "claude", "gemini", "codex", "aider", "pi"];
  }

  private async classifyStall(
    sessionId: string,
    recentOutput: string,
  ): Promise<StallClassification | null> {
    const meta = this.sessionMetadata.get(sessionId);
    const agentType = (meta?.agentType as string) ?? "unknown";
    return classifyStallOutput({
      sessionId,
      recentOutput,
      agentType,
      buffers: this.sessionOutputBuffers,
      traceEntries: this.traceEntries,
      runtime: this.runtime,
      manager: this.manager,
      metricsTracker: this.metricsTracker,
      debugSnapshots: this.serviceConfig.debug === true,
      log: (msg: string) => this.log(msg),
    });
  }

  // ─── Workspace Files ───

  private getAdapter(agentType: AdapterType): BaseCodingAdapter {
    let adapter = this.adapterCache.get(agentType);
    if (!adapter) {
      adapter = createAdapter(agentType);
      this.adapterCache.set(agentType, adapter);
    }
    return adapter;
  }

  getWorkspaceFiles(agentType: AdapterType): AgentFileDescriptor[] {
    return this.getAdapter(agentType).getWorkspaceFiles();
  }

  getMemoryFilePath(agentType: AdapterType): string {
    return this.getAdapter(agentType).memoryFilePath;
  }

  getApprovalConfig(
    agentType: AdapterType,
    preset: ApprovalPreset,
  ): ApprovalConfig {
    return generateApprovalConfig(agentType, preset);
  }

  async writeMemoryFile(
    agentType: AdapterType,
    workspacePath: string,
    content: string,
    options?: WriteMemoryOptions,
  ): Promise<string> {
    return this.getAdapter(agentType).writeMemoryFile(
      workspacePath,
      content,
      options,
    );
  }

  // ─── Event & Adapter Registration ───

  onSessionEvent(callback: SessionEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      const idx = this.eventCallbacks.indexOf(callback);
      if (idx !== -1) this.eventCallbacks.splice(idx, 1);
    };
  }

  registerAdapter(adapter: unknown): void {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    if (this.usingBunWorker) {
      this.log(
        "registerAdapter not available with Bun worker - adapters must be in the worker",
      );
      return;
    }

    (this.manager as PTYManager).registerAdapter(
      adapter as Parameters<PTYManager["registerAdapter"]>[0],
    );
    this.log(`Registered adapter`);
  }

  private toSessionInfo(
    session: SessionHandle | WorkerSessionHandle,
    workdir?: string,
  ): SessionInfo {
    const metadata = this.sessionMetadata.get(session.id);
    const requestedType =
      typeof metadata?.requestedType === "string"
        ? metadata.requestedType
        : undefined;
    const displayAgentType =
      session.type === "shell" && isPiAgentType(requestedType)
        ? "pi"
        : session.type;
    return {
      id: session.id,
      name: session.name,
      agentType: displayAgentType,
      workdir: workdir ?? process.cwd(),
      status: session.status,
      createdAt: session.startedAt ? new Date(session.startedAt) : new Date(),
      lastActivityAt: session.lastActivityAt
        ? new Date(session.lastActivityAt)
        : new Date(),
      metadata,
    };
  }

  private emitEvent(sessionId: string, event: string, data: unknown): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(sessionId, event, data);
      } catch (err) {
        this.log(`Event callback error: ${err}`);
      }
    }
  }

  // ─── Metrics ───

  getAgentMetrics() {
    return this.metricsTracker.getAll();
  }

  private log(message: string): void {
    if (this.serviceConfig.debug) {
      logger.debug(`[PTYService] ${message}`);
    }
  }
}
