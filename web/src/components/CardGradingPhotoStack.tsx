"use client";

import type { ReactNode } from "react";
import type { CardConditionReport } from "@/lib/types";

type PhotoSide = "front" | "back";

interface SideMetrics {
  centeringScore?: number;
  corners?: number;
  edges?: number;
  surface?: number;
  leftRight?: string;
  topBottom?: string;
  cardDetected?: boolean;
}

function parseRatio(ratio?: string): { first: number; second: number } | null {
  if (!ratio) return null;
  const match = ratio.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (!match) return null;
  return { first: parseFloat(match[1]), second: parseFloat(match[2]) };
}

function sideMetrics(
  report: CardConditionReport | undefined,
  side: PhotoSide,
): SideMetrics | null {
  if (!report?.serviceAvailable) return null;

  const rawSide = report.raw?.[side] as
    | {
        cardDetected?: boolean;
        centering?: { score?: number; ratios?: { leftRight?: string; topBottom?: string } };
        corners?: { score?: number };
        edges?: { score?: number };
        surface?: { score?: number };
      }
    | undefined;

  const centering =
    side === "front" ? report.frontCentering : report.backCentering;

  if (rawSide) {
    return {
      centeringScore: rawSide.centering?.score,
      corners: rawSide.corners?.score,
      edges: rawSide.edges?.score,
      surface: rawSide.surface?.score,
      leftRight: rawSide.centering?.ratios?.leftRight ?? centering?.leftRight,
      topBottom: rawSide.centering?.ratios?.topBottom ?? centering?.topBottom,
      cardDetected: rawSide.cardDetected,
    };
  }

  if (!centering) return null;

  return {
    leftRight: centering.leftRight,
    topBottom: centering.topBottom,
    centeringScore: report.centering,
    corners: report.corners,
    edges: report.edges,
    surface: report.surface,
  };
}

function scoreTone(score: number): string {
  if (score >= 9) return "bg-emerald-600/90 text-white";
  if (score >= 7) return "bg-amber-600/90 text-white";
  return "bg-red-600/90 text-white";
}

function EdgeBadge({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={`absolute rounded px-1 py-0.5 text-[10px] font-bold leading-none shadow-sm backdrop-blur-sm ${className}`}
    >
      {children}
    </span>
  );
}

function GradingPhoto({
  imageUrl,
  alt,
  side,
  report,
}: {
  imageUrl: string;
  alt: string;
  side: PhotoSide;
  report?: CardConditionReport;
}) {
  const metrics = sideMetrics(report, side);
  const lr = parseRatio(metrics?.leftRight);
  const tb = parseRatio(metrics?.topBottom);
  const showOverlay = Boolean(metrics);

  return (
    <div className="w-full">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {side === "front" ? "Front" : "Back"}
      </p>
      <div className="relative inline-block max-w-full">
        <img
          src={imageUrl}
          alt={alt}
          className="max-h-72 w-auto max-w-full rounded-lg object-contain shadow-sm ring-1 ring-gray-200"
        />

        {showOverlay && (
          <>
            {lr && (
              <>
                <EdgeBadge className="left-1 top-1/2 -translate-y-1/2 bg-black/75 text-white">
                  {lr.first.toFixed(0)}%
                </EdgeBadge>
                <EdgeBadge className="right-1 top-1/2 -translate-y-1/2 bg-black/75 text-white">
                  {lr.second.toFixed(0)}%
                </EdgeBadge>
              </>
            )}
            {tb && (
              <>
                <EdgeBadge className="left-1/2 top-1 -translate-x-1/2 bg-black/75 text-white">
                  {tb.first.toFixed(0)}%
                </EdgeBadge>
                <EdgeBadge className="bottom-8 left-1/2 -translate-x-1/2 bg-black/75 text-white">
                  {tb.second.toFixed(0)}%
                </EdgeBadge>
              </>
            )}

            {metrics?.corners != null && metrics.corners > 0 && (
              <EdgeBadge className={`left-1 top-1 ${scoreTone(metrics.corners)}`}>
                C {metrics.corners.toFixed(1)}
              </EdgeBadge>
            )}
            {metrics?.edges != null && metrics.edges > 0 && (
              <EdgeBadge className={`right-1 top-1 ${scoreTone(metrics.edges)}`}>
                E {metrics.edges.toFixed(1)}
              </EdgeBadge>
            )}
            {metrics?.surface != null && metrics.surface > 0 && (
              <EdgeBadge
                className={`bottom-1 left-1 ${scoreTone(metrics.surface)}`}
              >
                S {metrics.surface.toFixed(1)}
              </EdgeBadge>
            )}
            {metrics?.centeringScore != null && metrics.centeringScore > 0 && (
              <EdgeBadge
                className={`bottom-1 right-1 ${scoreTone(metrics.centeringScore)}`}
              >
                CTR {metrics.centeringScore.toFixed(1)}
              </EdgeBadge>
            )}
          </>
        )}
      </div>

      {showOverlay && (metrics?.leftRight || metrics?.topBottom) && (
        <p className="mt-1 text-[10px] text-gray-500">
          L/R {metrics.leftRight ?? "—"} · T/B {metrics.topBottom ?? "—"}
          {metrics.cardDetected === false ? " · card edge detection weak" : ""}
        </p>
      )}
    </div>
  );
}

export function CardGradingPhotoStack({
  frontImageUrl,
  backImageUrl,
  cardName,
  report,
}: {
  frontImageUrl: string;
  backImageUrl?: string;
  cardName?: string;
  report?: CardConditionReport;
}) {
  const name = cardName ?? "Card";

  return (
    <div className="flex shrink-0 flex-col gap-3">
      <GradingPhoto
        imageUrl={frontImageUrl}
        alt={`${name} front`}
        side="front"
        report={report}
      />
      {backImageUrl?.trim() ? (
        <GradingPhoto
          imageUrl={backImageUrl}
          alt={`${name} back`}
          side="back"
          report={report}
        />
      ) : (
        <div className="flex max-h-36 min-h-24 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 text-center text-xs text-gray-500">
          No back photo
        </div>
      )}
    </div>
  );
}
