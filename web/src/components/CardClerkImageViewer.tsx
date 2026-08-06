"use client";

import { useState } from "react";
import type { CardConditionReport } from "@/lib/types";
import { CardPhotoLightbox } from "@/components/CardPhotoLightbox";

type PhotoTab = "front" | "back";

/** Clerk-first card photos — large front, back tab, tap to zoom. */
export function CardClerkImageViewer({
  frontImageUrl,
  backImageUrl,
  cardName,
  conditionReport,
}: {
  frontImageUrl?: string;
  backImageUrl?: string;
  cardName?: string;
  conditionReport?: CardConditionReport;
}) {
  const [tab, setTab] = useState<PhotoTab>("front");
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!frontImageUrl && !backImageUrl) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
        No card photos available
      </div>
    );
  }

  const activeUrl =
    tab === "back" && backImageUrl?.trim() ? backImageUrl : frontImageUrl;
  const hasBack = Boolean(backImageUrl?.trim());

  return (
    <>
      <div className="space-y-3">
        {hasBack && (
          <div className="flex gap-2">
            <button
              type="button"
              className={`min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                tab === "front"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
              onClick={() => setTab("front")}
            >
              Front
            </button>
            <button
              type="button"
              className={`min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                tab === "back"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
              onClick={() => setTab("back")}
            >
              Back
            </button>
          </div>
        )}

        {activeUrl && (
          <button
            type="button"
            className="block w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
            onClick={() => setLightboxOpen(true)}
            aria-label={`Enlarge ${tab} photo`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeUrl}
              alt={`${cardName ?? "Card"} ${tab}`}
              className="mx-auto max-h-72 w-full object-contain"
            />
          </button>
        )}

        <p className="text-center text-xs text-gray-500">Tap image to enlarge</p>

        {hasBack && tab === "front" && backImageUrl && (
          <button
            type="button"
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 text-left"
            onClick={() => setTab("back")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backImageUrl}
              alt="Back thumbnail"
              className="h-14 w-10 rounded object-cover"
            />
            <span className="text-sm text-gray-700">View back photo</span>
          </button>
        )}
      </div>

      {frontImageUrl && (
        <CardPhotoLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          frontImageUrl={frontImageUrl}
          backImageUrl={backImageUrl}
          cardName={cardName}
          report={conditionReport}
          initialSide={tab}
        />
      )}
    </>
  );
}
