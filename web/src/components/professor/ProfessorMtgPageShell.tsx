"use client";

import type { ReactNode } from "react";
import { ProfessorMtgTorch } from "./ProfessorMtgTorch";

/** MTG dungeon page wrapper — warm stone bg + fixed 16-bit torches on viewport edges. */
export function ProfessorMtgPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="professor-mtg-page flex min-h-screen flex-col">
      <div className="professor-mtg-page-ambient" aria-hidden>
        <div className="professor-mtg-page-ambient__pool professor-mtg-page-ambient__pool--left" />
        <div className="professor-mtg-page-ambient__pool professor-mtg-page-ambient__pool--right" />
        <div className="professor-mtg-page-ambient__floor" />
      </div>
      <div className="professor-mtg-page-torches" aria-hidden>
        <ProfessorMtgTorch side="left" />
        <ProfessorMtgTorch side="right" />
      </div>
      {children}
    </div>
  );
}
