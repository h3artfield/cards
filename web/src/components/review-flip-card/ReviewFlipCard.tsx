"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { ReviewCardState } from "@/components/ReviewStateCardShell";
import { ReviewFlipCard2D } from "./ReviewFlipCard2D";
import { useReviewFlipCard } from "./use-review-flip-card";

const ReviewFlipCard3D = dynamic(
  () =>
    import("./ReviewFlipCard3D").then((m) => ({
      default: m.ReviewFlipCard3D,
    })),
  { ssr: false, loading: () => <ReviewFlipCardLoading /> },
);

function ReviewFlipCardLoading() {
  return (
    <div
      className="mx-auto w-full max-w-md animate-pulse rounded-xl bg-gray-100"
      style={{ aspectRatio: "5 / 7", maxHeight: "min(85vh, 640px)" }}
    />
  );
}

export type ReviewFlipCardProps = {
  reviewState: ReviewCardState;
  front: ReactNode;
  reasonBack: ReactNode;
  reviewBack: ReactNode;
  controlsRef?: React.MutableRefObject<ReviewFlipCardHandle | null>;
};

export type ReviewFlipCardHandle = {
  flipToReason: () => void;
  flipToReview: () => void;
  flipToFront: () => void;
};

export function ReviewFlipCard({
  reviewState,
  front,
  reasonBack,
  reviewBack,
  controlsRef,
}: ReviewFlipCardProps) {
  const {
    face,
    backMode,
    reducedMotion,
    use2D,
    flipToReason,
    flipToReview,
    flipToFront,
    force2D,
  } = useReviewFlipCard();

  if (controlsRef) {
    controlsRef.current = { flipToReason, flipToReview, flipToFront };
  }

  const shared = {
    face,
    backMode,
    reducedMotion,
    reviewState,
    front,
    reasonBack,
    reviewBack,
  };

  if (use2D) {
    return <ReviewFlipCard2D {...shared} />;
  }

  return (
    <ReviewFlipCard3D
      {...shared}
      onError={force2D}
    />
  );
}

export { useReviewFlipCard } from "./use-review-flip-card";
export type { CardBackMode } from "./types";
