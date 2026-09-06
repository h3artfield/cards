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

    /**
     * Each source is applied the moment it lands.
     *
     * These used to share one `Promise.allSettled`, which quietly tied the
     * fastest source to the slowest: images come back in a few seconds and
     * prices can take a minute, so a whole deck of card art waited on the
     * price lookup. That was survivable when images were only used for hover
     * previews and invisible when they were not there, but the image-led views
     * render nothing at all until the map arrives.
     */
    const load = async <T,>(
      path: string,
      apply: (data: T) => void,
    ): Promise<void> => {
      try {
        const response = await fetch(`/api/store/${slug}/professor/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardNames: names }),
        });
        if (!response.ok) throw new Error(`${path} returned ${response.status}`);
        const data = (await response.json()) as T;
        if (!cancelled) apply(data);
      } catch {
        // Let these names be asked for again. Marking them up front stops two
        // requests racing for the same cards, but keeping them marked after a
        // failure would mean a single blip costs the deck its art until reload.
        for (const name of names) requested.current.delete(name);
      }
    };

    void load<{ imageUrls?: Record<string, string> }>("card-images", (data) => {
      if (data.imageUrls) setImageUrls((prev) => ({ ...prev, ...data.imageUrls }));
    });
    void load<{ inventoryByName?: Record<string, ProfessorDeckInventoryEntryV43> }>(
      "brew/inventory-match",
      (data) => {
        if (data.inventoryByName) {
          setInventoryByName((prev) => ({ ...prev, ...data.inventoryByName }));
        }
      },
    );
    void load<{ tcgPricesByName?: Record<string, number> }>("card-prices", (data) => {
      if (data.tcgPricesByName) {
        setTcgPricesByName((prev) => ({ ...prev, ...data.tcgPricesByName }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [slug, nameKey]);

  return useMemo(
    () => ({ imageUrls, inventoryByName, tcgPricesByName }),
    [imageUrls, inventoryByName, tcgPricesByName],
  );
}
