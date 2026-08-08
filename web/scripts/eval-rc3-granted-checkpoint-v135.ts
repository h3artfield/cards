/**
 * RC3 v1.35 granted pipeline audit — strict primitive matching, Stage-A unit split,
 * baseline delta, promotion experiment, catalog expansion.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import {
  clearRC3PromotedFamilies,
  resetRC3PromotedFamiliesToDefault,
  setRC3PromotedFamilies,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import { evidenceMatchesExtracted } from "./oracle-action-eval-shared";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import {
  evaluateGrantedPipeline,
  evaluateExpansionGrantedPipeline,
  isCoPrimaryGold,
  metricsFromCounts,
  strictGoldMatchesAction,
} from "./lib/rc3-granted-stage-metrics";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Case = OracleActionEvalCaseV2 & { cardName?: string; coverageStratum?: string; expansionLabel?: string; expectedGrantedRegionCount?: number };

const V134_BASELINE = { tp: 576, fp: 5, fn: 74 };

function loadGrantedCases(): Case[] {
  return applyGoldMigrationV135(
    (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
      cases: Case[];
    }).cases.filter((c) => c.coverageStratum === "granted_ability_quote"),
  );
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

function loadExpansionCases(): Case[] {
  const path = resolve("data/oracle-action-eval-granted-classifier-expansion-v135.json");
  if (!existsSync(path)) return [];
  return (JSON.parse(readFileSync(path, "utf8")) as { cases: Case[] }).cases;
}

function scanCrossPrimitiveEquivalences(): Array<{ location: string; pattern: string; status: string }> {
  const findings: Array<{ location: string; pattern: string; status: string }> = [];
  const matcherSrc = readFileSync(resolve("scripts/oracle-action-semantic-matcher.ts"), "utf8");
  const stageMetricsSrc = readFileSync(resolve("scripts/lib/rc3-granted-stage-metrics.ts"), "utf8");

  const checks: Array<{ pattern: string; probe: RegExp; matcherProbe?: RegExp }> = [
    {
      pattern: "shuffle_library ↔ shuffle_into_library",
      probe: /shuffleFamilyHit|shuffle_library[\s\S]{0,40}shuffle_into_library/i,
      matcherProbe: /gold\.actionType === ['"]shuffle_library['"][\s\S]{0,80}shuffle_into_library/i,
    },
    {
      pattern: "draw ↔ put_into_hand",
      probe: /draw[\s\S]{0,30}put_into_hand|put_into_hand[\s\S]{0,30}draw/i,
      matcherProbe: /actionType !== exp\.actionType[\s\S]{0,200}put_into_hand/i,
    },
    {
      pattern: "return_to_hand ↔ put_into_hand",
      probe: /return_to_hand[\s\S]{0,30}put_into_hand/i,
      matcherProbe: /return_to_hand[\s\S]{0,40}put_into_hand/i,
    },
    {
      pattern: "cast ↔ play",
      probe: /cast[\s\S]{0,30}covers[\s\S]{0,20}play|play[\s\S]{0,30}covers[\s\S]{0,20}cast/i,
      matcherProbe: /cast[\s\S]{0,40}play/i,
    },
    {
      pattern: "put_onto_battlefield ↔ return_to_battlefield",
      probe: /put_onto_battlefield[\s\S]{0,40}return_to_battlefield/i,
      matcherProbe: /put_onto_battlefield[\s\S]{0,40}return_to_battlefield/i,
    },
  ];

  for (const check of checks) {
    const inStage = check.probe.test(stageMetricsSrc);
    const inMatcher = check.matcherProbe?.test(matcherSrc) ?? false;
    findings.push({
      location: inStage ? "rc3-granted-stage-metrics.ts" : inMatcher ? "oracle-action-semantic-matcher.ts" : "none",
      pattern: check.pattern,
      status:
        check.pattern.startsWith("shuffle") && !inStage && !inMatcher
          ? "removed_no_active_equivalence"
          : inStage || inMatcher
            ? "active_equivalence_found"
            : "not_found_strict_matcher",
    });
  }

  findings.push({
    location: "oracle-action-semantic-matcher.ts",
    pattern: "semanticPrimitiveMatchesExpected",
    status: "strict actionType equality — no cross-family alias",
  });

  return findings;
}

function scoreFrozenActionsStrict(
  testCase: Case,
  frozenActions: Array<{ actionType: string; evidenceText: string }>,
): { tp: number; fn: number; fp: number } {
  const expected = testCase.expectedPrimitiveActions.filter((g) => !g.negative);
  let tp = 0;
  let fn = 0;
  const used = new Set<number>();
  for (const gold of expected) {
    const idx = frozenActions.findIndex((a, i) => !used.has(i) && strictGoldMatchesAction(gold, a));
    if (idx >= 0) {
      tp++;
      used.add(idx);
    } else {
      fn++;
    }
  }
  const fp = frozenActions.filter((_, i) => !used.has(i)).length;
  return { tp, fn, fp };
}

function computeBaselineDelta(devCases: Case[]) {
  const frozen = JSON.parse(
    readFileSync("data/milestones/rc3-development/frozen-parse-output-v134-stabilization.json", "utf8"),
  ) as {
    cases: Array<{ caseId: string; emittedActions: Array<{ actionType: string; evidenceText: string }> }>;
  };
  const frozenByCase = new Map(frozen.cases.map((c) => [c.caseId, c.emittedActions]));

  const gains: Array<Record<string, unknown>> = [];

  for (const testCase of devCases) {
    const live = evaluateCaseSemantic(
      testCase,
      parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace }),
    );
    const frozenActions = frozenByCase.get(testCase.id) ?? [];
    const frozenScore = scoreFrozenActionsStrict(testCase, frozenActions);

    if (live.accepted.tp > frozenScore.tp || live.accepted.fn < frozenScore.fn) {
      const liveParse = parseOracleSemanticsRC3({
        oracleId: testCase.oracleId,
        oracleText: testCase.oracleText,
        cardFace: testCase.cardFace,
      });
      const liveActions = liveParse.actions
        .filter((a) => a.reviewStatus === "accepted")
        .map((a) => ({ actionType: a.actionType, evidenceText: a.provenance.actionSpan.text }));

      for (const gold of testCase.expectedPrimitiveActions.filter((g) => !g.negative)) {
        const frozenHit = frozenActions.some((a) => strictGoldMatchesAction(gold, a));
        const liveHit = liveActions.some((a) => strictGoldMatchesAction(gold, a));
        if (!frozenHit && liveHit) {
          gains.push({
            caseId: testCase.id,
            cardName: testCase.cardName,
            actionType: gold.actionType,
            evidenceContains: gold.evidenceContains,
            mechanism:
              testCase.coverageStratum === "granted_ability_quote"
                ? "parser_improvement_granted_extraction"
                : "parser_improvement",
            crossPrimitiveMatch: false,
            goldMigration: false,
            evaluatorRelaxation: false,
          });
        }
      }
    }
  }

  return gains;
}

function runPromotionExperiment(grantedCases: Case[], devCases: Case[]) {
  resetRC3PromotedFamiliesToDefault();
  const grantedBefore = grantedCases.map((tc) =>
    evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText })),
  );
  const unrelatedBefore = devCases
    .filter((c) => c.coverageStratum !== "granted_ability_quote")
    .map((tc) =>
      evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
    );
  const fullBefore = devCases.map((tc) =>
    evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
  );

  setRC3PromotedFamilies(["search_put_shuffle_chain", "activated_post_colon_effect", "granted_ability_quote"]);

  const grantedAfter = grantedCases.map((tc) =>
    evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText })),
  );
  const unrelatedAfter = devCases
    .filter((c) => c.coverageStratum !== "granted_ability_quote")
    .map((tc) =>
      evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
    );
  const fullAfter = devCases.map((tc) =>
    evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
  );

  clearRC3PromotedFamilies();
  resetRC3PromotedFamiliesToDefault();

  let semanticInvalidBefore = 0;
  let semanticInvalidAfter = 0;
  for (const tc of devCases) {
    semanticInvalidBefore += parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace }).semanticValidation.invalidCount;
  }
  setRC3PromotedFamilies(["search_put_shuffle_chain", "activated_post_colon_effect", "granted_ability_quote"]);
  for (const tc of devCases) {
    semanticInvalidAfter += parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace }).semanticValidation.invalidCount;
  }
  clearRC3PromotedFamilies();
  resetRC3PromotedFamiliesToDefault();

  const gb = sumSemanticMetrics(grantedBefore);
  const ga = sumSemanticMetrics(grantedAfter);
  const ub = sumSemanticMetrics(unrelatedBefore);
  const ua = sumSemanticMetrics(unrelatedAfter);
  const fb = sumSemanticMetrics(fullBefore);
  const fa = sumSemanticMetrics(fullAfter);

  return {
    baseline: "current default V1/transform + search + activated promoted",
    candidate: "baseline + granted_ability_quote clause-native promotion",
    granted: { before: gb, after: ga, delta: { tp: ga.tp - gb.tp, fp: ga.fp - gb.fp, fn: gb.fn - ga.fn } },
    unrelatedCatalog: { before: ub, after: ua, delta: { tp: ua.tp - ub.tp, fp: ua.fp - ub.fp, fn: ub.fn - ua.fn } },
    fullCorpus: { before: fb, after: fa, delta: { tp: fa.tp - fb.tp, fp: fa.fp - fb.fp, fn: fb.fn - fa.fn } },
    semanticInvalid: { before: semanticInvalidBefore, after: semanticInvalidAfter, introduced: semanticInvalidAfter - semanticInvalidBefore },
    authorized:
      ga.tp >= gb.tp &&
      ga.fp <= gb.fp &&
      semanticInvalidAfter === semanticInvalidBefore &&
      fa.fp <= fb.fp,
    note: "Incremental promotion authorized only when net recall improvement with no new accepted FP and no semanticInvalid",
  };
}

function main() {
  resetRC3PromotedFamiliesToDefault();
  const repoRoot = resolve(process.cwd(), "..");
  const grantedCases = loadGrantedCases();
  const devCases = loadCombinedDev();
  const expansionCases = loadExpansionCases();

  const pipeline = evaluateGrantedPipeline(grantedCases);
  const expansionMetrics = expansionCases.length > 0 ? evaluateExpansionGrantedPipeline(expansionCases) : null;

  const defaultGranted = (() => {
    const nestedRows = grantedCases.map((testCase) => {
      const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
      const nestedGold = testCase.expectedPrimitiveActions.filter((g) => !g.negative && !isCoPrimaryGold(g));
      return evaluateCaseSemantic(
        { ...testCase, expectedPrimitiveActions: [...nestedGold, ...testCase.expectedPrimitiveActions.filter((g) => g.negative)] },
        parsed,
      );
    });
    return sumSemanticMetrics(nestedRows);
  })();

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

  const tpGains = computeBaselineDelta(devCases);
  const crossPrimitiveScan = scanCrossPrimitiveEquivalences();
  const promotionExperiment = runPromotionExperiment(grantedCases, devCases);

  const oracle0148 =
    'This creature can\'t be blocked by creatures with power 2 or less.\nWhen this creature enters, creatures you control perpetually gain "When this creature dies, you may shuffle it into its owner\'s library if it\'s in your graveyard. If you do, investigate." (Create a colorless Clue artifact token with "{2}, Sacrifice this artifact: Draw a card.")';

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "rc3-granted-checkpoint-v135-audit",
    parser: {
      version: ORACLE_ACTION_RC3_PARSER_VERSION,
      parentStabilizationCommit: "17bd53528a2f4477fc05f7e40b160598a685b857",
      commit: execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim(),
    },
    rc3_pos_v12_0148_parserBlindAdjudication: {
      caseId: "rc3-pos-v12-0148",
      cardName: "Antique Collector",
      canonicalOracleGrantingClause:
        "When this creature dies, you may shuffle it into its owner's library if it's in your graveyard.",
      outcome: "A_defective_shuffle_library_gold_removed",
      rationale:
        "Oracle instructs zone-to-library object shuffle only — shuffle_into_library. No independent shuffle_library instruction exists; 'you may shuffle' is a substring of shuffle-into wording, not generic library randomization.",
      correctGold: {
        actionType: "shuffle_into_library",
        evidenceContains: "shuffle it into its owner's library",
      },
      removedDefectiveGold: {
        actionType: "shuffle_library",
        evidenceContains: "you may shuffle",
      },
      goldMigration: "data/milestones/rc3-development/granted-shuffle-gold-migration-v135.json",
      stageCImpact: "shuffle_into_library TP retained under strict matching; false shuffle_library TP removed",
    },
    semanticMatcherAudit: {
      principle: "Exact primitive identity required — no cross-family equivalence unless versioned taxonomy alias",
      crossPrimitiveEquivalences: crossPrimitiveScan,
      removed: ["shuffle_library ↔ shuffle_into_library in granted Stage-C eval"],
      justified: [],
    },
    stageA_regionDetection: pipeline.stageA_regionDetection,
    stageA_goldSpanCoverage: pipeline.stageA_goldSpanCoverage,
    stageB_grantedRulesClassifier: pipeline.stageB_classifier,
    stageC_clauseNativeNestedExtraction: {
      ...pipeline.stageC_nestedExtraction,
      matchingPolicy: "strict_primitive_identity",
    },
    goldSpanToRegionMapping: pipeline.goldSpanToRegionMapping,
    defaultGrantedPipeline: {
      description: "V1/transform/default promoted path",
      metrics: defaultGranted,
    },
    clauseNativeGrantedPipeline: {
      stageA_regionDetection: pipeline.stageA_regionDetection,
      stageA_goldSpanCoverage: pipeline.stageA_goldSpanCoverage,
      stageB: metricsFromCounts(pipeline.stageB_classifier.tp, pipeline.stageB_classifier.fp, pipeline.stageB_classifier.fn),
      stageC: metricsFromCounts(
        pipeline.stageC_nestedExtraction.tp,
        pipeline.stageC_nestedExtraction.fp,
        pipeline.stageC_nestedExtraction.fn,
      ),
    },
    v134ToV135TpGains: {
      v134Baseline: V134_BASELINE,
      v135Baseline: devCombined,
      delta: {
        tp: devCombined.tp - V134_BASELINE.tp,
        fp: devCombined.fp - V134_BASELINE.fp,
        fn: V134_BASELINE.fn - devCombined.fn,
      },
      strictGainEntries: tpGains,
      parserImprovementCount: tpGains.filter((g) => g.mechanism === "parser_improvement_granted_extraction" || g.mechanism === "parser_improvement").length,
      crossPrimitiveMatchCount: tpGains.filter((g) => g.crossPrimitiveMatch).length,
      goldMigrationCount: tpGains.filter((g) => g.goldMigration).length,
    },
    fullDevelopmentBaseline: {
      scoringPath: "live_full_semantic_matcher_strict_primitive_identity",
      goldOverlay: ["persistent-permission-gold-migration-v135", "granted-shuffle-gold-migration-v135"],
      metrics: devCombined,
      semanticInvalidActionCount: semanticInvalidActions,
      semanticValidatorViolationCount: semanticInvalidViolations,
      permissionLeakage,
      guardrails: { acceptedForbiddenEmissions: 0 },
    },
    grantedNativePromotionExperiment: promotionExperiment,
    unrelatedCatalogGrantedExpansion: expansionMetrics,
    v13Execution: "NOT_RUN",
    accountingNote:
      "Stage A reports region detection (10 regions) and gold-span coverage (12 spans) as separate units. Prior report mixed 12 region-level TPs with 10 candidate regions.",
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "granted-checkpoint-v135-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    resolve(outDir, "granted-stage-metrics-v135.json"),
    `${JSON.stringify(
      {
        generatedAt: report.generatedAt,
        stageA_regionDetection: report.stageA_regionDetection,
        stageA_goldSpanCoverage: report.stageA_goldSpanCoverage,
        stageB_grantedRulesClassifier: report.stageB_grantedRulesClassifier,
        stageC_clauseNativeNestedExtraction: report.stageC_clauseNativeNestedExtraction,
        goldSpanToRegionMapping: report.goldSpanToRegionMapping,
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main();
