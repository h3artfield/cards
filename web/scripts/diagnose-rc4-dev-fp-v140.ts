/**
 * Diagnose combined development FPs after RC4 gold scrub.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { matchGoldToSemanticActions, semanticActionsForMatch } from "./oracle-action-semantic-matcher";
import { countParserFalsePositives, type ExtractedActionForMatch } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const PATHS = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
];

function loadCases(): OracleActionEvalCaseV2[] {
  return PATHS.flatMap((p) =>
    applyGoldMigrationV135(
      (JSON.parse(readFileSync(resolve(p), "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
    ),
  );
}

function main() {
  const fps: Array<Record<string, unknown>> = [];
  const fns: Array<Record<string, unknown>> = [];

  for (const testCase of loadCases()) {
    const parse = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: testCase.oracleText,
      caseId: testCase.id,
    });
    const actions = semanticActionsForMatch(parse);

    const extractedForFp = actions.map((a) => ({
      index: a.index,
      primitive: a.actionType,
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      cardFaceId: a.faceId,
      abilityIndex: a.segmentAbilityIndex,
      loyaltyCost: a.loyaltyCost,
      modalOptionId: a.modalOptionKey,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      optionalEffect: a.optionalEffect,
      optional: a.optionalEffect,
      optionalCost: a.optionalCost,
      cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
      cardStart: a.evidenceStart,
      cardEnd: a.evidenceEnd,
    })) as ExtractedActionForMatch[];

    for (const idx of matched.unmatchedActionIndices) {
      const action = actions[idx];
      if (!action || action.reviewStatus !== "accepted") continue;
      if (countParserFalsePositives(testCase, [idx], extractedForFp) === 0) continue;
      fps.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        actionType: action.actionType,
        evidence: action.evidenceText,
        forbidden: testCase.forbiddenPrimitiveActions ?? [],
      });
    }

    for (const expectedIndex of matched.unmatchedExpectedIndices) {
      const gold = expected[expectedIndex];
      if (!gold) continue;
      fns.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains,
      });
    }
  }

  const out = { fpCount: fps.length, fnCount: fns.length, fps, fns };
  writeFileSync(resolve("data/milestones/rc4-development/rc4-dev-fp-fn-diagnosis-v140.json"), `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ fpCount: fps.length, fnCount: fns.length, fps: fps.slice(0, 15), fns: fns.slice(0, 15) }, null, 2));
}

main();
