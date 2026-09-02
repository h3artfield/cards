"use client";

import { useMemo, useRef, useState } from "react";
import type { BrewTreeGraphV42, BrewTreeNodeV42 } from "@/lib/deck-synthesis/professor-brew-tree-v4-2-v1";

const EDGE_STYLES: Record<string, { stroke: string; dash?: string; width: number }> = {
  SOLID: { stroke: "#6ee7b7", width: 2 },
  DASHED: { stroke: "#737373", dash: "6 4", width: 1.5 },
  GLOWING: { stroke: "#c4b5fd", width: 2.5 },
  QUESTION: { stroke: "#ca8a04", dash: "3 3", width: 1.5 },
  REJECTED: { stroke: "#525252", dash: "2 4", width: 1 },
};

function nodeStyle(node: BrewTreeNodeV42, selected: boolean) {
  const base = selected ? "stroke-amber-400 stroke-2" : "stroke-neutral-700";
  if (node.kind === "COMMANDER") return `${base} fill-neutral-100`;
  if (node.kind === "DISCOVERY") return `${base} fill-violet-900/80 stroke-violet-400`;
  if (node.kind === "CARD") {
    if (node.cardStatus === "CORE") return `${base} fill-amber-900/60 stroke-amber-500`;
    if (node.cardStatus === "VERIFIED") return `${base} fill-emerald-950/50 stroke-emerald-600`;
    return `${base} fill-neutral-900/80 opacity-60`;
  }
  if (node.kind === "PACKAGE") return `${base} fill-neutral-800/80`;
  if (node.kind === "ENGINE") return `${base} fill-neutral-900/60`;
  return `${base} fill-neutral-900/40`;
}

function nodeRadius(node: BrewTreeNodeV42): number {
  if (node.kind === "COMMANDER") return 34;
  if (node.kind === "DISCOVERY") return 26;
  if (node.kind === "CARD") return node.cardStatus === "CORE" ? 20 : 16;
  if (node.kind === "PACKAGE") return 22;
  return 20;
}

function cardDimensions(node: BrewTreeNodeV42): { width: number; height: number } | null {
  if (!node.imageUrl) return null;
  if (node.kind === "COMMANDER") return { width: 88, height: 123 };
  if (node.kind === "CARD") return { width: 54, height: 76 };
  return null;
}

export function BrewTreeCanvas({
  tree,
  selectedNodeId,
  onSelectNode,
}: {
  tree: BrewTreeGraphV42;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const viewBox = useMemo(() => {
    if (tree.nodes.length === 0) return { minX: 0, minY: 0, width: 800, height: 600 };
    const xs = tree.nodes.map((n) => n.x);
    const ys = tree.nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 140;
    const maxX = Math.max(...xs) + 140;
    const minY = Math.min(...ys) - 60;
    const maxY = Math.max(...ys) + 100;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [tree.nodes]);

  return (
    <div className="relative h-full min-h-[480px] overflow-hidden bg-[radial-gradient(ellipse_at_center,_#12121a_0%,_#07070a_70%)]">
      <div className="absolute left-3 top-3 z-10 rounded border border-neutral-800/80 bg-black/40 px-2 py-1 text-[10px] text-neutral-500">
        Step {tree.revealStep}/{tree.maxRevealStep} · pan · scroll zoom
      </div>
      <svg
        className="h-full w-full cursor-grab active:cursor-grabbing"
        viewBox={`${viewBox.minX + pan.x} ${viewBox.minY + pan.y} ${viewBox.width / zoom} ${viewBox.height / zoom}`}
        onWheel={(e) => {
          e.preventDefault();
          setZoom((z) => Math.min(2.2, Math.max(0.5, z + (e.deltaY > 0 ? -0.08 : 0.08))));
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          const dx = (e.clientX - dragRef.current.x) * (viewBox.width / zoom / 900);
          const dy = (e.clientY - dragRef.current.y) * (viewBox.height / zoom / 600);
          setPan({ x: dragRef.current.panX - dx, y: dragRef.current.panY - dy });
        }}
        onMouseUp={() => {
          dragRef.current = null;
        }}
        onMouseLeave={() => {
          dragRef.current = null;
        }}
      >
        {tree.edges.map((edge) => {
          const source = tree.nodes.find((n) => n.nodeId === edge.sourceNodeId);
          const target = tree.nodes.find((n) => n.nodeId === edge.targetNodeId);
          if (!source || !target) return null;
          const style = EDGE_STYLES[edge.style] ?? EDGE_STYLES.SOLID!;
          const sourceR = cardDimensions(source)?.height ? cardDimensions(source)!.height / 2 : nodeRadius(source);
          const targetR = cardDimensions(target)?.height ? cardDimensions(target)!.height / 2 : nodeRadius(target);
          return (
            <g key={edge.edgeId}>
              <line
                x1={source.x}
                y1={source.y + sourceR}
                x2={target.x}
                y2={target.y - targetR}
                stroke={style.stroke}
                strokeWidth={style.width}
                strokeDasharray={style.dash}
                opacity={edge.style === "GLOWING" ? 0.95 : 0.7}
              />
              {edge.label ? (
                <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2} fill="#525252" fontSize="9" textAnchor="middle">
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {tree.nodes.map((node) => {
          const r = nodeRadius(node);
          const selected = node.nodeId === selectedNodeId;
          const cardSize = cardDimensions(node);
          const clipId = `brew-tree-clip-${node.nodeId}`;

          return (
            <g
              key={node.nodeId}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(node.nodeId);
              }}
            >
              {node.kind === "DISCOVERY" ? (
                <circle cx={node.x} cy={node.y} r={r + 6} fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.5" className="animate-pulse" />
              ) : null}

              {cardSize ? (
                <>
                  <defs>
                    <clipPath id={clipId}>
                      <rect
                        x={node.x - cardSize.width / 2}
                        y={node.y - cardSize.height / 2}
                        width={cardSize.width}
                        height={cardSize.height}
                        rx={4}
                      />
                    </clipPath>
                  </defs>
                  <rect
                    x={node.x - cardSize.width / 2 - 1}
                    y={node.y - cardSize.height / 2 - 1}
                    width={cardSize.width + 2}
                    height={cardSize.height + 2}
                    rx={5}
                    fill="#171717"
                    stroke={selected ? "#fbbf24" : "#404040"}
                    strokeWidth={selected ? 2 : 1}
                  />
                  <image
                    href={node.imageUrl}
                    x={node.x - cardSize.width / 2}
                    y={node.y - cardSize.height / 2}
                    width={cardSize.width}
                    height={cardSize.height}
                    clipPath={`url(#${clipId})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                </>
              ) : (
                <circle cx={node.x} cy={node.y} r={r} className={nodeStyle(node, selected)} />
              )}

              <text
                x={node.x}
                y={node.y - (cardSize ? cardSize.height / 2 : r) - 6}
                fill="#e5e5e5"
                fontSize={node.kind === "COMMANDER" ? 11 : 9}
                textAnchor="middle"
                fontWeight={node.kind === "COMMANDER" ? 600 : 400}
              >
                {node.label.length > 22 ? `${node.label.slice(0, 20)}…` : node.label}
              </text>
              {node.cardStatus ? (
                <text x={node.x} y={node.y + (cardSize ? cardSize.height / 2 : r) + 12} fill="#a3a3a3" fontSize="8" textAnchor="middle">
                  {node.cardStatus}
                </text>
              ) : null}
              {node.subtitle ? (
                <text x={node.x} y={node.y + (cardSize ? cardSize.height / 2 : r) + 22} fill="#737373" fontSize="8" textAnchor="middle">
                  {node.subtitle.slice(0, 28)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
