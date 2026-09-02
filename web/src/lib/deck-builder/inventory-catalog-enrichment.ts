import type { InventoryItem } from "../types";
import type { CardCrosswalk, CatalogCard } from "./types";
import {
  catalogCardFromScryfall,
  fetchScryfallByTcgplayerId,
} from "./scryfall-catalog";
import {
  getScryfallBulkIndex,
  resolveCatalogFromBulkIndex,
  type ScryfallBulkIndex,
} from "./scryfall-bulk-index";
import {
  getScryfallOracleTagsIndex,
  lookupOracleTags,
  type ScryfallOracleTagsIndex,
} from "./scryfall-oracle-tags";
import { scryfallFetch } from "../processing/scryfall-client";
import {
  fetchCardBySetCodeAndNumber,
  resolveScryfallSetCode,
  searchScryfallCard,
} from "./scryfall-set-resolver";
import { cardNameFromInventoryItem } from "../inventory/image-fallback";
import {
  isEnrichableMagicSingle,
  isInventoryCatalogLinked,
  isInventoryCatalogSkipped,
  isInventoryCatalogUnresolved,
  isMagicInventoryItem,
  markInventoryCatalogSkipped,
  markInventoryCatalogUnresolved,
  needsGoldenTableBackfill,
} from "../inventory/magic-items";
import { deriveCommanderClassification } from "./commander-classification";
import { resolveProductCommanderFormatLegal } from "./commander-format-legality-snapshot-v1";
import { upsertCatalogOracleFromPrinting } from "./catalog-oracle-card";

export type CatalogMatchMethod =
  | "tcgplayer_id"
  | "set_search"
  | "name_search"
  | "name_fuzzy"
  | "manual"
  | "skipped"
  | "unresolved";

export interface InventoryCatalogEnrichment {
  scryfallId: string;
  oracleId?: string;
  colorIdentity: string[];
  colors?: string[];
  typeLine: string;
  commanderFormatLegal: boolean;
  canBeSoleCommander: boolean;
  manaCost?: string;
  cmc: number;
  oracleText?: string;
  keywords: string[];
  oracleTags: string[];
  rarity?: string;
  setCode: string;
  setName?: string;
  collectorNumber: string;
  matchMethod: CatalogMatchMethod;
  syncedAt: string;
}

async function lookupBySetNameAndNumber(input: {
  setName: string;
  cardNumber: string;
  productName?: string;
}): Promise<CatalogCard | null> {
  const byCode = await fetchCardBySetCodeAndNumber({
    setName: input.setName,
    cardNumber: input.cardNumber,
  });
  if (byCode) return byCode;

  const cn = input.cardNumber.trim();
  const set = input.setName.trim();
  if (input.productName?.trim()) {
    const exact = await searchScryfallCard(
      `!"${input.productName.trim()}" set:"${set}" cn:${cn} game:paper`,
    );
    if (exact) return exact;

    const byNameCn = await searchScryfallCard(
      `!"${input.productName.trim()}" cn:${cn} game:paper`,
    );
    if (byNameCn) return byNameCn;
  }

  const setCode = await resolveScryfallSetCode(set);
  if (setCode) {
    return searchScryfallCard(`set:${setCode} cn:${cn} game:paper`);
  }

  return searchScryfallCard(`set:"${set}" cn:${cn} game:paper`);
}

export type CatalogResolveFailure =
  | "no_tcgplayer_id"
  | "tcgplayer_not_on_scryfall"
  | "no_set_or_number"
  | "all_lookups_failed";

/** Resolve the correct Scryfall catalog row for a TCGplayer inventory item. */
export async function resolveCatalogForEnrichment(
  item: InventoryItem,
  options?: { bulkIndex?: ScryfallBulkIndex | null; apiFallback?: boolean },
): Promise<
  | { catalog: CatalogCard; matchMethod: CatalogMatchMethod }
  | { failure: CatalogResolveFailure }
> {
  const productName =
    item.productName?.trim() ||
    cardNameFromInventoryItem(item) ||
    item.displayName.split(" — ")[0]?.trim() ||
    "";

  if (options?.bulkIndex) {
    const bulkHit = resolveCatalogFromBulkIndex(item, options.bulkIndex);
    if (bulkHit) return bulkHit;
  }

  const useApi = options?.apiFallback !== false && !options?.bulkIndex;
  if (!useApi) {
    if (!item.tcgplayerProductId && (!item.setName || !item.cardNumber)) {
      return { failure: "no_set_or_number" };
    }
    return {
      failure: item.tcgplayerProductId
        ? "tcgplayer_not_on_scryfall"
        : "all_lookups_failed",
    };
  }

  if (item.tcgplayerProductId) {
    const byTcg = await fetchScryfallByTcgplayerId(item.tcgplayerProductId);
    if (byTcg) {
      return { catalog: byTcg, matchMethod: "tcgplayer_id" };
    }
  } else if (!item.setName || !item.cardNumber) {
    return { failure: "no_tcgplayer_id" };
  }

  if (item.setName && item.cardNumber) {
    const bySet = await lookupBySetNameAndNumber({
      setName: item.setName,
      cardNumber: item.cardNumber,
      productName,
    });
    if (bySet) {
      return { catalog: bySet, matchMethod: "set_search" };
    }
  }

  if (productName) {
    const byExactName = await searchScryfallCard(
      `!"${productName}" game:paper`,
    );
    if (byExactName) {
      return { catalog: byExactName, matchMethod: "name_search" };
    }

    try {
      const res = await scryfallFetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(productName)}`,
      );
      if (res.ok) {
        const catalog = catalogCardFromScryfall(
          (await res.json()) as Record<string, unknown>,
        );
        if (catalog) {
          return { catalog, matchMethod: "name_fuzzy" };
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (!item.tcgplayerProductId && (!item.setName || !item.cardNumber)) {
    return { failure: "no_set_or_number" };
  }

  return {
    failure: item.tcgplayerProductId
      ? "tcgplayer_not_on_scryfall"
      : "all_lookups_failed",
  };
}

export function enrichmentFromCatalog(
  catalog: CatalogCard,
  matchMethod: CatalogMatchMethod,
  oracleTagsIndex?: ScryfallOracleTagsIndex | null,
): InventoryCatalogEnrichment {
  const oracleTags = lookupOracleTags(oracleTagsIndex, catalog.oracleId);
  const classification = deriveCommanderClassification({
    name: catalog.name,
    typeLine: catalog.typeLine,
    oracleText: catalog.oracleText,
    colorIdentity: catalog.colorIdentity ?? [],
    legalities: catalog.legalities ?? {
      commander: catalog.commanderFormatLegal ? "legal" : "not_legal",
    },
  });
  const resolvedLegality = resolveProductCommanderFormatLegal({
    catalog,
    classification,
  });
  return {
    scryfallId: catalog.id,
    oracleId: catalog.oracleId,
    colorIdentity: catalog.colorIdentity ?? [],
    colors: catalog.colors,
    typeLine: catalog.typeLine,
    commanderFormatLegal: resolvedLegality.commanderFormatLegal,
    canBeSoleCommander: resolvedLegality.canBeSoleCommander,
    manaCost: catalog.manaCost,
    cmc: catalog.cmc,
    oracleText: catalog.oracleText,
    keywords: catalog.keywords ?? [],
    oracleTags,
    rarity: catalog.rarity,
    setCode: catalog.set,
    setName: catalog.setName,
    collectorNumber: catalog.collectorNumber,
    matchMethod,
    syncedAt: new Date().toISOString(),
  };
}

export function applyEnrichmentToInventoryItem(
  item: InventoryItem,
  enrichment: InventoryCatalogEnrichment,
): InventoryItem {
  return {
    ...item,
    catalogScryfallId: enrichment.scryfallId,
    catalogOracleId: enrichment.oracleId,
    catalogColorIdentity: enrichment.colorIdentity,
    catalogColors: enrichment.colors,
    catalogTypeLine: enrichment.typeLine,
    catalogCommanderFormatLegal: enrichment.commanderFormatLegal,
    catalogCanBeSoleCommander: enrichment.canBeSoleCommander,
    catalogManaCost: enrichment.manaCost,
    catalogCmc: enrichment.cmc,
    catalogOracleText: enrichment.oracleText ?? "",
    catalogKeywords: enrichment.keywords,
    catalogOracleTags: enrichment.oracleTags,
    catalogRarity: enrichment.rarity,
    catalogSetCode: enrichment.setCode,
    catalogSyncedAt: enrichment.syncedAt,
    catalogMatchMethod: enrichment.matchMethod,
  };
}

export function crosswalkFromEnrichment(input: {
  storeId: string;
  item: InventoryItem;
  enrichment: InventoryCatalogEnrichment;
  existing?: CardCrosswalk | null;
}): CardCrosswalk {
  const docId = `${input.storeId}_${input.item.id}`;
  return {
    id: input.existing?.id ?? docId,
    storeId: input.storeId,
    inventoryItemId: input.item.id,
    tcgplayerProductId: input.item.tcgplayerProductId,
    scryfallId: input.enrichment.scryfallId,
    matchMethod:
      input.enrichment.matchMethod === "tcgplayer_id"
        ? "tcgplayer_id"
        : input.enrichment.matchMethod === "set_search"
          ? "name_set"
          : "manual",
    updatedAt: input.enrichment.syncedAt,
  };
}

export async function enrichInventoryCatalogBatch(input: {
  storeId: string;
  items: InventoryItem[];
  existingCrosswalks: Map<string, CardCrosswalk>;
  limit: number;
  forceRelink?: boolean;
  magicOnly?: boolean;
  saveCrosswalk: (cw: CardCrosswalk) => Promise<void>;
  saveCatalogCard: (card: CatalogCard) => Promise<void>;
  saveCatalogOracleCard?: (oracle: import("./types").CatalogOracleCard) => Promise<void>;
  getCatalogOracleCard?: (oracleId: string) => Promise<import("./types").CatalogOracleCard | null>;
  saveInventoryItem: (item: InventoryItem) => Promise<void>;
}): Promise<{
  processed: number;
  enriched: number;
  relinked: number;
  skipped: number;
  skippedNonCard: number;
  failed: number;
  unresolved: number;
  failureReasons: Partial<Record<CatalogResolveFailure, number>>;
  remaining: number;
  bulkIndexCards?: number;
  bulkIndexLoadMs?: number;
  bulkIndexUsed?: boolean;
  oracleTagsCards?: number;
  oracleTagsLoadMs?: number;
  oracleTagsUsed?: boolean;
}> {
  const magicOnly = input.magicOnly ?? true;
  let bulkIndex: ScryfallBulkIndex | null = null;
  let bulkIndexLoadMs: number | undefined;
  let bulkIndexUsed = false;
  let oracleTagsIndex: ScryfallOracleTagsIndex | null = null;
  let oracleTagsLoadMs: number | undefined;
  let oracleTagsUsed = false;

  const bulkStarted = Date.now();
  try {
    bulkIndex = await getScryfallBulkIndex();
    bulkIndexLoadMs = Date.now() - bulkStarted;
    bulkIndexUsed = true;
  } catch (err) {
    console.warn(
      "[enrich-catalog] Scryfall bulk index unavailable, using API fallback:",
      err instanceof Error ? err.message : err,
    );
  }

  const tagsStarted = Date.now();
  try {
    oracleTagsIndex = await getScryfallOracleTagsIndex();
    oracleTagsLoadMs = Date.now() - tagsStarted;
    oracleTagsUsed = true;
  } catch (err) {
    console.warn(
      "[enrich-catalog] Scryfall oracle tags unavailable:",
      err instanceof Error ? err.message : err,
    );
  }

  let candidates = input.items.filter((i) =>
    magicOnly ? isMagicInventoryItem(i) : true,
  );

  if (!input.forceRelink) {
    candidates = candidates.filter(
      (i) =>
        (!isInventoryCatalogLinked(i) &&
          !isInventoryCatalogSkipped(i) &&
          !isInventoryCatalogUnresolved(i)) ||
        needsGoldenTableBackfill(i),
    );
  } else {
    candidates = candidates.filter(
      (i) => isEnrichableMagicSingle(i) && !isInventoryCatalogSkipped(i),
    );
  }

  /** Golden-table backfill and unlinked rows first. */
  candidates.sort((a, b) => {
    const aBackfill = needsGoldenTableBackfill(a) ? 0 : 1;
    const bBackfill = needsGoldenTableBackfill(b) ? 0 : 1;
    if (aBackfill !== bBackfill) return aBackfill - bBackfill;
    const aPending = !a.catalogSyncedAt || !a.catalogScryfallId ? 0 : 1;
    const bPending = !b.catalogSyncedAt || !b.catalogScryfallId ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return a.id.localeCompare(b.id);
  });

  const batch = candidates.slice(0, Math.max(1, input.limit));
  let enriched = 0;
  let relinked = 0;
  let skipped = 0;
  let failed = 0;
  let unresolved = 0;
  let skippedNonCard = 0;
  const failureReasons: Partial<Record<CatalogResolveFailure, number>> = {};

  for (const item of batch) {
    if (!isEnrichableMagicSingle(item)) {
      if (!item.catalogSyncedAt) {
        await input.saveInventoryItem(markInventoryCatalogSkipped(item));
        skippedNonCard += 1;
      } else {
        skipped += 1;
      }
      await new Promise((r) => setTimeout(r, 5));
      continue;
    }

    const resolved = await resolveCatalogForEnrichment(item, { bulkIndex });
    if ("failure" in resolved) {
      failureReasons[resolved.failure] =
        (failureReasons[resolved.failure] ?? 0) + 1;
      if (!item.catalogSyncedAt) {
        await input.saveInventoryItem(markInventoryCatalogUnresolved(item));
        unresolved += 1;
      } else {
        failed += 1;
      }
      await new Promise((r) => setTimeout(r, bulkIndex ? 5 : 100));
      continue;
    }

    const { catalog, matchMethod } = resolved;
    const enrichment = enrichmentFromCatalog(catalog, matchMethod, oracleTagsIndex);
    const existing = input.existingCrosswalks.get(item.id);
    const wasLinked = Boolean(existing?.scryfallId);

    if (
      wasLinked &&
      existing!.scryfallId === enrichment.scryfallId &&
      item.catalogScryfallId === enrichment.scryfallId &&
      !input.forceRelink &&
      !needsGoldenTableBackfill(item)
    ) {
      skipped += 1;
      await new Promise((r) => setTimeout(r, bulkIndex ? 5 : 50));
      continue;
    }

    await input.saveCatalogCard(catalog);
    if (input.saveCatalogOracleCard) {
      await upsertCatalogOracleFromPrinting({
        catalog,
        oracleTags: enrichment.oracleTags,
        getExistingOracle: input.getCatalogOracleCard,
        saveOracle: input.saveCatalogOracleCard,
      });
    }
    const cw = crosswalkFromEnrichment({
      storeId: input.storeId,
      item,
      enrichment,
      existing,
    });
    await input.saveCrosswalk(cw);
    input.existingCrosswalks.set(item.id, cw);

    const updated = applyEnrichmentToInventoryItem(item, enrichment);
    await input.saveInventoryItem(updated);

    if (wasLinked && existing!.scryfallId !== enrichment.scryfallId) {
      relinked += 1;
    }
    enriched += 1;
    await new Promise((r) => setTimeout(r, bulkIndex ? 10 : 110));
  }

  const remaining = Math.max(0, candidates.length - batch.length);

  return {
    processed: batch.length,
    enriched,
    relinked,
    skipped: skipped + skippedNonCard,
    skippedNonCard,
    failed,
    unresolved,
    failureReasons,
    remaining,
    bulkIndexCards: bulkIndex?.cardCount,
    bulkIndexLoadMs,
    bulkIndexUsed,
    oracleTagsCards: oracleTagsIndex?.byOracleId.size,
    oracleTagsLoadMs,
    oracleTagsUsed,
  };
}
