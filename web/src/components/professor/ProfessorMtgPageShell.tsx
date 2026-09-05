"use client";

import type { ReactNode } from "react";

/**
 * Page wrapper for the Professor surfaces.
 *
 * The backdrop is a masked dot matrix plus two static accent glows and a floor
 * vignette. It replaced a pair of animated pixel-art torches, which were both
 * the most dated element on the page and the only reason these screens needed
 * a reduced-motion exemption. Nothing here moves.
 */
export function ProfessorMtgPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="professor-mtg-page flex min-h-screen flex-col">
      <div className="professor-mtg-backdrop" aria-hidden>
        <div className="professor-mtg-backdrop__grid" />
        <div className="professor-mtg-backdrop__glow professor-mtg-backdrop__glow--accent" />
        <div className="professor-mtg-backdrop__glow professor-mtg-backdrop__glow--cool" />
        <div className="professor-mtg-backdrop__floor" />
        <div className="professor-mtg-backdrop__grain" />
      </div>
      {children}
    </div>
  );
}
