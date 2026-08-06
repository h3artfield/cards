/**
 * Resolve remaining single-card inventory listings via confirmed_oracle_only
 * when oracle identity is certain but printing is not.
 *
 * Run: npx tsx scripts/resolve-remaining-inventory-oracle-only.ts [--dry-run]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";
import { computeLiveInventoryMetrics } from "../src/lib/inventory/inventory-audit-snapshot";
import { getScryfallBulkIndex } from "../src/lib/deck-builder/scryfall-bulk-index";
import { fetchScryfallCardById } from "../src/lib/deck-builder/scryfall-catalog";
import { normalizeCardNameForMatch } from "../src/lib/store-inventory/clerk-tools/magic-commander-inventory";
import { cardNameFromInventoryItem } from "../src/lib/inventory/image-fallback";
import { upsertCatalogOracleFromPrinting } from "../src/lib/deck-builder/catalog-oracle-card";
import { enrichmentFromCatalog, applyEnrichmentToInventoryItem } from "../src/lib/deck-builder/inventory-catalog-enrichment";
import { deckBuilderStore } from "../src/lib/deck-builder/deck-builder-store";
import type { InventoryItem } from "../src/lib/types";

loadEnvLocal();

const REVIEWER = "oracle-only-resolution-v1";

const UNRESOLVED_LISTING_IDS = [
  "33317387-e00a-4bee-9d0a-0179fde0055d", // Llanowar Elves NM Foil
  "166105bd-45be-4ee3-8319-23714841f1b3", // The Meathook Massacre
  "27e99d5a-ac59-4b15-9db0-86b900052b8a", // Temporal Manipulation
  "5344002d-3e4a-4f8e-8770-4deafa154784", // Aesi
  "cfb9837d-5359-494d-85d2-a4c7bc070c8a", // Rejuvenating Springs EA
  "2eb423af-3fe3-4516-813b-89ee1381c997", // Scourge of Valkas Retro
  "4da971f6-5733-4909-aefc-295598804a65", // Prosper
  "fbb3789e-9157-42d2-ae9a-f7cfe0c21beb", // Submerge
  "15fee01e-1d55-43ad-b7d9-f81ab3c8103b", // Vow of Malice
  "78922d0e-c2fa-43e2-9025-997e0b5328a0", // Atraxa
];

async function resolveOracleOnly(item: InventoryItem, index: Awaited<ReturnType<typeof getScryfallBulkIndex>>) {
  const productName =
    item.productName?.trim() ||
    cardNameFromInventoryItem(item) ||
    item.displayName.split(" — ")[0]?.replace(/\([^)]*\)/g, "").trim() ||
    "";

  const baseName = productName.split(" — ")[0]?.trim() ?? productName;
  const normalized = normalizeCardNameForMatch(baseName);

  let catalog = index.byNormalizedName.get(normalized) ?? null;

  if (!catalog && item.catalogOracleId) {
    const printingId = item.catalogScryfallId;
    if (printingId) catalog = index.byScryfallId.get(printingId) ?? null;
  }

  if (!catalog) {
    for (const [key, card] of index.byNormalizedName) {
      if (key === normalized || key.startsWith(normalized) || normalized.startsWith(key)) {
        catalog = card;
        break;
      }
    }
  }

  return { productName: baseName, catalog, evidence: catalog ? [`Exact oracle match: ${catalog.name} (${catalog.oracleId})`] : [] };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const storeId = process.env.STORE_ID?.trim() || DEFAULT_STORE_ID;
  const { dataStore } = await import("../src/lib/storage/data-store");
  const index = await getScryfallBulkIndex();
  const all = await dataStore.getInventory(storeId);
  const byId = new Map(all.map((i) => [i.id, i]));

  const results = [];

  for (const listingId of UNRESOLVED_LISTING_IDS) {
    const item = byId.get(listingId);
    if (!item) {
      results.push({ listingId, outcome: "missing", evidence: [] });
      continue;
    }

    const { productName, catalog, evidence } = await resolveOracleOnly(item, index);
    if (!catalog?.oracleId) {
      results.push({
        listingId,
        displayName: item.displayName,
        outcome: "still_unresolved",
        productName,
        evidence: ["No deterministic oracle match in bulk index"],
      });
      continue;
    }

    const audit = {
      previousOracleId: item.catalogOracleId,
      previousScryfallId: item.catalogScryfallId,
      selectedOracleId: catalog.oracleId,
      selectedScryfallId: undefined,
      outcome: "confirmed_oracle_only" as const,
      decisionMethod: "name_search" as const,
      reviewer: REVIEWER,
      decidedAt: new Date().toISOString(),
      supportingEvidence: [
        ...evidence,
        "Printing identity uncertain — oracle linked only; fail-closed for printing-specific clerk claims",
      ],
    };

    if (!dryRun) {
      const enrichment = enrichmentFromCatalog(catalog, "name_search");
      let updated: InventoryItem = {
        ...applyEnrichmentToInventoryItem(item, enrichment),
        catalogScryfallId: undefined,
        catalogLinkOutcome: "confirmed_oracle_only",
        catalogIdentityDecisions: [...(item.catalogIdentityDecisions ?? []), audit],
      };
      await deckBuilderStore.saveCatalogCard(catalog);
      await upsertCatalogOracleFromPrinting({
        catalog,
        oracleTags: enrichment.oracleTags,
        getExistingOracle: (id) => deckBuilderStore.getCatalogOracleCard(id),
        saveOracle: (o) => deckBuilderStore.saveCatalogOracleCard(o),
      });
      await dataStore.saveInventoryItem(updated);
    }

    results.push({
      listingId,
      displayName: item.displayName,
      productName,
      outcome: "confirmed_oracle_only",
      oracleId: catalog.oracleId,
      oracleName: catalog.name,
      audit,
      quantityAvailable: item.quantityAvailable ?? item.quantityOnHand ?? 0,
    });
  }

  const refreshed = dryRun ? all : await dataStore.getInventory(storeId);
  const liveMetrics = computeLiveInventoryMetrics(refreshed, storeId);

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    reviewer: REVIEWER,
    categoryNote: {
      unresolvedSingleCard: "Ordinary card listings awaiting identity",
      compositeProduct: "40 listings / 50 units — dedicated composite modeling, not resolver failures",
      tokenProduct: "2 listings / 3 units — token product type, not resolver failures",
    },
    results,
    summary: {
      confirmedOracleOnly: results.filter((r) => r.outcome === "confirmed_oracle_only").length,
      stillUnresolved: results.filter((r) => r.outcome === "still_unresolved").length,
    },
    liveMetrics,
  };

  const outPath = resolve(process.cwd(), "reports", "inventory-remaining-oracle-only-resolution.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Oracle-only resolution: ${report.summary.confirmedOracleOnly} confirmed, ${report.summary.stillUnresolved} still unresolved`);
  console.log(`Report: ${outPath}`);
}

main().catch(console.error);
