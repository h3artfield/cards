"use client";

import {
  v2ReviewStatusLabel,
  v2ReviewStatusTone,
  type V2ReviewStatus,
} from "@/lib/card-flow-v2/v2-review-status";

const TONE_CLASSES: Record<
  ReturnType<typeof v2ReviewStatusTone>,
  string
> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  red: "border-red-200 bg-red-50 text-red-950",
  violet: "border-violet-200 bg-violet-50 text-violet-950",
  slate: "border-slate-200 bg-slate-100 text-slate-800",
};

export function CardFlowV2ReviewStatusBadge({
  status,
  recommendedAction,
}: {
  status: V2ReviewStatus;
  recommendedAction?: string;
}) {
  const tone = v2ReviewStatusTone(status);
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${TONE_CLASSES[tone]}`}
    >
      <p className="font-semibold">V2 review: {v2ReviewStatusLabel(status)}</p>
      {recommendedAction && (
        <p className="mt-1 text-xs opacity-90">{recommendedAction}</p>
      )}
    </div>
  );
}
