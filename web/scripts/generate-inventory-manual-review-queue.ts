/**
 * Generate manual review queue for unresolved / manual-review inventory listings.
 * Run: npx tsx scripts/generate-inventory-manual-review-queue.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadInventoryAuditSnapshot } from "../src/lib/inventory/inventory-audit-snapshot";
import {
  classifyInventoryLinkStatus,
  type InventoryLinkCategory,
} from "../src/lib/inventory/catalog-link-identity";
import { cardNameFromInventoryItem } from "../src/lib/inventory/image-fallback";
import { isEnrichableMagicSingle, isMagicInventoryItem } from "../src/lib/inventory/magic-items";
import { inventoryQuantityAvailable } from "../src/lib/inventory/status";
import { normalizeCardNameForMatch } from "../src/lib/store-inventory/clerk-tools/magic-commander-inventory";
import { getScryfallBulkIndex, type ScryfallBulkIndex } from "../src/lib/deck-builder/scryfall-bulk-index";
import { resolveCatalogForEnrichment } from "../src/lib/deck-builder/inventory-catalog-enrichment";
import type { CatalogCard } from "../src/lib/deck-builder/types";
import type { InventoryItem } from "../src/lib/types";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";

loadEnvLocal();

interface MatchCandidate {
  oracleId?: string;
  scryfallId: string;
  name: string;
  setCode: string;
  setName?: string;
  collectorNumber: string;
  matchMethod: string;
  score: number;
  deterministic: boolean;
}

function parseConditionFinish(item: InventoryItem): {
  condition: string;
  finish?: string;
} {
  const raw =
    item.tcgplayerCondition ??
    item.displayName.split(" — ").slice(1).join(" — ") ??
    item.condition ??
    "";
  const lower = raw.toLowerCase();
  let finish: string | undefined;
  if (/\bfoil\b/.test(lower)) finish = "foil";
  else if (/\betched\b/.test(lower)) finish = "etched";
  return { condition: raw.trim() || "unknown", finish };
}

function scoreForMethod(method: string, deterministic: boolean): number {
  switch (method) {
    case "tcgplayer_id":
      return 100;
    case "set_search":
      return 95;
    case "manual":
      return 90;
    case "name_search":
      return 75;
    case "name_fuzzy":
      return 55;
    default:
      return deterministic ? 50 : 40;
  }
}

function catalogToCandidate(
  catalog: CatalogCard,
  method: string,
  deterministic: boolean,
): MatchCandidate {
  return {
    oracleId: catalog.oracleId,
    scryfallId: catalog.id,
    name: catalog.name,
    setCode: catalog.set,
    setName: catalog.setName,
    collectorNumber: catalog.collectorNumber,
    matchMethod: method,
    score: scoreForMethod(method, deterministic),
    deterministic,
  };
}

function fuzzyNameCandidates(
  productName: string,
  index: ScryfallBulkIndex,
  limit = 5,
): MatchCandidate[] {
  const key = normalizeCardNameForMatch(productName);
  if (key.length < 3) return [];

  const hits: MatchCandidate[] = [];
  const seen = new Set<string>();

  for (const [candidateKey, card] of index.byNormalizedName) {
    if (candidateKey === key) continue;
    if (candidateKey.length < 4 || key.length < 4) continue;
    const overlaps =
      candidateKey.includes(key) ||
      key.includes(candidateKey) ||
      levenshteinRatio(key, candidateKey) >= 0.82;
    if (!overlaps) continue;
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    hits.push(catalogToCandidate(card, "name_fuzzy", false));
    if (hits.length >= limit) break;
  }

  return hits.sort((a, b) => b.score - a.score);
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  const dist = dp[m]![n]!;
  return 1 - dist / Math.max(m, n);
}

async function findCandidates(
  item: InventoryItem,
  index: ScryfallBulkIndex,
): Promise<MatchCandidate[]> {
  const candidates: MatchCandidate[] = [];
  const seen = new Set<string>();

  function add(c: MatchCandidate) {
    if (seen.has(c.scryfallId)) return;
    seen.add(c.scryfallId);
    candidates.push(c);
  }

  const resolved = await resolveCatalogForEnrichment(item, {
    bulkIndex: index,
    apiFallback: false,
  });
  if ("catalog" in resolved) {
    add(
      catalogToCandidate(
        resolved.catalog,
        resolved.matchMethod,
        resolved.matchMethod === "tcgplayer_id" || resolved.matchMethod === "set_search",
      ),
    );
  }

  const productName =
    item.productName?.trim() ||
    cardNameFromInventoryItem(item) ||
    item.displayName.split(" — ")[0]?.trim() ||
    "";

  const exactKey = normalizeCardNameForMatch(productName);
  const exact = index.byNormalizedName.get(exactKey);
  if (exact) add(catalogToCandidate(exact, "name_search", false));

  for (const fuzzy of fuzzyNameCandidates(productName, index)) {
    add(fuzzy);
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

function failureReason(
  item: InventoryItem,
  category: InventoryLinkCategory,
  candidates: MatchCandidate[],
): string {
  if (item.catalogMatchMethod === "unresolved") {
    if (!item.tcgplayerProductId && (!item.setName || !item.cardNumber)) {
      return "Missing TCGplayer product ID and set/collector number — no deterministic lookup path";
    }
    if (item.tcgplayerProductId && !candidates.some((c) => c.matchMethod === "tcgplayer_id")) {
      return "TCGplayer product ID not found in Scryfall bulk index";
    }
    if (item.setName && item.cardNumber && !candidates.some((c) => c.matchMethod === "set_search")) {
      return "Set name and collector number did not match any paper printing in bulk index";
    }
    return "All bulk-index lookups failed; row marked unresolved during catalog enrichment";
  }
  if (category === "manual_review_candidate") {
    return "Normalized name match only — requires human confirmation before linking";
  }
  if (candidates.length > 1 && candidates[0]!.score === candidates[1]!.score) {
    return "Multiple equally-scored candidate printings — ambiguous identity";
  }
  if (!candidates.length) {
    return "No catalog candidates found in local golden bulk index";
  }
  return "Automatic enrichment did not persist a deterministic link";
}

function recommendedAction(
  item: InventoryItem,
  candidates: MatchCandidate[],
): string {
  const best = candidates[0];
  if (!best) {
    return "Research card identity manually; add TCGplayer ID mapping or correct set/collector number, then re-run enrichment";
  }
  if (best.deterministic && best.score >= 95) {
    return `Apply deterministic link: ${best.matchMethod} → oracle ${best.oracleId ?? "?"} / printing ${best.scryfallId}`;
  }
  if (best.score >= 75) {
    return `Confirm name match "${best.name}" (${best.setCode} #${best.collectorNumber}) and apply manual link`;
  }
  if (candidates.length > 1) {
    return `Review ${candidates.length} fuzzy candidates and pick correct printing; reject if none match`;
  }
  return `Verify weak fuzzy candidate "${best.name}" or update inventory metadata`;
}

async function main() {
  const started = Date.now();
  const storeId = process.env.STORE_ID?.trim() || DEFAULT_STORE_ID;
  const { dataStore } = await import("../src/lib/storage/data-store");

  console.log("Loading Scryfall bulk index…");
  const bulkIndex = await getScryfallBulkIndex();

  const all = await dataStore.getInventory(storeId);
  const queue = all.filter((item) => {
    if (!isMagicInventoryItem(item) || !isEnrichableMagicSingle(item)) return false;
    if (inventoryQuantityAvailable(item) <= 0) return false;
    const { category } = classifyInventoryLinkStatus(item);
    return category === "unresolved" || category === "manual_review_candidate";
  });

  const rows = [];
  for (const item of queue) {
    const { category } = classifyInventoryLinkStatus(item);
    const candidates = await findCandidates(item, bulkIndex);
    const { condition, finish } = parseConditionFinish(item);
    const qty = inventoryQuantityAvailable(item);

    rows.push({
      inventoryListingId: item.id,
      tcgplayerListingKey: item.tcgplayerListingKey,
      displayName: item.displayName,
      productName: item.productName ?? cardNameFromInventoryItem(item),
      tcgplayerProductId: item.tcgplayerProductId,
      setName: item.setName,
      collectorNumber: item.cardNumber,
      condition,
      finish,
      quantityAvailable: qty,
      quantityOnHand: item.quantityOnHand ?? item.quantity ?? 0,
      listPrice: item.listPrice,
      linkCategory: category,
      catalogMatchMethod: item.catalogMatchMethod,
      existingCatalogOracleId: item.catalogOracleId,
      existingCatalogScryfallId: item.catalogScryfallId,
      candidates,
      bestCandidateScore: candidates[0]?.score ?? 0,
      automaticResolutionFailedReason: failureReason(item, category, candidates),
      recommendedManualAction: recommendedAction(item, candidates),
    });
  }

  rows.sort((a, b) => {
    if (b.quantityAvailable !== a.quantityAvailable) {
      return b.quantityAvailable - a.quantityAvailable;
    }
    const priceA = a.listPrice ?? 0;
    const priceB = b.listPrice ?? 0;
    if (priceB !== priceA) return priceB - priceA;
    return b.bestCandidateScore - a.bestCandidateScore;
  });

  const report = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    storeId,
    auditSnapshot: loadInventoryAuditSnapshot(),
    summary: {
      queueTotal: rows.length,
      unresolved: rows.filter((r) => r.linkCategory === "unresolved").length,
      manualReview: rows.filter((r) => r.linkCategory === "manual_review_candidate").length,
      totalUnits: rows.reduce((s, r) => s + r.quantityAvailable, 0),
      withDeterministicCandidate: rows.filter((r) =>
        r.candidates.some((c) => c.deterministic),
      ).length,
      withAnyCandidate: rows.filter((r) => r.candidates.length > 0).length,
      withNoCandidates: rows.filter((r) => r.candidates.length === 0).length,
    },
    failClosedNote:
      "All queue rows remain excluded from customer recommendations until manually linked.",
    queue: rows,
  };

  const outPath = resolve(process.cwd(), "reports", "inventory-manual-review-queue.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\nInventory manual review queue\n");
  console.log(`  Queue listings: ${report.summary.queueTotal}`);
  console.log(`  Unresolved:     ${report.summary.unresolved}`);
  console.log(`  Manual review:  ${report.summary.manualReview}`);
  console.log(`  Total units:    ${report.summary.totalUnits}`);
  console.log(`  With deterministic candidate: ${report.summary.withDeterministicCandidate}`);
  console.log(`  With any candidate:           ${report.summary.withAnyCandidate}`);
  console.log(`  No candidates:              ${report.summary.withNoCandidates}`);
  console.log(`\nReport: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
