/**
 * EVALUATE_TRAJECTORIES action — scores trajectories for training quality.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { loadPersistedTrajectoryRows } from "../runtime/trajectory-persistence";

export const evaluateTrajectoriesAction: Action = {
  name: "EVALUATE_TRAJECTORIES",
  similes: ["SCORE_TRAJECTORIES", "ASSESS_TRAJECTORIES", "GRADE_TRAJECTORIES"],
  description:
    "Evaluate recent trajectories and score them for training data quality.",
  validate: async (_runtime, message) => {
    const text = message.content?.text?.toLowerCase() ?? "";
    return [
      "evaluate",
      "score",
      "assess",
      "grade",
      "trajectory",
      "training data",
    ].some((kw) => text.includes(kw));
  },

  handler: async (runtime, _message, _state, options) => {
    const params = (options as HandlerOptions | undefined)?.parameters;
    const lookbackHours = params?.lookbackHours
      ? Number(params.lookbackHours)
      : 24;
    const minQualityScore = params?.minQualityScore
      ? Number(params.minQualityScore)
      : 0.7;

    const rows = await loadPersistedTrajectoryRows(runtime, 5000);
    if (!rows || rows.length === 0) {
      return { text: "No trajectories found.", success: true };
    }

    // Filter by lookback window
    const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
    const recent = rows.filter((row) => {
      const ts = row.created_at;
      if (typeof ts === "string") return new Date(ts).getTime() >= cutoff;
      if (typeof ts === "number") return ts >= cutoff;
      return false;
    });

    if (recent.length === 0) {
      return {
        text: `No trajectories in the last ${lookbackHours} hours.`,
        success: true,
      };
    }

    // Score each trajectory
    const scored = recent.map((row) => ({
      id: String(row.trajectory_id ?? row.id),
      score: scoreTrajectory(row),
    }));

    const goodOnes = scored.filter((s) => s.score >= minQualityScore);

    return {
      text: `Evaluated ${recent.length} trajectories. ${goodOnes.length} scored >= ${minQualityScore} (suitable for training).`,
      success: true,
      data: {
        actionName: "EVALUATE_TRAJECTORIES",
        totalEvaluated: recent.length,
        qualifiedCount: goodOnes.length,
        minScore: minQualityScore,
        avgScore: scored.reduce((sum, s) => sum + s.score, 0) / scored.length,
        qualifiedIds: goodOnes.map((s) => s.id),
      },
    };
  },

  parameters: [
    {
      name: "lookbackHours",
      description: "How many hours back to evaluate (default 24)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "minQualityScore",
      description:
        "Minimum quality score to qualify for training (default 0.7, range 0-1)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

/** Score a trajectory row from 0 to 1. */
function scoreTrajectory(row: Record<string, unknown>): number {
  let score = 0;

  // Completed trajectory: +0.3
  const status = String(row.status ?? "");
  if (status === "completed" || status === "success") score += 0.3;

  // Low latency (< 30s): +0.2
  const duration = Number(row.duration_ms ?? 0);
  if (duration > 0 && duration < 30_000) score += 0.2;

  // No errors (total_reward >= 0 or ai_judge_reward > 0): +0.2
  const reward = Number(row.total_reward ?? 0);
  const aiReward = Number(row.ai_judge_reward ?? 0);
  if (reward >= 0 || aiReward > 0) score += 0.2;

  // Reasonable token usage (< 10k total): +0.15
  const promptTokens = Number(row.total_prompt_tokens ?? 0);
  const completionTokens = Number(row.total_completion_tokens ?? 0);
  if (promptTokens + completionTokens < 10_000) score += 0.15;

  // Multiple actions (step_count > 1): +0.15
  const steps = Number(row.step_count ?? 0);
  if (steps > 1) score += 0.15;

  return Math.min(1, score);
}
