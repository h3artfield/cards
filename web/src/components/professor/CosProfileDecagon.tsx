"use client";

import { COS_V1_PROFILE_META } from "@/lib/commander-optimization-score/v1/profile-scalars";
import type { CosV1ProfileAxisId } from "@/lib/commander-optimization-score/v1/types";

export type CosProfileDecagonPointV1 = {
  id: CosV1ProfileAxisId;
  percentile: number;
  measurable: boolean;
};

const AXIS_COUNT = COS_V1_PROFILE_META.length;

function axisValue(axis: CosProfileDecagonPointV1 | undefined): number {
  if (!axis?.measurable) return 0;
  return Math.max(0, Math.min(100, axis.percentile));
}

function polarPoint(index: number, radius: number, cx: number, cy: number) {
  const angle = (Math.PI * 2 * index) / AXIS_COUNT - Math.PI / 2;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function polygonPoints(
  profile: readonly CosProfileDecagonPointV1[],
  cx: number,
  cy: number,
  maxR: number,
): string {
  const byId = new Map(profile.map((axis) => [axis.id, axis]));
  return COS_V1_PROFILE_META.map((meta, index) => {
    const value = axisValue(byId.get(meta.id));
    const { x, y } = polarPoint(index, (value / 100) * maxR, cx, cy);
    return `${x},${y}`;
  }).join(" ");
}

/**
 * Ten-axis deck profile — one vertex per COS dimension.
 *
 * Percentiles are 0–100 versus comparable decks. Unmeasurable axes collapse to
 * the center rather than inventing a score.
 */
export function CosProfileDecagon({
  profile,
  size = 56,
  className,
  title,
}: {
  profile: readonly CosProfileDecagonPointV1[];
  size?: number;
  className?: string;
  title?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;
  const rings = [0.25, 0.5, 0.75, 1];
  const spokes = COS_V1_PROFILE_META.map((meta, index) => {
    const outer = polarPoint(index, maxR, cx, cy);
    return { meta, outer };
  });
  const fill = polygonPoints(profile, cx, cy, maxR);
  const tooltip = title ?? "Deck profile — ten COS dimensions versus comparable lists";

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={tooltip}
    >
      <title>{tooltip}</title>
      {rings.map((scale) => (
        <polygon
          key={scale}
          points={COS_V1_PROFILE_META.map((_, index) => {
            const { x, y } = polarPoint(index, maxR * scale, cx, cy);
            return `${x},${y}`;
          }).join(" ")}
          fill="none"
          stroke="rgba(201, 162, 39, 0.18)"
          strokeWidth={0.6}
        />
      ))}
      {spokes.map(({ meta, outer }) => (
        <line
          key={meta.id}
          x1={cx}
          y1={cy}
          x2={outer.x}
          y2={outer.y}
          stroke="rgba(201, 162, 39, 0.14)"
          strokeWidth={0.5}
        />
      ))}
      <polygon
        points={fill}
        fill="rgba(201, 162, 39, 0.28)"
        stroke="rgba(201, 162, 39, 0.85)"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
