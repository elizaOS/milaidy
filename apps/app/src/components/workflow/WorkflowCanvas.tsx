/**
 * WorkflowCanvas — stateful controller for the SVG workflow scene.
 *
 * Keeps drag/connect state and delegates the actual SVG rendering to
 * `WorkflowCanvasScene`.
 */

import { useCallback, useRef, useState } from "react";
import type { WorkflowEdge, WorkflowNode } from "../../api-client";
import {
  WORKFLOW_NODE_HEIGHT,
  WORKFLOW_NODE_WIDTH,
  WorkflowCanvasScene,
} from "./WorkflowCanvasScene";

interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdateNodes: (nodes: WorkflowNode[]) => void;
  onUpdateEdges: (edges: WorkflowEdge[]) => void;
  nodeTypeColors: Record<string, string>;
}

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

  const startConnection = useCallback((nodeId: string, handle?: string) => {
    setConnecting({ sourceId: nodeId, sourceHandle: handle });
  }, []);

  const connectToInput = useCallback(
    (nodeId: string) => {
      if (!connecting) return;
      if (connecting.sourceId === nodeId) {
        setConnecting(null);
        return;
      }

      const newEdge: WorkflowEdge = {
        id: `e-${connecting.sourceId}-${nodeId}-${Date.now()}`,
        source: connecting.sourceId,
        target: nodeId,
        sourceHandle: connecting.sourceHandle,
      };

      const exists = edges.some(
        (edge) =>
          edge.source === newEdge.source &&
          edge.target === newEdge.target &&
          edge.sourceHandle === newEdge.sourceHandle,
      );

      if (!exists) {
        onUpdateEdges([...edges, newEdge]);
      }
      setConnecting(null);
    },
    [connecting, edges, onUpdateEdges],
  );

  const handleOutputClick = useCallback(
    (e: React.MouseEvent, nodeId: string, handle?: string) => {
      e.stopPropagation();
      startConnection(nodeId, handle);
    },
    [startConnection],
  );

  const handleInputClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      connectToInput(nodeId);
    },
    [connectToInput],
  );

  const handleCanvasClick = useCallback(() => {
    onSelectNode(null);
    setConnecting(null);
  }, [onSelectNode]);

  const handleActivateKeyDown = useCallback(
    (event: React.KeyboardEvent<SVGElement>, action: () => void) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      action();
    },
    [],
  );

  // ── Edge path calculation ─────────────────────────────────────────────

  const getOutputPos = useCallback(
    (nodeId: string, handle?: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return { x: 0, y: 0 };

      if (node.type === "condition" && handle) {
        const isTrue = handle === "true";
        return {
          x:
            node.position.x +
            (isTrue ? WORKFLOW_NODE_WIDTH * 0.33 : WORKFLOW_NODE_WIDTH * 0.67),
          y: node.position.y + WORKFLOW_NODE_HEIGHT,
        };
      }

      return {
        x: node.position.x + WORKFLOW_NODE_WIDTH / 2,
        y: node.position.y + WORKFLOW_NODE_HEIGHT,
      };
    },
    [nodes],
  );

  const getInputPos = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return { x: 0, y: 0 };
      return {
        x: node.position.x + WORKFLOW_NODE_WIDTH / 2,
        y: node.position.y,
      };
    },
    [nodes],
  );

  // ── Edge removal ──────────────────────────────────────────────────────

  const removeEdge = useCallback(
    (edgeId: string) => {
      onUpdateEdges(edges.filter((edge) => edge.id !== edgeId));
    },
    [edges, onUpdateEdges],
  );

  const handleEdgeClick = useCallback(
    (e: React.MouseEvent, edgeId: string) => {
      e.stopPropagation();
      removeEdge(edgeId);
    },
    [removeEdge],
  );

  return (
    <WorkflowCanvasScene
      connectToInput={connectToInput}
      connecting={connecting}
      edges={edges}
      getInputPos={getInputPos}
      getOutputPos={getOutputPos}
      handleActivateKeyDown={handleActivateKeyDown}
      handleCanvasClick={handleCanvasClick}
      handleEdgeClick={handleEdgeClick}
      handleInputClick={handleInputClick}
      handleMouseDown={handleMouseDown}
      handleMouseMove={handleMouseMove}
      handleMouseUp={handleMouseUp}
      handleOutputClick={handleOutputClick}
      nodeTypeColors={nodeTypeColors}
      nodes={nodes}
      onSelectNode={onSelectNode}
      removeEdge={removeEdge}
      selectedNodeId={selectedNodeId}
      setConnecting={setConnecting}
      startConnection={startConnection}
      svgRef={svgRef}
    />
  );
}
