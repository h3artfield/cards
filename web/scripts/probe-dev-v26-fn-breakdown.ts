/**
 * Classify dev v26 accepted-tier false negatives with mutually exclusive failure modes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import {
  evidenceMatchesExtracted,
  evidenceMatchesOracle,
  inferSupportedPrimitiveFromEvidence,
  spanValid,
} from "./oracle-action-eval-shared";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type FnCategory =
  | "parser_missing_grammar"
  | "parser_scope_overblocking"
  | "needs_review_only"
  | "confidence_not_accepted"
  | "matcher/evidence_failure"
  | "duplicate_gold_defect"
  | "independently_proven_gold_defect";

function classifyFn(
  testCase: OracleActionEvalCaseV2,
  exp: OracleActionEvalCaseV2["expectedPrimitiveActions"][number],
  rows: Array<{
    primitive: string | null;
    evidenceText: string;
    reviewStatus: string;
    evidenceStart: number;
    evidenceEnd: number;
  }>,
): { category: FnCategory; detail: string } {
  const candidates = rows.filter((a) => a.primitive === exp.actionType);
  const nr = candidates.filter((a) => a.reviewStatus === "needs_review");
  const accepted = candidates.filter((a) => a.reviewStatus === "accepted");

  if (accepted.some((a) => evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains))) {
    return { category: "matcher/evidence_failure", detail: "accepted emission exists but matcher missed gold" };
  }
  if (nr.some((a) => evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains))) {
    return { category: "needs_review_only", detail: "parser emitted needs_review for matching evidence" };
  }
  if (candidates.length === 0 && !evidenceMatchesOracle(testCase.oracleText, exp.evidenceContains)) {
    return { category: "independently_proven_gold_defect", detail: "gold evidence not in oracle text" };
  }
  if (candidates.length === 0) {
    const oracleSupported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, exp.evidenceContains);
    if (oracleSupported === exp.actionType) {
      return { category: "parser_missing_grammar", detail: "oracle supports primitive; parser abstained" };
    }
    return { category: "parser_scope_overblocking", detail: "parser blocked or role-filtered valid span" };
  }
  if (accepted.length && !accepted.some((a) => evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains))) {
    return { category: "matcher/evidence_failure", detail: "accepted primitive with different evidence span" };
  }
  if (nr.length) {
    const badSpan = nr.find((a) => !spanValid(testCase.oracleText, a.evidenceText, a.evidenceStart, a.evidenceEnd));
    if (badSpan) return { category: "confidence_not_accepted", detail: "invalid evidence span blocked acceptance" };
    return { category: "needs_review_only", detail: "emitted only as needs_review" };
  }
  return { category: "parser_missing_grammar", detail: "no accepted emission for gold primitive" };
}

function main() {
  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };

  const breakdown: Record<FnCategory, number> = {
    parser_missing_grammar: 0,
    parser_scope_overblocking: 0,
    needs_review_only: 0,
    confidence_not_accepted: 0,
    "matcher/evidence_failure": 0,
    duplicate_gold_defect: 0,
    independently_proven_gold_defect: 0,
  };
  const items: Array<Record<string, unknown>> = [];

  for (const testCase of dev.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const rows = raw.actions.map((a) => ({
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      reviewStatus: a.reviewStatus,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      cardFaceId: a.faceId,
      abilityIndex: a.abilityIndex,
    }));
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      cardFaceId: a.faceId,
      abilityIndex: a.abilityIndex,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      optionalEffect: a.optionalEffect,
      optional: a.optional,
      optionalCost: a.optionalCost,
      loyaltyCost: a.loyaltyCost,
      sagaChapterId: a.sagaChapterId,
      modalOptionId: a.modalOptionId,
    }));
    const matched = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: testCase.oracleText });
    const matchedExpected = new Set(matched.matches.filter((m) => m.matched).map((m) => m.expectedIndex));

    for (let ei = 0; ei < expected.length; ei++) {
      if (matchedExpected.has(ei)) continue;
      const exp = expected[ei];
      const { category, detail } = classifyFn(testCase, exp, rows);
      breakdown[category] += 1;
      items.push({
        caseId: testCase.id,
        primitive: exp.actionType,
        goldEvidence: exp.evidenceContains,
        category,
        detail,
        cardName: (testCase as { cardName?: string }).cardName,
      });
    }
  }

  const report = { fnCount: items.length, breakdown, items };
  const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/dev-v26-fn-breakdown-v124.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ fnCount: items.length, breakdown }, null, 2));
}

main();
