/**
 * RC8-0 — audit accepted v1_legacy promotions for span containment.
 * Run: cd web && npx tsx scripts/audit-rc8-v1-legacy-containment-v1.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { countAcceptedActionOutsideOwnerSpan } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const DEV_PATHS = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
];

const OUT_DIR = "data/milestones/rc8-development";
const OUT_PATH = `${OUT_DIR}/rc8-v1-legacy-containment-audit-v1.json`;

function loadCases(path: string): OracleActionEvalCaseV2[] {
  return applyGoldMigrationV135(
    (JSON.parse(readFileSync(path, "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
  );
}

function main() {
  const cases = DEV_PATHS.flatMap(loadCases);
  const legacyAccepted: Array<Record<string, unknown>> = [];
  let outsideOwner = 0;

  for (const testCase of cases) {
    const parse = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    outsideOwner += countAcceptedActionOutsideOwnerSpan(parse);

    for (const action of parse.actions.filter((a) => a.reviewStatus === "accepted" && a.extractionSource === "v1_legacy")) {
      const owner = parse.abilities.find((a) => a.abilityId === action.parentAbilityId);
      const span = action.provenance.actionSpan;
      const contained =
        owner &&
        span.cardStart >= owner.abilitySpan.cardStart &&
        span.cardEnd <= owner.abilitySpan.cardEnd;
      if (!contained) {
        legacyAccepted.push({
          caseId: testCase.id,
          cardName: testCase.cardName,
          actionType: action.actionType,
          parentAbilityId: action.parentAbilityId,
          evidence: span.text.slice(0, 80),
          evidenceSpan: [span.cardStart, span.cardEnd],
          ownerSpan: owner ? [owner.abilitySpan.cardStart, owner.abilitySpan.cardEnd] : null,
        });
      }
    }
  }

  const report = {
    artifactType: "V1LegacyContainmentAudit",
    version: "rc8-v1-legacy-containment-audit-v1",
    corpusCaseCount: cases.length,
    acceptedActionOutsideOwnerSpanCount: outsideOwner,
    acceptedV1LegacyOutsideOwnerCount: legacyAccepted.length,
    violations: legacyAccepted,
    pass: outsideOwner === 0 && legacyAccepted.length === 0,
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  writeFileSync(resolve(OUT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
