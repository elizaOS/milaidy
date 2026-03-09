/**
 * WorkflowCanvas — SVG-based visual node graph editor.
 *
 * Renders workflow nodes as draggable cards on an SVG canvas with
 * edge connections. This is a lightweight implementation that works
 * without external dependencies. For production use, this can be
 * swapped for @xyflow/react (React Flow).
 *
 * Features:
 * - Draggable nodes
 * - Click to select
 * - Visual edge connections
 * - Node type color coding
 * - Connection handles (click source handle → click target to connect)
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
import { useCallback, useRef, useState } from "react";
import type { WorkflowEdge, WorkflowNode } from "../../api-client";

interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdateNodes: (nodes: WorkflowNode[]) => void;
  onUpdateEdges: (edges: WorkflowEdge[]) => void;
  nodeTypeColors: Record<string, string>;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const HANDLE_RADIUS = 6;

const NODE_ICONS: Record<string, typeof Zap> = {
  trigger: Zap,
  action: Send,
  llm: Bot,
  condition: GitBranch,
  transform: Code2,
  delay: Clock,
  hook: Hand,
  loop: Repeat,
  subworkflow: Workflow,
  output: ArrowRightLeft,
};

export function WorkflowCanvas({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onUpdateNodes,
  onUpdateEdges,
  nodeTypeColors,
}: WorkflowCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    nodeStartX: number;
    nodeStartY: number;
  } | null>(null);
  const [connecting, setConnecting] = useState<{
    sourceId: string;
    sourceHandle?: string;
  } | null>(null);

  // ── Drag handling ─────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      setDragging({
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        nodeStartX: node.position.x,
        nodeStartY: node.position.y,
      });
      onSelectNode(nodeId);
    },
    [nodes, onSelectNode],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;

      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;

      onUpdateNodes(
        nodes.map((n) =>
          n.id === dragging.nodeId
            ? {
                ...n,
                position: {
                  x: Math.max(0, dragging.nodeStartX + dx),
                  y: Math.max(0, dragging.nodeStartY + dy),
                },
              }
            : n,
        ),
      );
    },
    [dragging, nodes, onUpdateNodes],
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // ── Connection handling ───────────────────────────────────────────────

  const handleOutputClick = useCallback(
    (e: React.MouseEvent, nodeId: string, handle?: string) => {
      e.stopPropagation();
      setConnecting({ sourceId: nodeId, sourceHandle: handle });
    },
    [],
  );

  const handleInputClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      if (!connecting) return;
      if (connecting.sourceId === nodeId) {
        setConnecting(null);
        return;
      }

      // Create new edge
      const newEdge: WorkflowEdge = {
        id: `e-${connecting.sourceId}-${nodeId}-${Date.now()}`,
        source: connecting.sourceId,
        target: nodeId,
        sourceHandle: connecting.sourceHandle,
      };

      // Avoid duplicate edges
      const exists = edges.some(
        (e) =>
          e.source === newEdge.source &&
          e.target === newEdge.target &&
          e.sourceHandle === newEdge.sourceHandle,
      );

      if (!exists) {
        onUpdateEdges([...edges, newEdge]);
      }
      setConnecting(null);
    },
    [connecting, edges, onUpdateEdges],
  );

  const handleCanvasClick = useCallback(() => {
    onSelectNode(null);
    setConnecting(null);
  }, [onSelectNode]);

  // ── Edge path calculation ─────────────────────────────────────────────

  const getNodeCenter = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return { x: 0, y: 0 };
      return {
        x: node.position.x + NODE_WIDTH / 2,
        y: node.position.y + NODE_HEIGHT / 2,
      };
    },
    [nodes],
  );

  const getOutputPos = useCallback(
    (nodeId: string, handle?: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return { x: 0, y: 0 };

      if (node.type === "condition" && handle) {
        const isTrue = handle === "true";
        return {
          x: node.position.x + (isTrue ? NODE_WIDTH * 0.33 : NODE_WIDTH * 0.67),
          y: node.position.y + NODE_HEIGHT,
        };
      }

      return {
        x: node.position.x + NODE_WIDTH / 2,
        y: node.position.y + NODE_HEIGHT,
      };
    },
    [nodes],
  );

  const getInputPos = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return { x: 0, y: 0 };
      return {
        x: node.position.x + NODE_WIDTH / 2,
        y: node.position.y,
      };
    },
    [nodes],
  );

  // ── Edge removal ──────────────────────────────────────────────────────

  const handleEdgeClick = useCallback(
    (e: React.MouseEvent, edgeId: string) => {
      e.stopPropagation();
      onUpdateEdges(edges.filter((edge) => edge.id !== edgeId));
    },
    [edges, onUpdateEdges],
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      className="w-full h-full overflow-auto bg-[#0d1117] relative"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ minWidth: 800, minHeight: 600 }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="rgba(255,255,255,0.3)"
            />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge) => {
          const from = getOutputPos(edge.source, edge.sourceHandle);
          const to = getInputPos(edge.target);
          const midY = (from.y + to.y) / 2;

          return (
            <g key={edge.id}>
              <path
                d={`M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`}
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={2}
                markerEnd="url(#arrowhead)"
                className="cursor-pointer hover:stroke-red-400 transition-colors"
                onClick={(e) => handleEdgeClick(e, edge.id)}
              />
              {edge.sourceHandle && (
                <text
                  x={(from.x + to.x) / 2}
                  y={midY - 5}
                  textAnchor="middle"
                  fontSize={9}
                  fill="rgba(255,255,255,0.4)"
                >
                  {edge.sourceHandle}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isSelected = node.id === selectedNodeId;
          const color = nodeTypeColors[node.type] ?? "#6b7280";
          const Icon = NODE_ICONS[node.type] ?? Zap;

          return (
            <g key={node.id}>
              {/* Node body */}
              <rect
                x={node.position.x}
                y={node.position.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                fill="#1a1f2e"
                stroke={isSelected ? color : "rgba(255,255,255,0.1)"}
                strokeWidth={isSelected ? 2 : 1}
                className="cursor-move"
                onMouseDown={(e) => handleMouseDown(e, node.id)}
              />

              {/* Color accent bar */}
              <rect
                x={node.position.x}
                y={node.position.y}
                width={4}
                height={NODE_HEIGHT}
                rx={2}
                fill={color}
                className="pointer-events-none"
              />

              {/* Icon + label */}
              <foreignObject
                x={node.position.x + 12}
                y={node.position.y + 8}
                width={NODE_WIDTH - 24}
                height={NODE_HEIGHT - 16}
                className="pointer-events-none"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <Icon size={12} style={{ color }} />
                    <span className="text-[11px] font-medium text-white/90 truncate">
                      {node.label}
                    </span>
                  </div>
                  <span className="text-[9px] text-white/40 truncate">
                    {getNodeSummary(node)}
                  </span>
                </div>
              </foreignObject>

              {/* Input handle (top) — skip for trigger */}
              {node.type !== "trigger" && (
                <circle
                  cx={node.position.x + NODE_WIDTH / 2}
                  cy={node.position.y}
                  r={HANDLE_RADIUS}
                  fill={connecting ? "#4ade80" : "#374151"}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                  className="cursor-crosshair"
                  onClick={(e) => handleInputClick(e, node.id)}
                />
              )}

              {/* Output handle(s) (bottom) — skip for output */}
              {node.type !== "output" && node.type === "condition" ? (
                <>
                  {/* True handle */}
                  <circle
                    cx={node.position.x + NODE_WIDTH * 0.33}
                    cy={node.position.y + NODE_HEIGHT}
                    r={HANDLE_RADIUS}
                    fill={
                      connecting?.sourceId === node.id &&
                      connecting?.sourceHandle === "true"
                        ? "#4ade80"
                        : "#374151"
                    }
                    stroke="#22c55e"
                    strokeWidth={1}
                    className="cursor-crosshair"
                    onClick={(e) => handleOutputClick(e, node.id, "true")}
                  />
                  <text
                    x={node.position.x + NODE_WIDTH * 0.33}
                    y={node.position.y + NODE_HEIGHT + 14}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#22c55e"
                    className="pointer-events-none"
                  >
                    T
                  </text>

                  {/* False handle */}
                  <circle
                    cx={node.position.x + NODE_WIDTH * 0.67}
                    cy={node.position.y + NODE_HEIGHT}
                    r={HANDLE_RADIUS}
                    fill={
                      connecting?.sourceId === node.id &&
                      connecting?.sourceHandle === "false"
                        ? "#f87171"
                        : "#374151"
                    }
                    stroke="#ef4444"
                    strokeWidth={1}
                    className="cursor-crosshair"
                    onClick={(e) => handleOutputClick(e, node.id, "false")}
                  />
                  <text
                    x={node.position.x + NODE_WIDTH * 0.67}
                    y={node.position.y + NODE_HEIGHT + 14}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#ef4444"
                    className="pointer-events-none"
                  >
                    F
                  </text>
                </>
              ) : node.type !== "output" ? (
                <circle
                  cx={node.position.x + NODE_WIDTH / 2}
                  cy={node.position.y + NODE_HEIGHT}
                  r={HANDLE_RADIUS}
                  fill={
                    connecting?.sourceId === node.id
                      ? "#60a5fa"
                      : "#374151"
                  }
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                  className="cursor-crosshair"
                  onClick={(e) => handleOutputClick(e, node.id)}
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* Connection mode indicator */}
      {connecting && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs border border-blue-500/30">
          Click a target node's input handle to connect
          <button
            type="button"
            onClick={() => setConnecting(null)}
            className="ml-2 text-blue-300 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNodeSummary(node: WorkflowNode): string {
  switch (node.type) {
    case "trigger":
      return String(node.config.triggerType ?? "manual");
    case "action":
      return String(node.config.actionName ?? "—");
    case "llm":
      return truncate(String(node.config.prompt ?? ""), 30);
    case "condition":
      return truncate(String(node.config.expression ?? ""), 30);
    case "transform":
      return "JavaScript";
    case "delay":
      return node.config.duration
        ? String(node.config.duration)
        : node.config.date
          ? "until date"
          : "—";
    case "hook":
      return String(node.config.hookId ?? "—");
    case "loop":
      return `each ${node.config.variableName ?? "item"}`;
    case "subworkflow":
      return "sub";
    case "output":
      return "terminal";
    default:
      return "";
  }
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
}
