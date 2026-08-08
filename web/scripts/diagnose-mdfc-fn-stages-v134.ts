/**
 * MDFC/transform unrelated FN structural breakdown.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import { evaluateCaseSemantic, matchGoldToSemanticActions } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Stage =
  | "transform_in_place"
  | "enter_transformed"
  | "exile_return_transformed"
  | "card_face_referent_failure"
  | "zone_transition_failure"
  | "ordinary_primitive_missing";

function loadUnrelatedMdfc(): OracleActionEvalCaseV2[] {
  return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  }).cases.filter(
    (c) =>
      (c as { coverageStratum?: string }).coverageStratum === "mdfc_transform_zone_transition" &&
      !(c as { spentV12Regression?: boolean }).spentV12Regression,
  );
}

function classifyFn(testCase: OracleActionEvalCaseV2, gold: { actionType: string; evidenceContains?: string }): Stage {
  const needle = (gold.evidenceContains ?? gold.actionType).toLowerCase();
  const text = testCase.oracleText.toLowerCase();
  const native = extractClauseNativeActions({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });

  if (/\btransform\b/.test(needle) && !/\bexile\b/.test(needle) && /\btransform\b/.test(text) && !native.transformTransitions.some((t) => t.mode === "transform_in_place")) {
    return "transform_in_place";
  }
  if (/onto the battlefield transformed|enters transformed/.test(needle)) return "enter_transformed";
  if (/exile.*return.*transformed|return it transformed/.test(needle) || /exile.*return.*transformed/.test(text)) {
    return "exile_return_transformed";
  }
  if (/face|front|back|daybound|nightbound/.test(needle)) return "card_face_referent_failure";
  if (/exile|battlefield|graveyard|hand|library/.test(needle) && gold.actionType !== "transform") {
    return "zone_transition_failure";
  }
  return "ordinary_primitive_missing";
}

function main() {
  const cases = loadUnrelatedMdfc();
  const stageCounts: Record<Stage, number> = {
    transform_in_place: 0,
    enter_transformed: 0,
    exile_return_transformed: 0,
    card_face_referent_failure: 0,
    zone_transition_failure: 0,
    ordinary_primitive_missing: 0,
  };
  const rows: Array<{ caseId: string; goldAction: string; stage: Stage }> = [];

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
    const expected = testCase.expectedPrimitiveActions.filter((g) => !g.negative);
    const acceptedOnly = matchGoldToSemanticActions({ expected, parse: parsed, tier: "accepted", oracleText: testCase.oracleText });
    for (const match of acceptedOnly.matches.filter((m) => !m.matched)) {
      const gold = expected[match.expectedIndex]!;
      const stage = classifyFn(testCase, gold);
      stageCounts[stage]++;
      rows.push({ caseId: testCase.id, goldAction: `${gold.actionType}:${gold.evidenceContains ?? ""}`, stage });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    family: "mdfc_transform_zone_transition",
    unrelatedCaseCount: cases.length,
    unrelatedFnCount: rows.length,
    failureStageCounts: stageCounts,
    rows,
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "mdfc-fn-stage-breakdown-v134.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
