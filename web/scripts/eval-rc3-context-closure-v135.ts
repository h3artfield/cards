/**
 * RC3 v1.35 context-closure audit — FP accounting, routing, eval-0191, expansion.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import type { RC3ActionExtensions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-extraction-metadata";
import {
  clearRC3PromotedFamilies,
  resetRC3PromotedFamiliesToDefault,
  setRC3PromotedFamilies,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { evaluateCaseSemantic, sumSemanticMetrics, semanticActionsForMatch, matchGoldToSemanticActions } from "./oracle-action-semantic-matcher";
import { countParserFalsePositives, type ExtractedActionForMatch } from "./oracle-action-unified-matcher";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { evaluateGrantedPipeline, metricsFromCounts, strictGoldMatchesAction } from "./lib/rc3-granted-stage-metrics";
import { GRANTED_CLASSIFIER_EXPANSION_V135_SEEDS } from "./development-granted-classifier-expansion-v135-seeds";
import { routeCandidateRegions, filterGrantedRulesRoutes, filterTokenDefinitionRoutes } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router";
import { classifyGrantedRulesSpan } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import { buildGrantedRulesRegions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-region";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Case = OracleActionEvalCaseV2 & {
  cardName?: string;
  expansionLabel?: string;
  expectedGrantedRegionCount?: number;
  category?: string;
};

const V134 = { tp: 576, fp: 5, fn: 74 };
const V135_CANDIDATE = { tp: 574, fp: 9, fn: 68 };

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

function loadGranted(): Case[] {
  return applyGoldMigrationV135(
    (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
      cases: Case[];
    }).cases.filter((c) => c.coverageStratum === "granted_ability_quote"),
  );
}

function loadExpansion(): Case[] {
  const p = resolve("data/oracle-action-eval-granted-classifier-expansion-v135.json");
  if (!existsSync(p)) return [];
  return (JSON.parse(readFileSync(p, "utf8")) as { cases: Case[] }).cases;
}

function loadExpansionStageCGold(): Array<{ caseId: string; nestedGold: Array<{ actionType: string; evidenceContains: string }> }> {
  const p = resolve("data/oracle-action-eval-granted-expansion-stage-c-gold-v135.json");
  if (!existsSync(p)) return [];
  return (JSON.parse(readFileSync(p, "utf8")) as { cases: typeof Array.prototype }).cases as Array<{
    caseId: string;
    nestedGold: Array<{ actionType: string; evidenceContains: string }>;
  }>;
}

function auditAllFps(devCases: Case[]) {
  const v134Frozen = JSON.parse(
    readFileSync("data/milestones/rc3-development/frozen-parse-output-v134-stabilization.json", "utf8"),
  ) as { cases: Array<{ caseId: string; emittedActions: Array<{ actionType: string; evidenceText: string }> }> };
  const frozenByCase = new Map(v134Frozen.cases.map((c) => [c.caseId, c.emittedActions]));

  const allFps: Array<Record<string, unknown>> = [];

  for (const tc of devCases) {
    const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
    const semantic = semanticActionsForMatch(parse);
    const expected = tc.expectedPrimitiveActions.filter((e) => !e.negative);
    const match = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: tc.oracleText,
      caseId: tc.id,
    });

    const extractedForFp: ExtractedActionForMatch[] = semantic.map((a) => ({
      index: a.index,
      primitive: a.actionType,
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      cardFaceId: a.faceId,
      abilityIndex: a.segmentAbilityIndex,
      loyaltyCost: a.loyaltyCost,
      modalOptionId: a.modalOptionKey,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      optionalEffect: a.optionalEffect,
      optional: a.optionalEffect,
      optionalCost: a.optionalCost,
      cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
    }));

    for (const idx of match.unmatchedActionIndices) {
      const action = semantic[idx];
      const legacy = parse.legacy.actions.find(
        (a) => a.actionType === action.actionType && Math.abs(a.evidenceStart - action.evidenceStart) < 4,
      );
      const ext = (legacy ?? {}) as RC3ActionExtensions;

      const isFp =
        action.cardNativeLayer2Eligible !== false &&
        countParserFalsePositives(tc, [idx], extractedForFp) > 0;

      if (!isFp && action.cardNativeLayer2Eligible === false) {
        allFps.push({
          caseId: tc.id,
          cardName: tc.cardName,
          actionType: action.actionType,
          evidence: action.evidenceText.slice(0, 80),
          extractionSource: ext.extractionSource,
          executionContext: ext.executionContext ?? action.executionContext,
          semanticOwner: ext.semanticOwner ?? action.semanticOwner,
          cardNativeLayer2Eligible: false,
          v134Result: "n/a",
          v135Result: "context_scoped_emission_not_fp",
          transitionClass: "wrong_execution_context",
          note: "Accepted semantic fact — excluded from card-native FP by cardNativeLayer2Eligible=false",
        });
        continue;
      }
      if (!isFp) continue;

      const frozen = frozenByCase.get(tc.id) ?? [];
      const wasV134Fp = !expected.some((g) => frozen.some((a) => strictGoldMatchesAction(g, a))) &&
        frozen.some((a) => a.actionType === action.actionType);

      let transitionClass = "genuine_over_extraction";
      if (ext.executionContext === "token_definition") transitionClass = "token_definition_leakage";
      else if (ext.executionContext === "granted_ability") transitionClass = "wrong_execution_context";
      else if (action.actionType === "copy" && /\btoken that'?s a copy of\b/i.test(tc.oracleText)) {
        transitionClass = "wrong_primitive";
      }

      allFps.push({
        caseId: tc.id,
        cardName: tc.cardName,
        actionType: action.actionType,
        evidence: action.evidenceText.slice(0, 100),
        extractionSource: ext.extractionSource,
        executionContext: ext.executionContext ?? action.executionContext ?? "immediate",
        semanticOwner: ext.semanticOwner ?? action.semanticOwner ?? "source_card",
        cardNativeLayer2Eligible: action.cardNativeLayer2Eligible ?? true,
        v134Result: frozen.some((a) => a.actionType === action.actionType && a.evidenceText.includes(action.evidenceText.slice(0, 12)))
          ? "accepted_emitted"
          : wasV134Fp
            ? "fp"
            : "not_emitted",
        v135Result: "fp",
        transitionClass,
        isNewVsV134: !frozen.some((a) => strictGoldMatchesAction({ actionType: action.actionType, evidenceContains: action.evidenceText }, a)),
      });
    }
  }

  const cardNativeFps = allFps.filter((f) => f.v135Result === "fp");
  const newVsV134 = cardNativeFps.filter((f) => f.isNewVsV134);

  return { allFps, cardNativeFps, newVsV134, count: cardNativeFps.length, newCount: newVsV134.length };
}

function adjudicateEval0191() {
  const tc = loadDev().find((c) => c.id === "eval-0191")!;
  const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
  const copyGold = tc.expectedPrimitiveActions.find((g) => g.actionType === "copy");
  const emitted = parse.legacy.actions.filter((a) => a.actionType === "copy");
  const grantedQuote = tc.oracleText.match(/"When you cast this spell, copy it[^"]*"/)?.[0];

  return {
    caseId: "eval-0191",
    cardName: tc.cardName,
    oracleSnippet: grantedQuote ?? tc.oracleText.slice(0, 120),
    semanticFamily: "granted_spell_copy_on_cast",
    policy: "copy target spell / copy it on cast is genuine copy primitive — NOT token-copy construction",
    tokenCopyPolicy: "Does not apply — no 'create a token that\\'s a copy' construction",
    goldCopy: copyGold,
    emittedCopyActions: emitted.map((a) => ({
      evidenceText: a.evidenceText,
      executionContext: (a as RC3ActionExtensions).executionContext,
      reviewStatus: a.reviewStatus,
    })),
    adjudication: emitted.some((a) => /copy it/i.test(a.evidenceText))
      ? "genuine_copy_primitive_retained"
      : "parser_regression_requires_restore",
    restoreRecommended: !emitted.some((a) => /copy it/i.test(a.evidenceText)),
  };
}

function minionReflectorDiagnosis() {
  const tc = loadDev().find((c) => c.id === "dev-exp-v3-017")!;
  const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
  const actions = parse.legacy.actions.filter((a) => a.reviewStatus === "accepted");

  resetRC3PromotedFamiliesToDefault();
  const before = evaluateCaseSemantic(tc, parse);
  setRC3PromotedFamilies(["search_put_shuffle_chain", "activated_post_colon_effect", "granted_ability_quote"]);
  const afterParse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
  const after = evaluateCaseSemantic(tc, afterParse);
  clearRC3PromotedFamilies();
  resetRC3PromotedFamiliesToDefault();

  return {
    caseId: tc.id,
    cardName: tc.cardName,
    model: {
      sourceCardImmediate: "create_token with tokenCopyOf=that creature, modifier haste",
      createdObjectCapability: "triggered: beginning of end step → sacrifice this permanent",
    },
    createToken: {
      legitimate: true,
      gold: tc.expectedPrimitiveActions.find((g) => g.actionType === "create_token"),
      emitted: actions.filter((a) => a.actionType === "create_token"),
      promotionDiagnosis: after.accepted.fp > before.accepted.fp ? "duplicate_semantic_action_or_dedupe_failure" : "accepted_matches_gold",
    },
    copyPrimitive: {
      shouldExist: false,
      policy: "token-copy construction — copy absorbed into create_token+tokenCopyOf, not independent copy primitive",
      emitted: actions.filter((a) => a.actionType === "copy"),
      reclassification: "token_copy_taxonomy_violation_if_emitted",
    },
    nestedSacrifice: {
      owner: "created_object",
      executionContext: "granted_ability",
      cardNativeLayer2Eligible: false,
      note: "Quoted end-step sacrifice is token capability, not source-card immediate action",
    },
    promotionExperiment: { before: before.accepted, after: after.accepted },
  };
}

function expansionCardRegionMapping(cases: Case[]) {
  const seedByName = new Map(GRANTED_CLASSIFIER_EXPANSION_V135_SEEDS.map((s) => [s.cardName, s]));
  const positives = cases.filter((c) => c.expansionLabel === "positive_granted_region");
  const negatives = cases.filter((c) => c.expansionLabel === "negative_non_granted_region");

  const cardRows = positives.map((tc) => {
    const seed = seedByName.get(tc.cardName ?? "");
    let grantedRegions = 0;
    let tokenDefRegions = 0;
    for (const face of segmentCardFaces(tc.oracleText)) {
      for (const ability of segmentAbilities(tc.oracleId, face.faceId, face.text, face.start)) {
        const routes = routeCandidateRegions(ability.paragraphText, ability.abilityId);
        grantedRegions += filterGrantedRulesRoutes(routes).length;
        tokenDefRegions += filterTokenDefinitionRoutes(routes).length;
      }
    }
    return {
      caseId: tc.id,
      cardName: tc.cardName,
      category: seed?.category,
      expectedGrantedRegions: seed?.expectedGrantedRegionCount ?? 1,
      detectedGrantedRegions: grantedRegions,
      detectedTokenDefinitionRegions: tokenDefRegions,
    };
  });

  let negativeCandidateRegions = 0;
  for (const tc of negatives) {
    for (const face of segmentCardFaces(tc.oracleText)) {
      for (const ability of segmentAbilities(tc.oracleId, face.faceId, face.text, face.start)) {
        negativeCandidateRegions += filterGrantedRulesRoutes(routeCandidateRegions(ability.paragraphText, ability.abilityId)).length;
      }
    }
  }

  return {
    positiveCards: positives.length,
    positiveGrantedRegionsExpected: cardRows.reduce((s, r) => s + r.expectedGrantedRegions, 0),
    negativeCards: negatives.length,
    negativeGrantedCandidateRegions: negativeCandidateRegions,
    cardLevelMapping: cardRows,
  };
}

function evaluateExpansionStageABC(cases: Case[]) {
  const seedByName = new Map(GRANTED_CLASSIFIER_EXPANSION_V135_SEEDS.map((s) => [s.cardName, s]));
  const stageCGold = loadExpansionStageCGold();
  const goldByCase = new Map(stageCGold.map((g) => [g.caseId, g.nestedGold]));

  let expectedRegions = 0;
  let detectedGranted = 0;
  let regionTp = 0;
  let regionFp = 0;
  let regionFn = 0;
  let stageB_tp = 0;
  let stageB_fp = 0;
  let stageB_fn = 0;
  let stageC_tp = 0;
  let stageC_fp = 0;
  let stageC_fn = 0;
  let stageC_pool = 0;

  const positiveMisses: Array<Record<string, unknown>> = [];

  for (const tc of cases.filter((c) => c.expansionLabel === "positive_granted_region")) {
    const seed = seedByName.get(tc.cardName ?? "");
    const expected = seed?.expectedGrantedRegionCount ?? 1;
    expectedRegions += expected;

    let detected = 0;
    let classified = 0;
    for (const face of segmentCardFaces(tc.oracleText)) {
      for (const ability of segmentAbilities(tc.oracleId, face.faceId, face.text, face.start)) {
        const routes = filterGrantedRulesRoutes(routeCandidateRegions(ability.paragraphText, ability.abilityId));
        const regions = buildGrantedRulesRegions(ability.paragraphText, routes.map((r) => r.span), [], ability.abilityId);
        detected += regions.length;
        for (const region of regions) {
          const cls = region.classification ?? classifyGrantedRulesSpan(ability.paragraphText, region.span).classification;
          if (cls === "granted_rules_ability") classified++;
        }
      }
    }
    detectedGranted += detected;
    regionTp += Math.min(detected, expected);
    regionFn += Math.max(0, expected - detected);
    regionFp += Math.max(0, detected - expected);

    if (classified > 0) stageB_tp += Math.min(classified, expected);
    else stageB_fn += expected;
    stageB_fp += Math.max(0, classified - expected);

    if (detected < expected) {
      positiveMisses.push({
        caseId: tc.id,
        cardName: tc.cardName,
        category: seed?.category,
        expected,
        detected,
        classified,
      });
    }

    const nestedGold = goldByCase.get(tc.id) ?? [];
    if (nestedGold.length === 0) continue;
    stageC_pool += nestedGold.length;
    const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
    const emitted = parse.actions
      .filter((a) => a.reviewStatus === "accepted" && a.cardNativeLayer2Eligible !== false)
      .map((a) => ({ actionType: a.actionType, evidenceText: a.provenance.actionSpan.text }));

    for (const gold of nestedGold) {
      if (gold.actionType === "grant_keyword") {
        let regionText = "";
        for (const face of segmentCardFaces(tc.oracleText)) {
          for (const ability of segmentAbilities(tc.oracleId, face.faceId, face.text, face.start)) {
            for (const route of filterGrantedRulesRoutes(routeCandidateRegions(ability.paragraphText, ability.abilityId))) {
              regionText += route.span.innerText + " ";
            }
          }
        }
        const hit = regionText.toLowerCase().includes((gold.evidenceContains ?? "").toLowerCase());
        if (hit) stageC_tp++;
        else stageC_fn++;
        continue;
      }
      const hit = emitted.some((a) => strictGoldMatchesAction(gold, a));
      if (hit) stageC_tp++;
      else stageC_fn++;
    }
  }

  for (const tc of cases.filter((c) => c.expansionLabel === "negative_non_granted_region")) {
    for (const face of segmentCardFaces(tc.oracleText)) {
      for (const ability of segmentAbilities(tc.oracleId, face.faceId, face.text, face.start)) {
        const routes = filterGrantedRulesRoutes(routeCandidateRegions(ability.paragraphText, ability.abilityId));
        for (const route of routes) {
          const cls = classifyGrantedRulesSpan(ability.paragraphText, route.span).classification;
          if (cls === "granted_rules_ability") stageB_fp++;
        }
      }
    }
  }

  return {
    stageA: { expectedRegions, candidateGrantedRegions: detectedGranted, ...metricsFromCounts(regionTp, regionFp, regionFn) },
    stageB: { expectedRegions, ...metricsFromCounts(stageB_tp, stageB_fp, stageB_fn) },
    stageC: { conditionalPool: stageC_pool, ...metricsFromCounts(stageC_tp, stageC_fp, stageC_fn) },
    positiveMisses,
    missCategories: Object.fromEntries(
      positiveMisses.reduce((m, row) => {
        const c = String(row.category ?? "unknown");
        m.set(c, (m.get(c) ?? 0) + 1);
        return m;
      }, new Map<string, number>()),
    ),
  };
}

function main() {
  resetRC3PromotedFamiliesToDefault();
  const devCases = loadDev();
  const grantedCases = loadGranted();
  const expansionCases = loadExpansion();

  const devMetrics = sumSemanticMetrics(
    devCases.map((tc) =>
      evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
    ),
  );

  const fpAudit = auditAllFps(devCases);
  const grantedPipeline = evaluateGrantedPipeline(grantedCases);
  const eval0191 = adjudicateEval0191();
  const minion = minionReflectorDiagnosis();
  const expansionMapping = expansionCases.length > 0 ? expansionCardRegionMapping(expansionCases) : null;
  const expansionStages = expansionCases.length > 0 ? evaluateExpansionStageABC(expansionCases) : null;

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "rc3-context-closure-v135",
    authorization: {
      v134Authoritative: "576/5/74",
      v135Candidate: "development only — not authoritative until FP audit closes",
      grantedNativePromotion: "NOT AUTHORIZED",
    },
    parser: {
      version: ORACLE_ACTION_RC3_PARSER_VERSION,
      commit: execSync("git rev-parse HEAD", { cwd: resolve(process.cwd(), ".."), encoding: "utf8" }).trim(),
    },
    reviewStatusVsScoringContext: {
      policy: "reviewStatus = parser uncertainty only; cardNativeLayer2Eligible = scoring scope",
      schema: {
        reviewStatus: ["accepted", "needs_review", "abstained"],
        executionContext: ["immediate", "granted_ability", "token_definition"],
        semanticOwner: ["source_card", "granted_object", "created_object"],
        cardNativeLayer2Eligible: "boolean — false excludes from card-native TP/FP/FN",
      },
      foodTokenExample: {
        reviewStatus: "accepted",
        executionContext: "token_definition",
        semanticOwner: "created_object",
        cardNativeLayer2Eligible: false,
      },
    },
    genuineGrantRouting: {
      semanticContextRouter: "granted_rules | token_definition | reminder_only | other",
      grantedPipelineStageABC: {
        stageA: grantedPipeline.stageA_regionDetection,
        stageB: grantedPipeline.stageB_classifier,
        stageC: grantedPipeline.stageC_nestedExtraction,
      },
      tokenDefinitionRegions: grantedPipeline.tokenDefinitionRegions,
    },
    minionReflectorDiagnosis: minion,
    baselineFpAudit: {
      v134: V134,
      v135PreClosure: V135_CANDIDATE,
      v135Current: devMetrics,
      allCardNativeFps: fpAudit.cardNativeFps,
      newVsV134: fpAudit.newVsV134,
      contextScopedEmissions: fpAudit.allFps.filter((f) => f.v135Result === "context_scoped_emission_not_fp"),
    },
    eval0191CopyAdjudication: eval0191,
    expansion: expansionMapping
      ? {
          cardRegionMapping: expansionMapping,
          stageABC: expansionStages,
        }
      : null,
    correctedV135Baseline: {
      metrics: devMetrics,
      authoritative: false,
      note: "574/9/68 pre-closure reference; current metrics after routing + cardNativeLayer2Eligible",
    },
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "context-closure-v135-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
