import type { InventoryItem } from "../types";
import {
  isEnrichableMagicSingle,
  isInventoryCatalogEnriched,
  isInventoryCatalogLinked,
  isInventoryCatalogSkipped,
  isInventoryCatalogUnresolved,
  needsGoldenTableBackfill,
} from "../inventory/magic-items";

export interface CatalogCoverageCounts {
  total: number;
  enriched: number;
  linked: number;
  skipped: number;
  unresolved: number;
  pending: number;
  withOracleId: number;
  withScryfallId: number;
  withOracleText: number;
  withCommanderEligibility: number;
  withOracleTags: number;
  withKeywords: number;
  needsGoldenTableBackfill: number;
  fuzzyMatches: number;
  manualMatches: number;
  tcgplayerMatches: number;
  matchConflicts: number;
}

export interface CatalogCoverageRates {
  oracleIdPct: number;
  scryfallIdPct: number;
  oracleTextPct: number;
  commanderEligibilityPct: number;
  oracleTagsPct: number;
  keywordsPct: number;
  linkedPct: number;
  unresolvedPct: number;
  fuzzyMatchPct: number;
  manualMatchPct: number;
  conflictPct: number;
  pendingPct: number;
}

export interface CatalogCoverageReport {
  generatedAt: string;
  /** Rows included in this report (Magic singles eligible for Scryfall enrichment). */
  population: "enrichable_magic_singles";
  counts: CatalogCoverageCounts;
  matchMethods: Record<string, number>;
  rates: CatalogCoverageRates;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** P1 coverage metrics for Magic inventory catalog identity (§19). */
export function computeCatalogCoverage(
  items: InventoryItem[],
  input?: { matchConflicts?: number },
): CatalogCoverageReport {
  const magic = items.filter(isEnrichableMagicSingle);
  const total = magic.length;

  const matchMethods: Record<string, number> = {};
  let enriched = 0;
  let linked = 0;
  let skipped = 0;
  let unresolved = 0;
  let pending = 0;
  let withOracleId = 0;
  let withScryfallId = 0;
  let withOracleText = 0;
  let withCommanderEligibility = 0;
  let withOracleTags = 0;
  let withKeywords = 0;
  let needsBackfill = 0;
  let fuzzyMatches = 0;
  let manualMatches = 0;
  let tcgplayerMatches = 0;

  for (const item of magic) {
    if (isInventoryCatalogEnriched(item)) enriched += 1;
    if (isInventoryCatalogLinked(item)) linked += 1;
    if (isInventoryCatalogSkipped(item)) skipped += 1;
    if (isInventoryCatalogUnresolved(item)) unresolved += 1;
    if (!isInventoryCatalogEnriched(item)) pending += 1;

    if (item.catalogOracleId?.trim()) withOracleId += 1;
    if (item.catalogScryfallId?.trim()) withScryfallId += 1;
    if (item.catalogOracleText?.trim()) withOracleText += 1;
    if (item.catalogCanBeSoleCommander != null) withCommanderEligibility += 1;
    if ((item.catalogOracleTags ?? []).length > 0) withOracleTags += 1;
    if (item.catalogKeywords != null) withKeywords += 1;
    if (needsGoldenTableBackfill(item)) needsBackfill += 1;

    const method = item.catalogMatchMethod ?? "none";
    matchMethods[method] = (matchMethods[method] ?? 0) + 1;

    if (method === "name_fuzzy") fuzzyMatches += 1;
    if (method === "manual") manualMatches += 1;
    if (method === "tcgplayer_id") tcgplayerMatches += 1;
  }

  const matchConflicts = input?.matchConflicts ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    population: "enrichable_magic_singles",
    counts: {
      total,
      enriched,
      linked,
      skipped,
      unresolved,
      pending,
      withOracleId,
      withScryfallId,
      withOracleText,
      withCommanderEligibility,
      withOracleTags,
      withKeywords,
      needsGoldenTableBackfill: needsBackfill,
      fuzzyMatches,
      manualMatches,
      tcgplayerMatches,
      matchConflicts,
    },
    matchMethods,
    rates: {
      oracleIdPct: pct(withOracleId, total),
      scryfallIdPct: pct(withScryfallId, total),
      oracleTextPct: pct(withOracleText, total),
      commanderEligibilityPct: pct(withCommanderEligibility, total),
      oracleTagsPct: pct(withOracleTags, total),
      keywordsPct: pct(withKeywords, total),
      linkedPct: pct(linked, total),
      unresolvedPct: pct(unresolved, total),
      fuzzyMatchPct: pct(fuzzyMatches, total),
      manualMatchPct: pct(manualMatches, total),
      conflictPct: pct(matchConflicts, total),
      pendingPct: pct(pending, total),
    },
  };
}
