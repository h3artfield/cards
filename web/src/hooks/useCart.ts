"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  CART_STORAGE_PREFIX,
  addCartLine,
  cartItemCount,
  cartSubtotal,
  pruneCartLines,
  readCart,
  removeCartLine,
  setCartLineQuantity,
  writeCart,
  type CartLine,
} from "@/lib/store-inventory/cart";

/**
 * The cart lives in localStorage, so it is an external store: React reads it
 * through useSyncExternalStore instead of mirroring it into state.
 */
const cache = new Map<string, CartLine[]>();
const listeners = new Set<() => void>();
const EMPTY: CartLine[] = [];

function snapshot(slug: string): CartLine[] {
  const cached = cache.get(slug);
  if (cached) return cached;
  const loaded = readCart(slug);
  cache.set(slug, loaded);
  return loaded;
}

function publish(): void {
  for (const listener of listeners) listener();
}

function commit(slug: string, lines: CartLine[]): void {
  cache.set(slug, lines);
  writeCart(slug, lines);
  publish();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key && !event.key.startsWith(CART_STORAGE_PREFIX)) return;
    cache.clear();
    onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart(slug: string) {
  const lines = useSyncExternalStore(
    subscribe,
    () => snapshot(slug),
    () => EMPTY,
  );

  const add = useCallback(
    (line: Omit<CartLine, "quantity"> & { quantity?: number }) => {
      commit(slug, addCartLine(snapshot(slug), line));
    },
    [slug],
  );

  const setQuantity = useCallback(
    (inventoryItemId: string, quantity: number) => {
      commit(
        slug,
        setCartLineQuantity(snapshot(slug), inventoryItemId, quantity),
      );
    },
    [slug],
  );

  const remove = useCallback(
    (inventoryItemId: string) => {
      commit(slug, removeCartLine(snapshot(slug), inventoryItemId));
    },
    [slug],
  );

  const prune = useCallback(
    (inventoryItemIds: string[]) => {
      commit(slug, pruneCartLines(snapshot(slug), inventoryItemIds));
    },
    [slug],
  );

  const clear = useCallback(() => {
    commit(slug, []);
  }, [slug]);

  return {
    lines,
    count: cartItemCount(lines),
    subtotal: cartSubtotal(lines),
    add,
    setQuantity,
    remove,
    prune,
    clear,
  };
}
