import { getCatalogImageUrl, type PricingRaw } from "../processing/reference-image";
import type { CardSuspect, CatalogSource } from "./types";
import type { ScanDerivedSuspectMeta } from "./types";

export type ReferenceImageSource =
  | "scryfall"
  | "pokemon_tcg"
  | "pricecharting"
  | "tcgplayer"
  | "catalog"
  | "unknown";

export type SuspectReferenceImages = {
  referenceImageUrl?: string;
  referenceImageBackUrl?: string;
  referenceImageSource: ReferenceImageSource;
  hasReferenceImage: boolean;
};

function mapCatalogSource(source: CatalogSource): ReferenceImageSource {
  switch (source) {
    case "scryfall":
      return "scryfall";
    case "pokemon_tcg":
      return "pokemon_tcg";
    case "pricecharting":
      return "pricecharting";
    case "ygoprodeck":
    case "riftbound_official":
    case "sports_checklist":
    case "local_catalog":
      return "catalog";
    default:
      return "unknown";
  }
}

function scryfallFaceUrls(raw: Record<string, unknown>): {
  front?: string;
  back?: string;
} {
  const faces = raw.card_faces as
    | Array<{ image_uris?: { large?: string; normal?: string; png?: string } }>
    | undefined;
  if (faces?.length) {
    const pick = (face?: (typeof faces)[0]) => {
      const uris = face?.image_uris;
      return uris?.large ?? uris?.normal ?? uris?.png;
    };
    return { front: pick(faces[0]), back: pick(faces[1]) };
  }
  const url = getCatalogImageUrl(raw as PricingRaw, "scryfall");
  return url ? { front: url } : {};
}

function imagesFromRaw(
  raw: Record<string, unknown> | undefined,
  catalogSource: CatalogSource,
): { front?: string; back?: string } {
  if (!raw) return {};

  if (catalogSource === "scryfall") {
    return scryfallFaceUrls(raw);
  }

  if (catalogSource === "scan_derived_fallback") {
    const meta = raw as ScanDerivedSuspectMeta;
    const tcg = meta.tcgplayerJapanProduct;
    if (tcg?.imageUrl) {
      return { front: tcg.imageUrl };
    }
    const pc = meta.priceChartingProduct as Record<string, unknown> | undefined;
    if (pc) {
      const url =
        (pc["image-url"] as string | undefined) ??
        (pc.imageUrl as string | undefined);
      return url ? { front: url } : {};
    }
    return {};
  }

  const legacySource =
    catalogSource === "pokemon_tcg"
      ? "pokemon_tcg"
      : catalogSource === "pricecharting"
        ? "pricecharting"
        : catalogSource === "ygoprodeck"
          ? "ygoprodeck"
          : "catalog";
  const front = getCatalogImageUrl(raw as PricingRaw, legacySource);
  return front ? { front } : {};
}

/** Best available catalog reference images for a suspect (Directive 011). */
export function referenceImagesFromSuspect(
  suspect: CardSuspect,
): SuspectReferenceImages {
  const source = mapCatalogSource(suspect.catalogSource);
  const fromRaw = imagesFromRaw(
    suspect.rawCatalogData as Record<string, unknown> | undefined,
    suspect.catalogSource,
  );

  const referenceImageUrl =
    suspect.referenceImageUrls?.[0] ?? fromRaw.front ?? undefined;
  const referenceImageBackUrl = fromRaw.back;

  let referenceImageSource = referenceImageUrl ? source : "unknown";
  if (
    referenceImageUrl &&
    suspect.catalogSource === "scan_derived_fallback" &&
    (suspect.rawCatalogData as ScanDerivedSuspectMeta | undefined)
      ?.tcgplayerJapanProduct?.imageUrl
  ) {
    referenceImageSource = "tcgplayer";
  }

  return {
    referenceImageUrl,
    referenceImageBackUrl,
    referenceImageSource,
    hasReferenceImage: Boolean(referenceImageUrl),
  };
}

export function referenceSourceLabel(source: ReferenceImageSource): string {
  switch (source) {
    case "scryfall":
      return "Scryfall";
    case "pokemon_tcg":
      return "Pokémon TCG API";
    case "pricecharting":
      return "PriceCharting";
    case "tcgplayer":
      return "TCGplayer Japan";
    case "catalog":
      return "Catalog";
    default:
      return "Catalog";
  }
}

export function suspectCompareLabel(row: {
  label: string;
  setName?: string;
  setCode?: string;
  collectorNumber?: string;
  finish?: string;
  language?: string;
}): string {
  const name = row.label.split(" · ")[0] ?? row.label;
  const parts = [
    name,
    row.setName ?? row.setCode,
    row.collectorNumber,
    row.finish?.replace(/_/g, " "),
    row.language,
  ].filter(Boolean);
  return parts.join(" · ");
}
