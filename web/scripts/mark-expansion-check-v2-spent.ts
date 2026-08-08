/**
 * Mark expansion-check-v2 holdout spent after execution #1 recall gate failure.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SPENT = {
  holdoutStatus: "spent_for_development",
  spentReason: "recall gate failure after execution #1 (P=100%, R=80.6%)",
  parserExecutionCount: 1,
  result: "failed_recall_gate",
  spentAt: new Date().toISOString(),
  doNotRunExecution: 2,
};

for (const rel of ["data/oracle-action-eval-development-generalization-expansion-check-v2.json"]) {
  const full = resolve(process.cwd(), rel);
  const envelope = JSON.parse(readFileSync(full, "utf8")) as Record<string, unknown>;
  envelope.expansionCheckHoldout = SPENT;
  if (envelope.checkHoldout && typeof envelope.checkHoldout === "object") {
    envelope.checkHoldout = { ...(envelope.checkHoldout as object), ...SPENT };
  }
  writeFileSync(full, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  console.log("marked spent:", rel);
}
