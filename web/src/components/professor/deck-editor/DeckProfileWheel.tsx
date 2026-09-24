"use client";

import { COS_V1_PROFILE_META } from "@/lib/commander-optimization-score/v1/profile-scalars";
import type { CosProfileDecagonPointV1 } from "../CosProfileDecagon";
import { useState } from "react";

export type DeckProfileSpokeV1 = {
  key: string;
  label: string;
  count: number;
};

const SIZE = 184;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADIUS = 70;
const AXIS_COUNT = COS_V1_PROFILE_META.length;

function polar(index: number, radius: number): [number, number] {
  const angle = (Math.PI * 2 * index) / AXIS_COUNT - Math.PI / 2;
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
}

function axisValue(axis: CosProfileDecagonPointV1 | undefined): number {
  if (!axis?.measurable) return 0;
  return Math.max(0, Math.min(100, axis.percentile));
}

/**
 * Same ten-axis COS shape as the deck tile. That is the graded profile of the
 * list — not a six-role card-count hexagon.
 */
export function DeckProfileWheel({
  grade,
  bracket,
  playstyle,
  cosProfile,
}: {
  spokes?: readonly DeckProfileSpokeV1[];
  grade?: string | null;
  bracket?: number | null;
  playstyle?: string;
  focused?: string | null;
  onFocus?: (key: string | null) => void;
  cosProfile?: readonly CosProfileDecagonPointV1[] | null;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  if (!cosProfile?.length) return null;

  const byId = new Map(cosProfile.map((axis) => [axis.id, axis]));
  const polygon = COS_V1_PROFILE_META.map((meta, index) => {
    const value = axisValue(byId.get(meta.id));
    return polar(index, (value / 100) * RADIUS).join(",");
  }).join(" ");
  const hoveredMeta = COS_V1_PROFILE_META.find((meta) => meta.id === hoverId) ?? null;
  const hoveredAxis = hoveredMeta ? byId.get(hoveredMeta.id) : undefined;

  return (
    <div className="deck-profile-wheel">
      {bracket != null ? <span className="deck-profile-wheel__bracket">Bracket {bracket}</span> : null}
      <svg
        className="deck-profile-wheel__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label="Deck grade profile"
      >
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <polygon
            key={ratio}
            points={COS_V1_PROFILE_META.map((_, index) => polar(index, RADIUS * ratio).join(",")).join(" ")}
            className="deck-profile-wheel__grid"
          />
        ))}
        {COS_V1_PROFILE_META.map((meta, index) => {
          const [x, y] = polar(index, RADIUS);
          return (
            <line
              key={`axis-${meta.id}`}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              className="deck-profile-wheel__axis"
            />
          );
        })}
        <polygon points={polygon} className="deck-profile-wheel__fill" />
        {COS_V1_PROFILE_META.map((meta, index) => {
          const value = axisValue(byId.get(meta.id));
          const [x, y] = polar(index, (value / 100) * RADIUS);
          const on = hoverId === meta.id;
          return (
            <circle
              key={`dot-${meta.id}`}
              cx={x}
              cy={y}
              r={on ? 4.5 : 3}
              className={on ? "deck-profile-wheel__dot deck-profile-wheel__dot--on" : "deck-profile-wheel__dot"}
            />
          );
        })}
        {COS_V1_PROFILE_META.map((meta, index) => {
          const [x, y] = polar(index, RADIUS * 1.12);
          const next = polar((index + 1) % AXIS_COUNT, RADIUS * 1.12);
          return (
            <path
              key={`hit-${meta.id}`}
              d={`M ${CX} ${CY} L ${x[0].toFixed(1)} ${x[1].toFixed(1)} L ${next[0].toFixed(1)} ${next[1].toFixed(1)} Z`}
              className="deck-profile-wheel__hit"
              onMouseEnter={() => setHoverId(meta.id)}
              onMouseLeave={() => setHoverId((current) => (current === meta.id ? null : current))}
            >
              <title>
                {`${meta.label} — ${
                  byId.get(meta.id)?.measurable
                    ? `${Math.round(byId.get(meta.id)!.percentile)}th percentile`
                    : "unmeasured"
                }. ${meta.measures}`}
              </title>
            </path>
          );
        })}
        <circle cx={CX} cy={CY} r="28" className="deck-profile-wheel__hub" />
        {grade ? (
          <text x={CX} y={CY + 6} textAnchor="middle" className="deck-profile-wheel__grade">
            {grade}
          </text>
        ) : (
          <text
            x={CX}
            y={CY + 5}
            textAnchor="middle"
            className="deck-profile-wheel__grade deck-profile-wheel__grade--empty"
          >
            —
          </text>
        )}
      </svg>
      {playstyle ? <span className="deck-profile-wheel__style">{playstyle}</span> : null}
      {hoveredMeta ? (
        <div className="deck-profile-wheel__tip" role="status">
          <strong>
            {hoveredMeta.label}{" "}
            <span className="tabular-nums">
              {hoveredAxis?.measurable ? `${Math.round(hoveredAxis.percentile)}` : "—"}
            </span>
          </strong>
          <p>{hoveredMeta.measures}</p>
        </div>
      ) : null}
    </div>
  );
}
