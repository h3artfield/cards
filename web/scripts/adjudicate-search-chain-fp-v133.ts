/**
 * Adjudicate the +1 FP from search_put_shuffle_chain clause-native promotion experiment.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { clearRC3PromotedFamilies, setRC3PromotedFamilies } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { evaluateCaseSemantic, semanticActionsForMatch } from "./oracle-action-semantic-matcher";
import { countParserFalsePositives } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

function loadCatalog(): OracleActionEvalCaseV2[] {
  return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  }).cases.filter((c) => (c as { coverageStratum?: string }).coverageStratum === "search_put_shuffle_chain");
}

function main() {
  const cases = loadCatalog();
  clearRC3PromotedFamilies();
  const beforeFps: Array<{ caseId: string; actionType: string; evidence: string }> = [];
  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
    const metrics = evaluateCaseSemantic(testCase, parsed);
    const actions = semanticActionsForMatch(parsed);
    const unmatched = actions.filter((_, i) => !testCase.expectedPrimitiveActions.some((g) => !g.negative && g.actionType === actions[i]?.actionType));
    if (metrics.accepted.fp > 0) {
      for (const a of actions) {
        const isGold = testCase.expectedPrimitiveActions.some(
          (g) => !g.negative && g.actionType === a.actionType && a.evidenceText.includes(g.evidenceContains?.slice(0, 8) ?? "___"),
        );
        if (!isGold && a.reviewStatus === "accepted") {
          beforeFps.push({ caseId: testCase.id, actionType: a.actionType, evidence: a.evidenceText });
        }
      }
    }
  }

  setRC3PromotedFamilies(["search_put_shuffle_chain"]);
  const newFps: Array<{ caseId: string; actionType: string; evidence: string; cardName?: string; classification?: string }> = [];
  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
    const before = evaluateCaseSemantic(testCase, parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText }));
    clearRC3PromotedFamilies();
    const baseline = evaluateCaseSemantic(
      testCase,
      parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText }),
    );
    setRC3PromotedFamilies(["search_put_shuffle_chain"]);
    const promoted = evaluateCaseSemantic(testCase, parsed);
    if (promoted.accepted.fp <= baseline.accepted.fp) continue;

    const actions = semanticActionsForMatch(parsed);
    const extractedForFp = actions.map((a) => ({
      index: a.index,
      primitive: a.actionType,
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      cardFaceId: a.faceId,
      abilityIndex: a.segmentAbilityIndex,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
    }));
    const fpIndices = actions.map((_, i) => i).filter((i) => {
      const a = actions[i]!;
      return !testCase.expectedPrimitiveActions.some(
        (g) => !g.negative && g.actionType === a.actionType && a.evidenceText.toLowerCase().includes((g.evidenceContains ?? "").toLowerCase().slice(0, 8)),
      );
    });
    const added = fpIndices.filter((i) => promoted.accepted.fp > baseline.accepted.fp);
    for (const i of added) {
      const a = actions[i]!;
      let classification = "outside_explicit_caseScope";
      if (/^search.*put.*hand/is.test(a.evidenceText)) classification = "actual_chain_over_extraction";
      else if (a.actionType === "put_into_hand" && /search your library/i.test(a.evidenceText)) classification = "wrong_referent";
      else if (/duplicate/i.test(a.evidenceText)) classification = "duplicate_action";
      else if (a.actionType === "put_into_hand") classification = "missing_gold_or_wrong_primitive";
      newFps.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        actionType: a.actionType,
        evidence: a.evidenceText,
        classification,
      });
    }
  }
  clearRC3PromotedFamilies();

  const addedOnly = newFps.filter(
    (fp) => !beforeFps.some((b) => b.caseId === fp.caseId && b.evidence === fp.evidence),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    family: "search_put_shuffle_chain",
    promotionExperimentFpDelta: addedOnly.length,
    adjudication: addedOnly.map((fp) => ({
      ...fp,
      verdict: fp.classification === "missing_gold" ? "investigate_gold" : "parser_shadow_reject",
      keepInShadowMode: true,
    })),
    note: "Promotion remains in shadow until FP=0 on catalog slice with net recall gain.",
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "search-chain-fp-adjudication-v133.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
