/**
 * Granted span detector + classifier metrics with TP/FP/FN counts and error separation.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { detectGrantedRulesSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector";
import { classifyGrantedRulesSpan } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import { findGrantedQuoteContexts } from "../src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction";
import { parseAbilityBlock } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

function metricsFromCounts(tp: number, fp: number, fn: number, tn: number) {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  return { tp, fp, fn, tn, precision, recall };
}

function loadGrantedPositives(): OracleActionEvalCaseV2[] {
  return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  }).cases.filter((c) => (c as { coverageStratum?: string }).coverageStratum === "granted_ability_quote");
}

type NegCase = {
  id: string;
  oracleText: string;
  expectedSpanClass?: string;
  mustNotClassifyAs?: string;
  expectedPositiveSpan?: boolean;
};

function main() {
  const positives = loadGrantedPositives();
  const negatives = (
    JSON.parse(readFileSync("data/oracle-action-eval-rc3-granted-span-negative-v134.json", "utf8")) as {
      cases: NegCase[];
    }
  ).cases.filter((c) => !c.expectedPositiveSpan);

  let detTp = 0;
  let detFp = 0;
  let detFn = 0;
  let detTn = 0;
  let clsTp = 0;
  let clsFp = 0;
  let clsFn = 0;
  let clsTn = 0;
  let downstreamFn = 0;
  let candidateSpans = 0;
  let cardsWithCandidates = 0;

  const isNestedGold = (g: { actionType: string; evidenceContains?: string }) =>
    !/cast from exile|you may cast .*remains exiled|whenever you discard/i.test(g.evidenceContains ?? "");

  for (const testCase of positives) {
    const nestedGold = testCase.expectedPrimitiveActions.filter((g) => !g.negative && isNestedGold(g));
    let cardHadSpan = false;

    for (const face of segmentCardFaces(testCase.oracleText)) {
      for (const ability of segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start)) {
        const spans = detectGrantedRulesSpans(ability.paragraphText);
        candidateSpans += spans.length;
        if (spans.length > 0) cardHadSpan = true;

        for (const gold of nestedGold) {
          const needle = (gold.evidenceContains ?? gold.actionType).toLowerCase().slice(0, 12);
          const spanHit = spans.some((s) => s.innerText.toLowerCase().includes(needle));
          if (spanHit) detTp++;
          else detFn++;
        }

        for (const span of spans) {
          const isGold = nestedGold.some((g) =>
            span.innerText.toLowerCase().includes((g.evidenceContains ?? g.actionType).toLowerCase().slice(0, 12)),
          );
          if (!isGold) detFp++;
        }

        for (const gold of nestedGold) {
          const needle = (gold.evidenceContains ?? gold.actionType).toLowerCase().slice(0, 12);
          const classified = spans
            .filter((s) => s.innerText.toLowerCase().includes(needle))
            .map((s) => classifyGrantedRulesSpan(ability.paragraphText, s));
          const grantedHit = classified.some((c) => c.classification === "granted_rules_ability");
          if (grantedHit) clsTp++;
          else if (classified.length > 0) clsFn++;
          else clsFn++;
        }

        for (const span of spans) {
          const classified = classifyGrantedRulesSpan(ability.paragraphText, span);
          const isGold = nestedGold.some((g) =>
            span.innerText.toLowerCase().includes((g.evidenceContains ?? g.actionType).toLowerCase().slice(0, 12)),
          );
          if (classified.classification === "granted_rules_ability" && !isGold) clsFp++;
        }

        for (const gold of nestedGold) {
          const needle = (gold.evidenceContains ?? gold.actionType).toLowerCase().slice(0, 12);
          const ctx = findGrantedQuoteContexts(ability.paragraphText, "probe").find((c) =>
            c.innerText.toLowerCase().includes(needle),
          );
          if (!ctx) {
            downstreamFn++;
            continue;
          }
          const block = parseAbilityBlock({
            abilityId: ctx.grantedAbilityId,
            paragraphText: ctx.innerText,
            paragraphStart: 0,
          });
          const native = extractClauseNativeActions({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
          const emitted = native.actions.some(
            (a) => a.actionType === gold.actionType && a.evidenceText.toLowerCase().includes(needle),
          );
          if (!emitted && block.clauses.length > 0) downstreamFn++;
        }
      }
    }
    if (cardHadSpan) cardsWithCandidates++;
  }

  for (const neg of negatives) {
    for (const face of segmentCardFaces(neg.oracleText)) {
      for (const ability of segmentAbilities(neg.id, face.faceId, face.text, face.start)) {
        const spans = detectGrantedRulesSpans(ability.paragraphText);
        candidateSpans += spans.length;
        for (const span of spans) {
          const classified = classifyGrantedRulesSpan(ability.paragraphText, span);
          const isGranted = classified.classification === "granted_rules_ability";
          if (neg.mustNotClassifyAs === "granted_rules_ability") {
            if (isGranted) {
              detFp++;
              clsFp++;
            } else {
              detTn++;
              clsTn++;
            }
          }
        }
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    corpus: {
      grantedPositiveCards: positives.length,
      grantedNegativeControls: negatives.length,
      candidateSpanCount: candidateSpans,
      cardsWithCandidateSpans: cardsWithCandidates,
    },
    grantedRulesSpanDetector: metricsFromCounts(detTp, detFp, detFn, detTn),
    grantedRulesClassifier: metricsFromCounts(clsTp, clsFp, clsFn, clsTn),
    downstreamNestedParserErrors: downstreamFn,
    errorSeparationNote:
      "Detector/classifier counts are not identical by construction — compare FP sources separately.",
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "granted-span-metrics-v134.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
