import type { AgentRuntime } from "@elizaos/core";
import { isLoopbackHost } from "../security/network-policy";
import { parsePositiveInteger } from "../utils/number-parsing";
import type { RouteHelpers, RouteRequestContext } from "./route-helpers";
import type { TrainingServiceLike } from "./training-service-like";

export type TrainingRouteHelpers = RouteHelpers;

export interface TrainingRouteContext extends RouteRequestContext {
  runtime: AgentRuntime | null;
  trainingService: TrainingServiceLike;
}

function resolveOllamaUrlRejection(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "ollamaUrl must be a valid URL";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "ollamaUrl must use http:// or https://";
  }

  if (!isLoopbackHost(parsed.hostname)) {
    return "ollamaUrl must target a loopback host (localhost, 127.0.0.1, or ::1)";
  }

  return null;
}

export async function handleTrainingRoutes(
  ctx: TrainingRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    runtime,
    trainingService,
    json,
    error,
    readJsonBody,
  } = ctx;

  if (!pathname.startsWith("/api/training")) return false;

  // ── GET /api/training/status ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/training/status") {
    const status = trainingService.getStatus();
    json(res, {
      ...status,
      runtimeAvailable: runtime !== null,
    });
    return true;
  }

  // ── GET /api/training/trajectories ─────────────────────────────────────
  if (method === "GET" && pathname === "/api/training/trajectories") {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const limit = parsePositiveInteger(url.searchParams.get("limit"), 100);
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));
    const result = await trainingService.listTrajectories({ limit, offset });
    json(res, result);
    return true;
  }

  // ── GET /api/training/trajectories/:id ─────────────────────────────────
  const trajectoryMatch = /^\/api\/training\/trajectories\/([^/]+)$/.exec(
    pathname,
  );
  if (method === "GET" && trajectoryMatch) {
    const trajectoryId = decodeURIComponent(trajectoryMatch[1]);
    const detail = await trainingService.getTrajectoryById(trajectoryId);
    if (!detail) {
      error(res, "Trajectory not found", 404);
      return true;
    }
    json(res, { trajectory: detail });
    return true;
  }

  // ── GET /api/training/datasets ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/training/datasets") {
    json(res, { datasets: trainingService.listDatasets() });
    return true;
  }

  // ── POST /api/training/datasets/build ──────────────────────────────────
  if (method === "POST" && pathname === "/api/training/datasets/build") {
    const body = await readJsonBody<{
      limit?: number;
      minLlmCallsPerTrajectory?: number;
    }>(req, res);
    if (!body) return true;

    const dataset = await trainingService.buildDataset({
      limit: body.limit,
      minLlmCallsPerTrajectory: body.minLlmCallsPerTrajectory,
    });
    json(res, { dataset }, 201);
    return true;
  }

  // ── GET /api/training/jobs ─────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/training/jobs") {
    json(res, { jobs: trainingService.listJobs() });
    return true;
  }

  // ── POST /api/training/jobs ────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/training/jobs") {
    const body = await readJsonBody<{
      datasetId?: string;
      maxTrajectories?: number;
      backend?: "mlx" | "cuda" | "cpu";
      model?: string;
      iterations?: number;
      batchSize?: number;
      learningRate?: number;
    }>(req, res);
    if (!body) return true;

    try {
      const job = await trainingService.startTrainingJob({
        datasetId: body.datasetId,
        maxTrajectories: body.maxTrajectories,
        backend: body.backend,
        model: body.model,
        iterations: body.iterations,
        batchSize: body.batchSize,
        learningRate: body.learningRate,
      });
      json(res, { job }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(res, message, 400);
    }
    return true;
  }

  // ── GET /api/training/jobs/:id ─────────────────────────────────────────
  const jobMatch = /^\/api\/training\/jobs\/([^/]+)$/.exec(pathname);
  if (method === "GET" && jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]);
    const job = trainingService.getJob(jobId);
    if (!job) {
      error(res, "Training job not found", 404);
      return true;
    }
    json(res, { job });
    return true;
  }

  // ── POST /api/training/jobs/:id/cancel ─────────────────────────────────
  const cancelMatch = /^\/api\/training\/jobs\/([^/]+)\/cancel$/.exec(pathname);
  if (method === "POST" && cancelMatch) {
    const jobId = decodeURIComponent(cancelMatch[1]);
    try {
      const job = await trainingService.cancelJob(jobId);
      json(res, { job });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(res, message, 404);
    }
    return true;
  }

  // ── GET /api/training/models ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/training/models") {
    json(res, { models: trainingService.listModels() });
    return true;
  }

  // ── POST /api/training/models/:id/import-ollama ───────────────────────
  const importMatch = /^\/api\/training\/models\/([^/]+)\/import-ollama$/.exec(
    pathname,
  );
  if (method === "POST" && importMatch) {
    const modelId = decodeURIComponent(importMatch[1]);
    const body = await readJsonBody<{
      modelName?: string;
      baseModel?: string;
      ollamaUrl?: string;
    }>(req, res);
    if (!body) return true;

    if (body.ollamaUrl !== undefined && typeof body.ollamaUrl !== "string") {
      error(res, "ollamaUrl must be a string", 400);
      return true;
    }
    if (typeof body.ollamaUrl === "string") {
      const ollamaUrlRejection = resolveOllamaUrlRejection(body.ollamaUrl);
      if (ollamaUrlRejection) {
        error(res, ollamaUrlRejection, 400);
        return true;
      }
    }

    try {
      const model = await trainingService.importModelToOllama(modelId, body);
      json(res, { model });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(res, message, 400);
    }
    return true;
  }

  // ── POST /api/training/models/:id/activate ─────────────────────────────
  const activateMatch = /^\/api\/training\/models\/([^/]+)\/activate$/.exec(
    pathname,
  );
  if (method === "POST" && activateMatch) {
    const modelId = decodeURIComponent(activateMatch[1]);
    const body = await readJsonBody<{ providerModel?: string }>(req, res);
    if (!body) return true;
    try {
      const result = await trainingService.activateModel(
        modelId,
        body.providerModel,
      );
      json(res, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(res, message, 400);
    }
    return true;
  }

  // ── POST /api/training/models/:id/benchmark ────────────────────────────
  const benchmarkMatch = /^\/api\/training\/models\/([^/]+)\/benchmark$/.exec(
    pathname,
  );
  if (method === "POST" && benchmarkMatch) {
    const modelId = decodeURIComponent(benchmarkMatch[1]);
    try {
      const result = await trainingService.benchmarkModel(modelId);
      json(res, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(res, message, 400);
    }
    return true;
  }

  return false;
}
