/**
 * Mechanical reconciliation of remaining v14 genuine-parser residuals after RC5 Passes 1–3 + gold corrections.
 * Run: cd web && npx tsx scripts/reconcile-rc5-v14-residuals-v151.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scoreRc5RegressionPack, type Rc5RegressionPack } from "./lib/rc5-regression-scoring-v1";

const PACK_PATH = "data/oracle-action-eval-rc5-v14-regression-v151.json";

const EXPECTED_REMAINING_FN_CASES = [
  "vh14-0003",
  "vh14-0009",
  "vh14-0011",
  "vh14-0022",
  "vh14-0105",
  "vh14-0131",
  "vh14-0156",
  "vh14-0171",
  "vh14-0209",
];

const EXPECTED_REMAINING_FP_CASES = ["vh14-0052", "vh14-0172"];

/** Fixed incidentally during RC5 Pass 2 (stun reminder) — no longer emits saga token sacrifice FP. */
const EXPECTED_FIXED_FP_CASES = ["vh14-0169"];

const RECOVERED_FN_CASES = [
  "vh14-0083",
  "vh14-0087",
  "vh14-0089",
  "vh14-0094",
  "vh14-0098",
  "vh14-0133",
  "vh14-0137",
];

const GOLD_CORRECTED_CASES = ["vh14-0046", "vh14-0114"];

function main() {
  const pack = JSON.parse(readFileSync(resolve(PACK_PATH), "utf8")) as Rc5RegressionPack;
  const scored = scoreRc5RegressionPack(pack);

  const remainingFn = scored.action.rows
    .filter((r) => r.metrics.fn > 0)
    .map((r) => ({
      sourceV14CaseId: r.sourceV14CaseId,
      cardName: r.cardName,
      targets: r.targets.map((t) => ({ actionType: t.actionType, evidence: t.evidenceContains.slice(0, 50) })),
      fn: r.metrics.fn,
    }));

  const recoveredFn = scored.action.rows
    .filter((r) => RECOVERED_FN_CASES.includes(r.sourceV14CaseId) && r.metrics.fn === 0)
    .map((r) => ({
      sourceV14CaseId: r.sourceV14CaseId,
      cardName: r.cardName,
      tp: r.metrics.tp,
    }));

  const goldCorrected = {
    removed: GOLD_CORRECTED_CASES.filter((id) => !pack.actionScoringCases.some((c) => c.sourceV14CaseId === id)),
    reclassified: pack.actionScoringCases
      .filter((c) => c.sourceV14CaseId === "vh14-0114")
      .flatMap((c) => c.scoringTargets.map((t) => ({ actionType: t.actionType, evidence: t.evidenceContains }))),
  };

  const remainingFp = scored.fp.rows
    .filter((r) => !r.pass)
    .map((r) => ({
      sourceV14CaseId: r.sourceV14CaseId,
      cardName: r.cardName,
      observedAction: r.falsePositiveTarget.observedAction,
      fp: r.fp,
    }));

  const fixedFp = scored.fp.rows.filter((r) => r.pass);
  const fixedFpIds = fixedFp.map((r) => r.sourceV14CaseId).sort();
  const fixedFpMatch =
    fixedFpIds.length === EXPECTED_FIXED_FP_CASES.length &&
    fixedFpIds.every((id, i) => id === [...EXPECTED_FIXED_FP_CASES].sort()[i]);

  const fnCaseIds = remainingFn.map((r) => r.sourceV14CaseId).sort();
  const fpCaseIds = remainingFp.map((r) => r.sourceV14CaseId).sort();

  const fnMatch =
    fnCaseIds.length === EXPECTED_REMAINING_FN_CASES.length &&
    fnCaseIds.every((id, i) => id === [...EXPECTED_REMAINING_FN_CASES].sort()[i]);
  const fpMatch =
    fpCaseIds.length === EXPECTED_REMAINING_FP_CASES.length &&
    fpCaseIds.every((id, i) => id === [...EXPECTED_REMAINING_FP_CASES].sort()[i]);

  const report = {
    packPath: PACK_PATH,
    actionScore: scored.action.accepted,
    remainingKnownFn: remainingFn,
    remainingKnownFnCount: remainingFn.length,
    expectedRemainingFnCount: EXPECTED_REMAINING_FN_CASES.length,
    fnCaseIdsMatchExpected: fnMatch,
    recoveredGenuineFn: recoveredFn,
    goldCorrected,
    remainingGenuineFp: remainingFp,
    fixedGenuineFp: fixedFp.map((r) => ({ sourceV14CaseId: r.sourceV14CaseId, cardName: r.cardName })),
    expectedFixedFpCases: EXPECTED_FIXED_FP_CASES,
    fixedFpCaseIdsMatchExpected: fixedFpMatch,
    remainingFpCount: remainingFp.length,
    expectedRemainingFpCount: EXPECTED_REMAINING_FP_CASES.length,
    fpCaseIdsMatchExpected: fpMatch,
    reconciliationPass: fnMatch && fpMatch && fixedFpMatch,
    note:
      "vh14-0169 sacrifice FP fixed incidentally during Pass 2 — not an RC5 scoring target but verified mechanically",
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.reconciliationPass) process.exit(1);
}

main();
