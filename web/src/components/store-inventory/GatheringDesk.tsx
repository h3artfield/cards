"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  cardDisplayImage,
  cardDisplayPrice,
  readClerkDragPayload,
  type GatheringCard,
} from "./clerk-gathering";
import { CartPanel } from "./CartPanel";
import { ColorPips } from "./InventoryBrowseUI";
import { useCart } from "@/hooks/useCart";
import {
  buildGatheringDeckPrefill,
  saveProfessorSetupPrefill,
} from "@/lib/store-inventory/gathering-deck-build";
import {
  deckBuildSignInHref,
  professorPathFromPile,
} from "@/lib/store-inventory/deck-build-auth";
import { useCustomer } from "@/context/CustomerContext";

export function GatheringDesk({
  slug,
  cards,
  onAdd,
  onRemove,
  onClear,
}: {
  slug: string;
  cards: GatheringCard[];
  onAdd: (card: GatheringCard) => void;
  onRemove: (inventoryItemId: string) => void;
  onClear: () => void;
}) {
  const router = useRouter();
  const { customer, loading: customerLoading } = useCustomer();
  const { add: addToCart } = useCart(slug);
  const [dragOver, setDragOver] = useState(false);

  function cartLineFromCard(card: GatheringCard) {
    return {
      inventoryItemId: card.inventoryItemId,
      name: card.name,
      setName: card.setName,
      imageUrl: cardDisplayImage(card),
      unitPrice: cardDisplayPrice(card) ?? 0,
      maxQuantity: card.qty > 0 ? card.qty : 1,
    };
  }

  function addCardToCart(card: GatheringCard) {
    if ((cardDisplayPrice(card) ?? 0) <= 0) return;
    addToCart(cartLineFromCard(card));
  }

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

  function handleBuildDeck() {
    if (cards.length === 0 || customerLoading) return;
    const target = professorPathFromPile(slug);
    if (!customer) {
      router.push(deckBuildSignInHref(slug, target));
      return;
    }
    const prefill = buildGatheringDeckPrefill(cards);
    saveProfessorSetupPrefill(slug, prefill);
    router.push(target);
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
        <div className="flex shrink-0 flex-col items-end gap-1">
          {cards.length > 0 ? (
            <>
              <button
                type="button"
                onClick={handleBuildDeck}
                className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500"
              >
                Build deck
              </button>
              <button
                type="button"
                onClick={() => cards.forEach(addCardToCart)}
                className="rounded-lg border border-neutral-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:border-white"
              >
                All to cart
              </button>
              <button
                type="button"
                onClick={onClear}
                className="text-[10px] text-neutral-500 underline hover:text-neutral-300"
              >
                Clear
              </button>
            </>
          ) : null}
        </div>
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
                  {price != null && price > 0 ? (
                    <button
                      type="button"
                      onClick={() => addCardToCart(card)}
                      className="w-full rounded border border-neutral-700 py-0.5 text-[10px] text-neutral-300 hover:border-white hover:text-white"
                    >
                      Add to cart
                    </button>
                  ) : null}
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

      <CartPanel slug={slug} />
    </div>
  );
}
