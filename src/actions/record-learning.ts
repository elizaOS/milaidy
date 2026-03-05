/**
 * RECORD_LEARNING action — lets the agent record errors, insights,
 * corrections, and patterns into the LearningStore.
 *
 * Smart validate: only surfaces to the LLM when there's a recent error
 * or the user explicitly mentions learning/remember keywords. This keeps
 * the action out of the LLM's list on normal turns → saves tokens.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import type { LearningCategory } from "../services/learning-store";
import { getLearningStore } from "../services/learning-store";

const VALID_CATEGORIES: LearningCategory[] = [
  "error",
  "correction",
  "insight",
  "pattern",
];

const LEARNING_KEYWORDS = [
  "learn",
  "remember",
  "lesson",
  "note",
  "mistake",
  "pattern",
  "insight",
  "error",
  "wrong",
  "fix",
  "correction",
];

export const recordLearningAction: Action = {
  name: "RECORD_LEARNING",
  similes: ["LEARN", "NOTE_LEARNING", "REMEMBER_LESSON"],
  description:
    "Record a learning (error, correction, insight, or pattern) for future reference. Automatically promotes recurring learnings to long-term memory.",

  validate: async (_runtime, message, _state) => {
    // Always eligible if user explicitly mentions learning-related keywords
    const text = message.content?.text?.toLowerCase() ?? "";
    if (LEARNING_KEYWORDS.some((kw) => text.includes(kw))) return true;

    // Also eligible if the message metadata indicates an error just happened
    const meta = message.content?.metadata as
      | Record<string, unknown>
      | undefined;
    if (meta?.error || meta?.isError || meta?.actionError) return true;

    // Otherwise stay hidden to save tokens
    return false;
  },

  handler: async (_runtime, _message, _state, options) => {
    const params = (options as HandlerOptions | undefined)?.parameters;
    const category =
      typeof params?.category === "string"
        ? (params.category.trim() as LearningCategory)
        : undefined;
    const summary =
      typeof params?.summary === "string" ? params.summary.trim() : undefined;
    const detail =
      typeof params?.detail === "string" ? params.detail.trim() : undefined;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return {
        text: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
        success: false,
      };
    }
    if (!summary) {
      return { text: "Summary is required.", success: false };
    }

    const store = getLearningStore();
    if (!store) {
      return {
        text: "LearningStore not initialized.",
        success: false,
      };
    }

    const entry = store.record(category, summary, detail);

    // Check for promotions
    const promoted = await store.checkPromotions();
    const promotedMsg =
      promoted.length > 0
        ? ` ${promoted.length} learning(s) promoted to long-term memory.`
        : "";

    return {
      text: `Recorded ${category}: "${summary}" (occurrence #${entry.occurrences}).${promotedMsg}`,
      success: true,
      values: { success: true, id: entry.id, occurrences: entry.occurrences },
      data: {
        actionName: "RECORD_LEARNING",
        category,
        summary,
        entryId: entry.id,
        occurrences: entry.occurrences,
        promoted: promoted.length,
      },
    };
  },

  parameters: [
    {
      name: "category",
      description: "Type of learning: error, correction, insight, or pattern",
      required: true,
      schema: {
        type: "string" as const,
        enum: ["error", "correction", "insight", "pattern"],
      },
    },
    {
      name: "summary",
      description: "Brief summary of the learning (one sentence)",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "detail",
      description: "Optional detailed explanation or context",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
