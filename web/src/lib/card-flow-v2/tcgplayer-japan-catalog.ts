import type { PokemonScanIdentity } from "./pokemon-japanese-fallback";
import {
  extractPokemonScanIdentity,
  isExactJapanesePokemonPriceChartingMatch,
  scanDerivedMetaFromSuspect,
  scanIdentityFromSuspect,
  tryPriceChartingExactJapanesePokemon,
} from "./pokemon-japanese-fallback";
import {
  isNonLatinPokemonName,
  japanesePokemonSetMatchHints,
  normalizePokemonSetCode,
  pokemonCollectorQuery,
  pokemonNumbersMatch,
  textMatchesPokemonSetHints,
} from "../processing/pokemon-utils";
import type {
  CardSuspect,
  ImageEvidenceReport,
  ScanDerivedSuspectMeta,
  TcgplayerJapanProductMeta,
} from "./types";

export const POKEMON_JAPAN_PRODUCT_LINE_ID = 85;
export const POKEMON_JAPAN_PRODUCT_LINE_NAME = "Pokemon Japan";

function isJapaneseSuspectLanguage(lang: string): boolean {
  const v = lang.trim().toLowerCase();
  return v === "jp" || v === "ja" || v.includes("japanese");
}

function isJapaneseScanDerivedSuspect(
  suspect: CardSuspect,
  meta?: ScanDerivedSuspectMeta,
): boolean {
  if (isJapaneseSuspectLanguage(suspect.language ?? "")) return true;
  if (suspect.variantTags?.includes("japanese")) return true;
  if (meta?.nativeName && isNonLatinPokemonName(meta.nativeName)) return true;
  return false;
}

type TcgplayerProductDetails = {
  productId?: number;
  productName?: string;
  productLineName?: string;
  productLineId?: number;
  setName?: string;
  setCode?: string;
  setUrlName?: string;
  productUrlName?: string;
  marketPrice?: number;
  lowestPrice?: number;
  medianPrice?: number;
  customAttributes?: { number?: string };
};

export function tcgplayerProductImageUrl(productId: string | number): string {
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`;
}

export function tcgplayerProductPageUrl(productId: string | number): string {
  return `https://www.tcgplayer.com/product/${productId}`;
}

function isJapaneseProductLine(name?: string, lineId?: number): boolean {
  if (lineId === POKEMON_JAPAN_PRODUCT_LINE_ID) return true;
  const normalized = (name ?? "").trim().toLowerCase();
  return normalized === "pokemon japan" || normalized.includes("pokemon japan");
}

/** Strict match for Japanese Pokémon on TCGplayer Japan catalog rows. */
export function isExactJapanesePokemonTcgplayerMatch(
  product: TcgplayerProductDetails,
  identity: PokemonScanIdentity,
): boolean {
  if (!isJapaneseProductLine(product.productLineName, product.productLineId)) {
    return false;
  }

  const display = identity.displayName.trim().toLowerCase();
  const productName = String(product.productName ?? "").toLowerCase();
  if (!productName.includes(display)) return false;

  const setHints = japanesePokemonSetMatchHints(identity.setName, identity.setCode);
  const setMatch = textMatchesPokemonSetHints(
    [String(product.setName ?? ""), String(product.setCode ?? "")],
    setHints,
  );
  if (!setMatch) return false;

  const cardNumber =
    product.customAttributes?.number ??
    productName.match(/\d{1,3}\/\d{1,3}/)?.[0];
  const collector = pokemonCollectorQuery(identity.collectorNumber);
  if (cardNumber && identity.collectorNumber) {
    if (!pokemonNumbersMatch(identity.collectorNumber, cardNumber)) {
      if (
        collector != null &&
        !new RegExp(`\\b0*${collector}\\b`).test(String(cardNumber))
      ) {
        return false;
      }
    }
  }

  return true;
}

function metaFromDetails(
  details: TcgplayerProductDetails,
  resolutionSource: TcgplayerJapanProductMeta["resolutionSource"],
): TcgplayerJapanProductMeta | null {
  const productId = details.productId;
  if (!productId) return null;

  const slug = [details.productUrlName, details.setUrlName]
    .filter(Boolean)
    .join("-")
    .replace(/\s+/g, "-")
    .toLowerCase();
  const productUrl = slug
    ? `${tcgplayerProductPageUrl(productId)}/pokemon-japan-${slug}`
    : tcgplayerProductPageUrl(productId);

  return {
    productId: String(productId),
    productName: String(details.productName ?? ""),
    productLineName: String(
      details.productLineName ?? POKEMON_JAPAN_PRODUCT_LINE_NAME,
    ),
    setName: details.setName,
    setCode: details.setCode,
    cardNumber: details.customAttributes?.number,
    marketPrice: details.marketPrice,
    lowestPrice: details.lowestPrice,
    medianPrice: details.medianPrice,
    productUrl,
    imageUrl: tcgplayerProductImageUrl(productId),
    resolutionSource,
  };
}

export async function fetchTcgplayerProductDetails(
  productId: string | number,
): Promise<TcgplayerProductDetails | null> {
  const id = String(productId).trim();
  if (!/^\d+$/.test(id)) return null;

  try {
    const res = await fetch(
      `https://mp-search-api.tcgplayer.com/v1/product/${id}/details`,
      {
        headers: {
          Accept: "application/json",
          Origin: "https://www.tcgplayer.com",
          Referer: "https://www.tcgplayer.com/",
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as TcgplayerProductDetails;
  } catch {
    return null;
  }
}

async function fetchPriceChartingTcgplayerId(
  product: Record<string, unknown>,
): Promise<string | undefined> {
  const inline =
    product["tcg-id"] ??
    product.tcgId ??
    product.tcgplayerId ??
    product["tcgplayer-id"];
  if (inline != null && String(inline).trim()) {
    return String(inline).trim();
  }

  const pcId = product.id;
  if (pcId == null) return undefined;

  const apiKey = process.env.PRICECHARTING_API_KEY?.trim();
  if (!apiKey) return undefined;

  try {
    const res = await fetch(
      `https://www.pricecharting.com/api/product?t=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(String(pcId))}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as Record<string, unknown>;
    if (data.status === "error") return undefined;
    const tcgId = data["tcg-id"] ?? data.tcgId;
    return tcgId != null ? String(tcgId).trim() : undefined;
  } catch {
    return undefined;
  }
}

type TcgplayerSearchHit = {
  productId?: number;
  productName?: string;
  productLineName?: string;
  productLineId?: number;
  setName?: string;
  setCode?: string;
  customAttributes?: { number?: string };
};

async function searchTcgplayerJapanProducts(
  query: string,
): Promise<TcgplayerSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const body = {
    algorithm: "sales",
    from: 0,
    size: 12,
    filters: {
      term: { productLineName: [POKEMON_JAPAN_PRODUCT_LINE_NAME] },
      range: { quantity: { gte: 1 } },
      exclude: { channelExclusion: 0 },
    },
    context: { cart: {}, shippingCountry: "US", userProfile: {} },
  };

  try {
    const res = await fetch(
      `https://mp-search-api.tcgplayer.com/v1/search/request?q=${encodeURIComponent(trimmed)}&isList=false`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://www.tcgplayer.com",
          Referer: "https://www.tcgplayer.com/search/pokemon-japan/product",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ results?: TcgplayerSearchHit[] }>;
    };
    return data.results?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

function tcgplayerSearchQueries(identity: PokemonScanIdentity): string[] {
  const collector =
    pokemonCollectorQuery(identity.collectorNumber) ?? identity.collectorNumber;
  return [
    `${identity.displayName} ${identity.setName ?? ""} ${collector ?? ""}`.trim(),
    `${identity.setName ?? identity.setCode ?? ""} ${identity.displayName} ${collector ?? ""}`.trim(),
    `${identity.displayName} ${identity.setCode ?? ""} ${collector ?? ""}`.trim(),
  ].filter(Boolean);
}

async function resolveViaTcgplayerSearch(
  identity: PokemonScanIdentity,
): Promise<TcgplayerJapanProductMeta | null> {
  for (const query of tcgplayerSearchQueries(identity)) {
    const hits = await searchTcgplayerJapanProducts(query);
    for (const hit of hits) {
      if (!isExactJapanesePokemonTcgplayerMatch(hit, identity)) continue;
      const details =
        hit.productId != null
          ? await fetchTcgplayerProductDetails(hit.productId)
          : null;
      const merged = details ?? hit;
      if (!isExactJapanesePokemonTcgplayerMatch(merged, identity)) continue;
      return metaFromDetails(merged, "tcgplayer_search");
    }
  }
  return null;
}

function metaFromTcgId(
  tcgId: string,
  identity: PokemonScanIdentity,
  options?: {
    productName?: string;
    resolutionSource?: TcgplayerJapanProductMeta["resolutionSource"];
    marketPrice?: number;
    lowestPrice?: number;
  },
): TcgplayerJapanProductMeta {
  return {
    productId: tcgId,
    productName: options?.productName ?? identity.displayName,
    productLineName: POKEMON_JAPAN_PRODUCT_LINE_NAME,
    setName: identity.setName,
    setCode: identity.setCode,
    cardNumber: identity.collectorNumber,
    marketPrice: options?.marketPrice,
    lowestPrice: options?.lowestPrice,
    productUrl: tcgplayerProductPageUrl(tcgId),
    imageUrl: tcgplayerProductImageUrl(tcgId),
    resolutionSource: options?.resolutionSource ?? "pricecharting_tcg_id",
  };
}

async function resolveViaPriceChartingTcgId(
  identity: PokemonScanIdentity,
  priceChartingProduct?: Record<string, unknown>,
): Promise<TcgplayerJapanProductMeta | null> {
  let pcProduct = priceChartingProduct;
  if (!pcProduct) {
    pcProduct = (await tryPriceChartingExactJapanesePokemon(identity)) ?? undefined;
  }
  if (!pcProduct || !isExactJapanesePokemonPriceChartingMatch(pcProduct, identity)) {
    return null;
  }

  const tcgId = await fetchPriceChartingTcgplayerId(pcProduct);
  if (!tcgId) return null;

  const details = await fetchTcgplayerProductDetails(tcgId);
  if (details && isExactJapanesePokemonTcgplayerMatch(details, identity)) {
    return metaFromDetails(details, "pricecharting_tcg_id");
  }

  // Cloud Run / datacenter IPs sometimes cannot reach mp-search-api details —
  // still attach catalog art + product id when PriceCharting verified the printing.
  const looseCents = pcProduct["loose-price"];
  const marketFromPc =
    typeof looseCents === "number" && looseCents > 0 ? looseCents / 100 : undefined;

  return metaFromTcgId(tcgId, identity, {
    productName: String(pcProduct["product-name"] ?? identity.displayName),
    marketPrice: details?.marketPrice ?? marketFromPc,
    lowestPrice: details?.lowestPrice ?? undefined,
    resolutionSource: "pricecharting_tcg_id",
  });
}

/** Resolve a verified TCGplayer Japan product for a Japanese Pokémon scan identity. */
export async function resolveTcgplayerJapanPokemon(
  identity: PokemonScanIdentity,
  options?: { priceChartingProduct?: Record<string, unknown> },
): Promise<TcgplayerJapanProductMeta | null> {
  const fromSearch = await resolveViaTcgplayerSearch(identity);
  if (fromSearch) return fromSearch;

  return resolveViaPriceChartingTcgId(identity, options?.priceChartingProduct);
}

export function tcgplayerJapanProductFromSuspect(
  suspect: CardSuspect,
): TcgplayerJapanProductMeta | undefined {
  return scanDerivedMetaFromSuspect(suspect)?.tcgplayerJapanProduct;
}

function applyTcgplayerJapanToSuspect(
  suspect: CardSuspect,
  tcgProduct: TcgplayerJapanProductMeta,
  priceChartingProduct?: Record<string, unknown>,
): CardSuspect {
  const meta = scanDerivedMetaFromSuspect(suspect);
  if (!meta) return suspect;

  const nextMeta: ScanDerivedSuspectMeta = {
    ...meta,
    pricingStatus: "tcgplayer_japan_exact",
    tcgplayerJapanProduct: tcgProduct,
    priceChartingProduct: priceChartingProduct ?? meta.priceChartingProduct,
  };

  return {
    ...suspect,
    referenceImageUrls: [tcgProduct.imageUrl],
    rawCatalogData: nextMeta,
  };
}

function priceChartingImageUrl(
  product: Record<string, unknown>,
): string | undefined {
  const url =
    (product["image-url"] as string | undefined) ??
    (product.imageUrl as string | undefined);
  return url?.trim() || undefined;
}

function applyPriceChartingImageToSuspect(
  suspect: CardSuspect,
  priceChartingProduct: Record<string, unknown>,
): CardSuspect {
  const meta = scanDerivedMetaFromSuspect(suspect);
  if (!meta) return suspect;

  const imageUrl = priceChartingImageUrl(priceChartingProduct);
  const nextMeta: ScanDerivedSuspectMeta = {
    ...meta,
    pricingStatus: "pricecharting_exact",
    priceChartingProduct,
  };

  return {
    ...suspect,
    referenceImageUrls: imageUrl ? [imageUrl] : suspect.referenceImageUrls,
    rawCatalogData: nextMeta,
  };
}

/** Attach verified TCGplayer Japan catalog rows to scan-derived Japanese Pokémon suspects. */
export async function enrichPokemonScanDerivedTcgplayerJapan(input: {
  suspects: CardSuspect[];
  imageEvidence?: ImageEvidenceReport;
}): Promise<{ suspects: CardSuspect[]; notes: string[] }> {
  const notes: string[] = [];
  const suspects = [...input.suspects];
  let changed = false;

  for (let i = 0; i < suspects.length; i++) {
    const suspect = suspects[i]!;
    if (suspect.catalogSource !== "scan_derived_fallback") continue;

    const meta = scanDerivedMetaFromSuspect(suspect);
    if (!isJapaneseScanDerivedSuspect(suspect, meta)) continue;

    const existing = tcgplayerJapanProductFromSuspect(suspect);
    if (existing?.productId) continue;

    const identity =
      scanIdentityFromSuspect(suspect) ??
      (input.imageEvidence
        ? extractPokemonScanIdentity(input.imageEvidence)
        : null);
    if (!identity) continue;

    let pcProduct = meta?.priceChartingProduct as
      | Record<string, unknown>
      | undefined;
    if (!pcProduct) {
      pcProduct =
        (await tryPriceChartingExactJapanesePokemon(identity)) ?? undefined;
    }

    const tcgProduct = await resolveTcgplayerJapanPokemon(identity, {
      priceChartingProduct: pcProduct,
    });
    if (!tcgProduct) {
      if (
        pcProduct &&
        isExactJapanesePokemonPriceChartingMatch(pcProduct, identity) &&
        priceChartingImageUrl(pcProduct)
      ) {
        suspects[i] = applyPriceChartingImageToSuspect(
          {
            ...suspect,
            language: isJapaneseSuspectLanguage(suspect.language ?? "")
              ? suspect.language
              : "jp",
            variantTags: suspect.variantTags.includes("japanese")
              ? suspect.variantTags
              : [...suspect.variantTags, "japanese"],
          },
          pcProduct,
        );
        changed = true;
        notes.push(
          "PriceCharting reference image attached for Japanese scan-derived candidate.",
        );
      }
      continue;
    }

    suspects[i] = applyTcgplayerJapanToSuspect(
      {
        ...suspect,
        language: isJapaneseSuspectLanguage(suspect.language ?? "")
          ? suspect.language
          : "jp",
        variantTags: suspect.variantTags.includes("japanese")
          ? suspect.variantTags
          : [...suspect.variantTags, "japanese"],
      },
      tcgProduct,
      pcProduct,
    );
    changed = true;
    notes.push(
      `TCGplayer Japan catalog match: ${tcgProduct.productName} (#${tcgProduct.productId}).`,
    );
  }

  if (!changed) {
    return { suspects: input.suspects, notes: [] };
  }

  return { suspects, notes };
}
