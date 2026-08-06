import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyInventoryLinkStatus,
  isClerkEligibleInventory,
} from "./catalog-link-identity";
import {
  isEnrichableMagicSingle,
  isMagicInventoryItem,
} from "./magic-items";
import { inventoryQuantityAvailable } from "./status";
import type { InventoryItem } from "../types";

/** Immutable audit snapshot from a specific source CSV reconciliation. */
export interface InventoryAuditSnapshot {
  snapshotId: string;
  storeId: "the-game-lodge";
  sourceFile: string;
  sourceFileHash: string;
  inventorySnapshotId: string;
  generatedAt: string;
  figures: {
    sourceMagicListingRows: number;
    activeMagicListings: number;
    totalMagicUnits: number;
    activeSellableCardListings: number;
    activeSellableCardUnits: number;
    fullyLinkedSellableListings: number;
    fullyLinkedSellableUnits: number;
    listingIdentityCoveragePct: number;
    unitIdentityCoveragePct: number;
    remainingUnresolved: { listings: number; units: number };
    remainingManualReview: { listings: number; units: number };
  };
  notes?: string[];
}

export interface LiveInventoryMetrics {
  computedAt: string;
  storeId: string;
  activeMagicListings: number;
  totalMagicUnits: number;
  activeSellableCardListings: number;
  activeSellableCardUnits: number;
  fullyLinkedSellableListings: number;
  fullyLinkedSellableUnits: number;
  listingIdentityCoveragePct: number;
  unitIdentityCoveragePct: number;
  unresolved: { listings: number; units: number };
  manualReview: { listings: number; units: number };
  tokenProduct: { listings: number; units: number };
  compositeProduct: { listings: number; units: number };
  identityConflict: { listings: number; units: number };
  oracleOnly: { listings: number; units: number };
}

const SNAPSHOT_REPORT = resolve(
  process.cwd(),
  "reports/inventory-source-reconciliation.json",
);

/** Load the accepted CSV reconciliation as an immutable audit snapshot. */
export function loadInventoryAuditSnapshot(
  reportPath = SNAPSHOT_REPORT,
): InventoryAuditSnapshot | null {
  if (!existsSync(reportPath)) return null;
  const raw = JSON.parse(readFileSync(reportPath, "utf8")) as {
    generatedAt: string;
    storeId: string;
    sourceCsv?: {
      magicUniqueListingKeys?: number;
      magicActiveListings?: number;
      magicSumQuantityOnHand?: number;
    };
    customerFacing?: {
      activeSellableCardListings?: number;
      totalSellableCardUnits?: number;
      activeListingsFullyLinkedToOracle?: number;
      sellableUnitsFullyLinkedToOracle?: number;
      activeUnresolvedListings?: number;
      sellableUnresolvedUnits?: number;
      activeListingLinkageCoverage?: { pct?: number };
      unitLinkageCoverage?: { pct?: number };
    };
    customerBuckets?: {
      manual_review?: { listings?: number; quantityAvailable?: number };
    };
    reconciliationNotes?: {
      sourceFileHash?: string;
      inventorySnapshotId?: string;
    };
  };

  const cf = raw.customerFacing ?? {};
  const csv = raw.sourceCsv ?? {};
  const manual = raw.customerBuckets?.manual_review ?? {};
  const hash =
    raw.reconciliationNotes?.sourceFileHash ??
    createHash("sha256").update(raw.generatedAt).digest("hex").slice(0, 16);

  return {
    snapshotId: `inv-audit-${hash}`,
    storeId: (raw.storeId as "the-game-lodge") ?? "the-game-lodge",
    sourceFile: "TCGplayer__Pricing.csv",
    sourceFileHash: hash,
    inventorySnapshotId:
      raw.reconciliationNotes?.inventorySnapshotId ?? `snap-${raw.generatedAt}`,
    generatedAt: raw.generatedAt,
    figures: {
      sourceMagicListingRows: csv.magicUniqueListingKeys ?? 0,
      activeMagicListings: csv.magicActiveListings ?? 0,
      totalMagicUnits: csv.magicSumQuantityOnHand ?? 0,
      activeSellableCardListings: cf.activeSellableCardListings ?? 0,
      activeSellableCardUnits: cf.totalSellableCardUnits ?? 0,
      fullyLinkedSellableListings: cf.activeListingsFullyLinkedToOracle ?? 0,
      fullyLinkedSellableUnits: cf.sellableUnitsFullyLinkedToOracle ?? 0,
      listingIdentityCoveragePct: cf.activeListingLinkageCoverage?.pct ?? 0,
      unitIdentityCoveragePct: cf.unitLinkageCoverage?.pct ?? 0,
      remainingUnresolved: {
        listings: cf.activeUnresolvedListings ?? 0,
        units: cf.sellableUnresolvedUnits ?? 0,
      },
      remainingManualReview: {
        listings: manual.listings ?? 0,
        units: manual.quantityAvailable ?? 0,
      },
    },
    notes: [
      "Immutable audit snapshot for a specific CSV import — not live operational truth.",
      "Do not re-investigate the 6,830 figure unless a new source export appears.",
    ],
  };
}

/** Compute current linkage coverage from live Firestore inventory rows. */
export function computeLiveInventoryMetrics(
  items: InventoryItem[],
  storeId: string,
): LiveInventoryMetrics {
  let activeMagicListings = 0;
  let totalMagicUnits = 0;
  let activeSellableCardListings = 0;
  let activeSellableCardUnits = 0;
  let fullyLinkedSellableListings = 0;
  let fullyLinkedSellableUnits = 0;
  let unresolvedListings = 0;
  let unresolvedUnits = 0;
  let manualReviewListings = 0;
  let manualReviewUnits = 0;
  let tokenListings = 0;
  let tokenUnits = 0;
  let compositeListings = 0;
  let compositeUnits = 0;
  let conflictListings = 0;
  let conflictUnits = 0;
  let oracleOnlyListings = 0;
  let oracleOnlyUnits = 0;

  for (const item of items) {
    if (!isMagicInventoryItem(item)) continue;
    const qty = inventoryQuantityAvailable(item);
    totalMagicUnits += Math.max(0, item.quantityOnHand ?? item.quantity ?? 0);
    if (qty <= 0) continue;
    activeMagicListings += 1;

    if (!isEnrichableMagicSingle(item)) continue;
    activeSellableCardListings += 1;
    activeSellableCardUnits += qty;

    const outcome = item.catalogLinkOutcome;
    if (outcome === "token_product") {
      tokenListings += 1;
      tokenUnits += qty;
      continue;
    }
    if (outcome === "composite_product") {
      compositeListings += 1;
      compositeUnits += qty;
      continue;
    }
    if (outcome === "identity_conflict") {
      conflictListings += 1;
      conflictUnits += qty;
      continue;
    }
    if (outcome === "confirmed_oracle_only") {
      oracleOnlyListings += 1;
      oracleOnlyUnits += qty;
      continue;
    }

    const { category } = classifyInventoryLinkStatus(item);
    if (isClerkEligibleInventory(item)) {
      fullyLinkedSellableListings += 1;
      fullyLinkedSellableUnits += qty;
    } else if (category === "unresolved" || outcome === "unresolved") {
      unresolvedListings += 1;
      unresolvedUnits += qty;
    } else if (category === "manual_review_candidate") {
      manualReviewListings += 1;
      manualReviewUnits += qty;
    } else if (category === "oracle_only_linked") {
      oracleOnlyListings += 1;
      oracleOnlyUnits += qty;
    } else if (category === "conflict") {
      conflictListings += 1;
      conflictUnits += qty;
    }
  }

  return {
    computedAt: new Date().toISOString(),
    storeId,
    activeMagicListings,
    totalMagicUnits,
    activeSellableCardListings,
    activeSellableCardUnits,
    fullyLinkedSellableListings,
    fullyLinkedSellableUnits,
    listingIdentityCoveragePct:
      activeSellableCardListings > 0
        ? Math.round(
            (fullyLinkedSellableListings / activeSellableCardListings) * 10000,
          ) / 100
        : 0,
    unitIdentityCoveragePct:
      activeSellableCardUnits > 0
        ? Math.round((fullyLinkedSellableUnits / activeSellableCardUnits) * 10000) /
          100
        : 0,
    unresolved: { listings: unresolvedListings, units: unresolvedUnits },
    manualReview: { listings: manualReviewListings, units: manualReviewUnits },
    tokenProduct: { listings: tokenListings, units: tokenUnits },
    compositeProduct: { listings: compositeListings, units: compositeUnits },
    identityConflict: { listings: conflictListings, units: conflictUnits },
    oracleOnly: { listings: oracleOnlyListings, units: oracleOnlyUnits },
  };
}
