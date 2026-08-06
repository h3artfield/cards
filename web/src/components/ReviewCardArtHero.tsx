"use client";

import type { ReactNode } from "react";
import type { ReviewCardState } from "./ReviewStateCardShell";

/** Top hero — cropped front photo like TCG card art, with glass overlay for buyback info. */
export function ReviewCardArtHero({
  frontImageUrl,
  state,
  children,
}: {
  frontImageUrl?: string;
  state: ReviewCardState;
  children: ReactNode;
}) {
  const skinFallback =
    state === "yes" ? "/review-cards/yes.png" : "/review-cards/no.png";

  return (
    <div className="relative min-h-[13.5rem] overflow-hidden rounded-t-[0.65rem] sm:min-h-[15rem]">
      {frontImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={frontImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_28%]"
          aria-hidden
        />
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${skinFallback})` }}
          aria-hidden
        />
      )}

      {/* Dark glass pane — readable over card art */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/50 to-black/65 backdrop-blur-[2px]" />

      <div className="relative z-10 p-4 sm:p-5">{children}</div>
    </div>
  );
}
