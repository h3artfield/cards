"use client";

import type { GatheringCard } from "./clerk-gathering";
import { DraggableClerkCard } from "./DraggableClerkCard";

export function ClerkChatCardStrip({
  cards,
  onAddToGathering,
}: {
  cards: GatheringCard[];
  onAddToGathering?: (card: GatheringCard) => void;
}) {
  if (!cards.length) return null;

  return (
    <div className="mt-2">
      <p className="mb-1.5 text-[10px] text-neutral-500">
        {cards.length} in stock — drag to your pile → or tap a card to add
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cards.map((card) => (
          <DraggableClerkCard
            key={card.inventoryItemId}
            card={card}
            compact
            showReason
            onTapAdd={onAddToGathering}
          />
        ))}
      </div>
    </div>
  );
}
