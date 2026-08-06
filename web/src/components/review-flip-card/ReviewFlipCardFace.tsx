"use client";

import type { ReactNode } from "react";

/** Inner padding for a flip-card face — no nested scroll; page scrolls the order. */
export function ReviewFlipCardFace({
  children,
  className = "",
  fillHeight = false,
}: {
  children: ReactNode;
  className?: string;
  /** Flex column so footers can sit below main content. */
  fillHeight?: boolean;
}) {
  return (
    <div
      className={`px-3 py-2.5 text-sm sm:px-4 sm:py-3 ${
        fillHeight ? "flex flex-col" : ""
      } ${className}`}
    >
      {fillHeight ? (
        <div className="flex flex-col">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

export function ReviewFlipBackHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-gray-200 pb-2">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <button
        type="button"
        className="min-h-10 shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        onClick={onBack}
      >
        Back to summary
      </button>
    </div>
  );
}
