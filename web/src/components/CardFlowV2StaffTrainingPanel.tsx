"use client";

import type { StaffTrainingExplanation } from "@/lib/card-flow-v2/staff-training-explanation";

export function CardFlowV2StaffTrainingPanel({
  explanation,
}: {
  explanation: StaffTrainingExplanation | null;
}) {
  if (!explanation) return null;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-950">
      <p className="font-semibold">{explanation.heading}</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
        {explanation.paragraphs.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
