"use client";

import { useState } from "react";
import {
  cardDisplayImage,
  cardDisplayPrice,
  readClerkDragPayload,
  type GatheringCard,
} from "./clerk-gathering";
import { ColorPips } from "./InventoryBrowseUI";

export function GatheringDesk({
  cards,
  onAdd,
  onRemove,
  onClear,
}: {
  cards: GatheringCard[];
  onAdd: (card: GatheringCard) => void;
  onRemove: (inventoryItemId: string) => void;
  onClear: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const total = cards.reduce(
    (sum, c) => sum + (cardDisplayPrice(c) ?? 0),
    0,
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const payload = readClerkDragPayload(e.dataTransfer);
    if (payload) onAdd(payload);
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-3 transition ${
        dragOver
          ? "border-indigo-400 bg-indigo-950/40"
          : "border-neutral-600 bg-neutral-900/40"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Your card pile</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Drag cards here from the clerk or browse grid
          </p>
        </div>
        {cards.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[10px] text-neutral-500 underline hover:text-neutral-300"
          >
            Clear
          </button>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <div
          className={`mt-3 flex min-h-[140px] flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center ${
            dragOver ? "border-indigo-400/80" : "border-neutral-700"
          }`}
        >
          <p className="text-xs text-neutral-500">
            {dragOver ? "Drop to add" : "Drop zone — gather cards while you shop"}
          </p>
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {cards.map((card) => {
            const src = cardDisplayImage(card);
            const price = cardDisplayPrice(card);
            return (
              <li
                key={card.inventoryItemId}
                className="group relative overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950/80"
              >
                <button
                  type="button"
                  aria-label={`Remove ${card.name}`}
                  onClick={() => onRemove(card.inventoryItemId)}
                  className="absolute right-1 top-1 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-neutral-300 opacity-0 transition group-hover:opacity-100"
                >
                  ×
                </button>
                <div className="aspect-[5/7] w-full bg-neutral-900">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={card.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-1 text-center text-[10px] text-neutral-500">
                      {card.name}
                    </div>
                  )}
                </div>
                <div className="space-y-0.5 p-1.5">
                  <p className="line-clamp-2 text-[10px] font-medium leading-tight text-white">
                    {card.name}
                  </p>
                  <div className="flex items-center justify-between gap-1">
                    <ColorPips colors={card.colorIdentity ?? []} />
                    {price != null ? (
                      <span className="text-[10px] font-medium text-emerald-400">
                        ${price.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cards.length > 0 ? (
        <p className="mt-3 text-right text-xs text-neutral-400">
          {cards.length} card{cards.length === 1 ? "" : "s"}
          {total > 0 ? ` · ~$${total.toFixed(2)}` : ""}
        </p>
      ) : null}
    </div>
  );
}
