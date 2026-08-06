"use client";

import type { ClerkRecommendation } from "@/lib/card-flow-v2/clerk-recommendation";

const TONE_STYLES = {
  green: "border-emerald-300 bg-emerald-50 text-emerald-950",
  amber: "border-amber-300 bg-amber-50 text-amber-950",
  red: "border-red-300 bg-red-50 text-red-950",
  violet: "border-violet-300 bg-violet-50 text-violet-950",
  slate: "border-gray-300 bg-gray-50 text-gray-900",
} as const;

/** Step 3 — clear clerk recommendation before technical details. */
export function CardFlowV2ClerkRecommendation({
  recommendation,
  compact = false,
}: {
  recommendation: ClerkRecommendation;
  compact?: boolean;
}) {
  return (
    <div
      id="clerk-recommendation"
      className={`rounded-xl border px-4 py-4 ${TONE_STYLES[recommendation.tone]}`}
    >
      <p className="text-xs font-bold uppercase tracking-wide opacity-80">
        Recommendation
      </p>
      <p className="mt-1 text-lg font-semibold leading-tight">
        {recommendation.title}
      </p>
      {!compact && recommendation.reasonLines.length > 0 && (
        <div className="mt-3 text-sm">
          <p className="font-medium">Why:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {recommendation.reasonLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <p className={`text-sm font-medium ${compact ? "mt-2" : "mt-3"}`}>
        Action: {recommendation.actionLine}
      </p>
    </div>
  );
}
