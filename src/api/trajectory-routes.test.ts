import type { AgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../test-support/test-helpers";
import { handleTrajectoryRoute } from "./trajectory-routes";

const { loadRowsMock, deleteRowsMock, clearRowsMock, createZipArchiveMock } =
  vi.hoisted(() => ({
    loadRowsMock: vi.fn(),
    deleteRowsMock: vi.fn(),
    clearRowsMock: vi.fn(),
    createZipArchiveMock: vi.fn(),
  }));

vi.mock("../runtime/trajectory-persistence", () => ({
  loadPersistedTrajectoryRows: loadRowsMock,
  deletePersistedTrajectoryRows: deleteRowsMock,
  clearPersistedTrajectoryRows: clearRowsMock,
}));

vi.mock("./zip-utils", () => ({
  createZipArchive: createZipArchiveMock,
}));

type TrajectoryRecordCandidate = {
  id?: string;
  source?: string;
  status?: "active" | "completed" | "error" | "timeout";
  start_time?: number;
  end_time?: number | null;
  duration_ms?: number;
  steps_json?: string;
  step_count?: number;
  llm_call_count?: number;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  total_reward?: number;
  trajectory_id?: string;
  agent_id?: string;
  episode_length?: number;
  metadata?: Record<string, unknown>;
};

function makePersistedRows(
  overrides: Partial<TrajectoryRecordCandidate>[] = [],
): TrajectoryRecordCandidate[] {
  return overrides.map((row, index) => ({
    trajectory_id: row.trajectory_id ?? `trajectory-${index + 1}`,
    agent_id: row.agent_id ?? `agent-${index + 1}`,
    source: row.source ?? "runtime",
    status: row.status ?? "completed",
    start_time: row.start_time ?? 1_700_000_000_000 + index * 1_000,
    end_time: row.end_time ?? 1_700_000_000_500 + index * 1_000,
    duration_ms: row.duration_ms ?? 500,
    step_count: row.step_count ?? 1,
    llm_call_count: row.llm_call_count ?? 1,
    total_prompt_tokens: row.total_prompt_tokens ?? 10,
    total_completion_tokens: row.total_completion_tokens ?? 12,
    total_reward: row.total_reward ?? 42,
    episode_length: row.episode_length ?? 1,
    metadata: row.metadata ?? {
      source: row.source ?? "runtime",
      scene: "unit",
    },
    steps_json:
      row.steps_json ??
      JSON.stringify([
        {
          stepId: "s-1",
          llmCalls: [
            {
              callId: "call-1",
              timestamp: row.start_time ?? 1_700_000_000_000,
              model: "gpt-4",
              systemPrompt: "system prompt",
              userPrompt: "what is this?",
              response: "answer",
              temperature: 0.7,
              maxTokens: 500,
              purpose: "query",
              actionType: "completion",
              promptTokens: 7,
              completionTokens: 9,
              latencyMs: 12,
            },
          ],
          providerAccesses: [
            {
              providerId: "llm-provider",
              providerName: "llm-provider",
              timestamp: row.start_time ?? 1_700_000_000_000,
              data: { model: "gpt-4" },
              purpose: "inference",
            },
          ],
        },
      ]),
    ...row,
  }));
}

function makeLegacyLogger(overrides: {
  listTrajectories?: () => Promise<{
    trajectories: unknown[];
    total: number;
    offset: number;
    limit: number;
  }>;
  getTrajectoryDetail?: () => Promise<unknown>;
  getStats?: () => Promise<unknown>;
  deleteTrajectories?: () => Promise<number>;
  clearAllTrajectories?: () => Promise<number>;
  exportTrajectories?: () => Promise<{
    data: string;
    filename: string;
    mimeType: string;
  }>;
  isEnabled?: () => boolean;
  setEnabled?: (enabled: boolean) => void;
  executeRawSql?: (sql: string) => Promise<unknown>;
}) {
  return {
    isEnabled: vi.fn(() => true),
    setEnabled: vi.fn(),
    listTrajectories: vi.fn().mockResolvedValue({
      trajectories: [],
      total: 0,
      offset: 0,
      limit: 50,
    }),
    getTrajectoryDetail: vi.fn().mockResolvedValue({
      trajectoryId: "trajectory-1",
      agentId: "agent-1",
      startTime: 1_700_000_000_000,
      endTime: 1_700_000_000_500,
      durationMs: 500,
      steps: [],
      totalReward: 1,
      metrics: { episodeLength: 1, finalStatus: "completed" },
      metadata: { source: "runtime", roomId: "room-1" },
    }),
    getStats: vi.fn().mockResolvedValue({
      totalTrajectories: 1,
      totalLlmCalls: 1,
      totalProviderAccesses: 0,
      totalPromptTokens: 7,
      totalCompletionTokens: 9,
      averageDurationMs: 500,
      bySource: { runtime: 1 },
      byModel: { "gpt-4": 1 },
    }),
    deleteTrajectories: vi.fn().mockResolvedValue(0),
    clearAllTrajectories: vi.fn().mockResolvedValue(0),
    exportTrajectories: vi.fn().mockResolvedValue({
      data: JSON.stringify({}),
      filename: "trajectories.json",
      mimeType: "application/json",
    }),
    executeRawSql: vi.fn().mockResolvedValue({ rows: [] }),
    ...overrides,
  };
}

function makeRuntime(
  services: unknown[],
  options: {
    useGetService?: boolean;
    adapter?: Record<string, unknown>;
  } = {},
): AgentRuntime {
  return {
    adapter: options.adapter ?? { db: {} },
    getServicesByType: () => services,
    ...(options.useGetService ? { getService: () => services[0] } : {}),
  } as AgentRuntime;
}

function runtimeWithCoreLogger(runtimeServices: unknown[] = []): AgentRuntime {
  return {
    adapter: { db: { execute: vi.fn() } },
    getServicesByType: () => runtimeServices,
  } as AgentRuntime;
}

function runtimeWithLegacyLogger(logger: unknown): AgentRuntime {
  return {
    adapter: { db: {} },
    getServicesByType: () => [logger],
  } as AgentRuntime;
}

function readResponse<T = unknown>(
  res: Parameters<typeof createMockHttpResponse>[0],
) {
  const body = (res as { _body?: string })._body ?? "";
  return body ? (JSON.parse(body) as T) : null;
}

describe("handleTrajectoryRoute", () => {
  beforeEach(() => {
    loadRowsMock.mockReset();
    deleteRowsMock.mockReset();
    clearRowsMock.mockReset();
    createZipArchiveMock.mockReset();
    createZipArchiveMock.mockReturnValue(Buffer.from("zip"));
  });

  it("returns false for unrelated routes", async () => {
    const runtime = makeRuntime([]);
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/unknown",
      }),
      res,
      runtime,
      "/api/unknown",
    );

    expect(handled).toBe(false);
    expect(getStatus()).toBe(200);
  });

  it("returns 503 when runtime adapter is unavailable", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories",
      }),
      res,
      {} as AgentRuntime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson()).toEqual({
      error:
        "Database not available. The agent may not be running or the database adapter is not initialized.",
    });
  });

  it("returns listed trajectories via legacy logger", async () => {
    const logger = makeLegacyLogger({
      listTrajectories: vi.fn().mockResolvedValue({
        trajectories: [
          {
            id: "trajectory-1",
            agentId: "agent-1",
            source: "runtime",
            status: "completed",
            startTime: 1,
            endTime: 100,
            durationMs: 99,
            stepCount: 1,
            llmCallCount: 1,
            totalPromptTokens: 12,
            totalCompletionTokens: 10,
            totalReward: 11,
            scenarioId: null,
            batchId: null,
            createdAt: "2026-02-16T00:00:00.000Z",
          },
        ],
        total: 1,
        offset: 0,
        limit: 50,
      }),
    });

    const { res, getStatus, getJson } = createMockHttpResponse<{
      trajectories: unknown[];
      total: number;
      offset: number;
      limit: number;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories",
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(logger.listTrajectories).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      source: undefined,
      status: undefined,
      startDate: undefined,
      endDate: undefined,
      search: undefined,
    });
    const payload = getJson();
    expect(payload.trajectories).toEqual([
      expect.objectContaining({
        id: "trajectory-1",
        status: "completed",
        source: "runtime",
        roomId: null,
      }),
    ]);
  });

  it("resolves trajectory logger via getService compatibility path", async () => {
    const logger = makeLegacyLogger({
      listTrajectories: vi.fn().mockResolvedValue({
        trajectories: [],
        total: 0,
        offset: 0,
        limit: 50,
      }),
    });
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories",
      }),
      res,
      {
        adapter: { db: {} },
        getService: () => logger,
      } as unknown as AgentRuntime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
  });

  it("returns 503 when service candidates do not match trajectory logger", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories",
      }),
      res,
      {
        adapter: { db: {} },
        getServicesByType: () => [{}],
      } as unknown as AgentRuntime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("Trajectory logger service not available");
  });

  it("resolves single legacy logger candidate from getServicesByType", async () => {
    const logger = makeLegacyLogger({
      listTrajectories: vi.fn().mockResolvedValue({
        trajectories: [],
        total: 0,
        offset: 0,
        limit: 50,
      }),
    });
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories",
      }),
      res,
      {
        adapter: { db: {} },
        getServicesByType: () => logger,
      } as unknown as AgentRuntime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
  });

  it("skips invalid service candidates returned by getServicesByType", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories",
      }),
      res,
      {
        adapter: { db: {} },
        getServicesByType: () => "invalid",
      } as unknown as AgentRuntime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("Trajectory logger service not available");
  });

  it("returns 503 when trajectory logger service is missing for list", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories",
      }),
      res,
      {
        adapter: { db: {} },
        getServicesByType: () => [],
      } as unknown as AgentRuntime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("Trajectory logger service not available");
  });

  it("passes query filters to legacy trajectory list", async () => {
    const logger = makeLegacyLogger({
      listTrajectories: vi.fn().mockResolvedValue({
        trajectories: [],
        total: 0,
        offset: 5,
        limit: 10,
      }),
    });

    const { res } = createMockHttpResponse();
    await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories?limit=10&offset=5&source=chat&status=error&startDate=2026-01-01&endDate=2026-01-31&search=abc",
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories",
    );

    expect(logger.listTrajectories).toHaveBeenCalledWith({
      limit: 10,
      offset: 5,
      source: "chat",
      status: "error",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      search: "abc",
    });
  });

  it("returns runtime stats via legacy logger", async () => {
    const logger = makeLegacyLogger({
      getStats: vi.fn().mockResolvedValue({
        totalTrajectories: 2,
        totalLlmCalls: 3,
        totalPromptTokens: 9,
        totalCompletionTokens: 4,
        averageDurationMs: 400,
        bySource: { runtime: 2 },
        byModel: { "gpt-4": 2 },
      }),
    });
    const { res, getJson } = createMockHttpResponse<{
      totalTrajectories: number;
      totalProviderAccesses: number;
      bySource: Record<string, number>;
      byModel: Record<string, number>;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/stats",
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/stats",
    );

    expect(handled).toBe(true);
    expect(getJson()).toMatchObject({
      totalTrajectories: 2,
      totalLlmCalls: 3,
      totalProviderAccesses: 0,
      bySource: {},
      byModel: {},
    });
  });

  it("returns 503 when trajectory logger service is missing for stats", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/stats",
      }),
      res,
      {
        adapter: { db: {} },
        getServicesByType: () => [],
      } as unknown as AgentRuntime,
      "/api/trajectories/stats",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("Trajectory logger service not available");
  });

  it("hydrates logging config and forces enabled state", async () => {
    let enabled = false;
    const logger = makeLegacyLogger({
      isEnabled: vi.fn(() => enabled),
      setEnabled: vi.fn((value: boolean) => {
        enabled = value;
      }),
    });
    const { res, getJson } = createMockHttpResponse<{ enabled: boolean }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/config",
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/config",
    );

    expect(handled).toBe(true);
    expect(logger.setEnabled).toHaveBeenCalledWith(true);
    expect(getJson()).toEqual({ enabled: true });
  });

  it("returns 503 when trajectory logger service is missing for config get", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/config",
      }),
      res,
      {
        adapter: { db: {} },
        getServicesByType: () => [],
      } as unknown as AgentRuntime,
      "/api/trajectories/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("Trajectory logger service not available");
  });

  it("enables logging during config update regardless of input", async () => {
    let enabled = false;
    const logger = makeLegacyLogger({
      isEnabled: vi.fn(() => enabled),
      setEnabled: vi.fn((value: boolean) => {
        enabled = value;
      }),
    });
    const { res, getJson } = createMockHttpResponse<{ enabled: boolean }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "PUT",
        url: "/api/trajectories/config",
        body: { enabled: false },
        json: true,
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/config",
    );

    expect(handled).toBe(true);
    expect(logger.setEnabled).toHaveBeenCalledWith(true);
    expect(getJson()).toEqual({ enabled: true });
  });

  it("returns 503 when trajectory logger service is missing for config update", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "PUT",
        url: "/api/trajectories/config",
        body: { enabled: false },
        json: true,
      }),
      res,
      {
        adapter: { db: {} },
        getServicesByType: () => [],
      } as unknown as AgentRuntime,
      "/api/trajectories/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("Trajectory logger service not available");
  });

  it("returns error for non-object export body", async () => {
    const logger = makeLegacyLogger({
      exportTrajectories: vi.fn(),
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: "not-json",
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson().error).toBe("Invalid JSON in request body");
  });

  it("returns format validation error for invalid export format", async () => {
    const logger = makeLegacyLogger({
      exportTrajectories: vi.fn(),
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: { format: "bogus" },
        json: true,
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "Format must be 'json', 'csv', 'art', or 'zip'",
    });
  });

  it("returns 503 when trajectory logger service is missing for export", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: { format: "json" },
        json: true,
      }),
      res,
      {
        adapter: { db: {} },
        getServicesByType: () => [],
      } as unknown as AgentRuntime,
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("Trajectory logger service not available");
  });

  it("streams JSON export payload from logger export", async () => {
    const logger = makeLegacyLogger({
      exportTrajectories: vi.fn().mockResolvedValue({
        data: JSON.stringify({ x: 1 }),
        filename: "trajectories.json",
        mimeType: "application/json",
      }),
    });
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: { format: "json" },
        json: true,
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect((res as unknown as { _body: string })._body).toBe(
      JSON.stringify({ x: 1 }),
    );
    expect(logger.exportTrajectories).toHaveBeenCalledWith({
      format: "json",
      includePrompts: undefined,
      trajectoryIds: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  });

  it("streams ZIP export payload and uses zip archive helper", async () => {
    const logger = makeLegacyLogger({
      isEnabled: vi.fn(() => true),
      listTrajectories: vi.fn().mockResolvedValue({
        trajectories: [
          {
            id: "trajectory-1",
            agentId: "agent-1",
            source: "runtime",
            status: "completed",
            startTime: 1,
            endTime: 101,
            durationMs: 100,
            stepCount: 1,
            llmCallCount: 1,
            totalPromptTokens: 9,
            totalCompletionTokens: 1,
            totalReward: 2,
            scenarioId: null,
            batchId: null,
            createdAt: "2026-02-16T00:00:00.000Z",
          },
        ],
        total: 1,
        offset: 0,
        limit: 1,
      }),
      getTrajectoryDetail: vi.fn().mockResolvedValue({
        trajectoryId: "trajectory-1",
        agentId: "agent-1",
        startTime: 1,
        endTime: 101,
        durationMs: 100,
        steps: [],
        totalReward: 2,
        metrics: { episodeLength: 1, finalStatus: "completed" },
        metadata: { source: "runtime" },
      }),
    });
    createZipArchiveMock.mockReturnValue(Buffer.from("zip-bytes"));

    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: { format: "zip" },
        json: true,
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(createZipArchiveMock).toHaveBeenCalled();
    expect((res as unknown as { _body: string })._body).toBe(
      String(Buffer.from("zip-bytes")),
    );
  });

  it("deduplicates and trims trajectoryIds for zip export", async () => {
    const logger = makeLegacyLogger({
      isEnabled: vi.fn(() => true),
      getTrajectoryDetail: vi.fn().mockResolvedValue({
        trajectoryId: "trajectory-1",
        agentId: "agent-1",
        startTime: 1,
        endTime: 101,
        durationMs: 100,
        steps: [],
        totalReward: 2,
        metrics: { episodeLength: 1, finalStatus: "completed" },
        metadata: { source: "runtime" },
      }),
    });
    createZipArchiveMock.mockImplementation((entries) =>
      Buffer.from(JSON.stringify(entries)),
    );

    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: {
          format: "zip",
          trajectoryIds: ["  trajectory-1 ", "", "trajectory-1"],
        },
        json: true,
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect((res as unknown as { _body: string })._body).toContain(
      "trajectory-1",
    );
    expect(logger.getTrajectoryDetail).toHaveBeenCalledTimes(1);
    expect(logger.getTrajectoryDetail).toHaveBeenCalledWith("trajectory-1");
    expect(logger.listTrajectories).not.toHaveBeenCalled();
    const entries = JSON.parse(
      (res as unknown as { _body: string })._body,
    ) as Array<{ name: string; data: string }>;
    const manifest = entries.find((entry) => entry.name === "manifest.json");
    expect(manifest).toBeDefined();
    const payload = JSON.parse(manifest?.data ?? "{}");
    expect(payload.requestedTrajectoryCount).toBe(1);
    expect(payload.exportedTrajectoryCount).toBe(1);
    expect(payload.missingTrajectoryIds).toEqual([]);
  });

  it("records missing trajectories during zip export", async () => {
    const logger = makeLegacyLogger({
      isEnabled: vi.fn(() => true),
      listTrajectories: vi.fn().mockResolvedValue({
        trajectories: [
          {
            id: "trajectory-missing",
            agentId: "agent-1",
            source: "runtime",
            status: "completed",
            startTime: 1,
            endTime: 101,
            durationMs: 100,
            stepCount: 1,
            llmCallCount: 0,
            totalPromptTokens: 9,
            totalCompletionTokens: 1,
            totalReward: 2,
            scenarioId: null,
            batchId: null,
            createdAt: "2026-02-16T00:00:00.000Z",
          },
        ],
        total: 1,
        offset: 0,
        limit: 1,
      }),
      getTrajectoryDetail: vi.fn().mockResolvedValue(null),
    });
    createZipArchiveMock.mockImplementation((entries) =>
      Buffer.from(JSON.stringify(entries)),
    );

    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: {
          format: "zip",
        },
        json: true,
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    const entries = JSON.parse(
      (res as unknown as { _body: string })._body,
    ) as Array<{ name: string; data: string }>;
    const manifest = entries.find((entry) => entry.name === "manifest.json");
    const payload = JSON.parse(manifest?.data ?? "{}");
    expect(payload.requestedTrajectoryCount).toBe(1);
    expect(payload.exportedTrajectoryCount).toBe(0);
    expect(payload.missingTrajectoryIds).toEqual(["trajectory-missing"]);
  });

  it("returns 404 when trajectory detail is missing", async () => {
    const logger = makeLegacyLogger({
      getTrajectoryDetail: vi.fn().mockResolvedValue(null),
    });
    const { res, getJson } = createMockHttpResponse<{ error: string }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/ghost",
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/ghost",
    );

    expect(handled).toBe(true);
    expect(getJson().error).toBe(`Trajectory "ghost" not found`);
  });

  it("loads trajectory detail with fallback SQL-backed steps", async () => {
    const logger = makeLegacyLogger({
      getTrajectoryDetail: vi.fn().mockResolvedValue({
        trajectoryId: "trajectory-1",
        agentId: "agent-1",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        steps: [],
        totalReward: 2,
        metrics: { episodeLength: 1, finalStatus: "completed" },
        metadata: { source: "runtime" },
      }),
      executeRawSql: vi.fn().mockResolvedValue({
        rows: [
          {
            steps_json: JSON.stringify([
              {
                stepId: "from-sql",
                stepNumber: 0,
                timestamp: 1500,
                llmCalls: [
                  {
                    callId: "sql-call",
                    timestamp: 1500,
                    model: "gpt-4",
                    systemPrompt: "sys",
                    userPrompt: "hi",
                    response: "ok",
                    temperature: 0.1,
                    maxTokens: 100,
                    purpose: "query",
                    actionType: "completion",
                    promptTokens: 3,
                    completionTokens: 4,
                    latencyMs: 10,
                  },
                ],
              },
            ]),
          },
        ],
      }),
    });
    const { res } = createMockHttpResponse();

    await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/trajectory-1",
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/trajectory-1",
    );

    const payload = readResponse<{ llmCalls: Array<{ id: string }> }>(res);
    expect(payload?.llmCalls?.[0]?.id).toBe("sql-call");
  });

  it("loads trajectory detail with nested steps object from SQL fallback", async () => {
    const logger = makeLegacyLogger({
      getTrajectoryDetail: vi.fn().mockResolvedValue({
        trajectoryId: "trajectory-1",
        agentId: "agent-1",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        steps: [],
        totalReward: 2,
        metrics: { episodeLength: 1, finalStatus: "completed" },
        metadata: { source: "runtime" },
      }),
      executeRawSql: vi.fn().mockResolvedValue({
        rows: [
          {
            steps_json: JSON.stringify({
              steps: [
                {
                  stepId: "from-sql-nested",
                  stepNumber: 0,
                  timestamp: 1500,
                  llmCalls: [
                    {
                      callId: "sql-nested-call",
                      timestamp: 1500,
                      model: "gpt-4",
                      systemPrompt: "sys",
                      userPrompt: "hi",
                      response: "ok",
                      temperature: 0.1,
                      maxTokens: 100,
                      purpose: "query",
                      actionType: "completion",
                      promptTokens: 3,
                      completionTokens: 4,
                      latencyMs: 10,
                    },
                  ],
                },
              ],
            }),
          },
        ],
      }),
    });
    const { res } = createMockHttpResponse();

    await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/trajectory-1",
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/trajectory-1",
    );

    const payload = readResponse<{ llmCalls: Array<{ id: string }> }>(res);
    expect(payload?.llmCalls?.[0]?.id).toBe("sql-nested-call");
  });

  it("keeps original trajectory when SQL fallback has malformed JSON", async () => {
    const logger = makeLegacyLogger({
      getTrajectoryDetail: vi.fn().mockResolvedValue({
        trajectoryId: "trajectory-1",
        agentId: "agent-1",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        steps: [],
        totalReward: 2,
        metrics: { episodeLength: 1, finalStatus: "completed" },
        metadata: { source: "runtime" },
      }),
      executeRawSql: vi.fn().mockResolvedValue({
        rows: [{ steps_json: "{not-json}" }],
      }),
    });
    const { res } = createMockHttpResponse();

    await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/trajectory-1",
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/trajectory-1",
    );

    const payload = readResponse<{ llmCalls: Array<{ id: string }> }>(res);
    expect(payload?.llmCalls?.length).toBe(0);
  });

  it("ignores SQL fallback steps payload with missing steps array", async () => {
    const logger = makeLegacyLogger({
      getTrajectoryDetail: vi.fn().mockResolvedValue({
        trajectoryId: "trajectory-1",
        agentId: "agent-1",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        steps: [],
        totalReward: 2,
        metrics: { episodeLength: 1, finalStatus: "completed" },
        metadata: { source: "runtime" },
      }),
      executeRawSql: vi.fn().mockResolvedValue({
        rows: [{ steps_json: JSON.stringify({ notSteps: [] }) }],
      }),
    });
    const { res } = createMockHttpResponse();

    await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/trajectory-1",
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/trajectory-1",
    );

    const payload = readResponse<{ llmCalls: Array<{ id: string }> }>(res);
    expect(payload?.llmCalls?.length).toBe(0);
  });

  it("includes provider access entries when transforming trajectory detail", async () => {
    const logger = makeLegacyLogger({
      getTrajectoryDetail: vi.fn().mockResolvedValue({
        trajectoryId: "trajectory-1",
        agentId: "agent-1",
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        steps: [
          {
            stepId: "step-1",
            stepNumber: 0,
            timestamp: 1500,
            llmCalls: [],
            providerAccesses: [
              {
                providerId: "provider-1",
                providerName: "provider-x",
                timestamp: 1501,
                data: { model: "local" },
                query: { action: "query" },
                purpose: "search",
              },
            ],
          },
        ],
        totalReward: 3,
        metrics: {
          episodeLength: 1,
          finalStatus: "completed",
        },
        metadata: { source: "runtime" },
      }),
    });
    const { res } = createMockHttpResponse();

    await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/trajectory-1",
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories/trajectory-1",
    );

    const payload = readResponse<{
      providerAccesses: Array<{ id: string; providerName: string }>;
    }>(res);
    expect(payload?.providerAccesses?.[0]?.id).toBe("provider-1");
    expect(payload?.providerAccesses?.[0]?.providerName).toBe("provider-x");
  });

  it("returns 503 when trajectory logger service is missing for trajectory detail", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/ghost",
      }),
      res,
      {
        adapter: { db: {} },
        getServicesByType: () => [],
      } as unknown as AgentRuntime,
      "/api/trajectories/ghost",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("Trajectory logger service not available");
  });

  it("deletes specific trajectories", async () => {
    const logger = makeLegacyLogger({
      deleteTrajectories: vi.fn().mockResolvedValue(3),
    });
    const { res, getJson } = createMockHttpResponse<{ deleted: number }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "DELETE",
        url: "/api/trajectories",
        body: { trajectoryIds: ["trajectory-1", "trajectory-2"] },
        json: true,
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(logger.deleteTrajectories).toHaveBeenCalledWith([
      "trajectory-1",
      "trajectory-2",
    ]);
    expect(getJson()).toEqual({ deleted: 3 });
  });

  it("clears all trajectories when clearAll is true", async () => {
    const logger = makeLegacyLogger({
      clearAllTrajectories: vi.fn().mockResolvedValue(9),
    });
    const { res, getJson } = createMockHttpResponse<{ deleted: number }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "DELETE",
        url: "/api/trajectories",
        body: { clearAll: true },
        json: true,
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(logger.clearAllTrajectories).toHaveBeenCalled();
    expect(getJson()).toEqual({ deleted: 9 });
  });

  it("returns request validation error when delete payload is invalid", async () => {
    const logger = makeLegacyLogger({});
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "DELETE",
        url: "/api/trajectories",
        body: {},
        json: true,
      }),
      res,
      runtimeWithLegacyLogger(logger),
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
  });

  it("returns 503 when trajectory logger service is missing for delete", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "DELETE",
        url: "/api/trajectories",
        body: { trajectoryIds: ["trajectory-1"] },
        json: true,
      }),
      res,
      {
        adapter: { db: {} },
        getServicesByType: () => [],
      } as unknown as AgentRuntime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("Trajectory logger service not available");
  });

  it("loads core logger from core runtime services", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-1",
          source: "runtime",
          status: "completed",
          metadata: { source: "runtime" },
          steps_json: JSON.stringify([
            {
              stepId: "core-step",
              llmCalls: [
                {
                  callId: "core-call",
                  timestamp: 1_700_000_000_100,
                  model: "gpt-4",
                  systemPrompt: "system",
                  userPrompt: "hello",
                  response: "world",
                  temperature: 0.2,
                  maxTokens: 60,
                  purpose: "query",
                  actionType: "completion",
                  promptTokens: 4,
                  completionTokens: 5,
                  latencyMs: 11,
                },
              ],
              providerAccesses: [],
            },
          ]),
        },
      ]),
    );

    const coreLogger = {
      getLlmCallLogs: vi.fn(),
      getProviderAccessLogs: vi.fn(),
    };
    const runtime = runtimeWithCoreLogger([coreLogger]);
    const { res, getJson } = createMockHttpResponse<{
      trajectories: Array<{ id: string; llmCallCount: number }>;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories?limit=1&offset=0",
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(loadRowsMock).toHaveBeenCalled();
    expect(getJson().trajectories[0].id).toBe("core-1");
    expect(getJson().trajectories[0].llmCallCount).toBe(1);
  });

  it("filters persisted core trajectories by endDate and search", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-filter-match",
          source: "chat",
          status: "completed",
          start_time: 1_700_000_000_000,
          metadata: { source: "chat" },
          steps_json: JSON.stringify([
            {
              stepId: "core-match-step",
              stepNumber: 1,
              timestamp: 1_700_000_000_001,
              llmCalls: [
                {
                  callId: "core-match-call",
                  timestamp: 1_700_000_000_001,
                  model: "gpt-4o-mini",
                  systemPrompt: "system prompt",
                  userPrompt: "trace search token",
                  response: "search result",
                  temperature: 0.2,
                  maxTokens: 64,
                  purpose: "query",
                  actionType: "completion",
                  promptTokens: 11,
                  completionTokens: 9,
                  latencyMs: 22,
                },
              ],
            },
          ]),
        },
        {
          trajectory_id: "core-filter-no-match",
          source: "runtime",
          status: "completed",
          start_time: 1_700_000_010_000,
          metadata: { source: "runtime" },
          steps_json: JSON.stringify([
            {
              stepId: "core-no-match-step",
              stepNumber: 1,
              timestamp: 1_700_000_010_001,
              llmCalls: [
                {
                  callId: "core-no-match-call",
                  timestamp: 1_700_000_010_001,
                  model: "gpt-4o-mini",
                  systemPrompt: "system prompt",
                  userPrompt: "other text",
                  response: "other reply",
                  temperature: 0.2,
                  maxTokens: 64,
                  purpose: "query",
                  actionType: "completion",
                  promptTokens: 8,
                  completionTokens: 7,
                  latencyMs: 18,
                },
              ],
            },
          ]),
        },
      ]),
    );
    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const endDate = new Date(1_700_000_005_000).toISOString();
    const { res, getJson } = createMockHttpResponse<{
      trajectories: Array<{
        id: string;
        llmCallCount: number;
      }>;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: `/api/trajectories?endDate=${encodeURIComponent(endDate)}&search=trace`,
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getJson().trajectories).toHaveLength(1);
    expect(getJson().trajectories[0].id).toBe("core-filter-match");
  });

  it("filters persisted core trajectories by startDate", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-start-old",
          source: "chat",
          status: "completed",
          start_time: 1_700_000_000_000,
        },
        {
          trajectory_id: "core-start-new",
          source: "chat",
          status: "completed",
          start_time: 1_700_000_005_000,
        },
      ]),
    );
    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const startDate = new Date(1_700_000_002_500).toISOString();
    const { res, getJson } = createMockHttpResponse<{
      trajectories: Array<{ id: string }>;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: `/api/trajectories?startDate=${encodeURIComponent(startDate)}`,
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getJson().trajectories.map((row) => row.id)).toEqual([
      "core-start-new",
    ]);
  });

  it("filters persisted core trajectories by status and source", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-status-completed",
          source: "chat",
          status: "completed",
          start_time: 1_700_000_000_000,
        },
        {
          trajectory_id: "core-status-active",
          source: "runtime",
          status: "active",
          start_time: 1_700_000_010_000,
          end_time: 1_700_000_010_000,
        },
        {
          trajectory_id: "core-source-chat-active",
          source: "chat",
          status: "active",
          start_time: 1_700_000_020_000,
          end_time: 1_700_000_020_000,
        },
      ]),
    );
    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getJson } = createMockHttpResponse<{
      trajectories: Array<{ id: string; source: string }>;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories?status=active&source=chat",
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getJson().trajectories).toEqual([
      expect.objectContaining({
        id: "core-source-chat-active",
        source: "chat",
      }),
    ]);
  });

  it("coerces numeric core trajectory fields into text form", async () => {
    loadRowsMock.mockResolvedValue([
      {
        trajectory_id: 456 as unknown as string,
        agent_id: 99 as unknown as string,
        source: "runtime",
        status: "completed",
        start_time: 1_700_000_005_000,
        steps_json: JSON.stringify([
          {
            stepId: "core-coerce-step",
            stepNumber: 1,
            timestamp: 1_700_000_005_100,
            llmCalls: [
              {
                callId: "core-coerce-call",
                timestamp: 1_700_000_005_101,
                model: 42 as unknown as string,
                systemPrompt: true as unknown as string,
                userPrompt: false as unknown as string,
                response: 1.23 as unknown as string,
                temperature: 0.2,
                maxTokens: 64,
                purpose: 1 as unknown as string,
                actionType: false as unknown as string,
                promptTokens: 11,
                completionTokens: 9,
                latencyMs: 22,
              },
            ],
          },
        ]),
      } as unknown as TrajectoryRecordCandidate,
    ]);
    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getJson } = createMockHttpResponse<{
      trajectories: Array<{
        id: string;
        agentId: string;
        llmCallCount: number;
      }>;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories?limit=1&offset=0",
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getJson().trajectories[0]).toEqual(
      expect.objectContaining({
        id: "456",
        agentId: "99",
      }),
    );
  });

  it("parses numeric string timestamps when loading core trajectories", async () => {
    loadRowsMock.mockResolvedValue([
      {
        trajectory_id: "core-string-start",
        source: "runtime",
        status: "completed",
        start_time: "1700000000123",
        end_time: "1700000000456",
        steps_json: JSON.stringify([
          {
            stepId: "core-string-step",
            stepNumber: 1,
            timestamp: 1_700_000_001_123,
            llmCalls: [
              {
                callId: "core-string-call",
                timestamp: 1_700_000_001_123,
                model: { value: "text-embedding-3-small" },
                systemPrompt: { text: "system" },
                userPrompt: {},
                response: { text: "reply" },
                temperature: 0.2,
                maxTokens: 64,
                purpose: { type: "query" },
                actionType: [],
                promptTokens: 11,
                completionTokens: 9,
                latencyMs: 22,
              },
            ],
          },
        ]),
      } as unknown as TrajectoryRecordCandidate,
    ]);
    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getJson } = createMockHttpResponse<{
      trajectories: Array<{ id: string; agentId: string }>;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories?limit=1&offset=0",
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getJson().trajectories[0]).toEqual(
      expect.objectContaining({
        id: "core-string-start",
      }),
    );
  });

  it("returns empty trajectories when search finds no matches", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-no-search-match",
          source: "chat",
          status: "completed",
          metadata: { source: "chat" },
          steps_json: JSON.stringify([
            {
              stepId: "core-no-match-step",
              stepNumber: 1,
              timestamp: 1_700_000_000_001,
              llmCalls: [
                {
                  callId: "core-no-search-call",
                  timestamp: 1_700_000_000_001,
                  model: "gpt-4o-mini",
                  systemPrompt: "system prompt",
                  userPrompt: "unrelated context",
                  response: "plain response",
                  temperature: 0.2,
                  maxTokens: 64,
                  purpose: "query",
                  actionType: "completion",
                  promptTokens: 4,
                  completionTokens: 3,
                  latencyMs: 11,
                },
              ],
            },
          ]),
        },
      ]),
    );
    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getJson } = createMockHttpResponse<{
      trajectories: Array<{ id: string }>;
      total: number;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: `/api/trajectories?search=${encodeURIComponent("completely-missing")}`,
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getJson().trajectories).toHaveLength(0);
    expect(getJson().total).toBe(0);
  });

  it("uses fallback source from row.source when metadata lacks source", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-metadata-fallback",
          source: "db-source",
          status: "completed",
          metadata: { source: "" },
          start_time: 1_700_000_020_000,
        },
      ]),
    );
    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getJson } = createMockHttpResponse<{
      trajectories: Array<{ id: string; source: string }>;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories?limit=5&offset=0",
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getJson().trajectories[0].source).toBe("db-source");
    expect(getJson().trajectories[0].id).toBe("core-metadata-fallback");
  });

  it("uses core logger stats path and core trajectory persistence", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-stats",
          source: "runtime",
          status: "completed",
          end_time: 1_700_000_001_100,
          metadata: { source: "runtime" },
        },
      ]),
    );

    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getJson } = createMockHttpResponse<{
      totalTrajectories: number;
      totalLlmCalls: number;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/stats",
      }),
      res,
      runtime,
      "/api/trajectories/stats",
    );

    expect(handled).toBe(true);
    expect(loadRowsMock).toHaveBeenCalled();
    expect(getJson().totalTrajectories).toBe(1);
    expect(getJson().totalLlmCalls).toBe(1);
  });

  it("returns 503 when core logger candidate lacks runtime db.execute support", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();
    const runtime = {
      adapter: { db: {} },
      getServicesByType: () => [
        { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
      ],
    } as unknown as AgentRuntime;

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories",
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("Trajectory logger service not available");
  });

  it("does not count embedding-only calls while filtering core trajectories", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-embed",
          source: "runtime",
          status: "completed",
          steps_json: JSON.stringify([
            {
              stepId: "core-embed-step",
              stepNumber: 1,
              timestamp: 1_700_000_000_001,
              llmCalls: [
                {
                  callId: "core-embed-call",
                  timestamp: 1_700_000_000_001,
                  model: "text-embedding-3-small",
                  systemPrompt: "system prompt",
                  userPrompt: "",
                  response: "[0.01,0.02,0.03,0.04,0.05,0.06,0.07,0.08]",
                  temperature: 0.2,
                  maxTokens: 64,
                  purpose: "embedding",
                  actionType: "embedding",
                  promptTokens: 0,
                  completionTokens: 0,
                  latencyMs: 12,
                },
              ],
            },
          ]),
        },
      ]),
    );
    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getJson } = createMockHttpResponse<{
      trajectories: Array<{ llmCallCount: number; id: string }>;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories?limit=10&offset=0",
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getJson().trajectories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "core-embed",
          llmCallCount: 0,
        }),
      ]),
    );
  });

  it("exports core trajectories as CSV", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-csv",
          source: "runtime",
          status: "completed",
          metadata: { source: "runtime", roomId: "room-1" },
          total_prompt_tokens: 3,
          total_completion_tokens: 4,
          llm_call_count: 2,
        },
      ]),
    );

    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: { format: "csv" },
        json: true,
      }),
      res,
      runtime,
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    const body = (res as unknown as { _body: string })._body;
    expect(body).toContain("id,agentId,source,status,startTime");
    expect(body).toContain("core-csv");
  });

  it("deletes selected core trajectories by id", async () => {
    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    deleteRowsMock.mockResolvedValue(2);
    const { res, getJson } = createMockHttpResponse<{ deleted: number }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "DELETE",
        url: "/api/trajectories",
        body: { trajectoryIds: ["core-a", "core-b"] },
        json: true,
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(deleteRowsMock).toHaveBeenCalledWith(expect.anything(), [
      "core-a",
      "core-b",
    ]);
    expect(getJson()).toEqual({ deleted: 2 });
  });

  it("exports core trajectories as ART with prompts excluded", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-art",
          source: "runtime",
          status: "completed",
          metadata: { source: "runtime" },
          steps_json: JSON.stringify([
            {
              stepId: "core-step",
              llmCalls: [
                {
                  callId: "core-call",
                  timestamp: 1_700_000_000_100,
                  model: "gpt-4",
                  systemPrompt: "system",
                  userPrompt: "hello",
                  response: "world",
                  temperature: 0.2,
                  maxTokens: 60,
                  purpose: "query",
                  actionType: "completion",
                  promptTokens: 4,
                  completionTokens: 5,
                  latencyMs: 11,
                },
              ],
              providerAccesses: [],
            },
          ]),
        },
      ]),
    );

    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: { format: "art", includePrompts: false },
        json: true,
      }),
      res,
      runtime,
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    const body = (res as unknown as { _body: string })._body;
    expect(body).toContain('"messages"');
    expect(body).toContain('"metadata":');
  });

  it("exports filtered core trajectories as JSON", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-json-1",
          source: "runtime",
          status: "completed",
          metadata: { source: "runtime" },
        },
        {
          trajectory_id: "core-json-2",
          source: "runtime",
          status: "completed",
          metadata: { source: "runtime" },
        },
      ]),
    );

    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: { format: "json", trajectoryIds: ["core-json-2"] },
        json: true,
      }),
      res,
      runtime,
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    const body = (res as unknown as { _body: string })._body;
    const payload = JSON.parse(body);
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload[0].trajectoryId ?? payload[0].id).toBe("core-json-2");
  });

  it("returns core trajectory detail", async () => {
    loadRowsMock.mockResolvedValue(
      makePersistedRows([
        {
          trajectory_id: "core-detail",
          source: "runtime",
          status: "completed",
          metadata: { source: "runtime", roomId: "room-3" },
        },
      ]),
    );
    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getJson } = createMockHttpResponse<{
      trajectory: { id: string };
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/core-detail",
      }),
      res,
      runtime,
      "/api/trajectories/core-detail",
    );

    expect(handled).toBe(true);
    expect(getJson().trajectory?.id).toBe("core-detail");
  });

  it("deletes persisted core trajectories via clear-all path", async () => {
    clearRowsMock.mockResolvedValue(4);
    const runtime = runtimeWithCoreLogger([
      { getLlmCallLogs: vi.fn(), getProviderAccessLogs: vi.fn() },
    ]);
    const { res, getJson } = createMockHttpResponse<{ deleted: number }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "DELETE",
        url: "/api/trajectories",
        body: { clearAll: true },
        json: true,
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(clearRowsMock).toHaveBeenCalled();
    expect(getJson().deleted).toBe(4);
  });
});
