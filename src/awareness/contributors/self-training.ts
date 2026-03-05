/**
 * Self-training contributor — reports training job status to agent awareness.
 */
import type { IAgentRuntime } from "@elizaos/core";
import type { AwarenessContributor } from "../../contracts/awareness";

const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

export const selfTrainingContributor: AwarenessContributor = {
  id: "self-training",
  position: 90,
  cacheTtl: 300_000,
  invalidateOn: ["training-updated"],
  trusted: true,

  async summary(_runtime: IAgentRuntime): Promise<string> {
    try {
      const resp = await fetch(
        `http://localhost:${API_PORT}/api/training/status`,
      );
      if (!resp.ok) return "Training: unavailable";

      const data = (await resp.json()) as {
        activeJob?: { id?: string; progress?: number };
        activeModel?: { id?: string };
        status?: string;
      };

      if (data.activeJob) {
        const progress =
          typeof data.activeJob.progress === "number"
            ? ` (${Math.round(data.activeJob.progress * 100)}%)`
            : "";
        return `Training: job ${data.activeJob.id ?? "?"} running${progress}`;
      }

      if (data.activeModel) {
        return `Training: model ${data.activeModel.id ?? "?"} active`;
      }

      return "Training: idle";
    } catch {
      return "";
    }
  },

  async detail(
    _runtime: IAgentRuntime,
    level: "brief" | "full",
  ): Promise<string> {
    const lines: string[] = ["## Self-Training"];

    try {
      const statusResp = await fetch(
        `http://localhost:${API_PORT}/api/training/status`,
      );
      if (!statusResp.ok) {
        lines.push("Training service unavailable.");
        return lines.join("\n");
      }

      const status = (await statusResp.json()) as Record<string, unknown>;
      lines.push(`Status: ${JSON.stringify(status)}`);

      if (level === "full") {
        // Fetch jobs
        const jobsResp = await fetch(
          `http://localhost:${API_PORT}/api/training/jobs`,
        );
        if (jobsResp.ok) {
          const jobs = (await jobsResp.json()) as Array<
            Record<string, unknown>
          >;
          lines.push("", "### Jobs");
          for (const job of jobs.slice(0, 10)) {
            lines.push(
              `- ${job.id}: ${job.status} (${job.backend ?? "unknown"})`,
            );
          }
        }

        // Fetch models
        const modelsResp = await fetch(
          `http://localhost:${API_PORT}/api/training/models`,
        );
        if (modelsResp.ok) {
          const models = (await modelsResp.json()) as Array<
            Record<string, unknown>
          >;
          lines.push("", "### Models");
          for (const model of models) {
            lines.push(`- ${model.id}: ${model.status ?? "available"}`);
          }
        }
      }
    } catch {
      lines.push("Training service unavailable.");
    }

    return lines.join("\n");
  },
};
