/**
 * Investigate default_cards import failures with categorization.
 * Run: npx --yes tsx scripts/investigate-printing-failures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { downloadBulkToCache, fetchBulkMetadata } from "../src/lib/deck-builder/golden-catalog/bulk-metadata";
import { streamJsonlFile } from "../src/lib/deck-builder/golden-catalog/stream-bulk-jsonl";
import { parsePrintingFromBulk } from "../src/lib/deck-builder/golden-catalog/parse-printing";
import { catalogCardFromScryfall } from "../src/lib/deck-builder/scryfall-catalog";

loadEnvLocal();

type FailureCategory =
  | "unsupported_layout"
  | "missing_required_source_field"
  | "parser_defect"
  | "firestore_serialization_defect"
  | "write_failure"
  | "duplicate_conflict"
  | "source_data_issue"
  | "excluded_nonpaper"
  | "excluded_token_emblem";

interface PrintingFailure {
  scryfallId?: string;
  oracleId?: string;
  name?: string;
  set?: string;
  collectorNumber?: string;
  layout?: string;
  failedParserField?: string;
  exception?: string;
  rawRecordLocator: number;
  category: FailureCategory;
  retryResult?: "success" | "failed";
}

async function main() {
  const meta = await fetchBulkMetadata("default_cards");
  if (!meta) throw new Error("default_cards metadata unavailable");
  const { cachePath } = await downloadBulkToCache(meta);

  let rawDefaultCardsRowCount = 0;
  let excludedNonPaper = 0;
  let excludedTokenEmblemArt = 0;
  let parsedSuccessfully = 0;
  const failures: PrintingFailure[] = [];

  await streamJsonlFile({
    cachePath,
    onLine: async (raw, lineNumber) => {
      rawDefaultCardsRowCount += 1;
      const games = raw.games as string[] | undefined;
      if (games?.length && !games.includes("paper")) {
        excludedNonPaper += 1;
        return;
      }
      const typeLine = String(raw.type_line ?? "").toLowerCase();
      if (raw.layout === "token" || typeLine.includes("token") || raw.layout === "emblem") {
        excludedTokenEmblemArt += 1;
        return;
      }

      const printing = parsePrintingFromBulk(raw, { bulkUpdatedAt: meta.updatedAt });
      if (!printing) {
        failures.push({
          scryfallId: raw.id as string | undefined,
          oracleId: raw.oracle_id as string | undefined,
          name: raw.name as string | undefined,
          set: raw.set as string | undefined,
          collectorNumber: raw.collector_number as string | undefined,
          layout: raw.layout as string | undefined,
          failedParserField: "parsePrintingFromBulk returned null",
          rawRecordLocator: lineNumber,
          category: !raw.id || !raw.oracle_id || !raw.name
            ? "missing_required_source_field"
            : "parser_defect",
          retryResult: "failed",
        });
        return;
      }

      try {
        const legacy = catalogCardFromScryfall(raw);
        if (!legacy) {
          failures.push({
            scryfallId: raw.id as string | undefined,
            oracleId: raw.oracle_id as string | undefined,
            name: raw.name as string | undefined,
            set: raw.set as string | undefined,
            collectorNumber: raw.collector_number as string | undefined,
            layout: raw.layout as string | undefined,
            failedParserField: "catalogCardFromScryfall returned null",
            rawRecordLocator: lineNumber,
            category: "parser_defect",
            retryResult: "failed",
          });
          return;
        }
        parsedSuccessfully += 1;
      } catch (err) {
        failures.push({
          scryfallId: raw.id as string | undefined,
          oracleId: raw.oracle_id as string | undefined,
          name: raw.name as string | undefined,
          set: raw.set as string | undefined,
          collectorNumber: raw.collector_number as string | undefined,
          layout: raw.layout as string | undefined,
          failedParserField: "catalogCardFromScryfall threw",
          exception: err instanceof Error ? err.message : String(err),
          rawRecordLocator: lineNumber,
          category: "parser_defect",
          retryResult: "failed",
        });
      }
    },
  });

  const expectedImportablePrintingCount =
    rawDefaultCardsRowCount - excludedNonPaper - excludedTokenEmblemArt;
  const actionableFailures = failures.filter(
    (f) => f.category !== "excluded_nonpaper" && f.category !== "excluded_token_emblem",
  );

  const failuresByCategory: Record<string, number> = {};
  for (const f of failures) {
    failuresByCategory[f.category] = (failuresByCategory[f.category] ?? 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    rawDefaultCardsRowCount,
    excludedNonPaper,
    excludedTokenEmblemArt,
    expectedImportablePrintingCount,
    parsedSuccessfully,
    parseFailures: actionableFailures.length,
    failures: actionableFailures,
    failuresByCategory,
    coverageFormula: `parsedSuccessfully (${parsedSuccessfully}) / expectedImportablePrintingCount (${expectedImportablePrintingCount}) = ${(
      (parsedSuccessfully / expectedImportablePrintingCount) *
      100
    ).toFixed(4)}%`,
  };

  const outPath = resolve(process.cwd(), "reports", "printing-failures-audit.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Printing failure investigation\n");
  for (const [k, v] of Object.entries({
    "raw rows": rawDefaultCardsRowCount,
    "excluded non-paper": excludedNonPaper,
    "excluded token/emblem": excludedTokenEmblemArt,
    "expected importable": expectedImportablePrintingCount,
    "parsed OK": parsedSuccessfully,
    "parse failures": actionableFailures.length,
  })) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`  ${report.coverageFormula}`);
  console.log(`\nReport: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
