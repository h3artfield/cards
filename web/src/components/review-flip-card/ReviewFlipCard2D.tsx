"use client";

import type { ReactNode } from "react";
import type { ReviewCardState } from "@/components/ReviewStateCardShell";
import { CLERK_FLIP_CARD_SHELL } from "./flip-card-layout";

const ACCENT: Record<ReviewCardState, string> = {
  yes: "ring-emerald-400/70",
  no: "ring-red-400/60",
  pending: "ring-amber-400/80",
};

/**
 * Clerk flip card — content height, no inner scroll trap.
 * Page scroll passes through when the pointer is over a card.
 */
export function ReviewFlipCard2D({
  face,
  backMode,
  reviewState,
  front,
  reasonBack,
  reviewBack,
}: {
  face: "front" | "back";
  backMode: "reason" | "review" | null;
  reducedMotion?: boolean;
  reviewState: ReviewCardState;
  front: ReactNode;
  reasonBack: ReactNode;
  reviewBack: ReactNode;
}) {
  const flipped = face === "back";
  const backContent = backMode === "reason" ? reasonBack : reviewBack;
  const ring = ACCENT[reviewState];

  return (
    <div className={`${CLERK_FLIP_CARD_SHELL} ring-2 ${ring}`}>
      <div className={flipped ? "hidden" : "block"} aria-hidden={flipped}>
        {front}
      </div>
      <div className={flipped ? "block" : "hidden"} aria-hidden={!flipped}>
        {backContent}
      </div>
    </div>
  );
}
