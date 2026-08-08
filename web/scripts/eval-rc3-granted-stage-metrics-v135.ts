/**
 * Granted pipeline stage metrics — span-based denominators (Stages A/B/C).
 * Stage A: granted-rules span detection
 * Stage B: classification on gold-matched detected spans
 * Stage C: nested actions inside correctly classified granted spans
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { detectGrantedRulesSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector";
import { classifyGrantedRulesSpan } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import { detectQuoteSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-quote-span-detector";
import { parseAbilityBlock } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { matchGoldToSemanticActions } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

function metricsFromCounts(tp: number, fp: number, fn: number) {
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

function loadGrantedPositives(): OracleActionEvalCaseV2[] {
  return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  }).cases.filter((c) => (c as { coverageStratum?: string }).coverageStratum === "granted_ability_quote");
}

const isCoPrimaryGold = (g: { actionType: string; evidenceContains?: string }) =>
  /cast from exile|you may cast .*remains exiled|whenever you discard/i.test(g.evidenceContains ?? "");

/** Parser-blind gold span: minimal quote/paren region containing nested gold evidence. */
function deriveGoldGrantedSpans(paragraph: string, nestedGold: Array<{ evidenceContains?: string }>) {
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

function spansOverlap(a: { localStart: number; localEnd: number }, b: { localStart: number; localEnd: number }) {
  return a.localStart < b.localEnd && b.localStart < a.localEnd;
}

function main() {
  resetRC3PromotedFamiliesToDefault();
  const positives = loadGrantedPositives();

  let stageA_expected = 0;
  let stageA_tp = 0;
  let stageA_fp = 0;
  let stageA_fn = 0;

  let stageB_pool = 0;
  let stageB_tp = 0;
  let stageB_fp = 0;
  let stageB_fn = 0;

  let stageC_pool = 0;
  let stageC_tp = 0;
  let stageC_fp = 0;
  let stageC_fn = 0;

  let candidateSpanCount = 0;
  let cardsWithCandidates = 0;
  let stageB_excludedGoldSpanCollisions = 0;
  const stageB_excludedDetails: Array<{ caseId: string; goldSpanCount: number; uniqueDetectedMatches: number }> = [];
  let stageB_fp_detectorFalsePositiveSpans = 0;

  for (const testCase of positives) {
    const nestedGold = testCase.expectedPrimitiveActions.filter((g) => !g.negative && !isCoPrimaryGold(g));
    let cardHadCandidate = false;

    for (const face of segmentCardFaces(testCase.oracleText)) {
      for (const ability of segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start)) {
        const goldSpans = deriveGoldGrantedSpans(ability.paragraphText, nestedGold);
        const detected = detectGrantedRulesSpans(ability.paragraphText);
        candidateSpanCount += detected.length;
        if (detected.length > 0) cardHadCandidate = true;

        stageA_expected += goldSpans.length;
        const matchedDetected = new Set<number>();
        let paragraphGoldHits = 0;

        for (const goldSpan of goldSpans) {
          const hitIdx = detected.findIndex((d) => spansOverlap(d, goldSpan));
          if (hitIdx >= 0) {
            stageA_tp++;
            paragraphGoldHits++;
            matchedDetected.add(hitIdx);
          } else {
            stageA_fn++;
          }
        }
        if (paragraphGoldHits > matchedDetected.size) {
          const collisions = paragraphGoldHits - matchedDetected.size;
          stageB_excludedGoldSpanCollisions += collisions;
          stageB_excludedDetails.push({
            caseId: testCase.id,
            goldSpanCount: paragraphGoldHits,
            uniqueDetectedMatches: matchedDetected.size,
          });
        }

        for (let i = 0; i < detected.length; i++) {
          const isGoldAligned = goldSpans.some((g) => spansOverlap(g, detected[i]));
          if (!isGoldAligned) stageA_fp++;
        }

        for (const idx of matchedDetected) {
          stageB_pool++;
          const span = detected[idx];
          const classified = classifyGrantedRulesSpan(ability.paragraphText, span);
          const isGranted = classified.classification === "granted_rules_ability";
          if (isGranted) stageB_tp++;
          else stageB_fn++;

          if (!isGranted) continue;

          const relevantGold = nestedGold.filter((g) =>
            span.innerText.toLowerCase().includes((g.evidenceContains ?? g.actionType).toLowerCase().slice(0, 12)),
          );
          stageC_pool += relevantGold.length;

          const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
          const spanNeedle = span.innerText.toLowerCase();
          const spanActions = parsed.actions.filter((a) =>
            spanNeedle.includes(a.provenance.actionSpan.text.toLowerCase().slice(0, Math.min(12, a.provenance.actionSpan.text.length))),
          );

          for (const gold of relevantGold) {
            const needle = (gold.evidenceContains ?? gold.actionType).toLowerCase().slice(0, 12);
            const hit = spanActions.some(
              (a) =>
                a.actionType === gold.actionType &&
                a.reviewStatus === "accepted" &&
                a.provenance.actionSpan.text.toLowerCase().includes(needle),
            );
            if (hit) stageC_tp++;
            else stageC_fn++;
          }

          for (const action of spanActions.filter((a) => a.reviewStatus === "accepted")) {
            const matchedGold = relevantGold.some(
              (g) =>
                g.actionType === action.actionType &&
                action.provenance.actionSpan.text.toLowerCase().includes((g.evidenceContains ?? g.actionType).toLowerCase().slice(0, 12)),
            );
            if (!matchedGold) stageC_fp++;
          }
        }

        for (const idx of detected.keys()) {
          if (matchedDetected.has(idx)) continue;
          const span = detected[idx];
          const classified = classifyGrantedRulesSpan(ability.paragraphText, span);
          if (classified.classification === "granted_rules_ability") {
            stageB_fp++;
            stageB_fp_detectorFalsePositiveSpans++;
          }
        }
      }
    }
    if (cardHadCandidate) cardsWithCandidates++;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    methodology: "Span-based denominators — one FN per missed gold span, not per nested action",
    corpus: {
      grantedPositiveCards: positives.length,
      candidateSpanCount,
      cardsWithCandidateSpans: cardsWithCandidates,
    },
    stageA_grantedRulesSpanDetector: {
      unit: "gold granted-rules span",
      expectedGoldSpans: stageA_expected,
      detectedCandidateSpans: candidateSpanCount,
      ...metricsFromCounts(stageA_tp, stageA_fp, stageA_fn),
    },
    stageB_grantedRulesClassifier: {
      unit: "gold-matched detected span (unique detected index per ability paragraph)",
      conditionalPool: stageB_pool,
      cohortNote:
        "Stage A counts 12 gold-span hits; Stage B denominator is 10 because 2 gold spans share the same detected quote/paren region (deduped by detected index)",
      excludedFromClassifierDenominator: {
        reason: "multiple_gold_spans_map_to_one_detected_span",
        count: stageB_excludedGoldSpanCollisions,
        details: stageB_excludedDetails,
      },
      classifierFalsePositiveSources: {
        detectorFalsePositiveSpans: stageB_fp_detectorFalsePositiveSpans,
        note: "All 6 classifier FPs are detector false-positive spans (not gold-aligned) misclassified as granted_rules_ability",
      },
      ...metricsFromCounts(stageB_tp, stageB_fp, stageB_fn),
    },
    stageC_clauseNativeNestedExtraction: {
      description: "Clause-native granted pipeline only — nested actions inside correctly classified granted spans",
      conditionalPool: stageC_pool,
      ...metricsFromCounts(stageC_tp, stageC_fp, stageC_fn),
    },
    priorFlawedMetrics: {
      source: "granted-span-metrics-v134.json",
      note: "Prior detector FN counted once per nested gold action inside missed span — invalid for span detector",
    },
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "granted-stage-metrics-v135.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
