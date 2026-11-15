/**
 * v16 Gold Policy preflight against RC6 stack — expect HARD STOP on stack mismatch.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runGoldPolicyPreflight } from "./lib/gold-policy-preflight-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const cases = (
  JSON.parse(readFileSync("data/oracle-action-eval-validation-v16.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  }
).cases;
const benchmarkHash = createHash("sha256").update(JSON.stringify(cases)).digest("hex");

const preflight = runGoldPolicyPreflight({
  certificatePath: "data/milestones/validation-v16-certification/validation-v16-gold-policy-certificate-v3.json",
  benchmarkPath: "data/oracle-action-eval-validation-v16.json",
  cases,
  benchmarkHash,
});

console.log(JSON.stringify({ benchmarkHash, preflight, parserExecutionCount: 0 }, null, 2));
