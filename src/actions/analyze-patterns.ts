/**
 * ANALYZE_PATTERNS action — scans trajectory history for recurring errors
 * and patterns, cross-references with the LearningStore, and auto-promotes.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { loadPersistedTrajectoryRows } from "../runtime/trajectory-persistence";
import { getLearningStore } from "../services/learning-store";

const ANALYZE_KEYWORDS = [
  "analyze",
  "pattern",
  "scan",
  "review error",
  "find pattern",
  "trajectory",
  "what did i learn",
  "what have you learned",
];

export const analyzePatternsAction: Action = {
  name: "ANALYZE_PATTERNS",
  similes: ["SCAN_PATTERNS", "REVIEW_ERRORS", "FIND_PATTERNS"],
  description:
    "Analyze recent trajectories to find recurring error patterns and auto-promote frequent learnings to memory.",

  validate: async (_runtime, message) => {
    // Only surface when user explicitly asks — auto-analysis handles the rest
    const text = message.content?.text?.toLowerCase() ?? "";
    return ANALYZE_KEYWORDS.some((kw) => text.includes(kw));
  },

  handler: async (runtime, _message, _state, options) => {
    const params = (options as HandlerOptions | undefined)?.parameters;
    const lookbackHours = params?.lookbackHours
      ? Number(params.lookbackHours)
      : 24;
    const autoPromote = params?.autoPromote !== "false";

    const store = getLearningStore();
    if (!store) {
      return { text: "LearningStore not initialized.", success: false };
    }

    // Fetch trajectories
    const rows = await loadPersistedTrajectoryRows(runtime, 5000);
    if (!rows || rows.length === 0) {
      return { text: "No trajectories found to analyze.", success: true };
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

    // Group error trajectories by similarity — check both trajectory-level and step-level
    const errorGroups = new Map<string, number>();
    for (const row of recent) {
      const status = String(row.status ?? "");
      if (status === "error" || status === "failed") {
        const meta =
          typeof row.metadata === "string"
            ? row.metadata
            : JSON.stringify(row.metadata ?? "");
        const signature = extractErrorSignature(meta);
        errorGroups.set(signature, (errorGroups.get(signature) ?? 0) + 1);
      }

      // Also scan steps_json for action-level failures within completed trajectories
      const stepsJson =
        row.steps_json ?? (row as Record<string, unknown>).stepsJson;
      if (stepsJson) {
        const sigs = extractStepErrorSignatures(
          typeof stepsJson === "string" ? stepsJson : JSON.stringify(stepsJson),
        );
        for (const sig of sigs) {
          errorGroups.set(sig, (errorGroups.get(sig) ?? 0) + 1);
        }
      }
    }

    // Record findings into LearningStore
    let recorded = 0;
    for (const [signature, count] of errorGroups) {
      if (signature && count >= 1) {
        store.record(
          "error",
          signature,
          `Occurred ${count} time(s) in last ${lookbackHours}h`,
          "pattern-analyzer",
        );
        recorded++;
      }
    }

    // Auto-promote if enabled
    let promoted = 0;
    if (autoPromote) {
      const promotedEntries = await store.checkPromotions();
      promoted = promotedEntries.length;
    }

    return {
      text: `Analyzed ${recent.length} trajectories. Found ${errorGroups.size} error patterns, recorded ${recorded} learnings, promoted ${promoted} to memory.`,
      success: true,
      data: {
        actionName: "ANALYZE_PATTERNS",
        trajectoryCount: recent.length,
        errorPatterns: errorGroups.size,
        recorded,
        promoted,
      },
    };
  },

  parameters: [
    {
      name: "lookbackHours",
      description: "How many hours back to analyze (default 24)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "autoPromote",
      description:
        "Whether to auto-promote recurring patterns to memory (default true)",
      required: false,
      schema: { type: "string" as const, enum: ["true", "false"] },
    },
  ],
};

/** Extract error signatures from step-level data within a trajectory. */
function extractStepErrorSignatures(stepsStr: string): string[] {
  const sigs: string[] = [];
  try {
    const steps = JSON.parse(stepsStr);
    if (!Array.isArray(steps)) return sigs;
    for (const step of steps) {
      const stepStatus = String(step?.status ?? step?.result?.status ?? "");
      if (
        stepStatus === "error" ||
        stepStatus === "failed" ||
        step?.error ||
        step?.result?.error
      ) {
        const errorMsg =
          step?.error ?? step?.result?.error ?? step?.result?.text ?? "";
        const sig = extractErrorSignature(
          typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg),
        );
        if (sig && sig !== "unknown error") sigs.push(sig);
      }
    }
  } catch {
    // Malformed steps — skip
  }
  return sigs;
}

/** Extract a short error signature from trajectory metadata. */
function extractErrorSignature(meta: string): string {
  // Try to find error message patterns
  const errorMatch = meta.match(/(?:error|Error|ERROR)[:\s]+([^"}\n]{10,100})/);
  if (errorMatch) return errorMatch[1].trim();

  // Try to find failure reason
  const failMatch = meta.match(/(?:fail|FAIL)[:\s]+([^"}\n]{10,80})/);
  if (failMatch) return failMatch[1].trim();

  // Fallback: first 80 chars
  return meta.slice(0, 80).trim() || "unknown error";
}
