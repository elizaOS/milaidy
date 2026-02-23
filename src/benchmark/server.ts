import http from "node:http";
import path from "node:path";
import {
  AgentRuntime,
  ChannelType,
  type Content,
  elizaLogger,
  type Memory,
  type Plugin,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import dotenv from "dotenv";
import { CORE_PLUGINS } from "../runtime/core-plugins";
import { createMiladyPlugin } from "../runtime/milady-plugin";
import {
  type BenchmarkContext,
  type CapturedAction,
  clearCapturedAction,
  createBenchmarkPlugin,
  getCapturedAction,
  setBenchmarkContext,
} from "./plugin";

// Load environment variables BEFORE anything else
// This ensures API keys are available when plugins initialize
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DEFAULT_PORT = 3939;
const BENCHMARK_WORLD_ID = stringToUuid("milady-benchmark-world");
const BENCHMARK_MESSAGE_SERVER_ID = stringToUuid(
  "milady-benchmark-message-server",
);

interface BenchmarkSession {
  benchmark: string;
  taskId: string;
  roomId: UUID;
  relayRoomId: UUID;
  userEntityId: UUID;
}

interface BenchmarkOutboxEntry {
  kind: "direct" | "room";
  targetId: string;
  text: string;
  source: string;
  ts: number;
}

interface BenchmarkTrajectoryStep {
  step: number;
  startedAt: number;
  finishedAt: number;
  inputText: string;
  promptText: string;
  context?: Record<string, unknown>;
  thought: string | null;
  responseText: string;
  actions: string[];
  params: Record<string, unknown>;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function disableManualCompactionAction(runtime: AgentRuntime): void {
  const runtimeWithActions = runtime as AgentRuntime & {
    actions?: Array<{ name?: string }>;
  };
  if (!Array.isArray(runtimeWithActions.actions)) {
    return;
  }
  const compactSessionIndex = runtimeWithActions.actions.findIndex(
    (action) => action?.name?.toUpperCase() === "COMPACT_SESSION",
  );
  if (compactSessionIndex === -1) {
    return;
  }
  runtimeWithActions.actions.splice(compactSessionIndex, 1);
  elizaLogger.info(
    "[bench] Disabled manual COMPACT_SESSION action; auto-compaction remains enabled",
  );
}

function toPlugin(candidate: unknown, source: string): Plugin {
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Plugin from ${source} was not an object`);
  }

  const pluginLike = candidate as { name?: unknown };
  if (typeof pluginLike.name !== "string" || pluginLike.name.length === 0) {
    throw new Error(`Plugin from ${source} was missing a valid name`);
  }

  return candidate as Plugin;
}

function resolvePort(): number {
  const raw = process.env.MILADY_BENCH_PORT;
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    elizaLogger.warn(
      `[bench] Invalid MILADY_BENCH_PORT="${raw}"; using ${DEFAULT_PORT}`,
    );
    return DEFAULT_PORT;
  }
  return Math.floor(parsed);
}

function extractRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function extractTaskId(context: Record<string, unknown> | undefined): string {
  const bySnake = context?.task_id;
  if (typeof bySnake === "string" && bySnake.trim()) return bySnake.trim();
  const byCamel = context?.taskId;
  if (typeof byCamel === "string" && byCamel.trim()) return byCamel.trim();
  return "default-task";
}

function extractBenchmarkName(
  context: Record<string, unknown> | undefined,
): string {
  const benchmark = context?.benchmark;
  if (typeof benchmark === "string" && benchmark.trim()) {
    return benchmark.trim();
  }
  return "unknown";
}

function composeBenchmarkPrompt(params: {
  text: string;
  context?: Record<string, unknown>;
  image?: unknown;
}): string {
  const segments: string[] = [params.text.trim()];

  if (params.context && Object.keys(params.context).length > 0) {
    segments.push(
      [
        "BENCHMARK CONTEXT (authoritative):",
        JSON.stringify(params.context, null, 2),
      ].join("\n"),
    );
  }

  if (params.image !== undefined) {
    segments.push(
      ["IMAGE PAYLOAD:", JSON.stringify(params.image, null, 2)].join("\n"),
    );
  }

  segments.push(
    "Respond using normal Eliza action output so actions/params can be executed and evaluated.",
  );

  return segments.join("\n\n");
}

function coerceActions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function coerceParams(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through to XML parsing
    }

    if (trimmed.startsWith("<")) {
      const paramsByAction: Record<string, unknown> = {};
      const actionMatches = [
        ...trimmed.matchAll(/<([A-Za-z0-9_-]+)>([\s\S]*?)<\/\1>/g),
      ];
      for (const [, actionName, actionBody] of actionMatches) {
        const actionParams: Record<string, unknown> = {};
        const fieldMatches = [
          ...actionBody.matchAll(/<([A-Za-z0-9_-]+)>([\s\S]*?)<\/\1>/g),
        ];
        for (const [, fieldName, fieldValue] of fieldMatches) {
          actionParams[fieldName] = fieldValue.trim();
        }
        paramsByAction[actionName] =
          Object.keys(actionParams).length > 0
            ? actionParams
            : actionBody.trim();
      }
      if (Object.keys(paramsByAction).length > 0) {
        return paramsByAction;
      }
    }
  }

  return {};
}

function normalizeBenchmarkContext(
  session: BenchmarkSession,
  context: Record<string, unknown> | undefined,
): BenchmarkContext {
  const normalized: Record<string, unknown> = {
    ...(context ?? {}),
    benchmark: session.benchmark,
    taskId: session.taskId,
  };

  if (
    !Array.isArray(normalized.actionSpace) &&
    Array.isArray(normalized.action_space)
  ) {
    normalized.actionSpace = normalized.action_space;
  }

  if (normalized.task_id === undefined) {
    normalized.task_id = session.taskId;
  }

  return normalized as BenchmarkContext;
}

function capturedActionToParams(
  capturedAction: CapturedAction | null,
): Record<string, unknown> {
  if (!capturedAction) return {};

  const benchmarkParams: Record<string, unknown> = {};
  if (capturedAction.command) benchmarkParams.command = capturedAction.command;
  if (capturedAction.toolName)
    benchmarkParams.tool_name = capturedAction.toolName;
  if (capturedAction.arguments)
    benchmarkParams.arguments = capturedAction.arguments;
  if (capturedAction.operation)
    benchmarkParams.operation = capturedAction.operation;
  if (capturedAction.elementId)
    benchmarkParams.element_id = capturedAction.elementId;
  if (capturedAction.value) benchmarkParams.value = capturedAction.value;

  if (Object.keys(benchmarkParams).length === 0) {
    return {};
  }

  return { BENCHMARK_ACTION: benchmarkParams };
}

function sessionKey(session: BenchmarkSession): string {
  return `${session.benchmark}:${session.taskId}`;
}

async function collectSessionDiagnostics(
  runtime: AgentRuntime,
  session: BenchmarkSession,
): Promise<Record<string, unknown>> {
  const room = await runtime.getRoom(session.roomId);
  const rawLastCompactionAt = room?.metadata?.lastCompactionAt;
  const lastCompactionAt =
    typeof rawLastCompactionAt === "number" ? rawLastCompactionAt : null;

  const [allMessages, recentMessages, factsInRoom, factsForUser] =
    await Promise.all([
      runtime.getMemories({
        tableName: "messages",
        roomId: session.roomId,
        count: 2000,
        unique: false,
      }),
      runtime.getMemories({
        tableName: "messages",
        roomId: session.roomId,
        count: 2000,
        unique: false,
        ...(lastCompactionAt !== null ? { start: lastCompactionAt } : {}),
      }),
      runtime.getMemories({
        tableName: "facts",
        roomId: session.roomId,
        count: 2000,
        unique: false,
      }),
      runtime.getMemories({
        tableName: "facts",
        roomId: session.roomId,
        entityId: session.userEntityId,
        count: 500,
        unique: false,
      }),
    ]);

  const compactionSummaries = allMessages
    .filter((m) => m.content?.source === "compaction")
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const latestCompactionSummary = compactionSummaries.at(-1) ?? null;
  const latestSummaryText =
    typeof latestCompactionSummary?.content?.text === "string"
      ? latestCompactionSummary.content.text
      : "";
  const summaryPreview = latestSummaryText.slice(0, 400);

  const providerNames = runtime.providers.map((provider) => provider.name);
  const evaluatorNames = (
    runtime as unknown as { evaluators?: Array<{ name?: string }> }
  ).evaluators
    ?.map((evaluator) => evaluator?.name ?? "")
    .filter((name) => name.length > 0) ?? [];
  const actionNames = (
    runtime as unknown as { actions?: Array<{ name?: string }> }
  ).actions
    ?.map((action) => action?.name?.toUpperCase() ?? "")
    .filter((name) => name.length > 0) ?? [];

  return {
    benchmark: session.benchmark,
    task_id: session.taskId,
    room_id: session.roomId,
    relay_room_id: session.relayRoomId,
    room_metadata: {
      last_compaction_at: lastCompactionAt,
      compaction_history:
        Array.isArray(room?.metadata?.compactionHistory)
          ? room.metadata.compactionHistory
          : [],
    },
    memory_counts: {
      messages_total: allMessages.length,
      messages_since_last_compaction: recentMessages.length,
      compaction_summaries: compactionSummaries.length,
      facts_room_total: factsInRoom.length,
      facts_for_user_total: factsForUser.length,
    },
    latest_compaction_summary: latestCompactionSummary
      ? {
          memory_id: latestCompactionSummary.id,
          created_at: latestCompactionSummary.createdAt ?? null,
          preview: summaryPreview,
        }
      : null,
    capability_flags: {
      has_recent_messages_provider: providerNames.includes("RECENT_MESSAGES"),
      has_facts_provider: providerNames.includes("FACTS"),
      has_reflection_evaluator: evaluatorNames.some((name) =>
        name.toUpperCase().includes("REFLECTION"),
      ),
      has_relationship_evaluator: evaluatorNames.some((name) =>
        name.toUpperCase().includes("RELATIONSHIP"),
      ),
      has_manual_compaction_action: actionNames.includes("COMPACT_SESSION"),
    },
  };
}

async function ensureBenchmarkSessionContext(
  runtime: AgentRuntime,
  session: BenchmarkSession,
): Promise<void> {
  await runtime.ensureWorldExists({
    id: BENCHMARK_WORLD_ID,
    name: "Milady Benchmark World",
    agentId: runtime.agentId,
    messageServerId: BENCHMARK_MESSAGE_SERVER_ID,
    metadata: {
      type: "benchmark",
      description: "World used for benchmark sessions",
      extra: {
        benchmark: session.benchmark,
      },
    },
  });

  // Use ChannelType.API to ensure the agent always responds to benchmark messages
  // (API channel type bypasses shouldRespond evaluation)
  await runtime.ensureRoomExists({
    id: session.roomId,
    name: `benchmark:${session.taskId}`,
    source: "benchmark",
    type: ChannelType.API,
    channelId: `bench-${session.taskId}`,
    messageServerId: BENCHMARK_MESSAGE_SERVER_ID,
    worldId: BENCHMARK_WORLD_ID,
    metadata: {
      benchmark: session.benchmark,
      taskId: session.taskId,
    },
  });

  await runtime.ensureRoomExists({
    id: session.relayRoomId,
    name: "relay-room",
    source: "benchmark",
    type: ChannelType.API,
    channelId: `relay-${session.taskId}`,
    messageServerId: BENCHMARK_MESSAGE_SERVER_ID,
    worldId: BENCHMARK_WORLD_ID,
    metadata: {
      benchmark: session.benchmark,
      taskId: session.taskId,
      role: "relay-room",
    },
  });

  await runtime.ensureConnection({
    entityId: session.userEntityId,
    roomId: session.roomId,
    worldId: BENCHMARK_WORLD_ID,
    userName: "Benchmark User",
    source: "benchmark",
    channelId: `bench-${session.taskId}`,
    type: ChannelType.API,
    messageServerId: BENCHMARK_MESSAGE_SERVER_ID,
    metadata: {
      benchmark: session.benchmark,
      taskId: session.taskId,
      role: "benchmark-room",
    },
  });
  await runtime.ensureParticipantInRoom(runtime.agentId, session.relayRoomId);
}

function createSession(taskId: string, benchmark: string): BenchmarkSession {
  const normalizedTaskId = taskId.trim() || "default-task";
  const normalizedBenchmark = benchmark.trim() || "unknown";
  const seed = `${normalizedBenchmark}:${normalizedTaskId}:${Date.now()}:${Math.random()}`;

  return {
    benchmark: normalizedBenchmark,
    taskId: normalizedTaskId,
    roomId: stringToUuid(`benchmark-room:${seed}`),
    relayRoomId: stringToUuid(`benchmark-relay:${seed}`),
    userEntityId: stringToUuid(`benchmark-user:${seed}`),
  };
}

// Proper robust server implementation
export async function startBenchmarkServer() {
  const port = resolvePort();
  elizaLogger.info(
    `[bench] Initializing milady benchmark runtime on port ${port}...`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PLUGIN LOADING — Use full CORE_PLUGINS to test with realistic context
  // ═══════════════════════════════════════════════════════════════════════════
  // We intentionally load the full Milady plugin set to ensure benchmarks test
  // the agent's ability to perform tasks despite context "pollution" from all
  // the default actions, providers, evaluators, etc. If the agent can still
  // succeed with a crowded context, it demonstrates sufficient context handling.
  // ═══════════════════════════════════════════════════════════════════════════

  const plugins: Plugin[] = [];
  const loadedPlugins: string[] = [];
  const failedPlugins: string[] = [];

  // Plugins to skip in benchmark context — these require external auth or
  // interfere with benchmark operation
  const skipPlugins = new Set([
    "@elizaos/plugin-elizacloud", // Requires ElizaOS cloud auth, conflicts with local LLM
  ]);

  // Load all CORE_PLUGINS — these are what the production Milady runtime uses
  for (const pluginName of CORE_PLUGINS) {
    if (skipPlugins.has(pluginName)) {
      elizaLogger.debug(
        `[bench] Skipping plugin (benchmark mode): ${pluginName}`,
      );
      continue;
    }
    try {
      const pluginModule = await import(pluginName);
      const plugin =
        pluginModule.default ?? pluginModule[Object.keys(pluginModule)[0]];
      if (plugin) {
        plugins.push(toPlugin(plugin, pluginName));
        loadedPlugins.push(pluginName);
      }
    } catch (error: unknown) {
      // Some plugins may not be available in all environments — that's OK
      failedPlugins.push(pluginName);
      elizaLogger.debug(
        `[bench] Plugin not available: ${pluginName} (${formatUnknownError(error)})`,
      );
    }
  }

  elizaLogger.info(
    `[bench] Loaded ${loadedPlugins.length}/${CORE_PLUGINS.length} core plugins`,
  );
  if (failedPlugins.length > 0) {
    elizaLogger.debug(
      `[bench] Unavailable plugins: ${failedPlugins.join(", ")}`,
    );
  }

  // Load Milady plugin — provides workspace context, session keys, autonomous state,
  // custom actions, and lifecycle actions (restart, trigger tasks)
  try {
    const workspaceDir = process.env.MILADY_WORKSPACE_DIR ?? process.cwd();
    const miladyPlugin = createMiladyPlugin({
      workspaceDir,
      agentId: "benchmark",
    });
    plugins.push(toPlugin(miladyPlugin, "milady-plugin"));
    elizaLogger.info(
      `[bench] Loaded milady plugin with workspace: ${workspaceDir}`,
    );
  } catch (error: unknown) {
    elizaLogger.error(
      `[bench] Failed to load milady plugin: ${formatUnknownError(error)}`,
    );
  }

  // Load benchmark plugin — provides benchmark provider + BENCHMARK_ACTION
  try {
    const benchmarkPlugin = createBenchmarkPlugin();
    plugins.push(toPlugin(benchmarkPlugin, "benchmark-plugin"));
    elizaLogger.info("[bench] Loaded benchmark plugin");
  } catch (error: unknown) {
    elizaLogger.error(
      `[bench] Failed to load benchmark plugin: ${formatUnknownError(error)}`,
    );
  }

  // Load trust plugin — provides trust engine, security module, and permission system
  // (may already be in CORE_PLUGINS but we want to ensure it's loaded)
  if (!loadedPlugins.includes("@elizaos/plugin-trust")) {
    try {
      const { default: trustPlugin } = await import("@elizaos/plugin-trust");
      plugins.push(toPlugin(trustPlugin, "@elizaos/plugin-trust"));
      elizaLogger.info("[bench] Loaded plugin: @elizaos/plugin-trust");
    } catch (error: unknown) {
      elizaLogger.debug(
        `[bench] Trust plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  // Load LLM provider plugins based on environment
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  if (groqApiKey) {
    process.env.GROQ_API_KEY = groqApiKey;
    try {
      const { default: groqPlugin } = await import("@elizaos/plugin-groq");
      plugins.push(toPlugin(groqPlugin, "@elizaos/plugin-groq"));
      elizaLogger.info("[bench] Loaded LLM plugin: @elizaos/plugin-groq");
    } catch (error: unknown) {
      elizaLogger.warn(
        `[bench] Groq plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiApiKey && !openAiApiKey.startsWith("gsk_")) {
    process.env.OPENAI_API_KEY = openAiApiKey;
    try {
      const { default: openaiPlugin } = await import("@elizaos/plugin-openai");
      plugins.push(toPlugin(openaiPlugin, "@elizaos/plugin-openai"));
      elizaLogger.info("[bench] Loaded LLM plugin: @elizaos/plugin-openai");
    } catch (error: unknown) {
      elizaLogger.debug(
        `[bench] OpenAI plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  // Load computer use plugin if enabled
  if (process.env.MILADY_ENABLE_COMPUTERUSE) {
    try {
      process.env.COMPUTERUSE_ENABLED ??= "true";
      process.env.COMPUTERUSE_MODE ??= "local";
      const localComputerusePath =
        "../../../plugins/plugin-computeruse/typescript/src/index.ts";
      const computeruseModule = (await import(localComputerusePath)) as Record<
        string,
        unknown
      >;
      const computerusePlugin =
        computeruseModule.computerusePlugin ??
        computeruseModule.computerUsePlugin ??
        computeruseModule.default;
      if (computerusePlugin) {
        plugins.push(toPlugin(computerusePlugin, localComputerusePath));
        elizaLogger.info(
          "[bench] Loaded local plugin: @elizaos/plugin-computeruse",
        );
      }
    } catch (error: unknown) {
      elizaLogger.debug(
        `[bench] Computer use plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  // Load mock plugin for testing (file is gitignored for local-only use)
  if (
    process.env.MILADY_BENCH_MOCK === "true" ||
    process.env.MILAIDY_BENCH_MOCK === "true"
  ) {
    try {
      const localMockPath = String("./mock-plugin.ts");
      const { mockPlugin } = (await import(localMockPath)) as {
        mockPlugin?: unknown;
      };
      plugins.push(toPlugin(mockPlugin, localMockPath));
      elizaLogger.info("[bench] Loaded mock benchmark plugin");
    } catch (error: unknown) {
      elizaLogger.error(
        `[bench] Failed to load mock benchmark plugin: ${formatUnknownError(error)}`,
      );
    }
  }

  // Build settings object from environment variables
  // These are needed by plugins like Groq that use runtime.getSetting()
  const settings: Record<string, string> = {
    // Use in-memory database for benchmarks to avoid pglite corruption issues
    // and ensure a clean state for each benchmark run
    PGLITE_DATA_DIR: "memory://",
  };
  const envKeys = [
    "GROQ_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENROUTER_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
  ];
  for (const key of envKeys) {
    const value = process.env[key]?.trim();
    if (value) {
      settings[key] = value;
    }
  }

  // Optional runtime setting passthrough for deterministic benchmark tuning.
  // Useful for forcing compaction behavior in context-stress scenarios.
  const runtimeSettingKeys = [
    "MAX_CONVERSATION_TOKENS",
    "AUTO_COMPACT",
    "CONVERSATION_LENGTH",
    "ADVANCED_CAPABILITIES",
  ];
  for (const key of runtimeSettingKeys) {
    const value = process.env[key]?.trim();
    if (value) {
      settings[key] = value;
    }
  }

  const runtime = new AgentRuntime({
    character: {
      name: "Kira",
      bio: ["A benchmark execution agent."],
      messageExamples: [],
      topics: [],
      adjectives: [],
      plugins: [],
      settings: {
        secrets: settings,
      },
    },
    plugins,
  });

  await runtime.initialize();
  disableManualCompactionAction(runtime);
  const modelHandlers = (
    runtime as unknown as { models?: Map<string, unknown[]> }
  ).models;
  const modelHandlerSummary = Object.fromEntries(
    [...(modelHandlers?.entries() ?? [])].map(([modelType, handlers]) => [
      modelType,
      (handlers as Array<{ provider?: string; priority?: number }>).map(
        (handler) => ({
          provider: handler.provider ?? "unknown",
          priority: handler.priority ?? 0,
        }),
      ),
    ]),
  );
  elizaLogger.info(
    `[bench] Model handlers: ${JSON.stringify(modelHandlerSummary)}`,
  );
  elizaLogger.info(
    `[bench] Runtime initialized — agent=${runtime.character.name}, plugins=${plugins.length}`,
  );

  const roomToSession = new Map<string, string>();
  const entityToSession = new Map<string, string>();
  const trajectoriesBySession = new Map<string, BenchmarkTrajectoryStep[]>();
  const outboxBySession = new Map<string, BenchmarkOutboxEntry[]>();

  const benchmarkTransport = {
    sendDirectMessage: async (targetEntityId: string, content: Content) => {
      const key = entityToSession.get(targetEntityId);
      const text = typeof content.text === "string" ? content.text : "";
      const source =
        typeof content.source === "string" ? content.source : "benchmark";
      if (!key) return;
      const current = outboxBySession.get(key) ?? [];
      current.push({
        kind: "direct",
        targetId: targetEntityId,
        text,
        source,
        ts: Date.now(),
      });
      outboxBySession.set(key, current);
    },
    sendRoomMessage: async (targetRoomId: string, content: Content) => {
      const key = roomToSession.get(targetRoomId);
      const text = typeof content.text === "string" ? content.text : "";
      const source =
        typeof content.source === "string" ? content.source : "benchmark";
      if (!key) return;
      const current = outboxBySession.get(key) ?? [];
      current.push({
        kind: "room",
        targetId: targetRoomId,
        text,
        source,
        ts: Date.now(),
      });
      outboxBySession.set(key, current);
    },
  };

  const runtimeWithServiceOverride = runtime as unknown as {
    getService: (serviceType: string) => unknown;
  };
  const originalGetService =
    runtimeWithServiceOverride.getService.bind(runtime);
  runtimeWithServiceOverride.getService = (serviceType: string) => {
    if (serviceType === "benchmark") {
      return benchmarkTransport;
    }
    return originalGetService(serviceType);
  };

  const sessions = new Map<string, BenchmarkSession>();
  let activeSession: BenchmarkSession | null = null;

  const registerSessionRefs = (session: BenchmarkSession): void => {
    const key = sessionKey(session);
    roomToSession.set(session.roomId, key);
    roomToSession.set(session.relayRoomId, key);
    entityToSession.set(session.userEntityId, key);
  };

  const resolveSession = (
    taskId: string,
    benchmark: string,
    createIfMissing = true,
  ): BenchmarkSession | null => {
    const key = `${benchmark}:${taskId}`;
    const existing = sessions.get(key);
    if (existing) {
      activeSession = existing;
      return existing;
    }
    if (!createIfMissing) return null;
    const created = createSession(taskId, benchmark);
    sessions.set(key, created);
    registerSessionRefs(created);
    activeSession = created;
    return created;
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const pathname = requestUrl.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (pathname === "/api/benchmark/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ready",
          agent_name: runtime.character.name ?? "Milady",
          plugins: plugins.length,
          active_session: activeSession
            ? {
                benchmark: activeSession.benchmark,
                task_id: activeSession.taskId,
                room_id: activeSession.roomId,
              }
            : null,
        }),
      );
      return;
    }

    if (pathname === "/api/benchmark/reset" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const parsed = body.trim()
            ? (JSON.parse(body) as {
                task_id?: unknown;
                benchmark?: unknown;
              })
            : {};
          const taskId =
            typeof parsed.task_id === "string" &&
            parsed.task_id.trim().length > 0
              ? parsed.task_id
              : "default-task";
          const benchmark =
            typeof parsed.benchmark === "string" &&
            parsed.benchmark.trim().length > 0
              ? parsed.benchmark
              : "unknown";

          const session = resolveSession(taskId, benchmark, true);
          if (!session) {
            throw new Error("Failed to initialize benchmark session");
          }
          const key = sessionKey(session);
          trajectoriesBySession.set(key, []);
          outboxBySession.set(key, []);

          await ensureBenchmarkSessionContext(runtime, session);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "ok",
              room_id: session.roomId,
              task_id: session.taskId,
              benchmark: session.benchmark,
            }),
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          elizaLogger.error(`[bench] Reset error: ${formatUnknownError(err)}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: errorMessage }));
        }
      });
      return;
    }

    if (pathname === "/api/benchmark/outbox" && req.method === "GET") {
      const context = extractRecord({
        benchmark: requestUrl.searchParams.get("benchmark") ?? undefined,
        task_id:
          requestUrl.searchParams.get("task_id") ??
          requestUrl.searchParams.get("taskId") ??
          undefined,
      });
      const taskId = extractTaskId(context);
      const benchmark = extractBenchmarkName(context);
      const session =
        resolveSession(taskId, benchmark, false) ??
        activeSession ??
        resolveSession("default-task", "unknown", false);

      if (!session) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", outbox: [] }));
        return;
      }

      const key = sessionKey(session);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          benchmark: session.benchmark,
          task_id: session.taskId,
          room_id: session.roomId,
          outbox: outboxBySession.get(key) ?? [],
        }),
      );
      return;
    }

    if (pathname === "/api/benchmark/trajectory" && req.method === "GET") {
      const context = extractRecord({
        benchmark: requestUrl.searchParams.get("benchmark") ?? undefined,
        task_id:
          requestUrl.searchParams.get("task_id") ??
          requestUrl.searchParams.get("taskId") ??
          undefined,
      });
      const taskId = extractTaskId(context);
      const benchmark = extractBenchmarkName(context);
      const session =
        resolveSession(taskId, benchmark, false) ??
        activeSession ??
        resolveSession("default-task", "unknown", false);

      if (!session) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            steps: [],
            outbox: [],
          }),
        );
        return;
      }

      const key = sessionKey(session);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          benchmark: session.benchmark,
          task_id: session.taskId,
          room_id: session.roomId,
          relay_room_id: session.relayRoomId,
          steps: trajectoriesBySession.get(key) ?? [],
          outbox: outboxBySession.get(key) ?? [],
        }),
      );
      return;
    }

    if (pathname === "/api/benchmark/diagnostics" && req.method === "GET") {
      try {
        const context = extractRecord({
          benchmark: requestUrl.searchParams.get("benchmark") ?? undefined,
          task_id:
            requestUrl.searchParams.get("task_id") ??
            requestUrl.searchParams.get("taskId") ??
            undefined,
        });
        const taskId = extractTaskId(context);
        const benchmark = extractBenchmarkName(context);
        const session =
          resolveSession(taskId, benchmark, false) ??
          activeSession ??
          resolveSession("default-task", "unknown", false);

        if (!session) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", diagnostics: null }));
          return;
        }

        const diagnostics = await collectSessionDiagnostics(runtime, session);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", diagnostics }));
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        elizaLogger.error(
          `[bench] Diagnostics error: ${formatUnknownError(err)}`,
        );
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: errorMessage }));
      }
      return;
    }

    if (pathname === "/api/benchmark/message" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body) as {
            text?: unknown;
            context?: unknown;
            image?: unknown;
          };

          const text =
            typeof parsed.text === "string" ? parsed.text.trim() : "";
          if (!text) {
            throw new Error(
              "Request body must include non-empty string `text`",
            );
          }

          const context = extractRecord(parsed.context);
          const taskId = extractTaskId(context);
          const benchmark = extractBenchmarkName(context);
          const session =
            resolveSession(taskId, benchmark, true) ??
            activeSession ??
            resolveSession("default-task", "unknown", true);
          if (!session) {
            throw new Error("Failed to resolve benchmark session");
          }
          const key = sessionKey(session);
          const trajectory = trajectoriesBySession.get(key) ?? [];
          const startedAt = Date.now();

          await ensureBenchmarkSessionContext(runtime, session);

          const benchmarkContext = normalizeBenchmarkContext(session, context);
          const composedPrompt = composeBenchmarkPrompt({
            text,
            context: benchmarkContext,
            image: parsed.image,
          });

          const incomingMessage: Memory = {
            id: stringToUuid(`benchmark-msg:${Date.now()}:${Math.random()}`),
            content: {
              text: composedPrompt,
              source: "benchmark",
              metadata: {
                benchmark: session.benchmark,
                taskId: session.taskId,
                ...(context ? { contextJson: JSON.stringify(context) } : {}),
              },
            },
            entityId: session.userEntityId,
            agentId: runtime.agentId,
            roomId: session.roomId,
            createdAt: Date.now(),
          };

          const callbackTexts: string[] = [];
          const callback = async (content: Content): Promise<Memory[]> => {
            if (
              typeof content.text === "string" &&
              content.text.trim().length > 0
            ) {
              callbackTexts.push(content.text.trim());
            }
            return [];
          };

          if (!runtime.messageService) {
            throw new Error("Runtime message service is not available");
          }
          const messageService = runtime.messageService;

          clearCapturedAction();
          setBenchmarkContext(benchmarkContext);
          const result = await (async () => {
            try {
              return await messageService.handleMessage(
                runtime,
                incomingMessage,
                callback,
              );
            } finally {
              setBenchmarkContext(null);
            }
          })();

          const capturedAction = getCapturedAction();

          const responseText =
            typeof result.responseContent?.text === "string"
              ? result.responseContent.text
              : callbackTexts.join("\n\n");
          const thought =
            typeof result.responseContent?.thought === "string"
              ? result.responseContent.thought
              : null;
          const actionList = coerceActions(result.responseContent?.actions);
          const actions =
            actionList.length > 0
              ? actionList
              : capturedAction
                ? ["BENCHMARK_ACTION"]
                : [];
          const parsedParams = coerceParams(result.responseContent?.params);
          const params =
            Object.keys(parsedParams).length > 0
              ? parsedParams
              : capturedActionToParams(capturedAction);
          const finishedAt = Date.now();

          trajectory.push({
            step: trajectory.length + 1,
            startedAt,
            finishedAt,
            inputText: text,
            promptText: composedPrompt,
            context,
            thought,
            responseText,
            actions,
            params,
          });
          trajectoriesBySession.set(key, trajectory);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              text: responseText,
              thought,
              actions,
              params,
              benchmark: session.benchmark,
              task_id: session.taskId,
              room_id: session.roomId,
              trajectory_step: trajectory.length,
            }),
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const errorDetail =
            err instanceof Error && err.stack
              ? err.stack
              : formatUnknownError(err);
          elizaLogger.error(`[bench] Request error: ${errorDetail}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: errorMessage }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(port, () => {
    elizaLogger.info(
      `[bench] Milady benchmark server listening on port ${port}`,
    );
    console.log(`MILADY_BENCH_READY port=${port}`);
  });
}

startBenchmarkServer().catch((err) => {
  console.error("Failed to start benchmark server:", err);
  process.exit(1);
});
