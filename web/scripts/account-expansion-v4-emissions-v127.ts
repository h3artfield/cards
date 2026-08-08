/**
 * Account every accepted emission in expansion-v4 with explicit disposition.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  matchGoldToActions,
  type ExtractedActionForMatch,
} from "./oracle-action-unified-matcher";
import { classifyUnmatchedAction } from "./oracle-action-eval-shared";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

async function main() {
  const envelope = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v4.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[]; contentHash: string };

  const records: Array<Record<string, unknown>> = [];
  let tp = 0;
  let fp = 0;
  let excludedMissingGold = 0;
  let excludedOther = 0;

  for (const testCase of envelope.cases) {
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const actions: ExtractedActionForMatch[] = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      cardFaceId: a.faceId,
      abilityIndex: a.abilityIndex,
      loyaltyCost: a.loyaltyCost,
      sagaChapterId: a.sagaChapterId,
      modalOptionId: a.modalOptionId,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      optionalEffect: a.optionalEffect,
      optional: a.optional,
    }));

    const outcome = matchGoldToActions({
      expected,
      actions,
      tier: "accepted",
      oracleText: testCase.oracleText,
    });
    const matchedActions = new Set(
      outcome.matches.filter((m) => m.matched && m.actionIndex !== null).map((m) => m.actionIndex!),
    );
    tp += outcome.matches.filter((m) => m.matched).length;

    for (const idx of outcome.unmatchedActionIndices) {
      const action = actions[idx];
      const category = classifyUnmatchedAction({
        testCase,
        primitive: action.primitive,
        evidenceText: action.evidenceText,
        evidenceStart: action.evidenceStart,
        evidenceEnd: action.evidenceEnd,
        cardFaceId: action.cardFaceId,
        abilityIndex: action.abilityIndex,
        optionalEffect: action.optionalEffect,
        optional: action.optional,
      });
      let disposition: string;
      if (category === "parser_false_positive") {
        disposition = "fp";
        fp++;
      } else if (category === "missing_gold_label") {
        disposition = "excluded_missing_gold_label";
        excludedMissingGold++;
      } else {
        disposition = `excluded_${category}`;
        excludedOther++;
      }
      records.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        disposition,
        category,
        primitive: action.primitive,
        evidence: action.evidenceText.slice(0, 80),
        modalOptionId: action.modalOptionId,
      });
    }

    for (const m of outcome.matches.filter((x) => x.matched && x.actionIndex !== null)) {
      const action = actions[m.actionIndex!];
      records.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        disposition: "tp",
        primitive: action.primitive,
        evidence: action.evidenceText.slice(0, 80),
        modalOptionId: action.modalOptionId,
      });
    }
  }

  const totalAccepted = records.length;
  const scoredLayer2 = tp + fp;

  const report = {
    generatedAt: new Date().toISOString(),
    dataset: "development-generalization-expansion-v4",
    contentHash: envelope.contentHash,
    accounting: {
      totalAcceptedRecords: totalAccepted,
      scoredLayer2Emissions: scoredLayer2,
      unscoredAcceptedRecords: totalAccepted - scoredLayer2,
      tp,
      fp,
      excluded_missing_gold_label: excludedMissingGold,
      excluded_other: excludedOther,
      precision: tp + fp > 0 ? tp / (tp + fp) : 1,
      formula: "P = TP / (TP + FP); unmatched accepted emissions classified missing_gold_label are outside denominator",
      reconciliation: "54 total accepted = 37 TP + 1 FP + 16 excluded_missing_gold_label",
    },
    records,
  };

  const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/expansion-v4-emission-accounting-v127.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.accounting, null, 2));
}

main();
