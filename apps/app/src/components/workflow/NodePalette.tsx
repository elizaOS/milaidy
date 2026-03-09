/**
 * NodePalette — draggable node type list for the workflow builder.
 *
 * Displays available node types with descriptions. Clicking a node
 * type adds it to the canvas.
 */

import {
  ArrowRightLeft,
  Bot,
  Clock,
  Code2,
  GitBranch,
  Hand,
  Repeat,
  Send,
  Workflow,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

interface NodeTypeEntry {
  type: string;
  label: string;
  description: string;
  icon: ReactNode;
  color: string;
}

const NODE_TYPES: NodeTypeEntry[] = [
  {
    type: "trigger",
    label: "Trigger",
    description: "Entry point (manual, cron, webhook)",
    icon: <Zap size={14} />,
    color: "#f59e0b",
  },
  {
    type: "action",
    label: "Action",
    description: "Execute a registered action",
    icon: <Send size={14} />,
    color: "#3b82f6",
  },
  {
    type: "llm",
    label: "LLM Call",
    description: "Generate text with AI model",
    icon: <Bot size={14} />,
    color: "#8b5cf6",
  },
  {
    type: "condition",
    label: "Condition",
    description: "Branch based on expression",
    icon: <GitBranch size={14} />,
    color: "#ef4444",
  },
  {
    type: "transform",
    label: "Transform",
    description: "JavaScript data transformation",
    icon: <Code2 size={14} />,
    color: "#10b981",
  },
  {
    type: "delay",
    label: "Delay",
    description: "Wait for a duration or date",
    icon: <Clock size={14} />,
    color: "#6366f1",
  },
  {
    type: "hook",
    label: "Hook",
    description: "Pause for external event",
    icon: <Hand size={14} />,
    color: "#f97316",
  },
  {
    type: "loop",
    label: "Loop",
    description: "Iterate over array data",
    icon: <Repeat size={14} />,
    color: "#14b8a6",
  },
  {
    type: "subworkflow",
    label: "Subworkflow",
    description: "Call another workflow",
    icon: <Workflow size={14} />,
    color: "#ec4899",
  },
  {
    type: "output",
    label: "Output",
    description: "Terminal result node",
    icon: <ArrowRightLeft size={14} />,
    color: "#6b7280",
  },
];

interface NodePaletteProps {
  onAddNode: (type: string, label: string) => void;
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <div className="w-48 border-r border-border bg-surface/20 overflow-y-auto shrink-0">
      <div className="p-2">
        <div className="text-xs font-medium text-muted mb-2 px-1">
          Node Types
        </div>
        <div className="space-y-1">
          {NODE_TYPES.map((entry) => (
            <button
              key={entry.type}
              type="button"
              onClick={() => onAddNode(entry.type, entry.label)}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-surface/60 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0" style={{ color: entry.color }}>
                  {entry.icon}
                </span>
                <span className="text-xs font-medium">{entry.label}</span>
              </div>
              <p className="text-[10px] text-muted mt-0.5 pl-[22px]">
                {entry.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
