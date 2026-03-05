/**
 * ACTIVATE_TRAINED_MODEL action — benchmark and activate a fine-tuned model.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { isSelfEvolutionEnabled } from "../services/learning-store";

const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

export const activateTrainedModelAction: Action = {
  name: "ACTIVATE_TRAINED_MODEL",
  similes: ["DEPLOY_MODEL", "USE_TRAINED_MODEL", "SWITCH_MODEL"],
  description:
    "Benchmark a fine-tuned model and activate it if it passes. Requires ENABLE_SELF_EVOLUTION setting.",

  validate: async (runtime, message) => {
    const settings = runtime.character?.settings as
      | Record<string, unknown>
      | undefined;
    if (!isSelfEvolutionEnabled(settings)) return false;
    // Keyword gate — only show when relevant to save tokens
    const text = message.content?.text?.toLowerCase() ?? "";
    return [
      "activate model",
      "deploy model",
      "use model",
      "switch model",
      "trained model",
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
    const modelId =
      typeof params?.modelId === "string" ? params.modelId.trim() : undefined;
    const autoActivate = params?.autoActivate !== "false";

    if (!modelId) {
      return { text: "modelId is required.", success: false };
    }

    // Benchmark
    try {
      const benchResp = await fetch(
        `http://localhost:${API_PORT}/api/training/models/${modelId}/benchmark`,
        { method: "POST" },
      );
      if (!benchResp.ok) {
        const errText = await benchResp.text();
        return {
          text: `Benchmark failed: ${errText}`,
          success: false,
        };
      }

      const benchData = (await benchResp.json()) as {
        passed?: boolean;
        score?: number;
        metrics?: Record<string, unknown>;
      };

      if (!autoActivate || !benchData.passed) {
        return {
          text: `Benchmark ${benchData.passed ? "passed" : "failed"} (score: ${benchData.score ?? "N/A"}).${!autoActivate ? " Auto-activate is off." : ""}`,
          success: true,
          data: {
            actionName: "ACTIVATE_TRAINED_MODEL",
            modelId,
            benchmarkPassed: benchData.passed,
            score: benchData.score,
          },
        };
      }

      // Activate
      const activateResp = await fetch(
        `http://localhost:${API_PORT}/api/training/models/${modelId}/activate`,
        { method: "POST" },
      );
      if (!activateResp.ok) {
        const errText = await activateResp.text();
        return {
          text: `Benchmark passed but activation failed: ${errText}`,
          success: false,
        };
      }

      return {
        text: `Model "${modelId}" benchmarked (score: ${benchData.score ?? "N/A"}) and activated.`,
        success: true,
        data: {
          actionName: "ACTIVATE_TRAINED_MODEL",
          modelId,
          benchmarkPassed: true,
          score: benchData.score,
          activated: true,
        },
      };
    } catch (err) {
      return {
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "modelId",
      description: "ID of the trained model to benchmark and activate",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "autoActivate",
      description: "Automatically activate if benchmark passes (default true)",
      required: false,
      schema: { type: "string" as const, enum: ["true", "false"] },
    },
  ],
};
