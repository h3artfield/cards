"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SemanticMapCompareResult, SemanticMapInventoryOverlay, SemanticMapPoint } from "@/lib/semantic-visualization/types";

const QUALITY_COLORS: Record<string, string> = {
  publishable: "#7dd3fc",
  needs_review: "#fbbf24",
  quarantined: "#f87171",
};

export function SemanticMapCanvas2D({
  points,
  allPoints,
  selectedOracleId,
  hoverOracleId,
  highlightOracleIds,
  compare,
  inventoryMap,
  flyTarget,
  onFlyComplete,
  onHover,
  onSelect,
}: {
  points: SemanticMapPoint[];
  allPoints: SemanticMapPoint[];
  selectedOracleId: string | null;
  hoverOracleId: string | null;
  highlightOracleIds: string[];
  compare: SemanticMapCompareResult | null;
  inventoryMap: Map<string, SemanticMapInventoryOverlay>;
  flyTarget: string | null;
  onFlyComplete: () => void;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ scale: 40, offsetX: 0, offsetY: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const bounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of allPoints) {
      minX = Math.min(minX, p.x2);
      maxX = Math.max(maxX, p.x2);
      minY = Math.min(minY, p.y2);
      maxY = Math.max(maxY, p.y2);
    }
    return { minX, maxX, minY, maxY };
  }, [allPoints]);

  useEffect(() => {
    if (!flyTarget) return;
    const p = allPoints.find((x) => x.oracleId === flyTarget);
    if (!p) return;
    setView((v) => ({ ...v, offsetX: -p.x2 * v.scale, offsetY: p.y2 * v.scale }));
    onFlyComplete();
  }, [flyTarget, allPoints, onFlyComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    const toScreen = (x: number, y: number) => ({
      sx: w / 2 + x * view.scale + view.offsetX,
      sy: h / 2 - y * view.scale + view.offsetY,
    });

    if (compare) {
      const a = points.find((p) => p.oracleId === compare.cardA.oracleId);
      const b = points.find((p) => p.oracleId === compare.cardB.oracleId);
      if (a && b) {
        const pa = toScreen(a.x2, a.y2);
        const pb = toScreen(b.x2, b.y2);
        ctx.strokeStyle = "#f472b6";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
        ctx.stroke();
      }
    }

    for (const p of points) {
      const { sx, sy } = toScreen(p.x2, p.y2);
      const inv = inventoryMap.get(p.oracleId);
      const isSelected = p.oracleId === selectedOracleId;
      const isHighlight = highlightOracleIds.includes(p.oracleId);
      const isHover = p.oracleId === hoverOracleId;
      let color = inv?.inStock ? "#34d399" : (QUALITY_COLORS[p.qualityStatus] ?? "#7dd3fc");
      if (selectedOracleId && !isSelected && !isHighlight) color = "#334155";
      if (isSelected) color = "#fbbf24";
      if (isHover && !isSelected) color = "#ffffff";
      const radius = isSelected ? 10 : isHighlight ? 7 : isHover ? 6 : 3;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
      if (isSelected) {
        ctx.beginPath();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.arc(sx, sy, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.arc(sx, sy, radius + 8, 0, Math.PI * 2);
        ctx.stroke();
      } else if (isHover) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [points, compare, view, selectedOracleId, hoverOracleId, highlightOracleIds, inventoryMap]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full cursor-grab active:cursor-grabbing"
      onWheel={(e) => {
        e.preventDefault();
        setView((v) => ({ ...v, scale: Math.max(10, Math.min(200, v.scale - e.deltaY * 0.05)) }));
      }}
      onMouseDown={(e) => {
        dragRef.current = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
      }}
      onMouseMove={(e) => {
        if (dragRef.current) {
          const d = dragRef.current;
          setView((v) => ({
            ...v,
            offsetX: d.ox + (e.clientX - d.x),
            offsetY: d.oy + (e.clientY - d.y),
          }));
          return;
        }
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        let found: string | null = null;
        for (const p of points) {
          const sx = rect.width / 2 + p.x2 * view.scale + view.offsetX;
          const sy = rect.height / 2 - p.y2 * view.scale + view.offsetY;
          if ((mx - sx) ** 2 + (my - sy) ** 2 < 36) {
            found = p.oracleId;
            break;
          }
        }
        onHover(found);
      }}
      onMouseUp={() => {
        dragRef.current = null;
      }}
      onMouseLeave={() => {
        dragRef.current = null;
        onHover(null);
      }}
      onClick={(e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        for (const p of points) {
          const sx = rect.width / 2 + p.x2 * view.scale + view.offsetX;
          const sy = rect.height / 2 - p.y2 * view.scale + view.offsetY;
          if ((mx - sx) ** 2 + (my - sy) ** 2 < 36) {
            onSelect(p.oracleId);
            break;
          }
        }
      }}
    />
  );
}
