/**
 * Shared Stage A/B/C metrics for granted pipeline evaluation.
 */
import { segmentAbilities, segmentCardFaces } from "../../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { detectGrantedRulesSpans } from "../../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector";
import { classifyGrantedRulesSpan } from "../../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import {
  buildGrantedRulesRegions,
  mapGoldSpansToRegions,
} from "../../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-region";
import { detectQuoteSpans } from "../../src/lib/deck-builder/golden-catalog/oracle-rc3-quote-span-detector";
import { parseOracleSemanticsRC3 } from "../../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { evidenceMatchesExtracted, type ExpectedPrimitiveAction } from "../oracle-action-eval-shared";

export function metricsFromCounts(tp: number, fp: number, fn: number) {
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  return {
    tp,
    fp,
    fn,
    precision,
    precisionLabel: tp + fp > 0 ? `${((tp / (tp + fp)) * 100).toFixed(1)}%` : "N/A",
    recall,
    recallLabel: `${(recall * 100).toFixed(1)}%`,
  };
}

export const isCoPrimaryGold = (g: { actionType: string; evidenceContains?: string }) =>
  /cast from exile|you may cast .*remains exiled|whenever you discard/i.test(g.evidenceContains ?? "");

export function deriveGoldGrantedSpans(paragraph: string, nestedGold: Array<{ evidenceContains?: string }>) {
  const spans: Array<{ localStart: number; localEnd: number; innerText: string; goldKeys: string[] }> = [];
  const quoteSpans = detectQuoteSpans(paragraph);
  const parenRe = /\(([^)]{8,})\)/g;
  const candidates: Array<{ localStart: number; localEnd: number; innerText: string }> = [
    ...quoteSpans.map((q) => ({ localStart: q.localStart, localEnd: q.localEnd, innerText: q.innerText })),
  ];
  let m: RegExpExecArray | null;
  while ((m = parenRe.exec(paragraph)) !== null) {
    candidates.push({ localStart: m.index, localEnd: m.index + m[0].length, innerText: m[1] });
  }
  for (const gold of nestedGold) {
    const needle = (gold.evidenceContains ?? "").toLowerCase();
    if (needle.length < 4) continue;
    const containing = candidates
      .filter((c) => c.innerText.toLowerCase().includes(needle.slice(0, 12)))
      .sort((a, b) => a.localEnd - a.localStart - (b.localEnd - b.localStart));
    if (containing.length === 0) continue;
    const best = containing[0];
    const key = needle.slice(0, 24);
    const existing = spans.find((s) => s.localStart === best.localStart && s.localEnd === best.localEnd);
    if (existing) existing.goldKeys.push(key);
    else spans.push({ ...best, goldKeys: [key] });
  }
  return spans;
}

export function spansOverlap(
  a: { localStart: number; localEnd: number },
  b: { localStart: number; localEnd: number },
): boolean {
  return a.localStart < b.localEnd && b.localStart < a.localEnd;
}

/** Strict primitive identity — no cross-family equivalence. */
export function strictGoldMatchesAction(
  gold: ExpectedPrimitiveAction,
  action: { actionType: string; evidenceText: string },
): boolean {
  return gold.actionType === action.actionType && evidenceMatchesExtracted(action.evidenceText, gold.evidenceContains);
}

export type GrantedCase = {
  id: string;
  oracleId: string;
  oracleText: string;
  cardName?: string;
  expectedPrimitiveActions: ExpectedPrimitiveAction[];
};

export type GrantedPipelineMetrics = {
  stageA_regionDetection: {
    unit: "GrantedRulesRegion";
    candidateRegionCount: number;
    goldAlignedRegionCount: number;
    nonGoldRegionCount: number;
    regionTp: number;
    regionFp: number;
    regionPrecision: number | null;
    regionPrecisionLabel: string;
  };
  stageA_goldSpanCoverage: {
    unit: "gold_ability_span";
    goldAbilitySpanCount: number;
    coveredGoldSpanCount: number;
    missedGoldSpanCount: number;
    coverageRecall: number;
    coverageRecallLabel: string;
  };
  stageB_classifier: {
    unit: "GrantedRulesRegion";
    candidateRegionCount: number;
    goldAlignedRegionCount: number;
    tp: number;
    fp: number;
    fn: number;
    precision: number | null;
    recall: number;
    precisionLabel: string;
    recallLabel: string;
    classifierErrors: Array<Record<string, unknown>>;
  };
  stageC_nestedExtraction: {
    unit: "nested_gold_action_in_classified_region";
    conditionalPool: number;
    tp: number;
    fp: number;
    fn: number;
    precision: number | null;
    recall: number;
    precisionLabel: string;
    recallLabel: string;
    fnAdjudications: Array<Record<string, unknown>>;
  };
  goldSpanToRegionMapping: Array<Record<string, unknown>>;
};

export function evaluateGrantedPipeline(cases: GrantedCase[]): GrantedPipelineMetrics {
  let candidateRegionCount = 0;
  let goldAlignedRegionCount = 0;
  let regionFp = 0;
  let goldSpanCount = 0;
  let coveredGoldSpanCount = 0;

  let stageB_tp = 0;
  let stageB_fp = 0;
  let stageB_fn = 0;
  const classifierErrors: Array<Record<string, unknown>> = [];

  let stageC_tp = 0;
  let stageC_fp = 0;
  let stageC_fn = 0;
  let stageC_pool = 0;
  const stageCFnAdjudications: Array<Record<string, unknown>> = [];
  const goldSpanToRegionMapping: Array<Record<string, unknown>> = [];

  for (const testCase of cases) {
    const nestedGold = testCase.expectedPrimitiveActions.filter((g) => !g.negative && !isCoPrimaryGold(g));

    for (const face of segmentCardFaces(testCase.oracleText)) {
      for (const ability of segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start)) {
        const goldSpans = deriveGoldGrantedSpans(ability.paragraphText, nestedGold);
        const detected = detectGrantedRulesSpans(ability.paragraphText, ability.abilityId);
        const regions = buildGrantedRulesRegions(ability.paragraphText, detected, nestedGold, ability.abilityId);
        candidateRegionCount += regions.length;
        goldSpanCount += goldSpans.length;

        const goldMapping = mapGoldSpansToRegions(goldSpans, regions);
        for (const row of goldMapping) {
          goldSpanToRegionMapping.push({
            caseId: testCase.id,
            cardName: testCase.cardName,
            goldKeys: row.goldSpan.goldKeys,
            goldSpan: { start: row.goldSpan.localStart, end: row.goldSpan.localEnd },
            mappedRegionId: row.region?.regionId ?? null,
            containedAbilitySpanCount: row.region?.containedAbilitySpans.length ?? 0,
          });
          if (row.region) coveredGoldSpanCount++;
        }

        for (const region of regions) {
          const isGoldAligned = goldSpans.some((g) => spansOverlap(g, region.span));
          const classified =
            region.classification ?? classifyGrantedRulesSpan(ability.paragraphText, region.span).classification;
          const isGranted = classified === "granted_rules_ability";

          if (!isGoldAligned) {
            regionFp++;
            if (isGranted) stageB_fp++;
            continue;
          }

          goldAlignedRegionCount++;
          if (isGranted) stageB_tp++;
          else {
            stageB_fn++;
            classifierErrors.push({
              caseId: testCase.id,
              regionId: region.regionId,
              classification: classified,
              innerText: region.span.innerText.slice(0, 80),
            });
          }

          if (!isGranted) continue;

          const relevantGold = nestedGold.filter((g) => {
            const needle = (g.evidenceContains ?? g.actionType).toLowerCase();
            if (needle.length < 4) return false;
            if (!region.span.innerText.toLowerCase().includes(needle.slice(0, 12))) return false;
            if (g.actionType === "cast" && /can't be spent to cast/i.test(region.span.innerText)) return false;
            return true;
          });
          stageC_pool += relevantGold.length;

          const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
          const spanNeedle = region.span.innerText.toLowerCase();
          const spanActionsRaw = parsed.actions
            .filter((a) => a.reviewStatus === "accepted")
            .map((a) => ({
              actionType: a.actionType,
              evidenceText: a.provenance.actionSpan.text,
            }))
            .filter((a) =>
              spanNeedle.includes(a.evidenceText.toLowerCase().slice(0, Math.min(12, a.evidenceText.length))),
            );
          const spanActions: typeof spanActionsRaw = [];
          for (const action of spanActionsRaw) {
            if (spanActions.some((s) => s.actionType === action.actionType && s.evidenceText === action.evidenceText)) {
              continue;
            }
            spanActions.push(action);
          }

          const costOnlyUnlessGold = new Set(["sacrifice", "discard", "exile", "tap"]);

          for (const gold of relevantGold) {
            const hit = spanActions.some((a) => strictGoldMatchesAction(gold, a));
            if (hit) stageC_tp++;
            else {
              stageC_fn++;
              stageCFnAdjudications.push({
                caseId: testCase.id,
                cardName: testCase.cardName,
                goldActionType: gold.actionType,
                goldEvidence: gold.evidenceContains,
                emittedActions: spanActions,
                adjudication:
                  spanActions.length === 0 ? "primitive_extraction" : "argument_or_evidence_mismatch",
              });
            }
          }

          for (const action of spanActions) {
            if (
              costOnlyUnlessGold.has(action.actionType) &&
              !relevantGold.some((g) => g.actionType === action.actionType)
            ) {
              continue;
            }
            const matchedGold = relevantGold.some((g) => strictGoldMatchesAction(g, action));
            if (!matchedGold) stageC_fp++;
          }
        }
      }
    }
  }

  const regionTp = goldAlignedRegionCount;
  const regionPrecision = regionTp + regionFp > 0 ? regionTp / (regionTp + regionFp) : null;
  const stageB = metricsFromCounts(stageB_tp, stageB_fp, stageB_fn);
  const stageC = metricsFromCounts(stageC_tp, stageC_fp, stageC_fn);

  return {
    stageA_regionDetection: {
      unit: "GrantedRulesRegion",
      candidateRegionCount,
      goldAlignedRegionCount,
      nonGoldRegionCount: regionFp,
      regionTp,
      regionFp,
      regionPrecision,
      regionPrecisionLabel: regionPrecision !== null ? `${(regionPrecision * 100).toFixed(1)}%` : "N/A",
    },
    stageA_goldSpanCoverage: {
      unit: "gold_ability_span",
      goldAbilitySpanCount: goldSpanCount,
      coveredGoldSpanCount,
      missedGoldSpanCount: goldSpanCount - coveredGoldSpanCount,
      coverageRecall: goldSpanCount > 0 ? coveredGoldSpanCount / goldSpanCount : 1,
      coverageRecallLabel: `${((goldSpanCount > 0 ? coveredGoldSpanCount / goldSpanCount : 1) * 100).toFixed(1)}%`,
    },
    stageB_classifier: {
      unit: "GrantedRulesRegion",
      candidateRegionCount,
      goldAlignedRegionCount,
      ...stageB,
      classifierErrors,
    },
    stageC_nestedExtraction: {
      unit: "nested_gold_action_in_classified_region",
      conditionalPool: stageC_pool,
      ...stageC,
      fnAdjudications: stageCFnAdjudications,
    },
    goldSpanToRegionMapping,
  };
}

export function evaluateExpansionGrantedPipeline(
  cases: Array<
    GrantedCase & {
      expansionLabel?: string;
      expectedGrantedRegionCount?: number;
    }
  >,
) {
  let positiveRegions = 0;
  let positiveGrantedClassified = 0;
  let negativeFp = 0;
  let negativeTotal = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const testCase of cases) {
    let detectedGranted = 0;
    let classifiedGranted = 0;
    for (const face of segmentCardFaces(testCase.oracleText)) {
      for (const ability of segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start)) {
        const detected = detectGrantedRulesSpans(ability.paragraphText, ability.abilityId);
        const regions = buildGrantedRulesRegions(ability.paragraphText, detected, [], ability.abilityId);
        for (const region of regions) {
          detectedGranted++;
          const cls =
            region.classification ?? classifyGrantedRulesSpan(ability.paragraphText, region.span).classification;
          if (cls === "granted_rules_ability") classifiedGranted++;
        }
      }
    }

    const isPositive = testCase.expansionLabel === "positive_granted_region";
    if (isPositive) {
      positiveRegions += detectedGranted;
      positiveGrantedClassified += classifiedGranted;
    } else {
      negativeTotal++;
      if (classifiedGranted > 0) negativeFp += classifiedGranted;
    }

    details.push({
      caseId: testCase.id,
      cardName: testCase.cardName,
      label: testCase.expansionLabel,
      detectedRegions: detectedGranted,
      classifiedGrantedRegions: classifiedGranted,
      expectedGrantedRegionCount: testCase.expectedGrantedRegionCount ?? null,
    });
  }

  const positiveCount = cases.filter((c) => c.expansionLabel === "positive_granted_region").length;
  return {
    caseCount: cases.length,
    positiveCases: positiveCount,
    negativeCases: negativeTotal,
    positiveRegionsDetected: positiveRegions,
    positiveRegionsClassifiedGranted: positiveGrantedClassified,
    negativeFalsePositiveRegions: negativeFp,
    details,
  };
}
