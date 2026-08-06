import type { ScannedCard, VisionResult } from "../types";
import { findCatalogCard } from "./pricing";
import { isGradedSlab } from "./slab-pricing";

interface CardImages {
  small?: string;
  large?: string;
}

export interface PricingRaw {
  images?: CardImages;
  image_uris?: { normal?: string; large?: string; png?: string };
  card_images?: Array<{ image_url?: string; image_url_small?: string }>;
  name?: string;
  number?: string;
  set?: { name?: string };
}

function getCatalogImageUrl(
  raw: PricingRaw,
  source: string,
): string | undefined {
  if (raw.images?.large || raw.images?.small) {
    return raw.images.large ?? raw.images.small;
  }

  if (raw.image_uris?.large || raw.image_uris?.normal || raw.image_uris?.png) {
    return raw.image_uris.large ?? raw.image_uris.normal ?? raw.image_uris.png;
  }

  if (source === "ygoprodeck" && raw.card_images?.length) {
    const img = raw.card_images[0];
    return img.image_url ?? img.image_url_small;
  }

  return undefined;
}

export function getReferenceImageUrl(card: ScannedCard): {
  url?: string;
  source?: string;
} {
  const pricing = card.pricingJson as
    | { source?: string; raw?: PricingRaw }
    | undefined;
  const raw = pricing?.raw;
  if (!raw) return {};

  const url = getCatalogImageUrl(raw, pricing?.source ?? "");
  if (!url) return {};

  return {
    url,
    source: pricing?.source ?? "catalog",
  };
}

export interface ResolvedReference {
  url?: string;
  source?: string;
  catalogRaw?: Record<string, unknown>;
}

/** Fetch catalog art from pricing snapshot or live API lookup. */
export async function resolveReferenceImage(
  card: ScannedCard,
): Promise<ResolvedReference> {
  const fromPricing = getReferenceImageUrl(card);
  if (fromPricing.url) {
    return fromPricing;
  }

  const vision = card.visionJson as VisionResult | undefined;
  if (!vision) return {};

  const catalog = await findCatalogCard(vision);
  if (!catalog) return {};

  const url = getCatalogImageUrl(
    catalog.raw as PricingRaw,
    catalog.source,
  );

  return {
    url,
    source: catalog.source,
    catalogRaw: catalog.raw,
  };
}

/** Attach catalog art to verification after pricing/catalog lookup. */
export async function enrichIdentityVerificationFromCatalog(
  verification: import("../types").CardIdentityVerification,
  card: ScannedCard,
): Promise<import("../types").CardIdentityVerification> {
  if (verification.referenceImageUrl) return verification;

  // Slabs: never attach an unvalidated catalog ref (wrong printing misleads the UI).
  if (isGradedSlab(card)) return verification;

  const fromPricing = getReferenceImageUrl(card);
  if (fromPricing.url) {
    return {
      ...verification,
      referenceImageUrl: fromPricing.url,
      referenceSource: fromPricing.source ?? verification.referenceSource,
    };
  }

  const resolved = await resolveReferenceImage(card);
  if (resolved.url) {
    return {
      ...verification,
      referenceImageUrl: resolved.url,
      referenceSource: resolved.source ?? verification.referenceSource,
    };
  }

  return verification;
}

export function catalogIdentityFields(
  raw: Record<string, unknown>,
  source: string,
): Record<string, string | undefined> {
  if (source === "pokemon_tcg") {
    return {
      name: String(raw.name ?? ""),
      number: String(raw.number ?? ""),
      set: String((raw.set as { name?: string } | undefined)?.name ?? ""),
      rarity: String(raw.rarity ?? ""),
    };
  }
  if (source === "scryfall") {
    return {
      name: String(raw.name ?? ""),
      number: String(raw.collector_number ?? ""),
      set: String((raw.set_name as string | undefined) ?? ""),
    };
  }
  if (source === "ygoprodeck") {
    return {
      name: String(raw.name ?? ""),
      set: String((raw as { card_sets?: Array<{ set_name?: string }> }).card_sets?.[0]?.set_name ?? ""),
    };
  }
  if (source === "pricecharting") {
    return {
      name: String(raw["product-name"] ?? ""),
      set: String(raw["console-name"] ?? ""),
    };
  }
  return {};
}

export { getCatalogImageUrl };
