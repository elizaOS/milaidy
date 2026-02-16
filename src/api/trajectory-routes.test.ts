import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearPersistedTrajectoryRows,
  deletePersistedTrajectoryRows,
  loadPersistedTrajectoryRows,
} from "../runtime/trajectory-persistence";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
  createMockJsonRequest,
} from "../test-support/test-helpers";
import { handleTrajectoryRoute } from "./trajectory-routes";

vi.mock("../runtime/trajectory-persistence", () => ({
  loadPersistedTrajectoryRows: vi.fn(),
  deletePersistedTrajectoryRows: vi.fn(),
  clearPersistedTrajectoryRows: vi.fn(),
}));

type InvokeResult = {
  handled: boolean;
  status: number;
  body: string;
  res: http.ServerResponse & { _status: number; _body: string };
};

type InvokeArgs = {
  method: string;
  pathname: string;
  url?: string;
  body?: unknown;
  runtime: AgentRuntime | null;
};

async function invokeRoute({
  method,
  pathname,
  url,
  body,
  runtime,
}: InvokeArgs): Promise<InvokeResult> {
  const req =
    body !== undefined
      ? createMockJsonRequest(body, { method, url: url ?? pathname })
      : createMockIncomingMessage({ method, url: url ?? pathname });
  const { res, getStatus } = createMockHttpResponse();
  const handled = await handleTrajectoryRoute(req, res, runtime, pathname);
  return { handled, status: getStatus(), body: res._body, res };
}

function parseJson<T>(body: string): T {
  return JSON.parse(body) as T;
}

function buildLegacyLogger(overrides: Record<string, unknown> = {}) {
  const state = { enabled: true };
  return {
    isEnabled: vi.fn(() => state.enabled),
    setEnabled: vi.fn((enabled) => {
      state.enabled = Boolean(enabled);
    }),
    listTrajectories: vi.fn().mockResolvedValue({
      trajectories: [],
      total: 0,
      offset: 0,
      limit: 50,
    }),
    getTrajectoryDetail: vi.fn().mockResolvedValue(null),
    getStats: vi.fn().mockResolvedValue({
      totalTrajectories: 0,
      totalSteps: 0,
      totalLlmCalls: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      averageDurationMs: 0,
      averageReward: 0,
      bySource: {},
      byStatus: {},
      byScenario: {},
    }),
    deleteTrajectories: vi.fn().mockResolvedValue(0),
    clearAllTrajectories: vi.fn().mockResolvedValue(0),
    exportTrajectories: vi.fn().mockResolvedValue({
      data: "[]",
      filename: "trajectories.json",
      mimeType: "application/json",
    }),
    ...overrides,
  };
}

describe("trajectory routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns false for unrelated paths", async () => {
    const runtime = { adapter: {} } as AgentRuntime;
    const result = await invokeRoute({
      method: "GET",
      pathname: "/api/status",
      runtime,
    });

    expect(result.handled).toBe(false);
  });

  test("returns 503 when runtime adapter is missing", async () => {
    const result = await invokeRoute({
      method: "GET",
      pathname: "/api/trajectories",
      runtime: {} as AgentRuntime,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(503);
    expect(parseJson<{ error: string }>(result.body).error).toMatch(
      /Database not available/i,
    );
  });

  test("lists trajectories and normalizes timeout status", async () => {
    const logger = buildLegacyLogger({
      listTrajectories: vi.fn().mockResolvedValue({
        trajectories: [
          {
            id: "traj-1",
            agentId: "agent-1",
            source: "cli",
            status: "timeout",
            startTime: 10,
            endTime: 20,
            durationMs: 10,
            stepCount: 1,
            llmCallCount: 2,
            totalPromptTokens: 5,
            totalCompletionTokens: 6,
            totalReward: 0,
            scenarioId: null,
            batchId: null,
            createdAt: new Date(0).toISOString(),
          },
        ],
        total: 1,
        offset: 0,
        limit: 50,
      }),
    });

    const runtime = {
      adapter: {},
      getServicesByType: vi.fn(() => [logger]),
    } as unknown as AgentRuntime;

    const result = await invokeRoute({
      method: "GET",
      pathname: "/api/trajectories",
      url: "/api/trajectories?limit=10&offset=0",
      runtime,
    });

    const payload = parseJson<{
      trajectories: Array<{ id: string; status: string }>;
      total: number;
    }>(result.body);

    expect(result.status).toBe(200);
    expect(logger.listTrajectories).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 0 }),
    );
    expect(payload.total).toBe(1);
    expect(payload.trajectories[0]?.status).toBe("error");
  });

  test("reports stats through UI shape", async () => {
    const logger = buildLegacyLogger({
      getStats: vi.fn().mockResolvedValue({
        totalTrajectories: 2,
        totalSteps: 3,
        totalLlmCalls: 4,
        totalPromptTokens: 5,
        totalCompletionTokens: 6,
        averageDurationMs: 7,
        averageReward: 0,
        bySource: { runtime: 2 },
        byStatus: { completed: 2 },
        byScenario: {},
      }),
    });

    const runtime = {
      adapter: {},
      getServicesByType: vi.fn(() => [logger]),
    } as unknown as AgentRuntime;

    const result = await invokeRoute({
      method: "GET",
      pathname: "/api/trajectories/stats",
      runtime,
    });

    const payload = parseJson<{ totalTrajectories: number; byModel: object }>(
      result.body,
    );

    expect(payload.totalTrajectories).toBe(2);
    expect(payload.byModel).toEqual({});
  });

  test("ensures logger stays enabled via config endpoints", async () => {
    const enabledState = { value: false };
    const logger = buildLegacyLogger({
      isEnabled: vi.fn(() => enabledState.value),
      setEnabled: vi.fn((enabled) => {
        enabledState.value = enabled;
      }),
    });

    const runtime = {
      adapter: {},
      getServicesByType: vi.fn(() => [logger]),
    } as unknown as AgentRuntime;

    const getResult = await invokeRoute({
      method: "GET",
      pathname: "/api/trajectories/config",
      runtime,
    });

    const getPayload = parseJson<{ enabled: boolean }>(getResult.body);
    expect(logger.setEnabled).toHaveBeenCalledWith(true);
    expect(getPayload.enabled).toBe(true);

    const putResult = await invokeRoute({
      method: "PUT",
      pathname: "/api/trajectories/config",
      runtime,
      body: { enabled: false },
    });

    const putPayload = parseJson<{ enabled: boolean }>(putResult.body);
    expect(logger.setEnabled).toHaveBeenCalledWith(true);
    expect(putPayload.enabled).toBe(true);
  });

  test("returns format error for invalid export request", async () => {
    const logger = buildLegacyLogger();
    const runtime = {
      adapter: {},
      getServicesByType: vi.fn(() => [logger]),
    } as unknown as AgentRuntime;

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/trajectories/export",
      runtime,
      body: { format: "xls" },
    });

    expect(result.status).toBe(400);
    expect(parseJson<{ error: string }>(result.body).error).toMatch(
      /Format must be/i,
    );
  });

  test("exports json via logger when requested", async () => {
    const logger = buildLegacyLogger({
      exportTrajectories: vi.fn().mockResolvedValue({
        data: '{"ok":true}',
        filename: "trajectories.json",
        mimeType: "application/json",
      }),
    });
    const runtime = {
      adapter: {},
      getServicesByType: vi.fn(() => [logger]),
    } as unknown as AgentRuntime;

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/trajectories/export",
      runtime,
      body: { format: "json" },
    });

    expect(result.status).toBe(200);
    expect(result.body).toBe('{"ok":true}');
    expect(logger.exportTrajectories).toHaveBeenCalled();
  });

  test("supports zip export with prompt redaction and fallback steps", async () => {
    const logger = buildLegacyLogger({
      getTrajectoryDetail: vi.fn().mockResolvedValue({
        trajectoryId: "my traj",
        agentId: "agent-zip",
        startTime: 0,
        endTime: 10,
        durationMs: 10,
        steps: [],
        totalReward: 0,
        metrics: { episodeLength: 1, finalStatus: "completed" },
        metadata: { source: "runtime" },
      }),
      executeRawSql: vi.fn().mockResolvedValue({
        rows: [
          {
            steps_json: JSON.stringify([
              {
                stepId: "step-1",
                llmCalls: [
                  {
                    callId: "call-1",
                    model: "gpt-4",
                    userPrompt: "secret",
                    response: "hidden",
                    promptTokens: 5,
                    completionTokens: 6,
                  },
                ],
              },
            ]),
          },
        ],
      }),
    });

    const runtime = {
      adapter: {},
      getServicesByType: vi.fn(() => [logger]),
    } as unknown as AgentRuntime;

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/trajectories/export",
      runtime,
      body: {
        format: "zip",
        includePrompts: false,
        trajectoryIds: ["my traj"],
      },
    });

    expect(result.status).toBe(200);
    const exported = Buffer.from(result.body, "binary").toString("utf8");
    expect(exported).toContain("manifest.json");
    expect(exported).toContain("my_traj/trajectory.json");
    expect(exported).toContain("[redacted]");
  });

  test("uses core logger path for persisted data filters", async () => {
    const coreLogger = {
      getLlmCallLogs: vi.fn(() => []),
      getProviderAccessLogs: vi.fn(() => []),
    };

    const runtime = {
      adapter: { db: { execute: vi.fn() } },
      getServicesByType: vi.fn(() => [coreLogger]),
    } as unknown as AgentRuntime;

    vi.mocked(loadPersistedTrajectoryRows).mockResolvedValue([
      {
        trajectory_id: "traj-needle",
        agent_id: "agent-1",
        start_time: 100,
        end_time: 200,
        status: "completed",
        steps_json: JSON.stringify([
          {
            stepId: "step-1",
            llmCalls: [
              {
                callId: "call-1",
                model: "embedding-model",
                userPrompt: "",
                response: "[array]",
                promptTokens: 1,
                completionTokens: 2,
              },
              {
                callId: "call-2",
                model: "gpt-4",
                userPrompt: "needle text",
                response: "answer",
                promptTokens: 3,
                completionTokens: 4,
              },
            ],
          },
        ]),
        metadata: JSON.stringify({ source: "runtime" }),
      },
    ]);

    const result = await invokeRoute({
      method: "GET",
      pathname: "/api/trajectories",
      url: "/api/trajectories?search=needle",
      runtime,
    });

    const payload = parseJson<{
      trajectories: Array<{ llmCallCount: number }>;
    }>(result.body);

    expect(payload.trajectories[0]?.llmCallCount).toBe(1);
  });

  test("deletes trajectories based on clearAll flag", async () => {
    const logger = buildLegacyLogger({
      clearAllTrajectories: vi.fn().mockResolvedValue(7),
    });
    const runtime = {
      adapter: {},
      getServicesByType: vi.fn(() => [logger]),
    } as unknown as AgentRuntime;

    const result = await invokeRoute({
      method: "DELETE",
      pathname: "/api/trajectories",
      runtime,
      body: { clearAll: true },
    });

    const payload = parseJson<{ deleted: number }>(result.body);
    expect(payload.deleted).toBe(7);
  });

  test("handles missing detail route", async () => {
    const logger = buildLegacyLogger({
      getTrajectoryDetail: vi.fn().mockResolvedValue(null),
    });
    const runtime = {
      adapter: {},
      getServicesByType: vi.fn(() => [logger]),
    } as unknown as AgentRuntime;

    const result = await invokeRoute({
      method: "GET",
      pathname: "/api/trajectories/unknown",
      runtime,
    });

    expect(result.status).toBe(404);
  });

  test("core logger delete path flows to persistence helpers", async () => {
    const coreLogger = {
      getLlmCallLogs: vi.fn(() => []),
      getProviderAccessLogs: vi.fn(() => []),
    };
    const runtime = {
      adapter: { db: { execute: vi.fn() } },
      getServicesByType: vi.fn(() => [coreLogger]),
    } as unknown as AgentRuntime;

    vi.mocked(deletePersistedTrajectoryRows).mockResolvedValue(4);

    const result = await invokeRoute({
      method: "DELETE",
      pathname: "/api/trajectories",
      runtime,
      body: { trajectoryIds: ["a", "b"] },
    });

    expect(result.status).toBe(200);
    expect(parseJson<{ deleted: number }>(result.body).deleted).toBe(4);
  });

  test("core logger clear-all flows to persistence helpers", async () => {
    const coreLogger = {
      getLlmCallLogs: vi.fn(() => []),
      getProviderAccessLogs: vi.fn(() => []),
    };
    const runtime = {
      adapter: { db: { execute: vi.fn() } },
      getServicesByType: vi.fn(() => [coreLogger]),
    } as unknown as AgentRuntime;

    vi.mocked(clearPersistedTrajectoryRows).mockResolvedValue(9);

    const result = await invokeRoute({
      method: "DELETE",
      pathname: "/api/trajectories",
      runtime,
      body: { clearAll: true },
    });

    expect(result.status).toBe(200);
    expect(parseJson<{ deleted: number }>(result.body).deleted).toBe(9);
  });
});
