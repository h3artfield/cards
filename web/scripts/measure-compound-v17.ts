/**
 * Precision guard for v1.17 compound-clause recovery.
 * Run: npx tsx scripts/measure-compound-v17.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";

const DATASET = "data/oracle-action-eval-development-v23.json";
const V16_BASELINE = "reports/catalog-baseline-v13-dev-v23.json";

function main() {
  const parserCommit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const envelope = JSON.parse(readFileSync(resolve(DATASET), "utf8"));
  const metrics = evaluateCaseSet(envelope.cases, { acceptedOnly: true });
  const before = JSON.parse(readFileSync(resolve(V16_BASELINE), "utf8"));

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserCommit,
    dataset: "development_set_v23",
    contentHash: envelope.contentHash,
    compoundFnBefore: 15,
    compoundFnAfter: null as number | null,
    accepted: {
      tp: metrics.tp,
      fp: metrics.fp,
      fn: metrics.fn,
      precision: metrics.precision,
      recall: metrics.recall,
      unsupported: metrics.unsupported,
    },
    v16Baseline: before.accepted,
    tpGained: metrics.tp - before.accepted.tp,
    fpIntroduced: metrics.fp - before.accepted.fp,
    fnRemoved: before.accepted.fn - metrics.fn,
    netPrecisionDelta: metrics.precision - before.accepted.precision,
    netRecallDelta: metrics.recall - before.accepted.recall,
    hardRegressions: {
      costRoleFp: metrics.costRoleFp ?? 0,
      wrongSpanRoleFromCost: metrics.wrongSpanRoleFromCost ?? 0,
      unsupportedAccepted: metrics.unsupported,
    },
  };

  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports/compound-precision-guard-v17.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
