/**
 * Record primary/secondary adjudication for catalog coverage gold (parser-blind).
 *
 * Run:
 *   cd web && npx tsx scripts/record-catalog-coverage-adjudication-v1.ts \
 *     --oracleId=... --adjudicator=human-a --slot=primary --input=path/to/gold.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CatalogCoverageSemanticGoldCase } from "./lib/catalog-coverage-semantic-gold-schema-v1";

const LEDGER_PATH = "data/milestones/catalog-shadow/catalog-coverage-gold-adjudication-ledger-v1.json";

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${prefix}=`))?.split("=").slice(1).join("=");
}

function main() {
  const oracleId = argValue("--oracleId");
  const adjudicator = argValue("--adjudicator");
  const slot = argValue("--slot") as "primary" | "secondary" | undefined;
  const inputPath = argValue("--input");
  if (!oracleId || !adjudicator || !slot || !inputPath) {
    throw new Error("--oracleId --adjudicator --slot --input required");
  }

  const semanticGold = JSON.parse(readFileSync(resolve(inputPath), "utf8")) as CatalogCoverageSemanticGoldCase;
  if (semanticGold.oracleId !== oracleId) {
    throw new Error(`oracleId mismatch: ${semanticGold.oracleId} vs ${oracleId}`);
  }

  const ledger = JSON.parse(readFileSync(resolve(LEDGER_PATH), "utf8")) as {
    records: Array<{
      oracleId: string;
      primary?: { adjudicatorId: string; semanticGold: CatalogCoverageSemanticGoldCase; adjudicatedAt: string };
      secondary?: { adjudicatorId: string; semanticGold: CatalogCoverageSemanticGoldCase; adjudicatedAt: string };
    }>;
    disagreements: unknown[];
    primaryAdjudicatedCount: number;
    secondaryAdjudicatedCount: number;
    disagreementCount: number;
  };

  let record = ledger.records.find((r) => r.oracleId === oracleId);
  if (!record) {
    record = { oracleId };
    ledger.records.push(record);
  }

  const entry = {
    adjudicatorId: adjudicator,
    semanticGold,
    adjudicatedAt: new Date().toISOString(),
  };
  record[slot] = entry;

  ledger.primaryAdjudicatedCount = ledger.records.filter((r) => r.primary).length;
  ledger.secondaryAdjudicatedCount = ledger.records.filter((r) => r.secondary).length;

  writeFileSync(resolve(LEDGER_PATH), `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(JSON.stringify({ oracleId, slot, adjudicator, recorded: true }, null, 2));
}

main();
