import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MilaidyConfig } from "../config/types.js";
import { TrainingService } from "../services/training-service.js";
import { handleTrainingRoutes } from "./training-routes.js";

type JsonBody =
  | Record<string, string | number | boolean | null | undefined>
  | null
  | undefined;

interface RouteInvocationResult {
  handled: boolean;
  status: number;
  payload: object;
}

describe("training routes", () => {
  let runtime: AgentRuntime | null;
  let trainingService: TrainingService;

  beforeEach(() => {
    runtime = { character: { name: "Milaidy" } } as AgentRuntime;

    const config = {} as MilaidyConfig;
    trainingService = new TrainingService({
      getRuntime: () => runtime,
      getConfig: () => config,
      setConfig: () => undefined,
    });

    vi.spyOn(trainingService, "getStatus").mockReturnValue({
      runningJobs: 0,
      queuedJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      modelCount: 0,
      datasetCount: 0,
    });
    vi.spyOn(trainingService, "listTrajectories").mockResolvedValue({
      available: true,
      total: 1,
      trajectories: [
        {
          id: "traj-row-1",
          trajectoryId: "trajectory-1",
          agentId: "agent-1",
          archetype: "default",
          createdAt: new Date(0).toISOString(),
          totalReward: 1,
          aiJudgeReward: 1,
          episodeLength: 4,
          hasLlmCalls: true,
          llmCallCount: 2,
        },
      ],
    });
    vi.spyOn(trainingService, "getTrajectoryById").mockResolvedValue({
      id: "traj-row-1",
      trajectoryId: "trajectory-1",
      agentId: "agent-1",
      archetype: "default",
      createdAt: new Date(0).toISOString(),
      totalReward: 1,
      aiJudgeReward: 1,
      episodeLength: 4,
      hasLlmCalls: true,
      llmCallCount: 2,
      stepsJson: "[]",
      aiJudgeReasoning: null,
    });
    vi.spyOn(trainingService, "buildDataset").mockResolvedValue({
      id: "dataset-1",
      createdAt: new Date(0).toISOString(),
      jsonlPath: "/tmp/training-data.jsonl",
      trajectoryDir: "/tmp/trajectories",
      metadataPath: "/tmp/metadata.json",
      sampleCount: 10,
      trajectoryCount: 3,
    });
    vi.spyOn(trainingService, "listDatasets").mockReturnValue([]);
    vi.spyOn(trainingService, "startTrainingJob").mockResolvedValue({
      id: "job-1",
      createdAt: new Date(0).toISOString(),
      startedAt: new Date(0).toISOString(),
      completedAt: null,
      status: "running",
      phase: "starting",
      progress: 0.1,
      error: null,
      exitCode: null,
      signal: null,
      options: {},
      datasetId: "dataset-1",
      pythonRoot: "/tmp/python",
      scriptPath: "/tmp/train.py",
      outputDir: "/tmp/out",
      logPath: "/tmp/job.log",
      modelPath: null,
      adapterPath: null,
      modelId: null,
      logs: [],
    });
    vi.spyOn(trainingService, "listJobs").mockReturnValue([]);
    vi.spyOn(trainingService, "getJob").mockReturnValue(null);
    vi.spyOn(trainingService, "cancelJob").mockRejectedValue(
      new Error("not found"),
    );
    vi.spyOn(trainingService, "listModels").mockReturnValue([]);
    vi.spyOn(trainingService, "importModelToOllama").mockResolvedValue({
      id: "model-1",
      createdAt: new Date(0).toISOString(),
      jobId: "job-1",
      outputDir: "/tmp/out",
      modelPath: "/tmp/out/model",
      adapterPath: "/tmp/out/adapter",
      sourceModel: "qwen",
      backend: "cpu",
      ollamaModel: "milaidy-ft-model",
      active: false,
      benchmark: { status: "not_run", lastRunAt: null, output: null },
    });
    vi.spyOn(trainingService, "activateModel").mockResolvedValue({
      modelId: "model-1",
      providerModel: "ollama/milaidy-ft-model",
      needsRestart: true,
    });
    vi.spyOn(trainingService, "benchmarkModel").mockResolvedValue({
      status: "passed",
      output: "ok",
    });
  });

  async function invoke(params: {
    method: string;
    pathname: string;
    url?: string;
    body?: JsonBody;
    runtimeOverride?: AgentRuntime | null;
  }): Promise<RouteInvocationResult> {
    const response = { status: 0, payload: {} as object };
    const req = {
      url: params.url ?? params.pathname,
      headers: { host: "localhost:2138" },
    } as http.IncomingMessage;
    const res = {} as http.ServerResponse;

    const handled = await handleTrainingRoutes({
      req,
      res,
      method: params.method,
      pathname: params.pathname,
      runtime:
        params.runtimeOverride === undefined ? runtime : params.runtimeOverride,
      trainingService,
      readJsonBody: async () => params.body ?? null,
      json: (_res, data, status = 200) => {
        response.status = status;
        response.payload = data;
      },
      error: (_res, message, status = 400) => {
        response.status = status;
        response.payload = { error: message };
      },
    });

    return {
      handled,
      status: response.status,
      payload: response.payload,
    };
  }

  test("returns false for non-training paths", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });
    expect(result.handled).toBe(false);
  });

  test("returns training status with runtime flag", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/training/status",
    });
    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      runningJobs: 0,
      runtimeAvailable: true,
    });
  });

  test("lists trajectories using parsed limit and offset", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/training/trajectories",
      url: "/api/training/trajectories?limit=25&offset=5",
    });
    expect(result.status).toBe(200);
    expect(trainingService.listTrajectories).toHaveBeenCalledWith({
      limit: 25,
      offset: 5,
    });
  });

  test("returns 404 when trajectory is missing", async () => {
    vi.spyOn(trainingService, "getTrajectoryById").mockResolvedValueOnce(null);
    const result = await invoke({
      method: "GET",
      pathname: "/api/training/trajectories/trajectory-404",
    });
    expect(result.status).toBe(404);
    expect(result.payload).toMatchObject({ error: "Trajectory not found" });
  });

  test("builds dataset via POST endpoint", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/datasets/build",
      body: { limit: 100, minLlmCallsPerTrajectory: 2 },
    });
    expect(result.status).toBe(201);
    expect(trainingService.buildDataset).toHaveBeenCalledWith({
      limit: 100,
      minLlmCallsPerTrajectory: 2,
    });
  });

  test("starts training job and returns created job", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/jobs",
      body: {
        datasetId: "dataset-1",
        backend: "cpu",
        iterations: 10,
      },
    });
    expect(result.status).toBe(201);
    expect(trainingService.startTrainingJob).toHaveBeenCalledWith({
      datasetId: "dataset-1",
      maxTrajectories: undefined,
      backend: "cpu",
      model: undefined,
      iterations: 10,
      batchSize: undefined,
      learningRate: undefined,
    });
  });

  test("returns 400 when training job start fails", async () => {
    vi.spyOn(trainingService, "startTrainingJob").mockRejectedValueOnce(
      new Error("bad request"),
    );
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/jobs",
      body: { backend: "cpu" },
    });
    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ error: "bad request" });
  });

  test("returns 404 when cancelling unknown job", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/jobs/job-404/cancel",
    });
    expect(result.status).toBe(404);
  });

  test("returns 404 when fetching unknown job", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/training/jobs/job-404",
    });
    expect(result.status).toBe(404);
    expect(result.payload).toMatchObject({ error: "Training job not found" });
  });

  test("activates model from endpoint", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/models/model-1/activate",
      body: { providerModel: "ollama/milaidy-ft-model" },
    });
    expect(result.status).toBe(200);
    expect(trainingService.activateModel).toHaveBeenCalledWith(
      "model-1",
      "ollama/milaidy-ft-model",
    );
  });

  test("imports model into Ollama from endpoint", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/models/model-1/import-ollama",
      body: {
        modelName: "milaidy-ft-model",
        baseModel: "qwen2.5:7b-instruct",
        ollamaUrl: "http://localhost:11434",
      },
    });
    expect(result.status).toBe(200);
    expect(trainingService.importModelToOllama).toHaveBeenCalledWith(
      "model-1",
      {
        modelName: "milaidy-ft-model",
        baseModel: "qwen2.5:7b-instruct",
        ollamaUrl: "http://localhost:11434",
      },
    );
  });

  test("benchmarks model from endpoint", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/models/model-1/benchmark",
    });
    expect(result.status).toBe(200);
    expect(trainingService.benchmarkModel).toHaveBeenCalledWith("model-1");
  });
});
