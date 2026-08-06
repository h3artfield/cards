"use client";

import { useCallback, useEffect, useState } from "react";
import type { CardBackMode, ReviewFlipFace } from "./types";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function prefersMobileLayout(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

export function useReviewFlipCard() {
  const [face, setFace] = useState<ReviewFlipFace>("front");
  const [backMode, setBackMode] = useState<CardBackMode | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [use2D, setUse2D] = useState(true);

  useEffect(() => {
    const rm = prefersReducedMotion();
    const mobile = prefersMobileLayout();
    setReducedMotion(rm);
    setUse2D(rm || mobile);

    const rmMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileMq = window.matchMedia("(max-width: 768px)");
    const sync = () => {
      const r = rmMq.matches;
      const m = mobileMq.matches;
      setReducedMotion(r);
      setUse2D(r || m);
    };
    rmMq.addEventListener("change", sync);
    mobileMq.addEventListener("change", sync);
    return () => {
      rmMq.removeEventListener("change", sync);
      mobileMq.removeEventListener("change", sync);
    };
  }, []);

  const flipToReason = useCallback(() => {
    setBackMode("reason");
    setFace("back");
  }, []);

  const flipToReview = useCallback(() => {
    setBackMode("review");
    setFace("back");
  }, []);

  const flipToFront = useCallback(() => {
    setFace("front");
    setBackMode(null);
  }, []);

  useEffect(() => {
    if (face !== "back") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") flipToFront();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [face, flipToFront]);

  const force2D = useCallback(() => setUse2D(true), []);

  return {
    face,
    backMode,
    reducedMotion,
    use2D,
    flipToReason,
    flipToReview,
    flipToFront,
    force2D,
  };
}
