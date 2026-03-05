/**
 * Learnings contributor — reports learning store status to agent awareness.
 */
import type { IAgentRuntime } from "@elizaos/core";
import type { AwarenessContributor } from "../../contracts/awareness";
import { getLearningStore } from "../../services/learning-store";

export const learningsContributor: AwarenessContributor = {
  id: "learnings",
  position: 85,
  cacheTtl: 120_000,
  invalidateOn: ["learning-recorded"],
  trusted: true,

  async summary(_runtime: IAgentRuntime): Promise<string> {
    const store = getLearningStore();
    if (!store) return "";

    const total = store.getCount();
    if (total === 0) return "";

    const promoted = store.getPromotedCount();
    const recent = store.getRecent(1);
    const recentSummary = recent[0]?.summary.slice(0, 30) ?? "";

    return `Learnings: ${total} recorded, ${promoted} promoted | Recent: ${recentSummary}`;
  },

  async detail(
    _runtime: IAgentRuntime,
    level: "brief" | "full",
  ): Promise<string> {
    const store = getLearningStore();
    if (!store) return "## Learnings\nLearning store not initialized.";

    const lines: string[] = ["## Learnings"];
    const total = store.getCount();
    const promoted = store.getPromotedCount();
    lines.push(`Total: ${total} | Promoted to memory: ${promoted}`);

    if (level === "brief") {
      const recent = store.getRecent(5);
      if (recent.length > 0) {
        lines.push("", "### Recent");
        for (const entry of recent) {
          lines.push(
            `- [${entry.category}] ${entry.summary} (x${entry.occurrences})`,
          );
        }
      }
    } else {
      const all = store.getAll();
      if (all.length > 0) {
        lines.push("", "### All Learnings");
        for (const entry of all) {
          lines.push(
            `- [${entry.category}] ${entry.summary} (x${entry.occurrences})${entry.promotedToMemory ? " ✓" : ""}`,
          );
          if (entry.detail) lines.push(`  ${entry.detail}`);
        }
      }

      // Error log
      const errors = all.filter((e) => e.category === "error");
      if (errors.length > 0) {
        lines.push("", "### Error Log");
        for (const err of errors) {
          lines.push(
            `- ${err.timestamp}: ${err.summary} (x${err.occurrences})`,
          );
        }
      }
    }

    return lines.join("\n");
  },
};
