import type { ConditionEstimate } from "../../types";
import type { TcgplayerMappingAudit } from "./source-health-types";

/** TCGplayer listing condition labels (mp-search-api). */
export const TCGPLAYER_LISTING_CONDITIONS: Record<
  ConditionEstimate,
  string
> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

/** Pokémon TCG API variant key → TCGplayer listing printing filter. */
const VARIANT_TO_LISTING_PRINTING: Record<string, string> = {
  normal: "Unlimited",
  holofoil: "Holofoil",
  reverseHolofoil: "Reverse Holofoil",
  "1stEditionNormal": "1st Edition",
  "1stEditionHolofoil": "1st Edition",
};

export function listingPrintingForVariant(
  variantKey?: string,
): string | undefined {
  if (!variantKey?.trim()) return undefined;
  return VARIANT_TO_LISTING_PRINTING[variantKey.trim()];
}

type ListingsResponse = {
  results?: Array<{
    results?: Array<{ price?: number }>;
  }>;
};

/** Lowest active listing card price (excludes shipping) for one condition. */
export async function fetchTcgplayerLowestListingPrice(input: {
  productId: string | number;
  condition: ConditionEstimate;
  printing?: string;
}): Promise<number | undefined> {
  const productId = Number(input.productId);
  if (!Number.isFinite(productId) || productId <= 0) return undefined;

  const term: Record<string, string | number> = {
    productId,
    condition: TCGPLAYER_LISTING_CONDITIONS[input.condition],
  };
  if (input.printing?.trim()) {
    term.printing = input.printing.trim();
  }

  const body = {
    filters: {
      term,
      range: { quantity: { gte: 1 } },
    },
    from: 0,
    size: 1,
    sort: { field: "price+shipping", order: "asc" },
    context: { shippingCountry: "US", cart: {} },
  };

  const res = await fetch(
    `https://mp-search-api.tcgplayer.com/v1/product/${productId}/listings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    },
  );

  if (!res.ok) return undefined;

  const data = (await res.json()) as ListingsResponse;
  const hit = data.results?.[0]?.results?.[0];
  const price = hit?.price;
  return price != null && price > 0 ? price : undefined;
}

/** Fetch lowest listing per condition for a TCGplayer product + finish printing. */
export async function fetchTcgplayerConditionLowPrices(input: {
  productId: string | number;
  printing?: string;
}): Promise<Partial<Record<ConditionEstimate, number>>> {
  const conditions: ConditionEstimate[] = ["NM", "LP", "MP", "HP", "DMG"];
  const entries = await Promise.all(
    conditions.map(async (condition) => {
      const price = await fetchTcgplayerLowestListingPrice({
        productId: input.productId,
        condition,
        printing: input.printing,
      });
      return [condition, price] as const;
    }),
  );

  const out: Partial<Record<ConditionEstimate, number>> = {};
  for (const [condition, price] of entries) {
    if (price != null && price > 0) {
      out[condition] = price;
    }
  }
  return out;
}

/** Populate conditionLowPrices on an existing TCGplayer mapping audit. */
export async function enrichTcgplayerMappingConditionLows(
  mapping: TcgplayerMappingAudit,
): Promise<void> {
  if (!mapping.productId) return;
  const printing = listingPrintingForVariant(
    mapping.selectedVariantName ?? mapping.finishMatched ?? mapping.subtype,
  );
  try {
    const lows = await fetchTcgplayerConditionLowPrices({
      productId: mapping.productId,
      printing,
    });
    if (!Object.keys(lows).length) return;
    mapping.conditionLowPrices = lows;
    mapping.conditionLowPrinting = printing;
    if (lows.NM != null) {
      mapping.lowPrice = lows.NM;
    }
  } catch {
    // Non-fatal — catalog tier low remains available.
  }
}
