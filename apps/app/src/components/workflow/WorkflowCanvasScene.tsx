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
import type { WorkflowEdge, WorkflowNode } from "../../api-client";

export const WORKFLOW_NODE_WIDTH = 180;
export const WORKFLOW_NODE_HEIGHT = 60;
export const WORKFLOW_HANDLE_RADIUS = 6;

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

type WorkflowCanvasSceneProps = {
  connectToInput: (nodeId: string) => void;
  connecting: {
    sourceId: string;
    sourceHandle?: string;
  } | null;
  edges: WorkflowEdge[];
  getInputPos: (nodeId: string) => { x: number; y: number };
  getOutputPos: (nodeId: string, handle?: string) => { x: number; y: number };
  handleActivateKeyDown: (
    event: React.KeyboardEvent<SVGElement>,
    action: () => void,
  ) => void;
  handleCanvasClick: () => void;
  handleEdgeClick: (event: React.MouseEvent, edgeId: string) => void;
  handleInputClick: (event: React.MouseEvent, nodeId: string) => void;
  handleMouseDown: (event: React.MouseEvent, nodeId: string) => void;
  handleMouseMove: (event: React.MouseEvent) => void;
  handleMouseUp: () => void;
  handleOutputClick: (
    event: React.MouseEvent,
    nodeId: string,
    handle?: string,
  ) => void;
  nodeTypeColors: Record<string, string>;
  nodes: WorkflowNode[];
  onSelectNode: (nodeId: string | null) => void;
  removeEdge: (edgeId: string) => void;
  selectedNodeId: string | null;
  setConnecting: (
    value: {
      sourceId: string;
      sourceHandle?: string;
    } | null,
  ) => void;
  startConnection: (nodeId: string, handle?: string) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
};

export function WorkflowCanvasScene({
  connectToInput,
  connecting,
  edges,
  getInputPos,
  getOutputPos,
  handleActivateKeyDown,
  handleCanvasClick,
  handleEdgeClick,
  handleInputClick,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleOutputClick,
  nodeTypeColors,
  nodes,
  onSelectNode,
  removeEdge,
  selectedNodeId,
  setConnecting,
  startConnection,
  svgRef,
}: WorkflowCanvasSceneProps) {
  return (
    /* biome-ignore lint/a11y/useSemanticElements: The canvas surface needs keyboard-focusable click handling for selection reset. */
    <div
      className="w-full h-full overflow-auto bg-[#0d1117] relative"
      role="button"
      tabIndex={0}
      aria-label="Workflow builder canvas"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
      onClick={handleCanvasClick}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" ||
          event.key === " " ||
          event.key === "Escape"
        ) {
          event.preventDefault();
          handleCanvasClick();
        }
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
      >
        <title>Workflow builder canvas</title>
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,255,255,0.3)" />
          </marker>
        </defs>

        {edges.map((edge) => {
          const from = getOutputPos(edge.source, edge.sourceHandle);
          const to = getInputPos(edge.target);
          const midY = (from.y + to.y) / 2;

          return (
            <g key={edge.id}>
              {/* biome-ignore lint/a11y/useSemanticElements: SVG paths are the clickable edge hit targets in this canvas. */}
              <path
                d={`M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`}
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={2}
                markerEnd="url(#arrowhead)"
                role="button"
                tabIndex={0}
                aria-label={`Delete edge from ${edge.source} to ${edge.target}`}
                className="cursor-pointer hover:stroke-red-400 transition-colors"
                onClick={(event) => handleEdgeClick(event, edge.id)}
                onKeyDown={(event) =>
                  handleActivateKeyDown(event, () => removeEdge(edge.id))
                }
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

        {nodes.map((node) => {
          const isSelected = node.id === selectedNodeId;
          const color = nodeTypeColors[node.type] ?? "#6b7280";
          const Icon = NODE_ICONS[node.type] ?? Zap;

          return (
            <g key={node.id}>
              {/* biome-ignore lint/a11y/useSemanticElements: SVG nodes need direct focus and drag handling inside the canvas. */}
              <rect
                x={node.position.x}
                y={node.position.y}
                width={WORKFLOW_NODE_WIDTH}
                height={WORKFLOW_NODE_HEIGHT}
                rx={8}
                fill="#1a1f2e"
                stroke={isSelected ? color : "rgba(255,255,255,0.1)"}
                strokeWidth={isSelected ? 2 : 1}
                role="button"
                tabIndex={0}
                aria-label={`Select ${node.label} node`}
                className="cursor-move"
                onMouseDown={(event) => handleMouseDown(event, node.id)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) =>
                  handleActivateKeyDown(event, () => onSelectNode(node.id))
                }
              />

              <rect
                x={node.position.x}
                y={node.position.y}
                width={4}
                height={WORKFLOW_NODE_HEIGHT}
                rx={2}
                fill={color}
                className="pointer-events-none"
              />

              <foreignObject
                x={node.position.x + 12}
                y={node.position.y + 8}
                width={WORKFLOW_NODE_WIDTH - 24}
                height={WORKFLOW_NODE_HEIGHT - 16}
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

              {node.type !== "trigger" && (
                /* biome-ignore lint/a11y/useSemanticElements: SVG handles are interactive graph ports, not semantic buttons. */
                <circle
                  cx={node.position.x + WORKFLOW_NODE_WIDTH / 2}
                  cy={node.position.y}
                  r={WORKFLOW_HANDLE_RADIUS}
                  fill={connecting ? "#4ade80" : "#374151"}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                  role="button"
                  tabIndex={0}
                  aria-label={`Connect into ${node.label}`}
                  className="cursor-crosshair"
                  onClick={(event) => handleInputClick(event, node.id)}
                  onKeyDown={(event) =>
                    handleActivateKeyDown(event, () => connectToInput(node.id))
                  }
                />
              )}

              {node.type !== "output" && node.type === "condition" ? (
                <>
                  {/* biome-ignore lint/a11y/useSemanticElements: SVG handles are interactive graph ports, not semantic buttons. */}
                  <circle
                    cx={node.position.x + WORKFLOW_NODE_WIDTH * 0.33}
                    cy={node.position.y + WORKFLOW_NODE_HEIGHT}
                    r={WORKFLOW_HANDLE_RADIUS}
                    fill={
                      connecting?.sourceId === node.id &&
                      connecting?.sourceHandle === "true"
                        ? "#4ade80"
                        : "#374151"
                    }
                    stroke="#22c55e"
                    strokeWidth={1}
                    role="button"
                    tabIndex={0}
                    aria-label={`Connect true branch from ${node.label}`}
                    className="cursor-crosshair"
                    onClick={(event) =>
                      handleOutputClick(event, node.id, "true")
                    }
                    onKeyDown={(event) =>
                      handleActivateKeyDown(event, () =>
                        startConnection(node.id, "true"),
                      )
                    }
                  />
                  <text
                    x={node.position.x + WORKFLOW_NODE_WIDTH * 0.33}
                    y={node.position.y + WORKFLOW_NODE_HEIGHT + 14}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#22c55e"
                    className="pointer-events-none"
                  >
                    T
                  </text>

                  {/* biome-ignore lint/a11y/useSemanticElements: SVG handles are interactive graph ports, not semantic buttons. */}
                  <circle
                    cx={node.position.x + WORKFLOW_NODE_WIDTH * 0.67}
                    cy={node.position.y + WORKFLOW_NODE_HEIGHT}
                    r={WORKFLOW_HANDLE_RADIUS}
                    fill={
                      connecting?.sourceId === node.id &&
                      connecting?.sourceHandle === "false"
                        ? "#f87171"
                        : "#374151"
                    }
                    stroke="#ef4444"
                    strokeWidth={1}
                    role="button"
                    tabIndex={0}
                    aria-label={`Connect false branch from ${node.label}`}
                    className="cursor-crosshair"
                    onClick={(event) =>
                      handleOutputClick(event, node.id, "false")
                    }
                    onKeyDown={(event) =>
                      handleActivateKeyDown(event, () =>
                        startConnection(node.id, "false"),
                      )
                    }
                  />
                  <text
                    x={node.position.x + WORKFLOW_NODE_WIDTH * 0.67}
                    y={node.position.y + WORKFLOW_NODE_HEIGHT + 14}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#ef4444"
                    className="pointer-events-none"
                  >
                    F
                  </text>
                </>
              ) : node.type !== "output" ? (
                /* biome-ignore lint/a11y/useSemanticElements: SVG handles are interactive graph ports, not semantic buttons. */
                <circle
                  cx={node.position.x + WORKFLOW_NODE_WIDTH / 2}
                  cy={node.position.y + WORKFLOW_NODE_HEIGHT}
                  r={WORKFLOW_HANDLE_RADIUS}
                  fill={
                    connecting?.sourceId === node.id ? "#60a5fa" : "#374151"
                  }
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                  role="button"
                  tabIndex={0}
                  aria-label={`Connect output from ${node.label}`}
                  className="cursor-crosshair"
                  onClick={(event) => handleOutputClick(event, node.id)}
                  onKeyDown={(event) =>
                    handleActivateKeyDown(event, () => startConnection(node.id))
                  }
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      {connecting && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs border border-blue-500/30">
          Click a target node&apos;s input handle to connect
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

function getNodeSummary(node: WorkflowNode): string {
  switch (node.type) {
    case "trigger":
      return String(node.config.triggerType ?? "manual");
    case "action":
      return String(node.config.actionName ?? "—");
    case "llm":
      return truncate(String(node.config.prompt ?? ""), 30);
    case "condition":
      return truncate(
        String(
          node.config.expression ??
            node.config.leftOperand ??
            node.config.operator ??
            "",
        ),
        30,
      );
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

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
