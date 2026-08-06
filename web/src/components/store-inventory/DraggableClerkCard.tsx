"use client";

import {
  cardDisplayImage,
  cardDisplayPrice,
  clerkDragPayload,
  CLERK_DRAG_MIME,
  type GatheringCard,
} from "./clerk-gathering";
import { ColorPips } from "./InventoryBrowseUI";

export function DraggableClerkCard({
  card,
  onTapAdd,
  compact = false,
  showReason = false,
  size = "default",
}: {
  card: GatheringCard;
  onTapAdd?: (card: GatheringCard) => void;
  compact?: boolean;
  showReason?: boolean;
  size?: "default" | "large";
}) {
  const src = cardDisplayImage(card);
  const price = cardDisplayPrice(card);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(CLERK_DRAG_MIME, clerkDragPayload(card));
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => onTapAdd?.(card)}
      title={onTapAdd ? "Drag to your pile, or tap to add" : "Drag to your card pile"}
      className={`cursor-grab overflow-hidden rounded-xl border border-emerald-700/50 bg-neutral-900/90 ring-1 ring-emerald-500/20 transition active:cursor-grabbing ${
        onTapAdd ? "hover:border-indigo-500 hover:ring-indigo-500/30" : ""
      } ${compact ? "w-[108px] shrink-0" : size === "large" ? "w-full max-w-[320px] mx-auto" : "w-full"}`}
    >
      <div className="relative aspect-[5/7] w-full bg-neutral-950">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={card.name}
            loading="lazy"
            draggable={false}
            className="pointer-events-none h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-neutral-500">
            {card.name}
          </div>
        )}
        {card.qty > 1 ? (
          <span
            className={`absolute right-1 top-1 rounded bg-black/75 px-1 py-0.5 font-semibold text-white ${
              size === "large" ? "text-xs" : "text-[9px]"
            }`}
          >
            ×{card.qty}
          </span>
        ) : null}
      </div>
      <div
        className={`space-y-0.5 ${
          compact ? "p-1.5" : size === "large" ? "p-3" : "p-2"
        }`}
      >
        <p
          className={`font-semibold leading-tight text-white ${
            compact
              ? "line-clamp-2 text-[10px]"
              : size === "large"
                ? "line-clamp-2 text-sm"
                : "line-clamp-2 text-xs"
          }`}
        >
          {card.name}
        </p>
        <div className="flex items-center justify-between gap-1">
          <ColorPips colors={card.colorIdentity ?? []} />
          {price != null ? (
            <span
              className={`shrink-0 font-medium text-emerald-400 ${
                size === "large" ? "text-sm" : "text-[10px]"
              }`}
            >
              ${price.toFixed(2)}
            </span>
          ) : null}
        </div>
        {showReason && card.reason ? (
          <p
            className={`line-clamp-2 leading-snug text-neutral-400 ${
              size === "large" ? "text-xs" : "text-[9px]"
            }`}
          >
            {card.reason}
          </p>
        ) : null}
      </div>
    </div>
  );
}
