/**
 * Classify remaining activated_post_colon_effect FNs after default promotion.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import { parseAbilityBlock } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { matchGoldToSemanticActions } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Stage =
  | "activated_block_not_recognized"
  | "colon_boundary_incorrect"
  | "cost_effect_region_incorrect"
  | "effect_clause_not_segmented"
  | "clause_role_incorrect"
  | "ordinary_primitive_missing"
  | "referent_argument_failure"
  | "evaluator_mismatch";

function loadActivated(): OracleActionEvalCaseV2[] {
  return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  }).cases.filter((c) => (c as { coverageStratum?: string }).coverageStratum === "activated_post_colon_effect");
}

function classifyStage(testCase: OracleActionEvalCaseV2, gold: { actionType: string; evidenceContains?: string }): Stage {
  const needle = (gold.evidenceContains ?? gold.actionType).toLowerCase();
  const native = extractClauseNativeActions({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
  const activated = native.activatedAbilities;
  if (activated.length === 0) return "activated_block_not_recognized";

  const block = activated.find((a) => a.effectRegion.text.toLowerCase().includes(needle.slice(0, 12)));
  if (!block) return "cost_effect_region_incorrect";

  for (const face of segmentCardFaces(testCase.oracleText)) {
    for (const ability of segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start)) {
      const parsed = parseAbilityBlock({
        abilityId: `${testCase.oracleId}:probe`,
        paragraphText: ability.paragraphText,
        paragraphStart: ability.paragraphStart,
      });
      const clauseHit = parsed.clauses.some((c) => c.text.toLowerCase().includes(needle.slice(0, 12)));
      if (!clauseHit && parsed.effectRegion) return "effect_clause_not_segmented";
      const roleHit = parsed.clauses.find((c) => c.text.toLowerCase().includes(needle.slice(0, 12)));
      if (roleHit && roleHit.role !== "effect" && roleHit.role !== "replacement_effect") return "clause_role_incorrect";
    }
  }

  const shadow = native.actions.some(
    (a) => a.actionType === gold.actionType && a.evidenceText.toLowerCase().includes(needle.slice(0, 12)),
  );
  if (shadow) return "evaluator_mismatch";
  return "ordinary_primitive_missing";
}

function main() {
  resetRC3PromotedFamiliesToDefault();
  const cases = loadActivated();
  const stageCounts: Record<Stage, number> = {
    activated_block_not_recognized: 0,
    colon_boundary_incorrect: 0,
    cost_effect_region_incorrect: 0,
    effect_clause_not_segmented: 0,
    clause_role_incorrect: 0,
    ordinary_primitive_missing: 0,
    referent_argument_failure: 0,
    evaluator_mismatch: 0,
  };
  const rows: Array<{ caseId: string; goldAction: string; stage: Stage }> = [];

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
    const expected = testCase.expectedPrimitiveActions.filter((g) => !g.negative);
    const acceptedOnly = matchGoldToSemanticActions({ expected, parse: parsed, tier: "accepted", oracleText: testCase.oracleText });
    for (const match of acceptedOnly.matches.filter((m) => !m.matched)) {
      const gold = expected[match.expectedIndex]!;
      const stage = classifyStage(testCase, gold);
      stageCounts[stage]++;
      rows.push({ caseId: testCase.id, goldAction: `${gold.actionType}:${gold.evidenceContains ?? ""}`, stage });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    family: "activated_post_colon_effect",
    promotionState: "default_promoted",
    remainingFnCount: rows.length,
    failureStageCounts: stageCounts,
    rows,
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "activated-fn-stage-breakdown-v134.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
