import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { computeCatalogCoverage } from "@/lib/deck-builder/catalog-coverage";
import {
  buildCatalogMatchQueue,
  countConflictInventoryRows,
} from "@/lib/deck-builder/catalog-match-queue";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import {
  inventoryEffectiveQuantity,
  isCatalogImportItem,
  isInventoryAvailable,
} from "@/lib/inventory/status";
import {
  isInventoryCatalogEnriched,
  isInventoryCatalogLinked,
  isInventoryCatalogSkipped,
  isInventoryCatalogUnresolved,
  isMagicInventoryItem,
} from "@/lib/inventory/magic-items";
import { dataStore } from "@/lib/storage/data-store";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const catalogCount = await deckBuilderStore.countCatalogCards();
    const oracleCardCount = await deckBuilderStore.countCatalogOracleCards();
    const commanders = await deckBuilderStore.listEdhrecCommanders(500);

    let inventoryEnriched = 0;
    let inventoryLinked = 0;
    let inventorySkipped = 0;
    let inventoryUnresolved = 0;
    let inventoryMagic = 0;
    let inventoryTotal = 0;
    let crosswalkCount = 0;
    let coverage = null;
    let matchQueueSummary = null;

    const scope = requireStoreScope(auth, req);
    if (!(scope instanceof Response)) {
      const items = (await dataStore.getInventory(scope.storeId)).filter(
        (i) =>
          isCatalogImportItem(i) &&
          isInventoryAvailable(i) &&
          inventoryEffectiveQuantity(i) > 0,
      );
      inventoryTotal = items.length;
      inventoryMagic = items.filter((i) => isMagicInventoryItem(i)).length;
      inventoryLinked = items.filter(
        (i) => isMagicInventoryItem(i) && isInventoryCatalogLinked(i),
      ).length;
      inventorySkipped = items.filter(
        (i) => isMagicInventoryItem(i) && isInventoryCatalogSkipped(i),
      ).length;
      inventoryUnresolved = items.filter(
        (i) => isMagicInventoryItem(i) && isInventoryCatalogUnresolved(i),
      ).length;
      inventoryEnriched = items.filter(
        (i) => isMagicInventoryItem(i) && isInventoryCatalogEnriched(i),
      ).length;
      crosswalkCount = (await deckBuilderStore.listCrosswalks(scope.storeId))
        .length;

      const conflictRows = countConflictInventoryRows(items);
      coverage = computeCatalogCoverage(items, { matchConflicts: conflictRows });

      const queue = buildCatalogMatchQueue(items, {
        reasons: ["unresolved", "fuzzy_match", "conflict", "missing_printing_id"],
        limit: 1,
      });
      matchQueueSummary = {
        needsReview: queue.total,
        conflictGroups: queue.conflictGroups,
        unresolved: coverage.counts.unresolved,
        fuzzyMatches: coverage.counts.fuzzyMatches,
        conflicts: conflictRows,
      };
    }

    return jsonOk({
      catalogCards: catalogCount,
      catalogOracleCards: oracleCardCount,
      edhrecCommanders: commanders.length,
      inventoryTotal,
      inventoryMagic,
      inventoryEnriched,
      inventoryLinked,
      inventorySkipped,
      inventoryUnresolved,
      crosswalkCount,
      coverage,
      matchQueueSummary,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
