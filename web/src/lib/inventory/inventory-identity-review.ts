import type { InventoryItem } from "../types";
import type { CatalogCard } from "../deck-builder/types";
import {
  getScryfallBulkIndex,
  type ScryfallBulkIndex,
} from "../deck-builder/scryfall-bulk-index";
import {
  applyEnrichmentToInventoryItem,
  crosswalkFromEnrichment,
  enrichmentFromCatalog,
} from "../deck-builder/inventory-catalog-enrichment";
import {
  fetchScryfallByTcgplayerId,
} from "../deck-builder/scryfall-catalog";
import { fetchCardBySetCodeAndNumber } from "../deck-builder/scryfall-set-resolver";
import { upsertCatalogOracleFromPrinting } from "../deck-builder/catalog-oracle-card";
import { normalizeCardNameForMatch } from "../store-inventory/clerk-tools/magic-commander-inventory";
import { cardNameFromInventoryItem } from "./image-fallback";
import type {
  InventoryIdentityDecisionAudit,
  InventoryLinkOutcome,
} from "./inventory-product-identity";
import {
  classifyProductIdentityForReview,
  detectSetCollectorConflict,
  parseCompositeComponentNames,
} from "./inventory-product-identity";
import type { InventoryItem as Item } from "../types";

export interface ReviewDecisionResult {
  listingId: string;
  displayName: string;
  outcome: InventoryLinkOutcome;
  applied: boolean;
  audit: InventoryIdentityDecisionAudit;
  skipReason?: string;
}

function setCnKey(setKey: string, cn: string): string {
  return `${setKey.toLowerCase()}:${cn.trim().toLowerCase()}`;
}

function normalizeSetKey(name: string): string {
  return name.trim().toLowerCase();
}

function collectorKeys(cn: string): string[] {
  const trimmed = cn.trim().toLowerCase();
  const keys = new Set<string>([trimmed]);
  const digits = trimmed.replace(/^0+/, "") || trimmed;
  if (digits !== trimmed) keys.add(digits);
  return [...keys];
}

function expandSetKeys(setName: string, index: ScryfallBulkIndex): string[] {
  const keys = new Set<string>();
  const normalized = normalizeSetKey(setName);
  keys.add(normalized);

  const code = index.setNameToCode.get(normalized);
  if (code) keys.add(code);

  const ordinal = normalized.replace(
    /\b(\d+)(st|nd|rd|th)\b/g,
    (_, n: string, suffix: string) => {
      const words: Record<string, string> = {
        "1": "first",
        "2": "second",
        "3": "third",
        "4": "fourth",
        "5": "fifth",
        "6": "sixth",
        "7": "seventh",
        "8": "eighth",
        "9": "ninth",
        "10": "tenth",
      };
      return words[n] ?? `${n}${suffix}`;
    },
  );
  if (ordinal !== normalized) {
    keys.add(ordinal);
    const ordCode = index.setNameToCode.get(ordinal);
    if (ordCode) keys.add(ordCode);
  }

  for (const [name, setCode] of index.setNameToCode) {
    if (name.includes(normalized) || normalized.includes(name)) {
      keys.add(name);
      keys.add(setCode);
    }
  }

  return [...keys];
}

function resolveSetSearchOnly(
  item: InventoryItem,
  index: ScryfallBulkIndex,
): { catalog: CatalogCard; matchMethod: "set_search" } | null {
  if (!item.setName?.trim() || !item.cardNumber?.trim()) return null;

  for (const setKey of expandSetKeys(item.setName, index)) {
    for (const cn of collectorKeys(item.cardNumber)) {
      const hit = index.bySetKeyAndCn.get(setCnKey(setKey, cn));
      if (hit) return { catalog: hit, matchMethod: "set_search" };
    }
  }
  return null;
}

async function resolveSetSearchViaApi(
  item: InventoryItem,
): Promise<{ catalog: CatalogCard; matchMethod: "set_search" } | null> {
  if (!item.setName?.trim() || !item.cardNumber?.trim()) return null;
  const catalog = await fetchCardBySetCodeAndNumber({
    setName: item.setName,
    cardNumber: item.cardNumber,
  });
  if (!catalog) return null;
  return { catalog, matchMethod: "set_search" };
}

async function resolveTcgplayerViaApi(
  item: InventoryItem,
): Promise<{ catalog: CatalogCard; matchMethod: "tcgplayer_id" } | null> {
  if (!item.tcgplayerProductId?.trim()) return null;
  const catalog = await fetchScryfallByTcgplayerId(item.tcgplayerProductId.trim());
  if (!catalog) return null;
  return { catalog, matchMethod: "tcgplayer_id" };
}

function resolveTcgplayerOnly(
  item: InventoryItem,
  index: ScryfallBulkIndex,
): { catalog: CatalogCard; matchMethod: "tcgplayer_id" } | null {
  if (!item.tcgplayerProductId?.trim()) return null;
  const hit = index.byTcgplayerId.get(item.tcgplayerProductId.trim());
  if (!hit) return null;
  return { catalog: hit, matchMethod: "tcgplayer_id" };
}

function resolveExactName(
  item: InventoryItem,
  index: ScryfallBulkIndex,
): { catalog: CatalogCard; matchMethod: "name_search" } | null {
  const productName =
    item.productName?.trim() ||
    cardNameFromInventoryItem(item) ||
    item.displayName.split(" — ")[0]?.trim() ||
    "";
  if (!productName) return null;
  const hit = index.byNormalizedName.get(normalizeCardNameForMatch(productName));
  if (!hit) return null;
  return { catalog: hit, matchMethod: "name_search" };
}

function appendAudit(
  item: Item,
  audit: InventoryIdentityDecisionAudit,
): Item {
  const prior = item.catalogIdentityDecisions ?? [];
  return {
    ...item,
    catalogIdentityDecisions: [...prior, audit],
    catalogLinkOutcome: audit.outcome,
  };
}

function resolveCompositeComponents(
  item: InventoryItem,
  index: ScryfallBulkIndex,
  productIdentityType: "double_sided_token" | "paired_card_product" | "composite",
): {
  componentPrintingIds: string[];
  componentOracleIds: string[];
  allResolved: boolean;
  evidence: string[];
} {
  const productName =
    item.productName?.trim() ||
    item.displayName.split(" — ")[0]?.trim() ||
    "";
  const names = parseCompositeComponentNames(productName);
  const componentPrintingIds: string[] = [];
  const componentOracleIds: string[] = [];
  const evidence: string[] = [];

  for (const name of names) {
    const hit = index.byNormalizedName.get(normalizeCardNameForMatch(name));
    if (!hit?.oracleId) {
      evidence.push(`Component "${name}" has no exact oracle match in bulk index`);
      return {
        componentPrintingIds,
        componentOracleIds,
        allResolved: false,
        evidence,
      };
    }
    componentPrintingIds.push(hit.id);
    componentOracleIds.push(hit.oracleId);
    evidence.push(`Component "${name}" → ${hit.set}/${hit.collectorNumber} (${hit.id})`);
  }

  return {
    componentPrintingIds,
    componentOracleIds,
    allResolved: names.length > 0 && componentPrintingIds.length === names.length,
    evidence,
  };
}

export async function decideInventoryReviewItem(
  item: InventoryItem,
  index: ScryfallBulkIndex,
  reviewer: string,
): Promise<ReviewDecisionResult> {
  const baseAudit = {
    previousOracleId: item.catalogOracleId,
    previousScryfallId: item.catalogScryfallId,
    reviewer,
    decidedAt: new Date().toISOString(),
  };

  const product = classifyProductIdentityForReview(item);
  if (product.outcome === "token_product") {
    return {
      listingId: item.id,
      displayName: item.displayName,
      outcome: "token_product",
      applied: true,
      audit: {
        ...baseAudit,
        outcome: "token_product",
        decisionMethod: "token_classification",
        supportingEvidence: product.evidence,
      },
    };
  }

  if (product.outcome === "composite_product") {
    const resolved = resolveCompositeComponents(
      item,
      index,
      product.productIdentityType ?? "composite",
    );
    return {
      listingId: item.id,
      displayName: item.displayName,
      outcome: "composite_product",
      applied: true,
      audit: {
        ...baseAudit,
        outcome: "composite_product",
        decisionMethod: "composite_classification",
        supportingEvidence: [
          ...product.evidence,
          ...resolved.evidence,
          resolved.allResolved
            ? "All named components resolved in bulk index"
            : "Composite product — not mapped to a single oracle printing",
        ],
        compositeIdentity: resolved.allResolved
          ? {
              listingId: item.id,
              componentPrintingIds: resolved.componentPrintingIds,
              componentOracleIds: resolved.componentOracleIds,
              productIdentityType: product.productIdentityType ?? "composite",
            }
          : {
              listingId: item.id,
              componentPrintingIds: resolved.componentPrintingIds,
              componentOracleIds: resolved.componentOracleIds,
              productIdentityType: product.productIdentityType ?? "composite",
            },
      },
    };
  }

  const setHit =
    resolveSetSearchOnly(item, index) ?? (await resolveSetSearchViaApi(item));
  const tcgHit =
    resolveTcgplayerOnly(item, index) ?? (await resolveTcgplayerViaApi(item));

  if (setHit && tcgHit) {
    const conflict = detectSetCollectorConflict(item, setHit.catalog);
    const samePrinting = setHit.catalog.id === tcgHit.catalog.id;
    if (conflict.conflict && !samePrinting) {
      const sameOracle =
        setHit.catalog.oracleId &&
        tcgHit.catalog.oracleId &&
        setHit.catalog.oracleId === tcgHit.catalog.oracleId;
      if (sameOracle) {
        return {
          listingId: item.id,
          displayName: item.displayName,
          outcome: "confirmed_printing",
          applied: true,
          audit: {
            ...baseAudit,
            selectedOracleId: setHit.catalog.oracleId,
            selectedScryfallId: setHit.catalog.id,
            outcome: "confirmed_printing",
            decisionMethod: "set_search",
            supportingEvidence: [
              ...conflict.evidence,
              `TCGplayer ID ${item.tcgplayerProductId} maps to ${tcgHit.catalog.setName} #${tcgHit.catalog.collectorNumber}`,
              `Inventory set/collector authoritative for physical stock → ${setHit.catalog.setName} #${setHit.catalog.collectorNumber}`,
              "Same oracle — corrected printing via set_search",
            ],
          },
        };
      }
      return {
        listingId: item.id,
        displayName: item.displayName,
        outcome: "identity_conflict",
        applied: true,
        audit: {
          ...baseAudit,
          selectedOracleId: tcgHit.catalog.oracleId,
          selectedScryfallId: tcgHit.catalog.id,
          outcome: "identity_conflict",
          decisionMethod: "conflict_detected",
          supportingEvidence: [
            ...conflict.evidence,
            `TCGplayer maps to ${tcgHit.catalog.setName} #${tcgHit.catalog.collectorNumber} (${tcgHit.catalog.id})`,
            `Set search maps to ${setHit.catalog.setName} #${setHit.catalog.collectorNumber} (${setHit.catalog.id})`,
          ],
        },
      };
    }
  }

  if (setHit) {
    return {
      listingId: item.id,
      displayName: item.displayName,
      outcome: "confirmed_printing",
      applied: true,
      audit: {
        ...baseAudit,
        selectedOracleId: setHit.catalog.oracleId,
        selectedScryfallId: setHit.catalog.id,
        outcome: "confirmed_printing",
        decisionMethod: "set_search",
        supportingEvidence: [
          `Set "${item.setName}" collector #${item.cardNumber} → ${setHit.catalog.setName} #${setHit.catalog.collectorNumber}`,
        ],
      },
    };
  }

  if (tcgHit) {
    const conflict = detectSetCollectorConflict(item, tcgHit.catalog);
    if (conflict.conflict) {
      return {
        listingId: item.id,
        displayName: item.displayName,
        outcome: "identity_conflict",
        applied: true,
        audit: {
          ...baseAudit,
          selectedOracleId: tcgHit.catalog.oracleId,
          selectedScryfallId: tcgHit.catalog.id,
          outcome: "identity_conflict",
          decisionMethod: "conflict_detected",
          supportingEvidence: conflict.evidence,
        },
      };
    }
    return {
      listingId: item.id,
      displayName: item.displayName,
      outcome: "confirmed_printing",
      applied: true,
      audit: {
        ...baseAudit,
        selectedOracleId: tcgHit.catalog.oracleId,
        selectedScryfallId: tcgHit.catalog.id,
        outcome: "confirmed_printing",
        decisionMethod: "tcgplayer_id",
        supportingEvidence: [
          `TCGplayer ID ${item.tcgplayerProductId} → ${tcgHit.catalog.name} (${tcgHit.catalog.set}/${tcgHit.catalog.collectorNumber})`,
        ],
      },
    };
  }

  return {
    listingId: item.id,
    displayName: item.displayName,
    outcome: "unresolved",
    applied: true,
    audit: {
      ...baseAudit,
      outcome: "unresolved",
      decisionMethod: "unresolved",
      supportingEvidence: ["No deterministic set_search or tcgplayer_id match in bulk index"],
    },
  };
}

export async function applyReviewDecisionToItem(
  item: InventoryItem,
  decision: ReviewDecisionResult,
  index: ScryfallBulkIndex,
  deps: {
    saveInventoryItem: (item: InventoryItem) => Promise<void>;
    saveCatalogCard: (card: CatalogCard) => Promise<void>;
    saveCatalogOracleCard?: (oracle: import("../deck-builder/types").CatalogOracleCard) => Promise<void>;
    getCatalogOracleCard?: (id: string) => Promise<import("../deck-builder/types").CatalogOracleCard | null>;
    saveCrosswalk?: (crosswalk: import("../deck-builder/types").CardCrosswalk) => Promise<void>;
    storeId: string;
  },
): Promise<InventoryItem> {
  let updated = appendAudit(item, decision.audit);

  if (decision.outcome === "token_product" || decision.outcome === "composite_product") {
    updated = {
      ...updated,
      catalogLinkOutcome: decision.outcome,
      catalogMatchMethod: "skipped",
      catalogSyncedAt: new Date().toISOString(),
      compositeInventoryIdentity: decision.audit.compositeIdentity,
      catalogScryfallId: undefined,
      catalogOracleId: undefined,
    };
    await deps.saveInventoryItem(updated);
    return updated;
  }

  if (decision.outcome === "identity_conflict" || decision.outcome === "unresolved") {
    updated = {
      ...updated,
      catalogLinkOutcome: decision.outcome,
      catalogMatchMethod: "unresolved",
      catalogSyncedAt: new Date().toISOString(),
    };
    await deps.saveInventoryItem(updated);
    return updated;
  }

  if (decision.outcome === "confirmed_printing" && decision.audit.selectedScryfallId) {
    const catalog =
      index.byScryfallId.get(decision.audit.selectedScryfallId) ??
      (await (async () => null)());
    if (!catalog) throw new Error(`Missing catalog card ${decision.audit.selectedScryfallId}`);

    const method =
      decision.audit.decisionMethod === "set_search"
        ? "set_search"
        : decision.audit.decisionMethod === "tcgplayer_id"
          ? "tcgplayer_id"
          : "manual";

    const enrichment = enrichmentFromCatalog(catalog, method);
    updated = applyEnrichmentToInventoryItem(updated, enrichment);
    updated.catalogLinkOutcome = "confirmed_printing";

    await deps.saveCatalogCard(catalog);
    if (deps.saveCatalogOracleCard) {
      await upsertCatalogOracleFromPrinting({
        catalog,
        oracleTags: enrichment.oracleTags,
        getExistingOracle: deps.getCatalogOracleCard,
        saveOracle: deps.saveCatalogOracleCard,
      });
    }
    if (deps.saveCrosswalk) {
      const crosswalk = crosswalkFromEnrichment({
        storeId: deps.storeId,
        item: updated,
        enrichment,
      });
      await deps.saveCrosswalk(crosswalk);
    }
    await deps.saveInventoryItem(updated);
    return updated;
  }

  await deps.saveInventoryItem(updated);
  return updated;
}

export async function loadBulkIndexForReview(): Promise<ScryfallBulkIndex> {
  return getScryfallBulkIndex();
}
