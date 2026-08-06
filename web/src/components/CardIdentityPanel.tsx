"use client";

import { useState } from "react";
import type { CardConditionReport, CardIdentityVerification } from "@/lib/types";
import {
  CardPhotoLightbox,
  CardPhotoThumbnail,
} from "@/components/CardPhotoLightbox";

const VERDICT_STYLES = {
  confirmed: "bg-emerald-100 text-emerald-800",
  likely: "bg-blue-100 text-blue-800",
  mismatch: "bg-red-100 text-red-800",
  inconclusive: "bg-gray-100 text-gray-700",
} as const;

const VERDICT_LABELS: Record<CardIdentityVerification["verdict"], string> = {
  confirmed: "Confirmed",
  likely: "Likely",
  mismatch: "Mismatch",
  inconclusive: "Inconclusive",
};

function ReferenceThumbnail({ imageUrl }: { imageUrl: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg ring-1 ring-gray-200">
      <img
        src={imageUrl}
        alt="Catalog reference"
        className="h-20 w-14 rounded-lg object-cover"
      />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
        Ref
      </span>
    </div>
  );
}

export function CardIdentityPanel({
  verification,
  frontImageUrl,
  backImageUrl,
  cardName,
  conditionReport,
}: {
  verification?: CardIdentityVerification;
  frontImageUrl?: string;
  backImageUrl?: string;
  cardName?: string;
  conditionReport?: CardConditionReport;
}) {
  const [lightbox, setLightbox] = useState<"front" | "back" | null>(null);

  if (!verification && !frontImageUrl) return null;

  const pct = verification ? Math.round(verification.matchScore * 100) : null;

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-2.5 text-xs">
        {(frontImageUrl || backImageUrl || verification?.referenceImageUrl) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {frontImageUrl && (
              <CardPhotoThumbnail
                imageUrl={frontImageUrl}
                label="Front"
                onClick={() => setLightbox("front")}
              />
            )}
            {backImageUrl?.trim() ? (
              <CardPhotoThumbnail
                imageUrl={backImageUrl}
                label="Back"
                onClick={() => setLightbox("back")}
              />
            ) : frontImageUrl ? (
              <div className="flex h-[6.5rem] w-14 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-[9px] text-gray-400">
                No back
              </div>
            ) : null}
            {verification?.referenceImageUrl && (
              <ReferenceThumbnail imageUrl={verification.referenceImageUrl} />
            )}
          </div>
        )}

        {verification ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-gray-800">Identity check</span>
            <span
              className={`rounded-full px-2 py-0.5 ${VERDICT_STYLES[verification.verdict]}`}
            >
              {VERDICT_LABELS[verification.verdict]}
            </span>
            {pct != null && (
              <span className="text-gray-600">{pct}% match</span>
            )}
          </div>
        ) : (
          frontImageUrl && (
            <p className="mt-2 font-semibold text-gray-800">Photos</p>
          )
        )}
      </div>

      {frontImageUrl && lightbox && (
        <CardPhotoLightbox
          open
          onClose={() => setLightbox(null)}
          frontImageUrl={frontImageUrl}
          backImageUrl={backImageUrl}
          cardName={cardName}
          report={conditionReport}
          initialSide={lightbox}
        />
      )}
    </>
  );
}
