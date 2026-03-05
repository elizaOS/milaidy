/**
 * TRIGGER_SELF_TRAINING action — kicks off a fine-tuning job using
 * existing training service endpoints.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { isSelfEvolutionEnabled } from "../services/learning-store";

const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";
const MIN_TRAJECTORIES = 50;

export const triggerSelfTrainingAction: Action = {
  name: "TRIGGER_SELF_TRAINING",
  similes: ["SELF_TRAIN", "FINE_TUNE", "START_TRAINING"],
  description:
    "Build a training dataset from trajectories and start a fine-tuning job. Requires ENABLE_SELF_EVOLUTION and minimum 50 trajectories.",

  validate: async (runtime, message) => {
    const settings = runtime.character?.settings as
      | Record<string, unknown>
      | undefined;
    if (!isSelfEvolutionEnabled(settings)) return false;
    // Keyword gate — only show when relevant to save tokens
    const text = message.content?.text?.toLowerCase() ?? "";
    return [
      "train",
      "fine-tune",
      "fine tune",
      "finetune",
      "self-train",
      "start training",
    ].some((kw) => text.includes(kw));
  },

  handler: async (runtime, _message, _state, options) => {
    const settings = runtime.character?.settings as
      | Record<string, unknown>
      | undefined;
    if (!isSelfEvolutionEnabled(settings)) {
      return {
        text: "Self-evolution is disabled. Set ENABLE_SELF_EVOLUTION=true in character settings.",
        success: false,
      };
    }

    const params = (options as HandlerOptions | undefined)?.parameters;
    const backend =
      typeof params?.backend === "string" ? params.backend : "mlx";
    const iterations = params?.iterations ? Number(params.iterations) : 100;
    const batchSize = params?.batchSize ? Number(params.batchSize) : undefined;
    const learningRate = params?.learningRate
      ? Number(params.learningRate)
      : undefined;

    // Check trajectory count
    try {
      const trajResp = await fetch(
        `http://localhost:${API_PORT}/api/training/trajectories`,
      );
      if (!trajResp.ok) {
        return {
          text: "Failed to fetch trajectories from training service.",
          success: false,
        };
      }
      const trajData = (await trajResp.json()) as {
        total?: number;
        trajectories?: unknown[];
      };
      const total = trajData.total ?? trajData.trajectories?.length ?? 0;
      if (total < MIN_TRAJECTORIES) {
        return {
          text: `Insufficient trajectories for training. Need ${MIN_TRAJECTORIES}, have ${total}.`,
          success: false,
        };
      }
    } catch (err) {
      return {
        text: `Training service unavailable: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }

    // Build dataset
    let datasetId: string | undefined;
    try {
      const dsResp = await fetch(
        `http://localhost:${API_PORT}/api/training/datasets/build`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 1000 }),
        },
      );
      if (!dsResp.ok) {
        return { text: "Failed to build training dataset.", success: false };
      }
      const dsData = (await dsResp.json()) as {
        id?: string;
        datasetId?: string;
      };
      datasetId = dsData.datasetId ?? dsData.id;
    } catch (err) {
      return {
        text: `Dataset build error: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }

    // Start training job
    try {
      const jobBody: Record<string, unknown> = {
        backend,
        iterations,
      };
      if (datasetId) jobBody.datasetId = datasetId;
      if (batchSize) jobBody.batchSize = batchSize;
      if (learningRate) jobBody.learningRate = learningRate;

      const jobResp = await fetch(
        `http://localhost:${API_PORT}/api/training/jobs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jobBody),
        },
      );
      if (!jobResp.ok) {
        const errText = await jobResp.text();
        return {
          text: `Failed to start training job: ${errText}`,
          success: false,
        };
      }
      const jobData = (await jobResp.json()) as {
        id?: string;
        jobId?: string;
        status?: string;
      };

      return {
        text: `Training job started: ${jobData.jobId ?? jobData.id ?? "unknown"} (backend: ${backend}, iterations: ${iterations}).`,
        success: true,
        data: {
          actionName: "TRIGGER_SELF_TRAINING",
          jobId: jobData.jobId ?? jobData.id,
          backend,
          iterations,
          datasetId,
        },
      };
    } catch (err) {
      return {
        text: `Training job error: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "backend",
      description: "Training backend: mlx, cuda, or cpu (default mlx)",
      required: false,
      schema: { type: "string" as const, enum: ["mlx", "cuda", "cpu"] },
    },
    {
      name: "iterations",
      description: "Number of training iterations (default 100)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "batchSize",
      description: "Batch size for training",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "learningRate",
      description: "Learning rate for training",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
