"use client";

import type { WorkingDeckTheoryV4 } from "@/lib/deck-synthesis/professor-working-deck-theory-v4";
import { collectBrewTreeCardNamesV42 } from "@/lib/deck-synthesis/professor-brew-tree-v4-2-v1";

export function ProfessorDeckSummaryPanel({
  theory,
  commanderName,
  swapEnabled,
}: {
  theory: WorkingDeckTheoryV4 | null;
  commanderName: string | null;
  swapEnabled: boolean;
}) {
  if (!theory) return null;

  const cardNames = collectBrewTreeCardNamesV42(theory).filter((n) => n !== theory.commander);

  return (
    <div className="border-t border-neutral-800/60 p-4">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500">Deck draft</h2>
      <p className="mt-1 text-sm text-neutral-300">
        {commanderName ? `${commanderName} · ` : ""}
        {theory.packages.length} packages · {cardNames.length} candidate slots
      </p>
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">{theory.thesis.summary.slice(0, 280)}</p>

      <div className="mt-4 space-y-3">
        {theory.packages.slice(0, 4).map((pkg) => (
          <div key={pkg.packageId}>
            <p className="text-xs font-medium text-amber-200/90">{pkg.name}</p>
            <p className="text-[10px] text-neutral-600">{pkg.purpose.slice(0, 100)}</p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {pkg.candidateCards.slice(0, 6).map((card) => (
                <li
                  key={`${pkg.packageId}-${card}`}
                  className="rounded border border-neutral-800 bg-neutral-950/60 px-2 py-0.5 text-[10px] text-neutral-400"
                >
                  {card}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {swapEnabled ? (
        <p className="mt-4 text-xs text-emerald-400/90">
          Deck built. Swap any card from the deck builder when you&apos;re ready.
        </p>
      ) : (
        <p className="mt-4 text-xs text-neutral-600">Card swaps unlock after the professors finish building.</p>
      )}
    </div>
  );
}
