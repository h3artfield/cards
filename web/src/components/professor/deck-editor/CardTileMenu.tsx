"use client";

import { useEffect, useRef, useState } from "react";
import type { DeckBoardV1 } from "@/lib/professor-deck-editor/types-v1";
import type { ProfessorDeckInventoryEntryV43 } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";
import {
  scryfallCardPageUrlV1,
  storeInventorySearchUrlV1,
  tcgplayerCardSearchUrlV1,
} from "./card-links-v1";
import type { DeckEditorCard } from "./types";

/**
 * The per-card actions on an image tile.
 *
 * At grid density a card is about a hundred pixels wide, which is not enough
 * room for a row of buttons — so the actions live behind one hover affordance,
 * the way Moxfield does it. Shop stock is listed first and priced, because a
 * card that is already on the shelf is the one piece of information the other
 * deck sites cannot give you.
 */

/** Matches the `w-52` on the menu; used to decide which way it opens. */
const MENU_WIDTH_PX = 208;

const MOVE_TARGETS: Record<DeckBoardV1, { board: DeckBoardV1; label: string }[]> = {
  mainboard: [
    { board: "considering", label: "Move to Considering" },
    { board: "cut", label: "Move to Cut" },
  ],
  considering: [
    { board: "mainboard", label: "Move to Deck" },
    { board: "cut", label: "Move to Cut" },
  ],
  cut: [
    { board: "mainboard", label: "Move to Deck" },
    { board: "considering", label: "Move to Considering" },
  ],
};

export function CardTileMenu({
  card,
  slug,
  inventory,
  synergySelected,
  onSynergy,
  onMove,
  onRemove,
  onMakeCommander,
}: {
  card: DeckEditorCard;
  slug: string;
  inventory?: ProfessorDeckInventoryEntryV43;
  synergySelected?: boolean;
  onSynergy: () => void;
  onMove: (board: DeckBoardV1) => void;
  onRemove?: () => void;
  onMakeCommander?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // The menu is wider than a card tile, so anchoring it to one side always
  // pushes it off screen at that edge of the grid. Which side it opens toward
  // is decided from where the tile actually sits when it opens.
  const [alignLeft, setAlignLeft] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  const inStock = (inventory?.quantity ?? 0) > 0;
  const price = inventory?.listPrice;

  return (
    <div ref={wrapRef} className="absolute right-1 top-1 z-20">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Actions for ${card.name}`}
        onClick={(event) => {
          // The tile itself toggles the synergy highlight, so the menu must not
          // also trigger it on the way through.
          event.stopPropagation();
          setOpen((value) => {
            const next = !value;
            if (next) {
              const rect = buttonRef.current?.getBoundingClientRect();
              // Open leftward only when there is not room on the left to hang
              // the menu off the tile's right edge.
              setAlignLeft(rect ? rect.right - MENU_WIDTH_PX < 8 : false);
            }
            return next;
          });
        }}
        className={`grid h-6 w-6 place-items-center rounded bg-black/75 text-[13px] leading-none text-[var(--text-hi)] ring-1 ring-white/15 transition group-hover:opacity-100 focus-visible:opacity-100 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
        ⋮
      </button>

      {open ? (
        <div
          role="menu"
          className={`professor-mtg-pop absolute top-[calc(100%+0.25rem)] w-52 text-left ${
            alignLeft ? "left-0" : "right-0"
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="professor-mtg-label truncate border-b border-[var(--mtg-stone-border)] px-2.5 py-1.5 text-[10px]">
            {card.name}
          </p>

          <button
            type="button"
            role="menuitem"
            className="professor-mtg-pop-item text-xs"
            onClick={() => {
              onSynergy();
              setOpen(false);
            }}
          >
            {synergySelected ? "Hide synergy" : "Show synergy"}
          </button>

          {inStock ? (
            <a
              role="menuitem"
              href={storeInventorySearchUrlV1(slug, card.name)}
              target="_blank"
              rel="noreferrer"
              className="professor-mtg-pop-item text-xs text-[var(--ok)]"
              onClick={() => setOpen(false)}
            >
              Buy here{price != null ? ` — $${price.toFixed(2)}` : ""}
            </a>
          ) : null}

          <a
            role="menuitem"
            href={tcgplayerCardSearchUrlV1(card.name)}
            target="_blank"
            rel="noreferrer"
            className="professor-mtg-pop-item text-xs"
            onClick={() => setOpen(false)}
          >
            Buy on TCGplayer
          </a>

          <a
            role="menuitem"
            href={scryfallCardPageUrlV1(card.name)}
            target="_blank"
            rel="noreferrer"
            className="professor-mtg-pop-item text-xs"
            onClick={() => setOpen(false)}
          >
            View details
          </a>

          <button
            type="button"
            role="menuitem"
            className="professor-mtg-pop-item text-xs"
            onClick={() => {
              void navigator.clipboard?.writeText(card.name);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy card name"}
          </button>

          <div className="border-t border-[var(--mtg-stone-border)]">
            {onMakeCommander ? (
              <button
                type="button"
                role="menuitem"
                className="professor-mtg-pop-item text-xs"
                onClick={() => {
                  onMakeCommander();
                  setOpen(false);
                }}
              >
                Make this the commander
              </button>
            ) : null}
            {MOVE_TARGETS[card.board].map((target) => (
              <button
                key={target.board}
                type="button"
                role="menuitem"
                className="professor-mtg-pop-item text-xs"
                onClick={() => {
                  onMove(target.board);
                  setOpen(false);
                }}
              >
                {target.label}
              </button>
            ))}
            {onRemove ? (
              <button
                type="button"
                role="menuitem"
                className="professor-mtg-pop-item text-xs text-[var(--bad)]"
                onClick={() => {
                  onRemove();
                  setOpen(false);
                }}
              >
                Remove from deck
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
