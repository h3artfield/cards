import type { InventoryItem } from "../types";
import type { CardCrosswalk, CatalogCard } from "./types";
import { fetchScryfallCardById } from "./scryfall-catalog";
import {
  applyEnrichmentToInventoryItem,
  crosswalkFromEnrichment,
  enrichmentFromCatalog,
} from "./inventory-catalog-enrichment";
import { upsertCatalogOracleFromPrinting } from "./catalog-oracle-card";
import { getScryfallOracleTagsIndex } from "./scryfall-oracle-tags";

export class ManualCatalogMatchError extends Error {
  constructor(
    message: string,
    readonly code:
      | "inventory_not_found"
      | "wrong_store"
      | "scryfall_not_found"
      | "not_magic_single",
  ) {
    super(message);
    this.name = "ManualCatalogMatchError";
  }
}

export interface ManualCatalogMatchResult {
  item: InventoryItem;
  catalog: CatalogCard;
  crosswalk: CardCrosswalk;
  previousScryfallId?: string;
}

/** Admin-applied Scryfall printing link — writes crosswalk + golden-table fields. */
export async function applyManualCatalogMatch(input: {
  storeId: string;
  inventoryItemId: string;
  scryfallId: string;
  getInventoryItem: (id: string) => Promise<InventoryItem | null>;
  saveInventoryItem: (item: InventoryItem) => Promise<void>;
  saveCatalogCard: (card: CatalogCard) => Promise<void>;
  saveCatalogOracleCard?: (oracle: import("./types").CatalogOracleCard) => Promise<void>;
  getCatalogOracleCard?: (oracleId: string) => Promise<import("./types").CatalogOracleCard | null>;
  saveCrosswalk: (crosswalk: CardCrosswalk) => Promise<void>;
  getExistingCrosswalk?: (
    storeId: string,
    inventoryItemId: string,
  ) => Promise<CardCrosswalk | null>;
}): Promise<ManualCatalogMatchResult> {
  const item = await input.getInventoryItem(input.inventoryItemId);
  if (!item) {
    throw new ManualCatalogMatchError(
      "Inventory row not found",
      "inventory_not_found",
    );
  }
  if (item.storeId !== input.storeId) {
    throw new ManualCatalogMatchError(
      "Inventory row belongs to another store",
      "wrong_store",
    );
  }

  const scryfallId = input.scryfallId.trim();
  if (!scryfallId) {
    throw new ManualCatalogMatchError(
      "Scryfall printing ID is required",
      "scryfall_not_found",
    );
  }

  const catalog = await fetchScryfallCardById(scryfallId);
  if (!catalog) {
    throw new ManualCatalogMatchError(
      "Scryfall printing not found",
      "scryfall_not_found",
    );
  }

  const oracleTagsIndex = await getScryfallOracleTagsIndex().catch(() => null);
  const enrichment = enrichmentFromCatalog(catalog, "manual", oracleTagsIndex);
  const previousScryfallId = item.catalogScryfallId;

  const existing = input.getExistingCrosswalk
    ? await input.getExistingCrosswalk(input.storeId, input.inventoryItemId)
    : null;

  const crosswalk = crosswalkFromEnrichment({
    storeId: input.storeId,
    item,
    enrichment,
    existing,
  });

  const updated = applyEnrichmentToInventoryItem(item, enrichment);

  await input.saveCatalogCard(catalog);
  if (input.saveCatalogOracleCard) {
    await upsertCatalogOracleFromPrinting({
      catalog,
      oracleTags: enrichment.oracleTags,
      getExistingOracle: input.getCatalogOracleCard,
      saveOracle: input.saveCatalogOracleCard,
    });
  }
  await input.saveCrosswalk(crosswalk);
  await input.saveInventoryItem(updated);

  return {
    item: updated,
    catalog,
    crosswalk,
    previousScryfallId,
  };
}
