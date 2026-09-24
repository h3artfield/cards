/**
 * expansion-v4 accepted emission accounting — every accepted record gets a disposition.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import { classifyUnmatchedAction } from "./oracle-action-eval-shared";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

async function main() {
  const envelope = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v4.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[]; contentHash: string };

  const records: Array<Record<string, unknown>> = [];
  let tp = 0;
  let fp = 0;
  let unscoredAccepted = 0;

  for (const testCase of envelope.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const unified = evaluateCaseUnified(
      testCase,
      raw.actions.map((a) => ({
        actionType: a.actionType,
        evidenceText: a.evidenceText,
        evidenceStart: a.evidenceStart,
        evidenceEnd: a.evidenceEnd,
        faceId: a.faceId,
        abilityIndex: a.abilityIndex,
        loyaltyCost: a.loyaltyCost,
        sagaChapterId: a.sagaChapterId,
        modalOptionId: a.modalOptionId,
        reviewStatus: a.reviewStatus,
        optionalEffect: a.optionalEffect,
        optional: a.optional,
      })),
    );

    const matchedActionIndices = new Set<number>();
    // Re-run matching to find which actions matched gold (approximation via unified tp)
    const acceptedActions = raw.actions
      .map((a, index) => ({ a, index }))
      .filter(({ a }) => a.reviewStatus === "accepted");

    for (const { a, index } of acceptedActions) {
      const primitive = normalizeToPrimitive(a.actionType, a.evidenceText);
      let disposition: string = "unscored_accepted";
      let reason = "";

      // Check if matches any gold
      const goldHit = expected.some(
        (e) =>
          e.actionType === primitive &&
          a.evidenceText.toLowerCase().includes(e.evidenceContains.toLowerCase().slice(0, 20)),
      );

      const forbidden = testCase.forbiddenPrimitiveActions ?? [];
      if (forbidden.includes(primitive as never)) {
        disposition = "fp_forbidden_primitive";
        fp++;
      } else if (goldHit) {
        disposition = "tp_matched_gold";
        tp++;
      } else {
        const category = classifyUnmatchedAction({
          testCase,
          primitive,
          evidenceText: a.evidenceText,
          evidenceStart: a.evidenceStart,
          evidenceEnd: a.evidenceEnd,
          cardFaceId: a.faceId,
          abilityIndex: a.abilityIndex,
          optionalEffect: a.optionalEffect,
          optional: a.optional,
        });
        if (category === "parser_false_positive") {
          disposition = "fp_parser_false_positive";
          fp++;
        } else if (category === "correct_action_missing_from_gold_labels") {
          disposition = "excluded_missing_gold_label";
          unscoredAccepted++;
          reason = "Legitimate oracle action not in gold sample; excluded from precision denominator until gold scope clarified";
        } else if (category === "genuinely_unsupported_extraction") {
          disposition = "excluded_unsupported";
          unscoredAccepted++;
        } else {
          disposition = `excluded_${category}`;
          unscoredAccepted++;
          reason = category;
        }
      }

      records.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        disposition,
        reason,
        primitive,
        evidence: a.evidenceText.slice(0, 80),
        modalOptionId: a.modalOptionId,
        loyaltyCost: a.loyaltyCost,
      });
      matchedActionIndices.add(index);
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
      precisionFormula: "TP / (TP + FP) on scored Layer-2 emissions only",
      precision: tp + fp > 0 ? tp / (tp + fp) : 1,
      note: "Unified matcher TP+FP may differ slightly from per-emission walk; use matcher totals as authoritative for gates",
    },
    matcherAuthoritative: (() => {
      let mtp = 0;
      let mfp = 0;
      for (const c of envelope.cases) {
        const raw = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
        const u = evaluateCaseUnified(
          c,
          raw.actions.map((a) => ({
            actionType: a.actionType,
            evidenceText: a.evidenceText,
            evidenceStart: a.evidenceStart,
            evidenceEnd: a.evidenceEnd,
            faceId: a.faceId,
            abilityIndex: a.abilityIndex,
            loyaltyCost: a.loyaltyCost,
            sagaChapterId: a.sagaChapterId,
            modalOptionId: a.modalOptionId,
            reviewStatus: a.reviewStatus,
            optionalEffect: a.optionalEffect,
            optional: a.optional,
          })),
        );
        mtp += u.accepted.tp;
        mfp += u.accepted.fp;
      }
      return { tp: mtp, fp: mfp, scoredLayer2Emissions: mtp + mfp };
    })(),
    records,
  };

  const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/expansion-v4-emission-accounting-v127.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.accounting, null, 2));
  console.log(JSON.stringify(report.matcherAuthoritative, null, 2));
}

main();
