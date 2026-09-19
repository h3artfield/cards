"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  PILE_STORAGE_PREFIX,
  addManyPileCards,
  addPileCard,
  readPile,
  removePileCard,
  togglePileCard,
  writePile,
  type PileCard,
} from "@/lib/store-inventory/pile";

const cache = new Map<string, PileCard[]>();
const listeners = new Set<() => void>();
const EMPTY: PileCard[] = [];

function snapshot(slug: string): PileCard[] {
  const cached = cache.get(slug);
  if (cached) return cached;
  const loaded = readPile(slug);
  cache.set(slug, loaded);
  return loaded;
}

function publish(): void {
  for (const listener of listeners) listener();
}

function commit(slug: string, cards: PileCard[]): void {
  cache.set(slug, cards);
  writePile(slug, cards);
  publish();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key && !event.key.startsWith(PILE_STORAGE_PREFIX)) return;
    cache.clear();
    onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePile(slug: string) {
  const cards = useSyncExternalStore(
    subscribe,
    () => snapshot(slug),
    () => EMPTY,
  );

  const add = useCallback(
    (card: PileCard) => {
      commit(slug, addPileCard(snapshot(slug), card));
    },
    [slug],
  );

  const addMany = useCallback(
    (incoming: PileCard[]) => {
      commit(slug, addManyPileCards(snapshot(slug), incoming));
    },
    [slug],
  );

  const remove = useCallback(
    (inventoryItemId: string) => {
      commit(slug, removePileCard(snapshot(slug), inventoryItemId));
    },
    [slug],
  );

  const toggle = useCallback(
    (card: PileCard) => {
      commit(slug, togglePileCard(snapshot(slug), card));
    },
    [slug],
  );

  const clear = useCallback(() => {
    commit(slug, []);
  }, [slug]);

  return {
    cards,
    count: cards.length,
    add,
    addMany,
    remove,
    toggle,
    clear,
  };
}
