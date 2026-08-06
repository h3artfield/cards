import type { PricingRaw } from "../processing/reference-image";
import type {
  CardCategory,
  CardSuspect,
  CatalogSource,
  EvidenceSlot,
} from "./types";

function refImages(raw: PricingRaw, source: string): string[] {
  const urls: string[] = [];
  if (raw.images?.large) urls.push(raw.images.large);
  else if (raw.images?.small) urls.push(raw.images.small);
  if (raw.image_uris?.large) urls.push(raw.image_uris.large);
  else if (raw.image_uris?.normal) urls.push(raw.image_uris.normal);
  if (source === "ygoprodeck" && raw.card_images?.length) {
    const img = raw.card_images[0];
    if (img.image_url) urls.push(img.image_url);
  }
  return [...new Set(urls)];
}

function finishFromTcgPrices(
  prices: Record<string, unknown> | undefined,
): string[] {
  if (!prices) return ["normal"];
  const finishes: string[] = [];
  if (prices.normal) finishes.push("normal");
  if (prices.holofoil) finishes.push("holofoil");
  if (prices.reverseHolofoil) finishes.push("reverse_holo");
  if (prices["1stEditionHolofoil"]) finishes.push("1st_edition_holo");
  if (prices["1stEditionNormal"]) finishes.push("1st_edition_normal");
  return finishes.length ? finishes : ["normal"];
}

export function catalogSourceFromLegacy(source: string): CatalogSource {
  switch (source) {
    case "scryfall":
      return "scryfall";
    case "pokemon_tcg":
      return "pokemon_tcg";
    case "ygoprodeck":
      return "ygoprodeck";
    case "pricecharting":
      return "pricecharting";
    case "scan_derived_fallback":
      return "scan_derived_fallback";
    default:
      return "unknown";
  }
}

function resolvePokemonSet(
  raw: Record<string, unknown>,
): { name?: string; id?: string } | undefined {
  const setField = raw.set;
  if (typeof setField === "string") {
    const id = setField.trim();
    return id ? { id, name: raw.setName != null ? String(raw.setName) : undefined } : undefined;
  }
  if (setField && typeof setField === "object") {
    const set = setField as { name?: string; id?: string };
    return {
      name: set.name,
      id: set.id,
    };
  }
  return undefined;
}

function resolveScryfallSet(
  raw: Record<string, unknown>,
): { name?: string; code?: string } | undefined {
  const setName =
    raw.set_name != null ? String(raw.set_name).trim() : undefined;
  const setField = raw.set;
  if (typeof setField === "string") {
    const code = setField.trim();
    return code ? { code, name: setName ?? code.toUpperCase() } : undefined;
  }
  if (setField && typeof setField === "object") {
    const set = setField as { name?: string; code?: string };
    return {
      name: setName ?? set.name,
      code: set.code,
    };
  }
  if (setName) return { name: setName };
  return undefined;
}

function isTheListPrinting(
  set?: { name?: string; code?: string },
  collector?: string,
): boolean {
  if (set?.code?.toLowerCase() === "plst") return true;
  if (set?.name?.toLowerCase() === "the list") return true;
  return /^[a-z]{2,4}-\d+/i.test(collector ?? "");
}

export function pokemonRawToSuspects(
  raw: Record<string, unknown>,
  category: CardCategory = "pokemon",
): CardSuspect[] {
  const name = String(raw.name ?? "Unknown");
  const set = resolvePokemonSet(raw);
  const number = String(raw.number ?? "");
  const id = String(raw.id ?? `${name}-${number}`);
  const tcgplayer = raw.tcgplayer as
    | { prices?: Record<string, unknown> }
    | undefined;
  const rarity = String(raw.rarity ?? "");
  const images = raw.images as { large?: string; small?: string } | undefined;
  const refs = images?.large ? [images.large] : images?.small ? [images.small] : [];

  const finishes = finishFromTcgPrices(tcgplayer?.prices);
  const foilUnknown = finishes.length > 1;

  if (foilUnknown && finishes.length >= 2) {
    return finishes.map((finish) => ({
      suspectId: `pokemon_tcg:${id}:${finish}`,
      category,
      label: `${name} · ${set?.name ?? "?"} · ${number} (${finish.replace(/_/g, " ")})`,
      canonicalName: name,
      catalogSource: "pokemon_tcg",
      catalogId: id,
      setName: set?.name,
      setCode: set?.id,
      collectorNumber: number,
      cardNumber: number,
      rarity,
      finish,
      variantTags: [finish, rarity].filter(Boolean),
      expectedEvidence: [],
      referenceImageUrls: refs,
      rawCatalogData: raw,
    }));
  }

  return [
    {
      suspectId: `pokemon_tcg:${id}:${finishes[0] ?? "normal"}`,
      category,
      label: `${name} · ${set?.name ?? "?"} · ${number}`,
      canonicalName: name,
      catalogSource: "pokemon_tcg",
      catalogId: id,
      setName: set?.name,
      setCode: set?.id,
      collectorNumber: number,
      cardNumber: number,
      rarity,
      finish: finishes[0],
      variantTags: [rarity].filter(Boolean),
      expectedEvidence: [],
      referenceImageUrls: refs,
      rawCatalogData: raw,
    },
  ];
}

export function scryfallRawToSuspects(
  raw: Record<string, unknown>,
  category: CardCategory = "mtg",
): CardSuspect[] {
  const name = String(raw.name ?? "Unknown");
  const set = resolveScryfallSet(raw);
  const collector = String(raw.collector_number ?? "");
  const id = String(raw.id ?? `${name}-${collector}`);
  const prices = raw.prices as { usd?: string; usd_foil?: string } | undefined;
  const refs = refImages(raw as PricingRaw, "scryfall");
  const apiFinishes = Array.isArray(raw.finishes)
    ? (raw.finishes as string[]).filter(Boolean)
    : [];
  const finishes: string[] = apiFinishes.length
    ? apiFinishes
    : (() => {
        const fromPrices: string[] = [];
        if (prices?.usd) fromPrices.push("nonfoil");
        if (prices?.usd_foil) fromPrices.push("foil");
        return fromPrices.length ? fromPrices : ["unknown_finish"];
      })();
  const finishList = finishes;
  const frameEffects = Array.isArray(raw.frame_effects)
    ? (raw.frame_effects as string[]).join(", ")
    : String(raw.frame ?? "");
  const promoTypes = Array.isArray(raw.promo_types)
    ? (raw.promo_types as string[]).join(", ")
    : String(raw.promo_types ?? "");
  const lang = raw.lang ? String(raw.lang) : undefined;
  const rarity = raw.rarity ? String(raw.rarity) : undefined;
  const theList = isTheListPrinting(set, collector);

  return finishList.map((finish) => ({
    suspectId: `scryfall:${id}:${finish}`,
    category,
    label: `${name} · ${set?.name ?? "?"} (${set?.code ?? "?"}) · #${collector} · ${finish}`,
    canonicalName: name,
    catalogSource: "scryfall",
    catalogId: id,
    setName: set?.name,
    setCode: set?.code,
    collectorNumber: collector,
    cardNumber: collector,
    finish,
    language: lang,
    rarity,
    variantTags: [
      finish,
      frameEffects,
      promoTypes,
      ...(theList ? ["the_list"] : []),
    ].filter(Boolean),
    expectedEvidence: [],
    referenceImageUrls: refs,
    rawCatalogData: raw,
  }));
}

export function ygoRawToSuspects(
  raw: Record<string, unknown>,
  category: CardCategory = "yugioh",
): CardSuspect[] {
  const name = String(raw.name ?? "Unknown");
  const id = String(raw.id ?? name);
  const cardSets = (raw.card_sets as Array<Record<string, unknown>> | undefined) ?? [];
  const refs = refImages(raw as PricingRaw, "ygoprodeck");

  if (!cardSets.length) {
    return [
      {
        suspectId: `ygoprodeck:${id}:default`,
        category,
        label: name,
        canonicalName: name,
        catalogSource: "ygoprodeck",
        catalogId: id,
        variantTags: [],
        expectedEvidence: [],
        referenceImageUrls: refs,
        rawCatalogData: raw,
      },
    ];
  }

  return cardSets.slice(0, 8).map((setInfo, idx) => {
    const setCode = String(setInfo.set_code ?? setInfo.set_name ?? "");
    const setName = String(setInfo.set_name ?? setCode);
    const rarity = String(setInfo.set_rarity ?? "");
    const edition = setInfo.set_edition
      ? String(setInfo.set_edition)
      : undefined;
    return {
      suspectId: `ygoprodeck:${id}:${setCode}:${idx}`,
      category,
      label: `${name} · ${setName} · ${rarity}${edition ? ` · ${edition}` : ""}`,
      canonicalName: name,
      catalogSource: "ygoprodeck",
      catalogId: id,
      setName,
      setCode,
      rarity,
      edition,
      variantTags: [rarity, edition ?? ""].filter(Boolean),
      expectedEvidence: [],
      referenceImageUrls: refs,
      rawCatalogData: { ...raw, card_sets: [setInfo] },
    };
  });
}

export function priceChartingToSuspects(
  product: Record<string, unknown>,
  category: CardCategory = "sports",
  options?: { graded?: boolean; gradingCompany?: string; grade?: string },
): CardSuspect[] {
  const name = String(product["product-name"] ?? "Unknown");
  const consoleName = String(product["console-name"] ?? "");
  const id = String(product.id ?? name);
  const suspects: CardSuspect[] = [];

  const base = {
    category,
    canonicalName: name,
    catalogSource: "pricecharting" as const,
    catalogId: id,
    setName: consoleName,
    expectedEvidence: [] as EvidenceSlot[],
    rawCatalogData: product,
  };

  suspects.push({
    ...base,
    suspectId: `pricecharting:${id}:raw`,
    label: `${name} · ${consoleName} (raw)`,
    finish: "raw",
    variantTags: ["raw"],
  });

  if (options?.graded && options.gradingCompany) {
    suspects.push({
      ...base,
      suspectId: `pricecharting:${id}:graded:${options.gradingCompany}:${options.grade ?? ""}`,
      label: `${name} · ${consoleName} (${options.gradingCompany} ${options.grade ?? ""})`,
      finish: "graded",
      gradingCompany: options.gradingCompany,
      grade: options.grade,
      variantTags: ["graded", options.gradingCompany],
    });
  }

  return suspects;
}

export function catalogMatchToSuspects(
  raw: Record<string, unknown>,
  source: string,
  category: CardCategory,
  options?: { graded?: boolean; gradingCompany?: string; grade?: string },
): CardSuspect[] {
  const catalogSource = catalogSourceFromLegacy(source);
  switch (catalogSource) {
    case "pokemon_tcg":
      return pokemonRawToSuspects(raw, category);
    case "scryfall":
      return scryfallRawToSuspects(raw, category);
    case "ygoprodeck":
      return ygoRawToSuspects(raw, category);
    case "pricecharting":
      return priceChartingToSuspects(raw, category, options);
    default:
      return [];
  }
}

export function buildSyntheticSuspect(
  partial: Partial<CardSuspect> & {
    suspectId: string;
    label: string;
    category: CardCategory;
  },
): CardSuspect {
  return {
    catalogSource: "local_catalog",
    variantTags: [],
    expectedEvidence: [],
    ...partial,
  };
}

export function expectedEvidenceFromSuspect(suspect: CardSuspect): EvidenceSlot[] {
  const fields: EvidenceSlot[] = [];
  const add = (field: string, value?: string) => {
    if (value) {
      fields.push({
        field,
        value,
        status: "observed",
        confidence: 1,
        source: "catalog_match",
      });
    }
  };
  add("card_name", suspect.canonicalName);
  add("set_name", suspect.setName);
  add("set_code", suspect.setCode);
  add("collector_number", suspect.collectorNumber ?? suspect.cardNumber);
  add("language", suspect.language);
  add("rarity", suspect.rarity);
  add("foil_pattern", suspect.finish);
  add("edition", suspect.edition);
  add("slab_company", suspect.gradingCompany);
  add("slab_grade", suspect.grade);
  return fields;
}
