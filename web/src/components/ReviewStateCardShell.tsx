"use client";

import type { ReactNode } from "react";

export type ReviewCardState = "yes" | "no" | "pending";

const SKIN_URL: Record<ReviewCardState, string> = {
  yes: "/review-cards/yes.png",
  no: "/review-cards/no.png",
  pending: "/review-cards/yes.png",
};

/**
 * Playing-card shell: yes/no skin frame + 3D inner card.
 * Hero slot = card art glass box; body/footer = bordered info panels.
 */
export function ReviewStateCardShell({
  state,
  hero,
  body,
  footer,
}: {
  state: ReviewCardState;
  hero: ReactNode;
  body?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-[1.35rem] bg-cover bg-center bg-no-repeat p-2 sm:p-2.5"
      style={{ backgroundImage: `url(${SKIN_URL[state]})` }}
    >
      <div
        className="overflow-hidden rounded-xl border-2 border-gray-300/90 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_4px_rgba(0,0,0,0.1),0_8px_20px_rgba(0,0,0,0.12),0_16px_40px_rgba(0,0,0,0.08)]"
        style={{ transform: "translateZ(0)" }}
      >
        {hero}

        {body ? (
          <div className="border-t border-gray-200 bg-white px-4 py-4">{body}</div>
        ) : null}

        {footer ? (
          <div className="border-t border-gray-100 bg-white px-4 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
