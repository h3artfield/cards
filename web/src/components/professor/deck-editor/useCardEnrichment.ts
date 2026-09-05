"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfessorDeckInventoryEntryV43 } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";

export type CardEnrichment = {
  imageUrls: Record<string, string>;
  inventoryByName: Record<string, ProfessorDeckInventoryEntryV43>;
  tcgPricesByName: Record<string, number>;
};

/**
 * Images, shop stock, and market prices for a set of card names.
 *
 * Fetched incrementally: only names not asked for before are sent, so adding
 * one card to a ninety-nine card deck costs a request about one card. Every
 * source is optional — a failure costs a price or a hover image, and the deck
 * still renders.
 */
export function useCardEnrichment(slug: string, cardNames: readonly string[]): CardEnrichment {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [inventoryByName, setInventoryByName] = useState<
    Record<string, ProfessorDeckInventoryEntryV43>
  >({});
  const [tcgPricesByName, setTcgPricesByName] = useState<Record<string, number>>({});
  const requested = useRef(new Set<string>());

  // Sorted and joined, so this effect re-runs when the deck's contents change
  // but not when the same cards arrive in a different order.
  const nameKey = useMemo(() => [...cardNames].sort().join("\u0001"), [cardNames]);

  useEffect(() => {
    if (!slug || nameKey.length === 0) return;
    const names = nameKey.split("\u0001").filter((name) => !requested.current.has(name));
    if (names.length === 0) return;
    names.forEach((name) => requested.current.add(name));

    let cancelled = false;
    const post = (path: string) =>
      fetch(`/api/store/${slug}/professor/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardNames: names }),
      });

    void (async () => {
      const [images, inventory, prices] = await Promise.allSettled([
        post("card-images"),
        post("brew/inventory-match"),
        post("card-prices"),
      ]);
      if (cancelled) return;

      if (images.status === "fulfilled" && images.value.ok) {
        const data = (await images.value.json().catch(() => null)) as {
          imageUrls?: Record<string, string>;
        } | null;
        if (data?.imageUrls && !cancelled) {
          setImageUrls((prev) => ({ ...prev, ...data.imageUrls }));
        }
      }

      if (inventory.status === "fulfilled" && inventory.value.ok) {
        const data = (await inventory.value.json().catch(() => null)) as {
          inventoryByName?: Record<string, ProfessorDeckInventoryEntryV43>;
        } | null;
        if (data?.inventoryByName && !cancelled) {
          setInventoryByName((prev) => ({ ...prev, ...data.inventoryByName }));
        }
      }

      if (prices.status === "fulfilled" && prices.value.ok) {
        const data = (await prices.value.json().catch(() => null)) as {
          tcgPricesByName?: Record<string, number>;
        } | null;
        if (data?.tcgPricesByName && !cancelled) {
          setTcgPricesByName((prev) => ({ ...prev, ...data.tcgPricesByName }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, nameKey]);

  return useMemo(
    () => ({ imageUrls, inventoryByName, tcgPricesByName }),
    [imageUrls, inventoryByName, tcgPricesByName],
  );
}
