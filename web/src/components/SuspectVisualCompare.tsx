"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/Button";
import { CardImageEnlargeLightbox } from "@/components/CardPhotoLightbox";
import {
  referenceSourceLabel,
  suspectCompareLabel,
  type ReferenceImageSource,
} from "@/lib/card-flow-v2/suspect-reference-image";
import type { SuspectPickerRow } from "@/lib/card-flow-v2/staff-suspect-selection";

function CompareImageFrame({
  label,
  sublabel,
  imageUrl,
  placeholder,
  onEnlarge,
  size = "default",
}: {
  label: string;
  sublabel?: string;
  imageUrl?: string;
  placeholder: string;
  onEnlarge?: () => void;
  size?: "default" | "overlay";
}) {
  const content = imageUrl ? (
    <button
      type="button"
      className="flex h-full w-full items-center justify-center bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      onClick={onEnlarge}
      disabled={!onEnlarge}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={label}
        className="max-h-full max-w-full object-contain"
      />
    </button>
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-gray-50 p-3 text-center">
      <p className="text-xs text-gray-500">{placeholder}</p>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
          {label}
        </p>
        {sublabel && (
          <p className="truncate text-[10px] text-gray-400">{sublabel}</p>
        )}
      </div>
      <div
        className={`w-full overflow-hidden rounded-lg border border-gray-200 bg-white ${
          size === "overlay"
            ? "aspect-[5/7] min-h-[16rem] max-h-[22rem]"
            : "aspect-[5/7]"
        }`}
      >
        {content}
      </div>
    </div>
  );
}

/** Inline side-by-side comparison panel (desktop + mobile summary). */
export function SuspectVisualComparePanel({
  row,
  customerFrontImageUrl,
  customerBackImageUrl,
  layout = "horizontal",
  size = "default",
  className = "",
}: {
  row?: SuspectPickerRow;
  customerFrontImageUrl: string;
  customerBackImageUrl?: string;
  layout?: "horizontal" | "stacked";
  size?: "default" | "overlay";
  className?: string;
}) {
  const [enlargeOpen, setEnlargeOpen] = useState(false);
  const refSource = row?.referenceImageSource ?? "unknown";
  const refLabel =
    refSource !== "unknown"
      ? referenceSourceLabel(refSource as ReferenceImageSource)
      : undefined;

  if (!row) {
    return (
      <div
        className={`rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-4 text-center text-xs text-gray-500 ${className}`}
      >
        Hover or tap a version to compare against the customer scan.
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-violet-200 bg-violet-50/30 p-3 shadow-lg ${className}`}
    >
      <p className="mb-2 text-xs font-medium text-violet-950">
        {suspectCompareLabel(row)}
      </p>
      <div
        className={`grid gap-3 ${
          layout === "stacked" ? "grid-cols-1" : "grid-cols-2"
        }`}
      >
        <CompareImageFrame
          label="Customer scan"
          imageUrl={customerFrontImageUrl}
          placeholder="Customer scan unavailable"
          onEnlarge={() => setEnlargeOpen(true)}
          size={size}
        />
        <CompareImageFrame
          label="Catalog reference"
          sublabel={refLabel}
          imageUrl={row.referenceImageUrl}
          placeholder="No reference image available for this version."
          size={size}
        />
      </div>
      <CardImageEnlargeLightbox
        open={enlargeOpen}
        onClose={() => setEnlargeOpen(false)}
        frontImageUrl={customerFrontImageUrl}
        backImageUrl={customerBackImageUrl}
        cardName={row.label.split(" · ")[0]}
      />
    </div>
  );
}

/** Fixed right-edge compare dock — versions stay in a single column on the left. */
export function DesktopHoverCompareDock({
  row,
  customerFrontImageUrl,
  customerBackImageUrl,
}: {
  row?: SuspectPickerRow;
  customerFrontImageUrl: string;
  customerBackImageUrl?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <aside
      className="pointer-events-none fixed inset-y-0 right-0 z-[120] hidden w-[min(36rem,52vw)] items-center p-4 pl-0 lg:flex"
      aria-label="Version visual compare"
    >
      <div className="pointer-events-auto max-h-[calc(100vh-5rem)] w-full overflow-y-auto">
        <SuspectVisualComparePanel
          row={row}
          customerFrontImageUrl={customerFrontImageUrl}
          customerBackImageUrl={customerBackImageUrl}
          layout="horizontal"
          className="shadow-2xl"
        />
      </div>
    </aside>,
    document.body,
  );
}

/** Mobile bottom sheet for full-screen visual compare + confirm. */
export function SuspectVisualCompareSheet({
  open,
  onClose,
  row,
  customerFrontImageUrl,
  customerBackImageUrl,
  saving,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  row: SuspectPickerRow;
  customerFrontImageUrl: string;
  customerBackImageUrl?: string;
  saving?: boolean;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Compare card version"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">Compare version</p>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <SuspectVisualComparePanel
          row={row}
          customerFrontImageUrl={customerFrontImageUrl}
          customerBackImageUrl={customerBackImageUrl}
          layout="stacked"
        />

        <div className="mt-4 flex flex-col gap-2">
          <Button
            className="min-h-11 w-full"
            disabled={saving}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {saving
              ? "Saving…"
              : row.scanDerived
                ? "Confirm this version"
                : "Confirm this printing"}
          </Button>
          <Button variant="ghost" className="min-h-11 w-full" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
