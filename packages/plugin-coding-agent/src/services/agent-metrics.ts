/**
 * Lightweight per-agent-type metrics for observability.
 *
 * Self-contained tracker — no dependencies on PTYService state.
 *
 * @module services/agent-metrics
 */

export interface AgentMetrics {
  spawned: number;
  completed: number;
  completedViaFastPath: number;
  completedViaClassifier: number;
  stallCount: number;
  avgCompletionMs: number;
  totalCompletionMs: number;
}

export class AgentMetricsTracker {
  private metrics: Map<string, AgentMetrics> = new Map();

  /** Get (or lazily initialize) metrics for a given agent type. */
  get(agentType: string): AgentMetrics {
    let m = this.metrics.get(agentType);
    if (!m) {
      m = {
        spawned: 0,
        completed: 0,
        completedViaFastPath: 0,
        completedViaClassifier: 0,
        stallCount: 0,
        avgCompletionMs: 0,
        totalCompletionMs: 0,
      };
      this.metrics.set(agentType, m);
    }
    return m;
  }

  /** Record a task completion and update rolling average duration. */
  recordCompletion(
    agentType: string,
    method: "fast-path" | "classifier",
    durationMs: number,
  ): void {
    const m = this.get(agentType);
    m.completed++;
    if (method === "fast-path") m.completedViaFastPath++;
    else m.completedViaClassifier++;
    m.totalCompletionMs += durationMs;
    m.avgCompletionMs = Math.round(m.totalCompletionMs / m.completed);
  }

  /** Increment the stall counter for an agent type. */
  incrementStalls(agentType: string): void {
    this.get(agentType).stallCount++;
  }

  /** Return a serializable copy of all metrics (for API endpoints). */
  getAll(): Record<string, Omit<AgentMetrics, "totalCompletionMs">> {
    const result: Record<string, Omit<AgentMetrics, "totalCompletionMs">> = {};
    for (const [type, m] of this.metrics) {
      const { totalCompletionMs: _, ...rest } = m;
      result[type] = { ...rest };
    }
    return result;
  }
}
