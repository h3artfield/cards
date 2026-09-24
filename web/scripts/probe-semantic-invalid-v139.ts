import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const paths = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
];

const cases = paths.flatMap((p) =>
  applyGoldMigrationV135(
    (JSON.parse(readFileSync(resolve(p), "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
  ),
);

let invalidTotal = 0;
let idTotal = 0;
const bad: unknown[] = [];

for (const testCase of cases) {
  const parsed = parseOracleSemanticsRC3({
    oracleId: testCase.oracleId,
    oracleText: testCase.oracleText,
    cardFace: testCase.cardFace,
  });
  const integrity = verifySemanticParseIntegrity(parsed, testCase.oracleText);
  invalidTotal += parsed.semanticValidation.invalidCount;
  idTotal += integrity.idViolations.length;
  if (parsed.semanticValidation.invalidCount > 0 || integrity.idViolations.length) {
    bad.push({
      id: testCase.id,
      invalidCount: parsed.semanticValidation.invalidCount,
      invalidIssues: parsed.semanticValidation.issues.filter((i) => i.severity === "invalid"),
      idViolations: integrity.idViolations,
    });
  }
}

console.log(JSON.stringify({ invalidTotal, idTotal, badCount: bad.length, bad }, null, 2));
