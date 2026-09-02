"use client";

import { useMemo, useRef, useState } from "react";
import type { DeckBuildGraph, DeckBuildGraphNode } from "@/lib/deck-synthesis/deck-build-graph-v1";

const NODE_COLORS: Record<string, string> = {
  COMMAND_ZONE_MEMBER: "#e5e5e5",
  BUILD_PATH: "#a3a3a3",
  CANDIDATE_INTENT: "#737373",
  CARD: "#525252",
  PACKAGE: "#404040",
};

function nodeRadius(node: DeckBuildGraphNode): number {
  switch (node.nodeType) {
    case "COMMAND_ZONE_MEMBER":
      return 28;
    case "CANDIDATE_INTENT":
      return 22;
    case "CARD":
      return 16;
    default:
      return 18;
  }
}

export function DeckBuildGraph2D({
  graph,
  onSelectNode,
  selectedNodeId,
}: {
  graph: DeckBuildGraph;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const viewBox = useMemo(() => {
    const xs = graph.nodes.map((n) => n.x);
    const ys = graph.nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 120;
    const maxX = Math.max(...xs) + 120;
    const minY = Math.min(...ys) - 80;
    const maxY = Math.max(...ys) + 120;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [graph.nodes]);

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-xl border border-neutral-800 bg-[#0a0a0a]">
      <svg
        ref={svgRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        viewBox={`${viewBox.minX + pan.x} ${viewBox.minY + pan.y} ${viewBox.width / zoom} ${viewBox.height / zoom}`}
        onWheel={(e) => {
          e.preventDefault();
          setZoom((z) => Math.min(2, Math.max(0.6, z + (e.deltaY > 0 ? -0.08 : 0.08))));
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          const dx = (e.clientX - dragRef.current.x) * (viewBox.width / zoom / 800);
          const dy = (e.clientY - dragRef.current.y) * (viewBox.height / zoom / 500);
          setPan({ x: dragRef.current.panX - dx, y: dragRef.current.panY - dy });
        }}
        onMouseUp={() => {
          dragRef.current = null;
        }}
        onMouseLeave={() => {
          dragRef.current = null;
        }}
      >
        {graph.edges.map((edge) => {
          const source = graph.nodes.find((n) => n.nodeId === edge.sourceNodeId);
          const target = graph.nodes.find((n) => n.nodeId === edge.targetNodeId);
          if (!source || !target) return null;
          return (
            <g key={edge.edgeId}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={edge.bridge ? "#737373" : "#404040"}
                strokeWidth={edge.bridge ? 1.5 : 1}
                strokeDasharray={edge.bridge ? "4 3" : undefined}
              />
            </g>
          );
        })}

        {graph.nodes.map((node) => {
          const r = nodeRadius(node);
          const selected = selectedNodeId === node.nodeId;
          return (
            <g
              key={node.nodeId}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(selected ? null : node.nodeId);
              }}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={r}
                fill={selected ? "#262626" : node.meta?.bridge ? "#1a1a2e" : "#141414"}
                stroke={
                  selected
                    ? "#d4d4d4"
                    : node.meta?.bridge
                      ? "#a78bfa"
                      : NODE_COLORS[node.nodeType] ?? "#525252"
                }
                strokeWidth={selected ? 2 : node.meta?.bridge ? 1.5 : 1}
              />
              <text
                x={node.x}
                y={node.y + r + 14}
                textAnchor="middle"
                fill="#a3a3a3"
                fontSize={node.nodeType === "CARD" ? 10 : 11}
              >
                {node.label.length > 22 ? `${node.label.slice(0, 20)}…` : node.label}
              </text>
              {node.subtitle ? (
                <text x={node.x} y={node.y + r + 26} textAnchor="middle" fill="#525252" fontSize={9}>
                  {node.subtitle}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-neutral-800 bg-neutral-950/90 px-2 py-1 text-[10px] text-neutral-500">
        Pan · scroll to zoom · click node for detail
      </div>
    </div>
  );
}
