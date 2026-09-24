"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomerDeckListEntryV1 } from "@/lib/professor-deck-editor/deck-list-v1";
import {
  applyDeckShelfOrderV1,
  reorderDeckShelfKeysV1,
  writeDeckShelfOrderV1,
} from "@/lib/professor-deck-editor/deck-shelf-order-v1";
import { DeckMagicCardTile } from "./DeckMagicCardTile";

const DRAG_THRESHOLD_PX = 10;

type DragSession = {
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  armed: boolean;
};

export function MyDeckShelf({
  slug,
  decks,
  onRequestDelete,
}: {
  slug: string;
  decks: readonly CustomerDeckListEntryV1[];
  onRequestDelete: (deck: CustomerDeckListEntryV1) => void;
}) {
  const [ordered, setOrdered] = useState<CustomerDeckListEntryV1[]>(() =>
    applyDeckShelfOrderV1(decks, slug),
  );
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const dragSession = useRef<DragSession | null>(null);
  const didDrag = useRef(false);

  useEffect(() => {
    setOrdered(applyDeckShelfOrderV1(decks, slug));
  }, [decks, slug]);

  const reorder = useCallback(
    (fromKey: string, toKey: string) => {
      if (fromKey === toKey) return;
      setOrdered((current) => {
        const keys = current.map((deck) => deck.key);
        const fromIndex = keys.indexOf(fromKey);
        const toIndex = keys.indexOf(toKey);
        if (fromIndex < 0 || toIndex < 0) return current;
        const nextKeys = reorderDeckShelfKeysV1(keys, fromIndex, toIndex);
        writeDeckShelfOrderV1(slug, nextKeys);
        const byKey = new Map(current.map((deck) => [deck.key, deck]));
        return nextKeys.map((key) => byKey.get(key)!);
      });
    },
    [slug],
  );

  const dropTargetFromPoint = (x: number, y: number): string | null => {
    const under = document.elementFromPoint(x, y);
    const item = under?.closest("[data-deck-key]");
    return item?.getAttribute("data-deck-key") ?? null;
  };

  const onPointerDown = (event: React.PointerEvent, deckKey: string) => {
    if ((event.target as HTMLElement).closest(".deck-magic-card__delete")) return;
    dragSession.current = {
      key: deckKey,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      armed: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const session = dragSession.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;
    if (!session.armed) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      session.armed = true;
      didDrag.current = true;
      setDragKey(session.key);
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    if (!session.armed) return;

    event.preventDefault();
    const target = dropTargetFromPoint(event.clientX, event.clientY);
    setOverKey(target);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const session = dragSession.current;
    if (!session || session.pointerId !== event.pointerId) return;

    if (session.armed) {
      const target = dropTargetFromPoint(event.clientX, event.clientY);
      if (target && target !== session.key) {
        reorder(session.key, target);
      }
    }

    dragSession.current = null;
    setDragKey(null);
    setOverKey(null);
    window.setTimeout(() => {
      didDrag.current = false;
    }, 80);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released.
    }
  };

  const onPointerCancel = (event: React.PointerEvent) => {
    onPointerUp(event);
  };

  return (
    <div className="deck-shelf-wrap mt-8">
      <p className="professor-mtg-muted mb-4 text-[11px]">
        Press and drag a card to reorder your shelf — order is saved on this device.
      </p>
      <ul className="deck-shelf">
        {ordered.map((deck) => {
          const isDragging = dragKey === deck.key;
          const isOver = overKey === deck.key && dragKey !== deck.key;
          return (
            <li
              key={deck.key}
              data-deck-key={deck.key}
              className={[
                "deck-shelf__item",
                isDragging ? "deck-shelf__item--dragging" : "",
                isOver ? "deck-shelf__item--over" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerDown={(event) => onPointerDown(event, deck.key)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              <DeckMagicCardTile
                deck={deck}
                onRequestDelete={onRequestDelete}
                isDragging={isDragging}
                suppressNavigation={() => didDrag.current}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
