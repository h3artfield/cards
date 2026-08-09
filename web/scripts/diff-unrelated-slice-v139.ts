/**
 * Diff unrelated-catalog slice metrics between two parser states or commits.
 * Run: npx tsx scripts/diff-unrelated-slice-v139.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { evaluateCaseSemantic } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const positiveCatalog = applyGoldMigrationV135(
  (JSON.parse(readFileSync(resolve("data/oracle-action-eval-rc3-positive-training-catalog-v133.json"), "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  }).cases,
);
const unrelated = positiveCatalog.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);

const rows: Array<{
  caseId: string;
  tp: number;
  fn: number;
  fp: number;
  expected: number;
  matched: string[];
  missed: string[];
  extra: string[];
}> = [];

for (const c of unrelated) {
  const parse = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
  const m = evaluateCaseSemantic(c, parse);
  const expected = c.expectedPrimitiveActions.filter((e) => !e.negative);
  const actions = parse.actions.filter((a) => a.reviewStatus === "accepted");
  rows.push({
    caseId: c.id,
    tp: m.accepted.tp,
    fn: m.accepted.fn,
    fp: m.accepted.fp,
    expected: expected.length,
    matched: [],
    missed: [],
    extra: [],
  });
}

const tp = rows.reduce((s, r) => s + r.tp, 0);
const fp = rows.reduce((s, r) => s + r.fp, 0);
const fn = rows.reduce((s, r) => s + r.fn, 0);
console.log(JSON.stringify({ tp, fp, fn, denominator: tp + fn }, null, 2));
console.log(
  "FN cases:",
  rows.filter((r) => r.fn > 0).map((r) => ({ caseId: r.caseId, fn: r.fn, tp: r.tp })),
);
console.log(
  "FP cases:",
  rows.filter((r) => r.fp > 0).map((r) => ({ caseId: r.caseId, fp: r.fp })),
);
