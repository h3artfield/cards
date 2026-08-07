/**
 * Verify validation v12 has zero oracleId overlap with prior benchmarks.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertNoOracleIdOverlap } from "./lib/benchmark-oracle-id-exclusions";

const v12 = JSON.parse(
  readFileSync(resolve(process.cwd(), "data/oracle-action-eval-validation-v12-fresh.json"), "utf8"),
) as { cases: Array<{ id: string; oracleId: string; cardName?: string }> };

const EXCLUDE_PATHS = [
  "data/oracle-action-eval-development-v25.json",
  "data/oracle-action-eval-validation-v8.json",
  "data/oracle-action-eval-validation-v9.json",
  "data/oracle-action-eval-validation-v10.json",
  "data/oracle-action-eval-validation-v11.json",
  "data/oracle-action-eval-final-blind-v2.json",
  "data/oracle-action-eval-development-generalization-expansion-v1.json",
];

const excluded = new Set<string>();
for (const rel of EXCLUDE_PATHS) {
  const envelope = JSON.parse(readFileSync(resolve(process.cwd(), rel), "utf8")) as {
    cases?: Array<{ oracleId: string }>;
  };
  for (const c of envelope.cases ?? []) {
    if (c.oracleId) excluded.add(c.oracleId);
  }
}

assertNoOracleIdOverlap(v12.cases, excluded, "validation_set_v12_fresh");
console.log(JSON.stringify({ ok: true, caseCount: v12.cases.length, excludedOracleIds: excluded.size }, null, 2));
