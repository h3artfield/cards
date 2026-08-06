"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CardConditionReport } from "@/lib/types";
import { CardGradingPhotoStack } from "@/components/CardGradingPhotoStack";

const LIGHTBOX_Z = "z-[9999]";

function useLightboxMount(open: boolean) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, mounted]);

  return mounted;
}

export function CardPhotoThumbnail({
  imageUrl,
  label,
  onClick,
}: {
  imageUrl: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-1 rounded-lg ring-1 ring-gray-200 transition hover:ring-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <img
        src={imageUrl}
        alt={label}
        className="h-20 w-14 rounded-lg object-cover"
      />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-600 group-hover:text-indigo-700">
        {label}
      </span>
    </button>
  );
}

/** Enlarge customer upload — plain photo only, no pregrade overlays. */
export function CardImageEnlargeLightbox({
  open,
  onClose,
  frontImageUrl,
  backImageUrl,
  cardName,
  initialSide = "front",
}: {
  open: boolean;
  onClose: () => void;
  frontImageUrl: string;
  backImageUrl?: string;
  cardName?: string;
  initialSide?: "front" | "back";
}) {
  const [side, setSide] = useState<"front" | "back">(initialSide);
  const hasBack = Boolean(backImageUrl?.trim());

  useEffect(() => {
    if (open) setSide(initialSide);
  }, [open, initialSide]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const mounted = useLightboxMount(open);

  if (!open || !mounted) return null;

  const activeUrl =
    side === "back" && backImageUrl?.trim() ? backImageUrl : frontImageUrl;

  return createPortal(
    <div
      className={`fixed inset-0 ${LIGHTBOX_Z} flex items-center justify-center bg-black/70 p-4`}
      role="dialog"
      aria-modal="true"
      aria-label={`${cardName ?? "Card"} ${side} photo`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] max-w-4xl flex-col rounded-xl bg-white p-3 shadow-xl sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">
            {cardName ?? "Card"} · {side === "back" ? "Back" : "Front"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        {hasBack && (
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                side === "front"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
              onClick={() => setSide("front")}
            >
              Front
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                side === "back"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
              onClick={() => setSide("back")}
            >
              Back
            </button>
          </div>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeUrl}
          alt={`${cardName ?? "Card"} ${side}`}
          className="max-h-[75vh] w-full object-contain"
        />
      </div>
    </div>,
    document.body,
  );
}

export function CardPhotoLightbox({
  open,
  onClose,
  frontImageUrl,
  backImageUrl,
  cardName,
  report,
  initialSide = "front",
}: {
  open: boolean;
  onClose: () => void;
  frontImageUrl: string;
  backImageUrl?: string;
  cardName?: string;
  report?: CardConditionReport;
  initialSide?: "front" | "back";
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const mounted = useLightboxMount(open);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${LIGHTBOX_Z} flex items-center justify-center bg-black/60 p-4`}
      role="dialog"
      aria-modal="true"
      aria-label={`${cardName ?? "Card"} photos`}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">
            {cardName ?? "Card"} · {initialSide === "back" ? "Back" : "Front"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
        <CardGradingPhotoStack
          frontImageUrl={frontImageUrl}
          backImageUrl={backImageUrl}
          cardName={cardName}
          report={report}
        />
      </div>
    </div>,
    document.body,
  );
}
