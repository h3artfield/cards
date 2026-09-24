/**
 * RC4 A/B/C + I2/P1 contrast probe — uses adjudicated action targets only.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { type Rc4RegressionPack, sliceActionScore, scoreFpTargets } from "./lib/rc4-regression-scoring-v1";

const pack = JSON.parse(
  readFileSync("data/oracle-action-eval-rc4-v13-regression-v140.json", "utf8"),
) as Rc4RegressionPack;

const SLICES = {
  counter: { caseIds: ["vh13-0016", "vh13-0068", "vh13-0206", "vh13-0207"], actionTypes: ["put_counter"] },
  cast: { caseIds: ["vh13-0160"], actionTypes: ["cast"] },
  library_fp: { fpCaseIds: ["vh13-0153"] },
};

const report = {
  generatedAt: new Date().toISOString(),
  parserVersion: "rc4-in-progress",
  scoringSource: "adjudicated action targets from validation-v13-policy-adjudication-v2",
  slices: {
    counter: sliceActionScore(pack, SLICES.counter.caseIds, SLICES.counter.actionTypes).accepted,
    cast: sliceActionScore(pack, SLICES.cast.caseIds, SLICES.cast.actionTypes).accepted,
    library_fp: scoreFpTargets(pack.fpScoringCases.filter((c) => c.sourceV13CaseId === "vh13-0153")),
  },
  sliceDetails: {
    counter: sliceActionScore(pack, SLICES.counter.caseIds, SLICES.counter.actionTypes).rows,
    cast: sliceActionScore(pack, SLICES.cast.caseIds, SLICES.cast.actionTypes).rows,
    library_fp: scoreFpTargets(pack.fpScoringCases.filter((c) => c.sourceV13CaseId === "vh13-0153")).rows,
  },
};

mkdirSync(resolve("data/milestones/rc4-development"), { recursive: true });
writeFileSync(
  resolve("data/milestones/rc4-development/rc4-abc-contrast-rescore-v140.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
