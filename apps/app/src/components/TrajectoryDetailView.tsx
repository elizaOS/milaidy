/**
 * TrajectoryDetailView — detailed view of a single trajectory.
 *
 * Shows all LLM calls with system prompts, user prompts, and responses
 * in a split view layout (side-by-side on desktop, stacked on mobile).
 */

import { useCallback, useEffect, useState } from "react";
import {
  client,
  type TrajectoryDetailResult,
  type TrajectoryLlmCall,
} from "../api-client";
import {
  formatTrajectoryDuration,
  formatTrajectoryTimestamp,
  formatTrajectoryTokenCount,
} from "./trajectory-format";

interface TrajectoryDetailViewProps {
  trajectoryId: string;
  onBack?: () => void;
}

function estimateCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
): string {
  // Rough cost estimates per 1M tokens (input/output)
  const costs: Record<string, [number, number]> = {
    "gpt-4o": [2.5, 10],
    "gpt-4o-mini": [0.15, 0.6],
    "gpt-4-turbo": [10, 30],
    "gpt-4": [30, 60],
    "gpt-3.5-turbo": [0.5, 1.5],
    "claude-3-opus": [15, 75],
    "claude-3-sonnet": [3, 15],
    "claude-3-haiku": [0.25, 1.25],
    "claude-3.5-sonnet": [3, 15],
  };

  // Find matching model (partial match)
  let inputCost = 1;
  let outputCost = 3;
  for (const [name, [ic, oc]] of Object.entries(costs)) {
    if (model.toLowerCase().includes(name.toLowerCase())) {
      inputCost = ic;
      outputCost = oc;
      break;
    }
  }

  const cost =
    (promptTokens / 1_000_000) * inputCost +
    (completionTokens / 1_000_000) * outputCost;

  if (cost < 0.001) return "<$0.001";
  if (cost < 0.01) return `~$${cost.toFixed(4)}`;
  return `~$${cost.toFixed(3)}`;
}

function CodeBlock({ content, label }: { content: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n").length;
  const shouldTruncate = !expanded && lines > 20;
  const displayContent = shouldTruncate
    ? `${content.split("\n").slice(0, 20).join("\n")}\n...`
    : content;

  return (
    <div className="border border-border bg-bg">
      <div className="flex items-center justify-between px-2 py-1 bg-muted/10 border-b border-border">
        <span className="text-[10px] text-muted uppercase tracking-wide font-semibold">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted">{lines} lines</span>
          {lines > 20 && (
            <button
              type="button"
              className="text-[10px] text-accent hover:underline"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
          <button
            type="button"
            className="text-[10px] text-muted hover:text-txt"
            onClick={() => navigator.clipboard.writeText(content)}
            title="Copy to clipboard"
          >
            Copy
          </button>
        </div>
      </div>
      <pre className="text-xs p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">
        {displayContent}
      </pre>
    </div>
  );
}

function LlmCallCard({
  call,
  index,
}: {
  call: TrajectoryLlmCall;
  index: number;
}) {
  const [showSystem, setShowSystem] = useState(false);
  const promptTokens = call.promptTokens ?? 0;
  const completionTokens = call.completionTokens ?? 0;
  const totalTokens = promptTokens + completionTokens;

  return (
    <div className="border border-border bg-card mb-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/5 border-b border-border">
        <span className="text-xs font-semibold">#{index + 1}</span>
        <span className="text-[10px] px-1.5 py-px bg-accent/10 text-accent rounded">
          {call.model}
        </span>
        <span className="text-[10px] text-muted">
          {call.purpose || call.actionType || "response"}
        </span>
        <span className="text-[10px] text-muted ml-auto">
          {formatTrajectoryDuration(call.latencyMs)}
        </span>
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap gap-4 px-3 py-1.5 text-[10px] text-muted border-b border-border">
        <span>
          Tokens:{" "}
          <span className="text-txt font-mono">
            {formatTrajectoryTokenCount(totalTokens, { emptyLabel: "—" })}
          </span>
          <span className="ml-1">
            ({formatTrajectoryTokenCount(promptTokens, { emptyLabel: "—" })}↑{" "}
            {formatTrajectoryTokenCount(completionTokens, { emptyLabel: "—" })}
            ↓)
          </span>
        </span>
        <span>
          Est. cost:{" "}
          <span className="text-warn font-mono">
            {estimateCost(promptTokens, completionTokens, call.model)}
          </span>
        </span>
        <span>
          Temp: <span className="text-txt font-mono">{call.temperature}</span>
        </span>
        {call.maxTokens > 0 && (
          <span>
            Max: <span className="text-txt font-mono">{call.maxTokens}</span>
          </span>
        )}
      </div>

      {/* System prompt toggle */}
      {call.systemPrompt && (
        <div className="border-b border-border">
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-[10px] text-muted hover:bg-muted/5"
            onClick={() => setShowSystem(!showSystem)}
          >
            {showSystem ? "▼" : "▶"} System prompt (
            {call.systemPrompt.length.toLocaleString()} chars)
          </button>
          {showSystem && (
            <div className="p-2">
              <CodeBlock content={call.systemPrompt} label="System" />
            </div>
          )}
        </div>
      )}

      {/* Main content: Input/Output split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-0 divide-y md:divide-y-0 md:divide-x divide-border">
        {/* Input (User Prompt) */}
        <div className="p-2">
          <CodeBlock content={call.userPrompt} label="Input (User)" />
        </div>

        {/* Output (Response) */}
        <div className="p-2">
          <CodeBlock content={call.response} label="Output (Response)" />
        </div>
      </div>
    </div>
  );
}

export function TrajectoryDetailView({
  trajectoryId,
  onBack,
}: TrajectoryDetailViewProps) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<TrajectoryDetailResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getTrajectoryDetail(trajectoryId);
      setDetail(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load trajectory",
      );
    } finally {
      setLoading(false);
    }
  }, [trajectoryId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted text-sm">Loading trajectory...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="text-danger text-sm">{error}</div>
        {onBack && (
          <button
            type="button"
            className="text-xs px-3 py-1.5 border border-border bg-card hover:border-accent"
            onClick={onBack}
          >
            Go back
          </button>
        )}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="text-muted text-sm">Trajectory not found</div>
        {onBack && (
          <button
            type="button"
            className="text-xs px-3 py-1.5 border border-border bg-card hover:border-accent"
            onClick={onBack}
          >
            Go back
          </button>
        )}
      </div>
    );
  }

  const { trajectory, llmCalls } = detail;
  const totalPromptTokens = llmCalls.reduce(
    (sum, c) => sum + (c.promptTokens ?? 0),
    0,
  );
  const totalCompletionTokens = llmCalls.reduce(
    (sum, c) => sum + (c.completionTokens ?? 0),
    0,
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border mb-3">
        {onBack && (
          <button
            type="button"
            className="text-xs px-2 py-1 border border-border bg-card hover:border-accent"
            onClick={onBack}
          >
            ← Back
          </button>
        )}
        <h2 className="text-sm font-semibold">Trajectory Detail</h2>
        <span className="text-[10px] text-muted font-mono">
          {trajectory.id.slice(0, 8)}...
        </span>
      </div>

      {/* Trajectory summary */}
      <div className="flex flex-wrap gap-4 text-xs mb-3 pb-3 border-b border-border">
        <div>
          <span className="text-muted">Time: </span>
          <span>
            {formatTrajectoryTimestamp(trajectory.createdAt, "detailed")}
          </span>
        </div>
        <div>
          <span className="text-muted">Source: </span>
          <span className="text-accent">{trajectory.source}</span>
        </div>
        <div>
          <span className="text-muted">Status: </span>
          <span
            className={
              trajectory.status === "completed"
                ? "text-success"
                : trajectory.status === "error"
                  ? "text-danger"
                  : "text-info"
            }
          >
            {trajectory.status}
          </span>
        </div>
        <div>
          <span className="text-muted">Duration: </span>
          <span>{formatTrajectoryDuration(trajectory.durationMs)}</span>
        </div>
        <div>
          <span className="text-muted">LLM Calls: </span>
          <span className="font-semibold">{llmCalls.length}</span>
        </div>
        <div>
          <span className="text-muted">Total Tokens: </span>
          <span className="text-accent font-mono">
            {formatTrajectoryTokenCount(
              totalPromptTokens + totalCompletionTokens,
              { emptyLabel: "—" },
            )}
          </span>
        </div>
      </div>

      {/* LLM calls list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {llmCalls.length === 0 ? (
          <div className="text-center py-8 text-muted">
            No LLM calls recorded for this trajectory.
          </div>
        ) : (
          llmCalls.map((call, i) => (
            <LlmCallCard key={call.id} call={call} index={i} />
          ))
        )}
      </div>
    </div>
  );
}
