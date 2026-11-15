"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfessorDeckInventoryEntryV43 } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";

export type CardEnrichment = {
  imageUrls: Record<string, string>;
  inventoryByName: Record<string, ProfessorDeckInventoryEntryV43>;
  tcgPricesByName: Record<string, number>;
};

export type CardEnrichmentNeedV1 = {
  images?: boolean;
  inventory?: boolean;
  prices?: boolean;
};

/**
 * Images, shop stock, and market prices for a set of card names.
 *
 * Each source is fetched only when asked for. The text list does not need art,
 * and fetching ninety-nine Scryfall faces in the background was crashing the
 * tab a few seconds after the names appeared.
 */
export function useCardEnrichment(
  slug: string,
  cardNames: readonly string[],
  need: CardEnrichmentNeedV1 = {},
): CardEnrichment {
  const wantImages = need.images === true;
  const wantInventory = need.inventory !== false;
  const wantPrices = need.prices === true;

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [inventoryByName, setInventoryByName] = useState<
    Record<string, ProfessorDeckInventoryEntryV43>
  >({});
  const [tcgPricesByName, setTcgPricesByName] = useState<Record<string, number>>({});
  const requestedImages = useRef(new Set<string>());
  const requestedInventory = useRef(new Set<string>());
  const requestedPrices = useRef(new Set<string>());

  const nameKey = useMemo(() => [...cardNames].sort().join("\u0001"), [cardNames]);

  useEffect(() => {
    if (!slug || nameKey.length === 0) return;
    const all = nameKey.split("\u0001");
    let cancelled = false;

    const load = async <T,>(
      path: string,
      names: string[],
      requested: Set<string>,
      apply: (data: T) => void,
    ): Promise<void> => {
      if (names.length === 0) return;
      names.forEach((name) => requested.add(name));
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
        for (const name of names) requested.delete(name);
      }
    };

    if (wantImages) {
      void load<{ imageUrls?: Record<string, string> }>(
        "card-images",
        all.filter((name) => !requestedImages.current.has(name)),
        requestedImages.current,
        (data) => {
          if (data.imageUrls) setImageUrls((prev) => ({ ...prev, ...data.imageUrls }));
        },
      );
    }
    if (wantInventory) {
      void load<{ inventoryByName?: Record<string, ProfessorDeckInventoryEntryV43> }>(
        "brew/inventory-match",
        all.filter((name) => !requestedInventory.current.has(name)),
        requestedInventory.current,
        (data) => {
          if (data.inventoryByName) {
            setInventoryByName((prev) => ({ ...prev, ...data.inventoryByName }));
          }
        },
      );
    }
    if (wantPrices) {
      void load<{ tcgPricesByName?: Record<string, number> }>(
        "card-prices",
        all.filter((name) => !requestedPrices.current.has(name)),
        requestedPrices.current,
        (data) => {
          if (data.tcgPricesByName) {
            setTcgPricesByName((prev) => ({ ...prev, ...data.tcgPricesByName }));
          }
        },
      );
    }

    return () => {
      cancelled = true;
    };
  }, [nameKey, slug, wantImages, wantInventory, wantPrices]);

  return useMemo(
    () => ({ imageUrls, inventoryByName, tcgPricesByName }),
    [imageUrls, inventoryByName, tcgPricesByName],
  );
}
