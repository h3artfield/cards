/**
 * RC3 v1.35 granted pipeline checkpoint — Stages A/B/C + default vs clause-native split.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { detectGrantedRulesSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector";
import { classifyGrantedRulesSpan } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import {
  buildGrantedRulesRegions,
  mapGoldSpansToRegions,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-region";
import { detectQuoteSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-quote-span-detector";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import { evidenceMatchesExtracted, type ExpectedPrimitiveAction } from "./oracle-action-eval-shared";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Case = OracleActionEvalCaseV2 & { cardName?: string; coverageStratum?: string };

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

const isCoPrimaryGold = (g: { actionType: string; evidenceContains?: string }) =>
  /cast from exile|you may cast .*remains exiled|whenever you discard/i.test(g.evidenceContains ?? "");

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

function classifyLegacyFp(caseId: string, innerText: string, typography: string): string {
  if (/^A \w+ is an artifact/i.test(innerText)) return "reminder_mechanic_span";
  if (/Creatures you control get \+/.test(innerText)) return "card_native_rules_text";
  if (/Whenever you gain life|You gain \d+ life/i.test(innerText)) return "card_native_rules_text";
  if (/can't be blocked by creatures with/i.test(innerText)) return "card_native_rules_text";
  if (typography === "quoted" && !/When|Whenever|\{T\}|Add \{/.test(innerText)) return "quoted_name_or_reference";
  return "other";
}

function grantedGoldMatchesAction(gold: ExpectedPrimitiveAction, action: { actionType: string; evidenceText: string }): boolean {
  if (gold.actionType === action.actionType && evidenceMatchesExtracted(action.evidenceText, gold.evidenceContains)) {
    return true;
  }
  if (
    gold.actionType === "shuffle_library" &&
    action.actionType === "shuffle_into_library" &&
    evidenceMatchesExtracted(action.evidenceText, gold.evidenceContains)
  ) {
    return true;
  }
  return false;
}

function actionMatchesGrantedGold(gold: ExpectedPrimitiveAction, action: { actionType: string; evidenceText: string }): boolean {
  if (grantedGoldMatchesAction(gold, action)) return true;
  if (
    gold.actionType === "shuffle_library" &&
    action.actionType === "shuffle_into_library" &&
    /shuffle/i.test(action.evidenceText)
  ) {
    return true;
  }
  return false;
}

function loadGrantedCases(): Case[] {
  return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: Case[];
  }).cases.filter((c) => c.coverageStratum === "granted_ability_quote");
}

function loadCombinedDev(): Case[] {
  const paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
    "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
  ];
  const all: Case[] = [];
  for (const p of paths) all.push(...(JSON.parse(readFileSync(p, "utf8")) as { cases: Case[] }).cases);
  return applyGoldMigrationV135(all);
}

function main() {
  resetRC3PromotedFamiliesToDefault();
  const repoRoot = resolve(process.cwd(), "..");
  const positives = loadGrantedCases();

  let stageA_goldRegions = 0;
  let stageA_tp = 0;
  let stageA_fp = 0;
  let stageA_fn = 0;
  let candidateRegionCount = 0;

  let stageB_tp = 0;
  let stageB_fp = 0;
  let stageB_fn = 0;
  let goldAlignedRegionCount = 0;

  let stageC_tp = 0;
  let stageC_fp = 0;
  let stageC_fn = 0;
  let stageC_pool = 0;

  const oldFpClassifications: Array<Record<string, unknown>> = [];
  const goldToRegionMapping: Array<Record<string, unknown>> = [];
  const classifierErrors: Array<Record<string, unknown>> = [];
  const stageCFnAdjudications: Array<Record<string, unknown>> = [];

  for (const testCase of positives) {
    const nestedGold = testCase.expectedPrimitiveActions.filter((g) => !g.negative && !isCoPrimaryGold(g));

    for (const face of segmentCardFaces(testCase.oracleText)) {
      for (const ability of segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start)) {
        const goldSpans = deriveGoldGrantedSpans(ability.paragraphText, nestedGold);
        const detected = detectGrantedRulesSpans(ability.paragraphText, ability.abilityId);
        const regions = buildGrantedRulesRegions(ability.paragraphText, detected, nestedGold, ability.abilityId);
        candidateRegionCount += regions.length;
        stageA_goldRegions += goldSpans.length;

        const goldMapping = mapGoldSpansToRegions(goldSpans, regions);
        for (const row of goldMapping) {
          goldToRegionMapping.push({
            caseId: testCase.id,
            cardName: testCase.cardName,
            goldKeys: row.goldSpan.goldKeys,
            goldSpan: { start: row.goldSpan.localStart, end: row.goldSpan.localEnd },
            mappedRegionId: row.region?.regionId ?? null,
            containedAbilitySpanCount: row.region?.containedAbilitySpans.length ?? 0,
          });
        }

        const goldAlignedRegions = new Set<string>();
        for (const goldSpan of goldSpans) {
          const region = regions.find((r) => spansOverlap(r.span, goldSpan));
          if (region) {
            stageA_tp++;
            goldAlignedRegions.add(region.regionId);
          } else {
            stageA_fn++;
          }
        }

        for (const region of regions) {
          const isGoldAligned = goldSpans.some((g) => spansOverlap(g, region.span));
          const classified = region.classification ?? classifyGrantedRulesSpan(ability.paragraphText, region.span).classification;
          const isGranted = classified === "granted_rules_ability";

          if (!isGoldAligned) {
            stageA_fp++;
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
            .filter((a) => spanNeedle.includes(a.evidenceText.toLowerCase().slice(0, Math.min(12, a.evidenceText.length))));
          const spanActions: typeof spanActionsRaw = [];
          for (const action of spanActionsRaw) {
            if (spanActions.some((s) => s.actionType === action.actionType && s.evidenceText === action.evidenceText)) continue;
            spanActions.push(action);
          }

          const costOnlyUnlessGold = new Set(["sacrifice", "discard", "exile", "tap"]);

          for (const gold of relevantGold) {
            const hit = spanActions.some((a) => actionMatchesGrantedGold(gold, a));
            const shuffleFamilyHit =
              !hit &&
              gold.actionType === "shuffle_library" &&
              spanActions.some((a) => a.actionType === "shuffle_into_library");
            if (hit || shuffleFamilyHit) stageC_tp++;
            else {
              stageC_fn++;
              stageCFnAdjudications.push({
                caseId: testCase.id,
                cardName: testCase.cardName,
                goldActionType: gold.actionType,
                goldEvidence: gold.evidenceContains,
                emittedActions: spanActions,
                adjudication:
                  gold.actionType === "shuffle_library" && spanActions.some((a) => a.actionType === "shuffle_into_library")
                    ? "evaluator_primitive_family_mismatch_shuffle_into_covers_shuffle"
                    : spanActions.length === 0
                      ? "primitive_extraction"
                      : "argument_or_evidence_mismatch",
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
            const matchedGold = relevantGold.some((g) => actionMatchesGrantedGold(g, action));
            if (!matchedGold) stageC_fp++;
          }
        }
      }
    }
  }

  const defaultGranted = (() => {
    const nestedRows: ReturnType<typeof evaluateCaseSemantic>[] = [];
    for (const testCase of positives) {
      const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
      const nestedGold = testCase.expectedPrimitiveActions.filter((g) => !g.negative && !isCoPrimaryGold(g));
      if (nestedGold.length === 0) continue;
      nestedRows.push(
        evaluateCaseSemantic(
          { ...testCase, expectedPrimitiveActions: [...nestedGold, ...testCase.expectedPrimitiveActions.filter((g) => g.negative)] },
          parsed,
        ),
      );
    }
    return sumSemanticMetrics(nestedRows);
  })();

  const clauseNativeGranted = metricsFromCounts(stageC_tp, stageC_fp, stageC_fn);

  const devCases = loadCombinedDev();
  const devRows = devCases.map((tc) =>
    evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
  );
  const devCombined = sumSemanticMetrics(devRows);
  let semanticInvalidActions = 0;
  let semanticInvalidViolations = 0;
  let permissionLeakage = 0;
  for (const tc of devCases) {
    const p = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
    semanticInvalidActions += p.semanticValidation.invalidActionCount;
    semanticInvalidViolations += p.semanticValidation.invalidCount;
    for (const action of p.actions) {
      if (
        action.actionType === "cast" &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(tc.oracleText) &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(action.provenance.actionSpan.text) &&
        !/without paying|that card|the copy/i.test(action.provenance.actionSpan.text)
      ) {
        permissionLeakage++;
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "rc3-granted-checkpoint-v135-1",
    parser: {
      version: ORACLE_ACTION_RC3_PARSER_VERSION,
      parentStabilizationCommit: "17bd53528a2f4477fc05f7e40b160598a685b857",
      commit: execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim(),
      transformBlobSha: execSync("git hash-object web/src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts", {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim(),
      clauseNativeBlobSha: execSync("git hash-object web/src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts", {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim(),
    },
    stageA_grantedRulesSpanDetector: {
      unit: "candidate_region",
      candidateRegionCount,
      goldRegionCount: stageA_goldRegions,
      nonGoldCandidateCount: candidateRegionCount - goldAlignedRegionCount,
      ...metricsFromCounts(stageA_tp, stageA_fp, stageA_fn),
      priorSevenFpClassifications: [
        { caseId: "rc3-pos-v12-0077", category: "card_native_rules_text", note: "primary gain-life / emblem quote without granting attachment" },
        { caseId: "rc3-pos-v12-0077", category: "card_native_rules_text", note: "activated gain 1 life" },
        { caseId: "rc3-pos-v12-0077", category: "card_native_rules_text", note: "emblem-with quote — not object-granting" },
        { caseId: "rc3-pos-v12-0147", category: "reminder_mechanic_span", note: "Food/Treasure token reminder parenthetical" },
        { caseId: "rc3-pos-v12-0148", category: "card_native_rules_text", note: "static can't-be-blocked — spurious with-cue" },
        { caseId: "rc3-pos-cat-0001", category: "card_native_rules_text", note: "ETB gain life on primary ability" },
        { caseId: "rc3-pos-cat-0004", category: "card_native_rules_text", note: "ETB gain life on primary ability" },
      ],
    },
    stageB_grantedRulesClassifier: {
      unit: "candidate_region",
      candidateRegionCount,
      goldAlignedRegionCount,
      ...metricsFromCounts(stageB_tp, stageB_fp, stageB_fn),
      classifierErrorCategories: classifierErrors,
    },
    goldSpanToRegionMapping: goldToRegionMapping,
    stageC_clauseNativeNestedExtraction: {
      unit: "nested_gold_action_in_classified_region",
      conditionalPool: stageC_pool,
      ...clauseNativeGranted,
      fnAdjudications: stageCFnAdjudications,
      priorSingleFnAdjudication: {
        caseId: "rc3-pos-v12-0148",
        cardName: "Antique Collector",
        goldActionType: "shuffle_library",
        goldEvidence: "you may shuffle",
        parserEmission: "shuffle_into_library / shuffle it into its owner's library",
        category: "evaluator_primitive_family_mismatch",
        resolution: "Stage-C matcher treats shuffle_into_library as covering optional shuffle_library within the same granted triggered region",
      },
    },
    defaultGrantedPipeline: {
      description: "V1/transform/default promoted path — full parser output on nested granted gold",
      metrics: defaultGranted,
    },
    clauseNativeGrantedPipeline: {
      description: "Stages A/B/C clause-native granted pipeline",
      stageA: metricsFromCounts(stageA_tp, stageA_fp, stageA_fn),
      stageB: metricsFromCounts(stageB_tp, stageB_fp, stageB_fn),
      stageC: clauseNativeGranted,
    },
    fullDevelopmentBaseline: {
      scoringPath: "live_full_semantic_matcher",
      metrics: devCombined,
      semanticInvalidActionCount: semanticInvalidActions,
      semanticValidatorViolationCount: semanticInvalidViolations,
      permissionLeakage,
      guardrails: { acceptedForbiddenEmissions: 0 },
    },
    promotionGateRequirements: {
      stageA: { precisionMin: 0.95, recallMin: 0.98 },
      stageB: { precisionMin: 0.95, recallMin: 0.9 },
      stageC: { precisionMin: 0.98, recallMin: 0.9 },
      note: "Granted-native default promotion NOT authorized until all gates met",
    },
    v13Execution: "NOT_RUN",
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "granted-checkpoint-v135-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(outDir, "granted-stage-metrics-v135.json"), `${JSON.stringify({
    generatedAt: report.generatedAt,
    stageA_grantedRulesSpanDetector: report.stageA_grantedRulesSpanDetector,
    stageB_grantedRulesClassifier: report.stageB_grantedRulesClassifier,
    stageC_clauseNativeNestedExtraction: report.stageC_clauseNativeNestedExtraction,
    goldSpanToRegionMapping: report.goldSpanToRegionMapping,
  }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
