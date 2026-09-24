/**
 * RC5 baseline probe — action scoring + integrity/leakage on v14 regression pack.
 * Usage: npx tsx scripts/probe-rc5-v14-regression-v150.ts [family|caseId...]
 */
import { readFileSync } from "node:fs";
import {
  type Rc5DevelopmentFamily,
  type Rc5RegressionPack,
  runIntegrityAssertions,
  runLeakageAssertions,
  scoreActionTargets,
  scoreRc5RegressionPack,
  sliceActionScoreByFamily,
  sliceFpScoreByFamily,
} from "./lib/rc5-regression-scoring-v1";

const pack = JSON.parse(readFileSync("data/oracle-action-eval-rc5-v14-regression-v150.json", "utf8")) as Rc5RegressionPack;

const focus = process.argv.slice(2);
const isFamily = (s: string): s is Rc5DevelopmentFamily =>
  [
    "granted_nested_actions",
    "replacement_effect_parsing",
    "modal_families",
    "triggered_families",
    "saga_planeswalker",
    "scattered_one_offs",
  ].includes(s);

if (focus.length === 1 && isFamily(focus[0]!)) {
  const family = focus[0]!;
  const action = sliceActionScoreByFamily(pack, family);
  const fp = sliceFpScoreByFamily(pack, family);
  console.log(
    JSON.stringify(
      {
        family,
        actionScore: action.accepted,
        fpScore: { fp: fp.fp, passCount: fp.passCount },
        remainingFn: action.rows.filter((r) => r.metrics.fn > 0),
        fpFails: fp.rows.filter((r) => !r.pass),
      },
      null,
      2,
    ),
  );
} else {
  const actionCases = focus.length
    ? pack.actionScoringCases.filter((c) => focus.some((f) => c.sourceV14CaseId.includes(f)))
    : pack.actionScoringCases;
  const action = scoreActionTargets(actionCases);
  const full = scoreRc5RegressionPack(pack);
  console.log(
    JSON.stringify(
      {
        accounting: pack.accounting,
        actionScore: action.accepted,
        fpScore: { fp: full.fp.fp, passCount: full.fp.passCount },
        integrity: {
          passCount: full.integrity.passCount,
          idViolations: full.integrity.idViolations,
          provenanceViolations: full.integrity.provenanceViolations,
        },
        leakage: {
          passCount: full.leakage.passCount,
          structuralLeak: full.leakage.structuralLeak,
          forbiddenHitCount: full.leakage.forbiddenHitCount,
        },
        remainingFn: action.rows.filter((r) => r.metrics.fn > 0),
        fpFails: full.fp.rows.filter((r) => !r.pass),
        leakageFails: full.leakage.rows.filter((r) => !r.pass).slice(0, 10),
      },
      null,
      2,
    ),
  );
}
