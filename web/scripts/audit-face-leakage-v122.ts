/**
 * Audit face-leakage heuristic hits on combined development corpus.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type LeakageClassification =
  | "true_cross_face_leakage"
  | "legitimate_full_card_shared_text"
  | "face_alias_mismatch"
  | "evaluator_heuristic_false_positive"
  | "granted_reminder_subtext_confusion";

function expectedFaceForPrimitive(
  testCase: OracleActionEvalCaseV2,
  primitive: string,
): string | undefined {
  const gold = testCase.expectedPrimitiveActions.filter((e) => !e.negative && e.actionType === primitive);
  const faces = [...new Set(gold.map((g) => g.cardFace).filter(Boolean))];
  if (faces.length === 1) return faces[0];
  if (testCase.cardFace) return testCase.cardFace;
  return undefined;
}

function classifyHit(input: {
  testCase: OracleActionEvalCaseV2;
  assignedFace?: string;
  expectedFace?: string;
  evidence: string;
  role?: string;
}): { trueLeakage: boolean; classification: LeakageClassification; reason: string } {
  const { testCase, assignedFace, expectedFace, evidence, role } = input;
  if (role === "reminder_text" || role === "mechanic_reminder" || role === "granted_ability") {
    return {
      trueLeakage: false,
      classification: "granted_reminder_subtext_confusion",
      reason: "Emission tagged as reminder/granted subtext, not cross-face primitive",
    };
  }
  if (!testCase.cardFace && !expectedFace && testCase.oracleText.includes("\n//\n")) {
    return {
      trueLeakage: false,
      classification: "legitimate_full_card_shared_text",
      reason: "Multiface card evaluated at full-card scope without per-face gold",
    };
  }
  if (expectedFace && assignedFace && expectedFace !== assignedFace) {
    const alias =
      (expectedFace === "front" && assignedFace === "mdfc_front") ||
      (expectedFace === "back" && assignedFace === "mdfc_back");
    if (alias) {
      return {
        trueLeakage: false,
        classification: "face_alias_mismatch",
        reason: `Gold face ${expectedFace} vs parser faceId ${assignedFace}`,
      };
    }
    return {
      trueLeakage: true,
      classification: "true_cross_face_leakage",
      reason: `Expected ${expectedFace}, assigned ${assignedFace}`,
    };
  }
  if (!expectedFace && testCase.cardFace && assignedFace && testCase.cardFace !== assignedFace) {
    return {
      trueLeakage: true,
      classification: "true_cross_face_leakage",
      reason: "Case scoped to one face but emission assigned elsewhere",
    };
  }
  const faceCorpus = testCase.cardFace
    ? testCase.oracleText.split("\n//\n")[testCase.cardFace === "back" ? 1 : 0] ?? testCase.oracleText
    : testCase.oracleText;
  if (faceCorpus.includes(evidence)) {
    return {
      trueLeakage: false,
      classification: "evaluator_heuristic_false_positive",
      reason: "Evidence present on expected face corpus; heuristic counted unmatched FP only",
    };
  }
  return {
    trueLeakage: false,
    classification: "evaluator_heuristic_false_positive",
    reason: "Unmatched accepted FP without cross-face evidence mismatch",
  };
}

function loadCombined(): OracleActionEvalCaseV2[] {
  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v25.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const exp = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v1.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const training = exp.cases.filter(
    (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
  );
  return [...dev.cases, ...training];
}

function main() {
  const cases = loadCombined();
  const hits: Array<Record<string, unknown>> = [];

  for (const testCase of cases) {
    if (!testCase.cardFace && !testCase.oracleText.includes("\n//\n")) continue;
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      textRole: a.textRole,
      faceId: a.faceId,
    }));
    const m = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: testCase.oracleText });
    for (const idx of m.unmatchedActionIndices) {
      const a = actions[idx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      if (!testCase.cardFace && !testCase.oracleText.includes("\n//\n")) continue;
      const expectedFace = expectedFaceForPrimitive(testCase, a.primitive);
      const { trueLeakage, classification, reason } = classifyHit({
        testCase,
        assignedFace: a.faceId,
        expectedFace,
        evidence: a.evidenceText,
        role: a.textRole,
      });
      hits.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        layout: testCase.layout,
        sourceFace: testCase.cardFace ?? "full_card",
        emittedAction: a.primitive,
        evidenceSpan: a.evidenceText,
        assignedFace: a.faceId,
        expectedFace: expectedFace ?? testCase.cardFace ?? null,
        trueLeakage,
        classification,
        reason,
      });
    }
  }

  const summary = {
    totalHeuristicHits: hits.length,
    trueCrossFaceLeakage: hits.filter((h) => h.trueLeakage).length,
    byClassification: hits.reduce(
      (acc, h) => {
        const k = h.classification as string;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    hits,
  };

  const outDir = resolve(process.cwd(), "data/milestones/rc2-development-planning");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "face-leakage-audit-v122.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        totalHeuristicHits: summary.totalHeuristicHits,
        trueCrossFaceLeakage: summary.trueCrossFaceLeakage,
        byClassification: summary.byClassification,
      },
      null,
      2,
    ),
  );
}

main();
