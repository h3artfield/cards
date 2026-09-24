/**
 * Build deck-resolution supplement: official printing/flavor aliases + competitive oracle frame.
 * Source: Scryfall default_cards bulk (same authority as paper eligibility audit).
 *
 * Alias evidence may come from any bulk row (including MTGO-only OM1 crossover printings).
 * Target oracle must still have >=1 competitive paper printing elsewhere.
 *
 * Run: cd web && npx tsx scripts/build-deck-resolution-supplement-v1.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { downloadBulkToCache, fetchBulkMetadata } from "../src/lib/deck-builder/golden-catalog/bulk-metadata";
import { streamJsonlFile } from "../src/lib/deck-builder/golden-catalog/stream-bulk-jsonl";
import { normalizeOracleName } from "../src/lib/deck-builder/golden-catalog/normalize-name";
import {
  extractOracleIdFromBulk,
  printingHasPaperGames,
} from "./lib/catalog-paper-eligibility-v1";
import {
  extractFlavorName,
  extractPrintedName,
  extractPrintingName,
  isCompetitiveTournamentPrinting,
  type DeckResolutionSupplement,
  type OfficialNameAliasRow,
} from "./lib/deck-resolution-supplement-v1";

loadEnvLocal();

const OUT_PATH = resolve(
  __dirname,
  "../data/milestones/catalog-shadow/catalog-deck-resolution-supplement-v1.json",
);

async function main() {
  const index = await loadGoldenCatalogIndex();
  console.log(`Loaded golden catalog: ${index.cardCount} oracle cards`);

  const defaultMeta = await fetchBulkMetadata("default_cards");
  if (!defaultMeta) throw new Error("default_cards bulk metadata unavailable");
  const { cachePath, contentHash } = await downloadBulkToCache(defaultMeta);
  console.log(`Using bulk cache: ${cachePath}`);
  console.log(`Bulk updatedAt: ${defaultMeta.updatedAt}`);
  console.log(`Bulk content hash: ${contentHash}`);

  const aliasCandidates = new Map<string, Map<string, OfficialNameAliasRow>>();
  const competitiveOracleIds = new Set<string>();
  const nonCompetitiveReasons = new Map<string, string>();
  const oracleOnlyNonCompetitive = new Set<string>();

  function registerAlias(input: {
    aliasDisplayName: string;
    oracleId: string;
    aliasKind: OfficialNameAliasRow["aliasKind"];
    setCode: string;
    setName?: string;
    evidenceHasPaperPrinting: boolean;
  }): void {
    const canonical = index.byOracleId.get(input.oracleId);
    if (!canonical) return;

    const normalizedAlias = normalizeOracleName(input.aliasDisplayName);
    const normalizedCanonical = normalizeOracleName(canonical.canonicalName);
    if (normalizedAlias === normalizedCanonical) return;

    const byOracle = aliasCandidates.get(normalizedAlias) ?? new Map();
    byOracle.set(input.oracleId, {
      normalizedAlias,
      aliasDisplayName: input.aliasDisplayName,
      oracleId: input.oracleId,
      canonicalOracleName: canonical.canonicalName,
      aliasKind: input.aliasKind,
      evidenceSetCode: input.setCode,
      evidenceSetName: input.setName,
      evidenceHasPaperPrinting: input.evidenceHasPaperPrinting,
    });
    aliasCandidates.set(normalizedAlias, byOracle);
  }

  await streamJsonlFile({
    cachePath,
    onLine: async (raw) => {
      const oracleId = extractOracleIdFromBulk(raw);
      if (!oracleId) return;

      if (isCompetitiveTournamentPrinting(raw)) {
        competitiveOracleIds.add(oracleId);
        oracleOnlyNonCompetitive.delete(oracleId);
      } else if (printingHasPaperGames(raw)) {
        if (!competitiveOracleIds.has(oracleId)) {
          oracleOnlyNonCompetitive.add(oracleId);
        }
      }

      const setCode = String(raw.set ?? "");
      const setName = raw.set_name as string | undefined;
      const evidenceHasPaperPrinting = printingHasPaperGames(raw);

      const printedName = extractPrintedName(raw);
      if (printedName) {
        registerAlias({
          aliasDisplayName: printedName,
          oracleId,
          aliasKind: "printed_name",
          setCode,
          setName,
          evidenceHasPaperPrinting,
        });
      }

      const flavorName = extractFlavorName(raw);
      if (flavorName) {
        registerAlias({
          aliasDisplayName: flavorName,
          oracleId,
          aliasKind: "flavor_name",
          setCode,
          setName,
          evidenceHasPaperPrinting,
        });
      }

      if (isCompetitiveTournamentPrinting(raw)) {
        const printingName = extractPrintingName(raw);
        if (printingName) {
          registerAlias({
            aliasDisplayName: printingName,
            oracleId,
            aliasKind: "printing_name",
            setCode,
            setName,
            evidenceHasPaperPrinting,
          });
        }
      }
    },
  });

  for (const oracleId of oracleOnlyNonCompetitive) {
    if (!index.byOracleId.has(oracleId)) continue;
    if (competitiveOracleIds.has(oracleId)) continue;
    nonCompetitiveReasons.set(
      oracleId,
      "paper_printings_only_in_playtest_or_non_competitive_sets",
    );
  }

  const officialNameAliases: OfficialNameAliasRow[] = [];
  let aliasConflictCount = 0;
  const aliasConflicts: NonNullable<DeckResolutionSupplement["aliasConflicts"]> = [];

  for (const [normalizedAlias, byOracle] of aliasCandidates.entries()) {
    if (byOracle.size !== 1) {
      aliasConflictCount += 1;
      aliasConflicts.push({
        normalizedAlias,
        competing: [...byOracle.values()].sort((a, b) => a.oracleId.localeCompare(b.oracleId)),
        exclusionReason:
          "alias_string_maps_to_multiple_oracle_ids_in_default_cards_bulk; excluded_to_prevent_silent_misresolution",
      });
      continue;
    }
    const row = [...byOracle.values()][0]!;
    if (!competitiveOracleIds.has(row.oracleId)) continue;
    officialNameAliases.push(row);
  }

  officialNameAliases.sort(
    (a, b) =>
      a.normalizedAlias.localeCompare(b.normalizedAlias) ||
      a.oracleId.localeCompare(b.oracleId),
  );

  const om1Aliases = officialNameAliases.filter((a) => a.evidenceSetCode === "om1");

  const supplement: DeckResolutionSupplement = {
    version: "deck-resolution-supplement-v2",
    generatedAt: new Date().toISOString(),
    bulkUpdatedAt: defaultMeta.updatedAt,
    bulkContentHash: contentHash,
    bulkCachePath: cachePath,
    officialNameAliases,
    aliasConflictCount,
    aliasConflicts,
    competitiveDeckOracleIds: [...competitiveOracleIds].sort(),
    nonCompetitiveOracleReasons: [...nonCompetitiveReasons.entries()]
      .map(([oracleId, reason]) => ({ oracleId, reason }))
      .sort((a, b) => a.oracleId.localeCompare(b.oracleId)),
    aliasExtractionNotes: [
      "Alias evidence is extracted from all default_cards rows with printed_name/flavor_name (including MTGO-only OM1 crossover printings).",
      "Alias targets must still have >=1 competitive paper printing on a different row.",
      "Prior v1 incorrectly gated alias extraction on isCompetitiveTournamentPrinting, excluding OM1 printed_name crossovers with games=[mtgo].",
    ],
  };

  writeFileSync(OUT_PATH, JSON.stringify(supplement, null, 2));

  const checks = [
    "Phenomena Recorder",
    "Bayo, Irritable Instructor",
    "Basil, Cabaretti Loudmouth",
    "Detect Intrusion",
    "The Terminus of Return",
  ];
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Aliases: ${officialNameAliases.length} (conflicts skipped: ${aliasConflictCount})`);
  console.log(`OM1 aliases: ${om1Aliases.length}`);
  console.log(`Competitive oracle ids: ${competitiveOracleIds.size}`);
  for (const name of checks) {
    const hit = officialNameAliases.find((a) => a.aliasDisplayName === name);
    console.log(`${name}: ${hit ? `-> ${hit.canonicalOracleName}` : "MISSING"}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
