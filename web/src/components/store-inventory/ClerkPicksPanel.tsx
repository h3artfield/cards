"use client";

import type { GatheringCard } from "./clerk-gathering";
import { DraggableClerkCard } from "./DraggableClerkCard";
import type { InventoryGridCard } from "./InventoryBrowseUI";

export type ClerkPickCard = InventoryGridCard & {
  reason?: string;
};

export function ClerkPicksPanel({
  title,
  picks,
  onAddToGathering,
}: {
  title: string;
  picks: ClerkPickCard[];
  onAddToGathering?: (card: GatheringCard) => void;
}) {
  if (!picks.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-emerald-900/50 bg-emerald-950/15 p-4">
      <p className="text-sm font-semibold text-emerald-200">{title}</p>
      <p className="mt-1 text-xs text-neutral-400">
        {picks.length} in-stock pick{picks.length === 1 ? "" : "s"} — drag to
        your pile or tap to add
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
        {picks.map((card) => (
          <li key={card.inventoryItemId}>
            <DraggableClerkCard
              card={card}
              showReason
              size="large"
              onTapAdd={onAddToGathering}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
