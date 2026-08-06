/**
 * Compare expected Scryfall bulk ID sets vs Firestore catalog ID sets.
 * Run: npx tsx scripts/reconcile-catalog-id-sets.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { downloadBulkToCache, fetchBulkMetadata } from "../src/lib/deck-builder/golden-catalog/bulk-metadata";
import { streamJsonlFile } from "../src/lib/deck-builder/golden-catalog/stream-bulk-jsonl";
import { isPaperPrinting, parsePrintingFromBulk } from "../src/lib/deck-builder/golden-catalog/parse-printing";
import { parseOracleCardFromBulk } from "../src/lib/deck-builder/golden-catalog/parse-oracle-card";
import { CATALOG_PRINTINGS_COLLECTION } from "../src/lib/deck-builder/golden-catalog/schemas";

loadEnvLocal();

type ExtraClassification =
  | "previously_included_nonpaper_record"
  | "token_emblem_art_object"
  | "old_filtering_rule_result"
  | "stale_scryfall_record"
  | "valid_record_excluded_incorrectly"
  | "unknown";

function classifyExtraPrinting(
  raw: Record<string, unknown> | null,
  stored?: Record<string, unknown>,
): ExtraClassification {
  const source = raw ?? stored;
  if (!source) return "unknown";
  const games = (source.games ?? stored?.games) as string[] | undefined;
  if (games?.length && !games.includes("paper")) return "previously_included_nonpaper_record";
  const layout = String(source.layout ?? stored?.layout ?? "");
  const typeLine = String(source.type_line ?? stored?.typeLine ?? "").toLowerCase();
  if (layout === "token" || layout === "emblem" || typeLine.includes("token")) {
    return "token_emblem_art_object";
  }
  if (raw && isPaperPrinting(raw)) return "valid_record_excluded_incorrectly";
  if (!raw && stored) return "stale_scryfall_record";
  return "old_filtering_rule_result";
}

async function main() {
  const started = Date.now();
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) process.exit(1);

  const db = await requireLocalFirestore("Firestore", () =>
    Promise.resolve(requireFirestore()),
  );

  const oracleMeta = await fetchBulkMetadata("oracle_cards");
  const defaultMeta = await fetchBulkMetadata("default_cards");
  if (!oracleMeta || !defaultMeta) throw new Error("bulk metadata unavailable");

  const { cachePath: oracleCache } = await downloadBulkToCache(oracleMeta);
  const { cachePath: defaultCache } = await downloadBulkToCache(defaultMeta);

  const expectedOracleIds = new Set<string>();
  const expectedPrintingIds = new Set<string>();
  const printingRawById = new Map<string, Record<string, unknown>>();

  await streamJsonlFile({
    cachePath: oracleCache,
    onLine: async (raw) => {
      const oracle = parseOracleCardFromBulk(raw, { bulkUpdatedAt: oracleMeta.updatedAt });
      if (oracle) expectedOracleIds.add(oracle.oracleId);
    },
  });

  await streamJsonlFile({
    cachePath: defaultCache,
    filter: isPaperPrinting,
    onLine: async (raw) => {
      const printing = parsePrintingFromBulk(raw, { bulkUpdatedAt: defaultMeta.updatedAt });
      if (printing) {
        expectedPrintingIds.add(printing.scryfallId);
        printingRawById.set(printing.scryfallId, raw);
      }
    },
  });

  const actualOracleIds = new Set<string>();
  const oracleSnap = await db.collection(COLLECTIONS.catalogOracleCards).select().get();
  for (const doc of oracleSnap.docs) actualOracleIds.add(doc.id);

  const actualPrintingIds = new Set<string>();
  const printingSnap = await db.collection(CATALOG_PRINTINGS_COLLECTION).select().get();
  for (const doc of printingSnap.docs) actualPrintingIds.add(doc.id);

  const missingOracleIds = [...expectedOracleIds].filter((id) => !actualOracleIds.has(id));
  const extraOracleIds = [...actualOracleIds].filter((id) => !expectedOracleIds.has(id));
  const missingPrintingIds = [...expectedPrintingIds].filter((id) => !actualPrintingIds.has(id));
  const extraPrintingIds = [...actualPrintingIds].filter((id) => !expectedPrintingIds.has(id));

  const extraPrintingAudit = extraPrintingIds.map((id) => {
    const snap = printingSnap.docs.find((d) => d.id === id);
    const data = snap?.data() as Record<string, unknown> | undefined;
    return {
      scryfallId: id,
      name: data?.name,
      set: data?.set,
      layout: data?.layout,
      games: data?.games,
      classification: classifyExtraPrinting(printingRawById.get(id) ?? null, data),
    };
  });

  const matchedOracle = expectedOracleIds.size - missingOracleIds.length;
  const matchedPrinting = expectedPrintingIds.size - missingPrintingIds.length;

  const report = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    oracle: {
      expectedOracleIds: expectedOracleIds.size,
      actualOracleIds: actualOracleIds.size,
      missingOracleIds,
      extraOracleIds,
      matchedCount: matchedOracle,
      coverageFormula: `${matchedOracle}/${expectedOracleIds.size}`,
      coveragePct:
        expectedOracleIds.size > 0
          ? Math.round((matchedOracle / expectedOracleIds.size) * 10_000) / 100
          : 0,
    },
    printings: {
      expectedPrintingIds: expectedPrintingIds.size,
      actualPrintingIds: actualPrintingIds.size,
      missingPrintingIds,
      extraPrintingIds,
      extraPrintingAudit,
      matchedCount: matchedPrinting,
      coverageFormula: `${matchedPrinting}/${expectedPrintingIds.size}`,
      coveragePct:
        expectedPrintingIds.size > 0
          ? Math.round((matchedPrinting / expectedPrintingIds.size) * 10_000) / 100
          : 0,
    },
  };

  const outPath = resolve(process.cwd(), "reports", "catalog-id-reconciliation.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Catalog ID reconciliation\n");
  console.log(`  Oracle:   ${report.oracle.coverageFormula} (${report.oracle.coveragePct}%)`);
  console.log(`  Printings: ${report.printings.coverageFormula} (${report.printings.coveragePct}%)`);
  console.log(`  Extra printings: ${extraPrintingIds.length}`);
  console.log(`\nReport: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
