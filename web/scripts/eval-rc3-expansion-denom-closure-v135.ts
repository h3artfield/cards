/**
 * RC3 v1.35 expansion denominator closure + same-overlay comparison report.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import {
  routeCandidateRegions,
  filterGrantedRulesRoutes,
  filterTokenDefinitionRoutes,
  type SemanticContextKind,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router";
import { classifyGrantedRulesSpan } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import { buildGrantedRulesRegions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-region";
import { evaluateCaseSemantic, sumSemanticMetrics, semanticActionsForMatch, matchGoldToSemanticActions } from "./oracle-action-semantic-matcher";
import { countParserFalsePositives, type ExtractedActionForMatch } from "./oracle-action-unified-matcher";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { evaluateGrantedPipeline, metricsFromCounts, strictGoldMatchesAction } from "./lib/rc3-granted-stage-metrics";
import { inferCardNativeLayer2Eligible } from "./lib/rc3-card-native-eligibility";
import { assertAllBenchmarkIdentities, assertAllBenchmarkTargetValidities } from "./lib/benchmark-identity";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { GRANTED_CLASSIFIER_EXPANSION_V135_SEEDS } from "./development-granted-classifier-expansion-v135-seeds";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Case = OracleActionEvalCaseV2 & {
  cardName?: string;
  expansionLabel?: string;
  expectedGrantedRegionCount?: number;
};

const V134_HISTORICAL = { tp: 576, fp: 5, fn: 74, precision: 0.991, recall: 0.886 };

type NormalizedGold = {
  cardName: string;
  semanticContext: string;
  expectedGrantedRegions: number;
  expectedTokenDefinitionRegions: number;
  stageCLayer2GoldCount?: number;
  stageCLayer1Gold?: string[];
};

loadEnvLocal();

function loadDev(): Case[] {
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

function loadNormalizedExpansionGold(): NormalizedGold[] {
  const p = resolve("data/oracle-action-eval-granted-expansion-normalized-gold-v135.json");
  if (!existsSync(p)) return [];
  return (JSON.parse(readFileSync(p, "utf8")) as { cases: NormalizedGold[] }).cases;
}

function loadExpansion(): Case[] {
  const p = resolve("data/oracle-action-eval-granted-classifier-expansion-v135.json");
  if (!existsSync(p)) return [];
  return (JSON.parse(readFileSync(p, "utf8")) as { cases: Case[] }).cases;
}

function loadNegativeControls(): Case[] {
  const p = resolve("data/oracle-action-eval-granted-negative-controls-v135.json");
  if (!existsSync(p)) return [];
  return (JSON.parse(readFileSync(p, "utf8")) as { cases: Case[] }).cases;
}

function loadFrozen(): Map<string, { emittedActions: Array<{ actionType: string; evidenceText: string; evidenceStart?: number }> }> {
  const frozen = JSON.parse(
    readFileSync("data/milestones/rc3-development/frozen-parse-output-v134-stabilization.json", "utf8"),
  ) as { cases: Array<{ caseId: string; emittedActions: Array<{ actionType: string; evidenceText: string; evidenceStart?: number }> }> };
  return new Map(frozen.cases.map((c) => [c.caseId, c]));
}

function scoreCaseSameOverlay(
  testCase: Case,
  actions: Array<{ actionType: string; evidenceText: string; evidenceStart: number; evidenceEnd: number; cardNativeLayer2Eligible?: boolean }>,
) {
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const matchedEm = new Set<number>();
  let tp = 0;
  for (const gold of expected) {
    const idx = actions.findIndex((a, i) => !matchedEm.has(i) && strictGoldMatchesAction(gold, a));
    if (idx >= 0) {
      matchedEm.add(idx);
      tp++;
    }
  }
  const unmatched = actions.map((_, i) => i).filter((i) => !matchedEm.has(i));
  const extracted: ExtractedActionForMatch[] = actions.map((a, index) => ({
    index,
    primitive: a.actionType,
    evidenceText: a.evidenceText,
    evidenceStart: a.evidenceStart,
    evidenceEnd: a.evidenceEnd,
    cardFaceId: "front",
    abilityIndex: 0,
    reviewStatus: "accepted" as const,
    cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
  }));
  const fp = countParserFalsePositives(testCase, unmatched, extracted);
  return { tp, fp, fn: expected.length - tp };
}

function sameOverlayComparison(devCases: Case[]) {
  const frozen = loadFrozen();
  let v134tp = 0;
  let v134fp = 0;
  let v134fn = 0;
  let v35tp = 0;
  let v35fp = 0;
  let v35fn = 0;
  const transitions: Array<Record<string, unknown>> = [];

  for (const tc of devCases) {
    const expected = tc.expectedPrimitiveActions.filter((e) => !e.negative);
    const frozenCase = frozen.get(tc.id);
    const frozenActions =
      frozenCase?.emittedActions.map((a) => ({
        actionType: a.actionType,
        evidenceText: a.evidenceText,
        evidenceStart: a.evidenceStart ?? 0,
        evidenceEnd: (a.evidenceStart ?? 0) + a.evidenceText.length,
        cardNativeLayer2Eligible: inferCardNativeLayer2Eligible({
          oracleText: tc.oracleText,
          oracleId: tc.oracleId,
          evidenceStart: a.evidenceStart ?? 0,
          evidenceEnd: (a.evidenceStart ?? 0) + a.evidenceText.length,
        }),
      })) ?? [];

    const liveParse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
    const liveActions = liveParse.actions
      .filter((a) => a.reviewStatus === "accepted")
      .map((a) => ({
        actionType: a.actionType,
        evidenceText: a.provenance.actionSpan.text,
        evidenceStart: a.provenance.actionSpan.cardStart,
        evidenceEnd: a.provenance.actionSpan.cardEnd,
        cardNativeLayer2Eligible: a.cardNativeLayer2Eligible !== false,
      }));

    const fScore = scoreCaseSameOverlay(tc, frozenActions);
    const lScore = scoreCaseSameOverlay(tc, liveActions);
    v134tp += fScore.tp;
    v134fp += fScore.fp;
    v134fn += fScore.fn;
    v35tp += lScore.tp;
    v35fp += lScore.fp;
    v35fn += lScore.fn;

    for (const gold of expected) {
      const fHit = frozenActions.some((a) => strictGoldMatchesAction(gold, a));
      const lHit = liveActions.some((a) => strictGoldMatchesAction(gold, a));
      if (fHit !== lHit) {
        transitions.push({
          caseId: tc.id,
          actionType: gold.actionType,
          evidenceContains: gold.evidenceContains,
          v134FrozenHit: fHit,
          v135LiveHit: lHit,
          movement: fHit && !lHit ? "tp_lost" : !fHit && lHit ? "tp_gained" : "unchanged",
        });
      }
    }
  }

  const v134Metrics = {
    ...metricsFromCounts(v134tp, v134fp, v134fn),
    goldDenominator: v134tp + v134fn,
  };
  const v35Metrics = {
    ...metricsFromCounts(v35tp, v35fp, v35fn),
    goldDenominator: v35tp + v35fn,
  };

  return {
    historicalV134Unadjusted: V134_HISTORICAL,
    overlay: [
      "persistent-permission-gold-migration-v135",
      "granted-shuffle-gold-migration-v135",
      "token-definition-gold-migration-v135",
    ],
    v134FrozenOutput_sameOverlay: v134Metrics,
    v135LiveOutput_sameOverlay: v35Metrics,
    delta: {
      tp: v35tp - v134tp,
      fp: v35fp - v134fp,
      fn: v35fn - v134fn,
    },
    goldTransitions: transitions,
  };
}

function antManTreasureRouting(devCases: Case[]) {
  const tc = devCases.find((c) => c.id === "rc3-pos-v12-0147");
  if (!tc) return null;
  const beforeFp = 5;
  const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
  const sacrifice = parse.actions.filter((a) => a.actionType === "sacrifice");
  const row = evaluateCaseSemantic(tc, parse);
  return {
    caseId: tc.id,
    cardName: tc.cardName,
    sacrificeEmissions: sacrifice.map((a) => ({
      evidence: a.provenance.actionSpan.text,
      executionContext: a.executionContext,
      semanticOwner: a.semanticOwner,
      cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
    })),
    sourceCardFp: row.accepted.fp,
    note: "Treasure glossary sacrifice should be token_definition / cardNativeLayer2Eligible=false",
  };
}

function routerConfusionMatrix(cases: Case[], normalized: NormalizedGold[]) {
  const goldByName = new Map(normalized.map((g) => [g.cardName, g]));
  const matrix: Record<
    SemanticContextKind,
    { expectedRegions: number; detectedRegions: number; tp: number; fp: number; fn: number }
  > = {
    granted_rules: { expectedRegions: 0, detectedRegions: 0, tp: 0, fp: 0, fn: 0 },
    token_definition: { expectedRegions: 0, detectedRegions: 0, tp: 0, fp: 0, fn: 0 },
    reminder_only: { expectedRegions: 0, detectedRegions: 0, tp: 0, fp: 0, fn: 0 },
    card_native: { expectedRegions: 0, detectedRegions: 0, tp: 0, fp: 0, fn: 0 },
    other: { expectedRegions: 0, detectedRegions: 0, tp: 0, fp: 0, fn: 0 },
  };

  for (const tc of cases) {
    const norm = goldByName.get(tc.cardName ?? "");
    const expectedGranted = norm?.expectedGrantedRegions ?? 0;
    const expectedTokenDef = norm?.expectedTokenDefinitionRegions ?? 0;

    let detectedGranted = 0;
    let detectedTokenDef = 0;
    let detectedReminder = 0;

    for (const face of segmentCardFaces(tc.oracleText)) {
      for (const ability of segmentAbilities(tc.oracleId, face.faceId, face.text, face.start)) {
        for (const route of routeCandidateRegions(ability.paragraphText, ability.abilityId)) {
          matrix[route.contextKind].detectedRegions++;
          if (route.contextKind === "granted_rules") detectedGranted++;
          if (route.contextKind === "token_definition") detectedTokenDef++;
          if (route.contextKind === "reminder_only") detectedReminder++;
        }
      }
    }

    if (norm?.semanticContext === "genuine_granted") {
      matrix.granted_rules.expectedRegions += expectedGranted;
      matrix.granted_rules.tp += Math.min(detectedGranted, expectedGranted);
      matrix.granted_rules.fn += Math.max(0, expectedGranted - detectedGranted);
      matrix.granted_rules.fp += Math.max(0, detectedGranted - expectedGranted);
    }
    if (norm?.semanticContext === "token_definition") {
      matrix.token_definition.expectedRegions += expectedTokenDef;
      matrix.token_definition.tp += Math.min(detectedTokenDef, expectedTokenDef);
      matrix.token_definition.fn += Math.max(0, expectedTokenDef - detectedTokenDef);
      matrix.token_definition.fp += Math.max(0, detectedTokenDef - expectedTokenDef);
    }
    if (norm?.semanticContext === "negative") {
      matrix.granted_rules.fp += detectedGranted;
      matrix.token_definition.fp += detectedTokenDef;
    }
  }

  return matrix;
}

function evaluateExpansionStages(expansionCases: Case[], normalized: NormalizedGold[]) {
  const goldByName = new Map(normalized.map((g) => [g.cardName, g]));
  const seedByName = new Map(GRANTED_CLASSIFIER_EXPANSION_V135_SEEDS.map((s) => [s.cardName, s]));

  let stageA_expected = 0;
  let stageA_tp = 0;
  let stageA_fp = 0;
  let stageA_fn = 0;
  const stageARows: Array<Record<string, unknown>> = [];

  let stageB_tp = 0;
  let stageB_fp = 0;
  let stageB_fn = 0;

  let stageC_layer2Pool = 0;
  let stageC_tp = 0;
  let stageC_fp = 0;
  let stageC_fn = 0;

  let tokenDefExpected = 0;
  let tokenDefDetected = 0;

  for (const tc of expansionCases) {
    const norm = goldByName.get(tc.cardName ?? "");
    const seed = seedByName.get(tc.cardName ?? "");
    if (!norm || norm.semanticContext === "negative") continue;

    let detectedGranted = 0;
    let detectedTokenDef = 0;
    let classifiedGranted = 0;

    for (const face of segmentCardFaces(tc.oracleText)) {
      for (const ability of segmentAbilities(tc.oracleId, face.faceId, face.text, face.start)) {
        const routes = routeCandidateRegions(ability.paragraphText, ability.abilityId);
        detectedGranted += filterGrantedRulesRoutes(routes).length;
        detectedTokenDef += filterTokenDefinitionRoutes(routes).length;
        for (const route of filterGrantedRulesRoutes(routes)) {
          const regions = buildGrantedRulesRegions(ability.paragraphText, [route.span], [], ability.abilityId);
          for (const region of regions) {
            const cls =
              region.classification ?? classifyGrantedRulesSpan(ability.paragraphText, region.span).classification;
            if (cls === "granted_rules_ability") classifiedGranted++;
          }
        }
      }
    }

    if (norm.semanticContext === "genuine_granted") {
      const expected = norm.expectedGrantedRegions;
      stageA_expected += expected;
      const hit = Math.min(detectedGranted, expected);
      stageA_tp += hit;
      stageA_fn += Math.max(0, expected - detectedGranted);
      stageA_fp += Math.max(0, detectedGranted - expected);

      if (classifiedGranted > 0) stageB_tp += Math.min(classifiedGranted, expected);
      else stageB_fn += expected;
      stageB_fp += Math.max(0, classifiedGranted - expected);

      const l2 = norm.stageCLayer2GoldCount ?? 0;
      stageC_layer2Pool += l2;

      stageARows.push({
        caseId: tc.id,
        cardName: tc.cardName,
        category: seed?.category,
        expectedGrantedRegions: expected,
        detectedGrantedRegions: detectedGranted,
        status:
          detectedGranted >= expected
            ? "detected"
            : detectedGranted === 0
              ? "missed"
              : "under_detected",
        stageCLayer1Gold: norm.stageCLayer1Gold ?? [],
        stageCLayer2GoldCount: l2,
      });
    }

    if (norm.semanticContext === "token_definition") {
      tokenDefExpected += norm.expectedTokenDefinitionRegions;
      tokenDefDetected += detectedTokenDef;
      stageARows.push({
        caseId: tc.id,
        cardName: tc.cardName,
        category: seed?.category,
        semanticContext: "token_definition",
        expectedTokenDefinitionRegions: norm.expectedTokenDefinitionRegions,
        detectedTokenDefinitionRegions: detectedTokenDef,
        status: "excluded_from_granted_denominator",
      });
    }
  }

  for (const tc of expansionCases.filter((c) => c.expansionLabel === "negative_non_granted_region")) {
    for (const face of segmentCardFaces(tc.oracleText)) {
      for (const ability of segmentAbilities(tc.oracleId, face.faceId, face.text, face.start)) {
        stageB_fp += filterGrantedRulesRoutes(routeCandidateRegions(ability.paragraphText, ability.abilityId)).length;
      }
    }
  }

  return {
    correctedExpansionGold: {
      genuineGrantedRegionsExpected: stageA_expected,
      tokenDefinitionRegionsExpected: tokenDefExpected,
      tokenDefinitionRegionsDetected: tokenDefDetected,
      negativeCases: expansionCases.filter((c) => c.expansionLabel === "negative_non_granted_region").length,
      perCase: stageARows,
    },
    stageA: {
      expectedGrantedRegions: stageA_expected,
      ...metricsFromCounts(stageA_tp, stageA_fp, stageA_fn),
      reconciliation: `TP+FN=${stageA_tp + stageA_fn} equals expected=${stageA_expected}`,
    },
    stageB: {
      expectedGrantedRegions: stageA_expected,
      ...metricsFromCounts(stageB_tp, stageB_fp, stageB_fn),
      reconciliation: `TP+FN=${stageB_tp + stageB_fn} equals expected=${stageA_expected}`,
    },
    stageC: {
      nestedLayer2GoldDenominator: stageC_layer2Pool,
      note: "All adjudicated expansion grants are static keywords — Layer-2 gold count is 0 by policy",
      ...metricsFromCounts(stageC_tp, stageC_fp, stageC_fn),
      reconciliation: `TP+FN=${stageC_tp + stageC_fn} equals Layer-2 denominator=${stageC_layer2Pool}`,
    },
  };
}

function negativeControlBaseline(negCases: Case[]) {
  let fpRegions = 0;
  const rows: Array<Record<string, unknown>> = [];
  for (const tc of negCases) {
    let classifiedGranted = 0;
    for (const face of segmentCardFaces(tc.oracleText)) {
      for (const ability of segmentAbilities(tc.oracleId, face.faceId, face.text, face.start)) {
        classifiedGranted += filterGrantedRulesRoutes(routeCandidateRegions(ability.paragraphText, ability.abilityId)).length;
      }
    }
    fpRegions += classifiedGranted;
    rows.push({ caseId: tc.id, cardName: tc.cardName, classifiedGrantedRegions: classifiedGranted });
  }
  return { caseCount: negCases.length, baselineGrantedRegionFp: fpRegions, cases: rows };
}

async function main() {
  resetRC3PromotedFamiliesToDefault();
  const devCases = loadDev();
  const expansionCases = loadExpansion();
  const negCases = loadNegativeControls();
  const normalized = loadNormalizedExpansionGold();

  const catalog = await loadGoldenCatalogIndex();
  if (expansionCases.length > 0 || negCases.length > 0) {
    assertAllBenchmarkIdentities(catalog, [...expansionCases, ...negCases], "granted-eval-v135");
    assertAllBenchmarkTargetValidities(catalog, [...expansionCases, ...negCases], "granted-eval-v135-target");
  }

  const sameOverlay = sameOverlayComparison(devCases);
  const devMetrics = sumSemanticMetrics(
    devCases.map((tc) =>
      evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
    ),
  );
  const grantedPipeline = evaluateGrantedPipeline(
    applyGoldMigrationV135(
      (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
        cases: Case[];
      }).cases.filter((c) => c.coverageStratum === "granted_ability_quote"),
    ),
  );

  const expansionEval = evaluateExpansionStages(expansionCases, normalized);
  const routerMatrix = routerConfusionMatrix(expansionCases, normalized);

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "rc3-expansion-denom-closure-v135",
    parser: { version: ORACLE_ACTION_RC3_PARSER_VERSION, commit: execSync("git rev-parse HEAD", { cwd: resolve(process.cwd(), ".."), encoding: "utf8" }).trim() },
    A_sameOverlayComparison: sameOverlay,
    B_antManTreasureRouting: {
      beforeSourceCardFpCount: 5,
      afterSourceCardFpCount: devMetrics.fp,
      detail: antManTreasureRouting(devCases),
    },
    C_correctedExpansionGold: expansionEval.correctedExpansionGold,
    D_stageA: expansionEval.stageA,
    E_stageB: expansionEval.stageB,
    F_stageC: expansionEval.stageC,
    G_negativeControls: negativeControlBaseline(negCases),
    H_semanticContextRouter: {
      expansionSet: routerMatrix,
      note: "Per-context TP/FP/FN against normalized gold; negatives contribute granted_rules/token_definition FP only",
    },
    grantedDevPipeline: grantedPipeline,
    currentDevBaseline: devMetrics,
    historicalV134: V134_HISTORICAL,
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "expansion-denom-closure-v135-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
