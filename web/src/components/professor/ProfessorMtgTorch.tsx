"use client";

/** 16-bit wall torch — pixel art SVG with animated flame. */
export function ProfessorMtgTorch({
  side,
  compact = false,
}: {
  side: "left" | "right";
  compact?: boolean;
}) {
  const size = compact ? { w: 24, h: 78 } : { w: 32, h: 104 };
  return (
    <div
      className={`professor-mtg-torch professor-mtg-torch--${side}${compact ? " professor-mtg-torch--compact" : ""}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 16 52"
        width={size.w}
        height={size.h}
        shapeRendering="crispEdges"
        className="professor-mtg-torch__sprite"
      >
        {/* wall mount */}
        <rect x="2" y="44" width="12" height="3" fill="#3a3228" />
        <rect x="3" y="41" width="10" height="3" fill="#4a4035" />
        <rect x="5" y="38" width="6" height="3" fill="#5c4f42" />
        {/* gold bracket */}
        <rect x="4" y="36" width="8" height="2" fill="#8b6914" />
        <rect x="5" y="34" width="6" height="2" fill="#c9a227" />
        {/* shaft */}
        <rect x="7" y="22" width="2" height="12" fill="#5c3d1e" />
        <rect x="6" y="20" width="4" height="3" fill="#7a4f28" />
        <rect x="6" y="18" width="4" height="2" fill="#8b5a2b" />
        {/* bowl */}
        <rect x="5" y="16" width="6" height="2" fill="#4a4035" />
        <rect x="6" y="14" width="4" height="2" fill="#6b5a48" />
        {/* flame — animated group */}
        <g className="professor-mtg-torch__flame">
          <rect x="4" y="12" width="8" height="2" fill="#cc3300" />
          <rect x="5" y="10" width="6" height="2" fill="#ff5500" />
          <rect x="5" y="8" width="6" height="2" fill="#ff7700" />
          <rect x="6" y="6" width="4" height="2" fill="#ff9900" />
          <rect x="6" y="4" width="4" height="2" fill="#ffbb00" />
          <rect x="7" y="2" width="2" height="2" fill="#ffdd44" />
          <rect x="7" y="0" width="2" height="2" fill="#ffffaa" />
        </g>
        <g className="professor-mtg-torch__flame professor-mtg-torch__flame--ghost">
          <rect x="5" y="9" width="6" height="2" fill="#ff8800" opacity="0.6" />
          <rect x="6" y="5" width="4" height="3" fill="#ffcc00" opacity="0.5" />
          <rect x="7" y="1" width="2" height="3" fill="#ffffcc" opacity="0.45" />
        </g>
      </svg>
      <div className="professor-mtg-torch__glow" />
    </div>
  );
}
