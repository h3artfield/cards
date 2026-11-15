/**
 * RC4 pass probe — integrity and leakage on rebuilt regression pack.
 */
import { readFileSync } from "node:fs";
import {
  type Rc4RegressionPack,
  runIntegrityAssertions,
  runLeakageAssertions,
  scoreActionTargets,
  scoreFpTargets,
} from "./lib/rc4-regression-scoring-v1";

const pack = JSON.parse(readFileSync("data/oracle-action-eval-rc4-v13-regression-v140.json", "utf8")) as Rc4RegressionPack;

const focus = process.argv.slice(2);
const actionCases = focus.length
  ? pack.actionScoringCases.filter((c) => focus.some((f) => c.sourceV13CaseId.includes(f)))
  : pack.actionScoringCases;

const action = scoreActionTargets(actionCases);
const fp = scoreFpTargets(pack.fpScoringCases);
const integrity = runIntegrityAssertions(pack.integrityAssertions);
const leakage = runLeakageAssertions(pack.leakageAssertions);

console.log(
  JSON.stringify(
    {
      accounting: pack.accounting,
      actionScore: action.accepted,
      fpScore: { fp: fp.fp, passCount: fp.passCount },
      integrity: { passCount: integrity.passCount, idViolations: integrity.idViolations, provenanceViolations: integrity.provenanceViolations },
      leakage: { passCount: leakage.passCount, structuralLeak: leakage.structuralLeak, forbiddenHitCount: leakage.forbiddenHitCount },
      remainingFn: action.rows.filter((r) => r.metrics.fn > 0),
    },
    null,
    2,
  ),
);
