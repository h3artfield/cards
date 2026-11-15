/**
 * v14 forensic diagnosis v2 — reconciled ledger, pinned policy stack, frozen artifact.
 * Run: cd web && npx tsx scripts/forensic-validation-v14-v2.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { OracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import { matchGoldToSemanticActions, semanticActionsForMatch } from "./oracle-action-semantic-matcher";
import { countParserFalsePositives } from "./oracle-action-unified-matcher";
import {
  adjudicateOfficialFpGoldCompleteness,
  classifyCastGold,
  classifySacrificeDiscardGold,
} from "./lib/validation-v13-policy-adjudication";
import {
  validateBenchmarkGoldPolicy,
  validateGoldAction,
  validatorSourceHash,
} from "./lib/gold-policy-validator-v1";
import { enrichGoldAction } from "./lib/gold-semantic-enrichment-v1";
import { isOneShotCastPermission, isPersistentZoneCastPermission } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { computeGoldPolicyStackHashes } from "./lib/gold-policy-stack-v1";

const OUT_DIR = "data/milestones/validation-v14-certification";
const V14_PATH = "data/oracle-action-eval-validation-v14.json";
const PRE_POLICY_PATH = `${OUT_DIR}/oracle-action-eval-validation-v14-pre-policy-sealed.json`;
const AGGREGATE_PATH = `${OUT_DIR}/validation-v14-rc4-execution-1-aggregate.json`;
const RAW_PATH = `${OUT_DIR}/validation-v14-rc4-execution-1-raw.json`;
const CERT_PATH = `${OUT_DIR}/validation-v14-gold-policy-certificate-v1.json`;
const CORR_PATH = `${OUT_DIR}/validation-v14-gold-policy-correction-report-v1.json`;

const OFFICIAL = {
  tp: 212,
  fp: 11,
  fn: 42,
  precision: 0.9506726457399103,
  recall: 0.8346456692913385,
  goldDenominator: 254,
  validationPass: false,
};

type FnVerdict =
  | "genuine_parser_fn"
  | "invalid_gold"
  | "evaluator_match_defect"
  | "scope_defect"
  | "unsupported";

type FpVerdict =
  | "genuine_parser_fp"
  | "missing_gold"
  | "evaluator_match_defect"
  | "scope_defect";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function goldKey(g: ExpectedPrimitiveAction): string {
  return `${g.actionType}|${(g.evidenceContains ?? "").toLowerCase().trim()}|${g.cardFace ?? ""}`;
}

function countPositiveGold(cases: OracleActionEvalCaseV2[]): number {
  return cases.reduce((s, c) => s + c.expectedPrimitiveActions.filter((g) => !g.negative).length, 0);
}

function evaluateOfficialFpFn(
  testCase: OracleActionEvalCaseV2,
  parse: OracleSemanticParse,
): { tp: number; fpRows: Array<Record<string, unknown>>; fnRows: Array<Record<string, unknown>> } {
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const match = matchGoldToSemanticActions({
    expected,
    parse,
    tier: "accepted",
    oracleText: testCase.oracleText,
    caseId: testCase.id,
  });
  const actions = semanticActionsForMatch(parse);
  const extracted = actions.map((a) => ({
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
    cardStart: a.evidenceStart,
    cardEnd: a.evidenceEnd,
  }));

  const fpRows: Array<Record<string, unknown>> = [];
  for (const idx of match.unmatchedActionIndices) {
    const a = actions[idx];
    if (!a || a.reviewStatus !== "accepted") continue;
    if (countParserFalsePositives(testCase, [idx], extracted) === 0) continue;
    fpRows.push({
      caseId: testCase.id,
      cardName: testCase.cardName,
      observedAction: a.actionType,
      observedEvidence: a.evidenceText,
      actionIndex: idx,
      abilityIndex: a.segmentAbilityIndex,
      modalOptionKey: a.modalOptionKey,
      loyaltyCost: a.loyaltyCost,
      executionContext: a.executionContext,
      cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
    });
  }

  const fnRows: Array<Record<string, unknown>> = [];
  for (const ei of match.unmatchedExpectedIndices) {
    const gold = expected[ei];
    if (!gold) continue;
    fnRows.push({
      caseId: testCase.id,
      cardName: testCase.cardName,
      expectedAction: gold.actionType,
      goldEvidence: gold.evidenceContains,
      optionalEffect: gold.optionalEffect,
      loyaltyCost: gold.loyaltyCost,
      optionId: gold.optionId,
    });
  }

  return { tp: match.matches.filter((m) => m.matched).length, fpRows, fnRows };
}

function adjudicateFn(testCase: OracleActionEvalCaseV2, gold: ExpectedPrimitiveAction): {
  finalVerdict: FnVerdict;
  policyClass: string;
  reason: string;
} {
  const livePolicyViolations = validateGoldAction(testCase, gold);
  if (livePolicyViolations.length > 0) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: livePolicyViolations[0]!.policyFamily,
      reason: livePolicyViolations[0]!.policyReason,
    };
  }

  if (gold.actionType === "sacrifice" || gold.actionType === "discard") {
    const row = classifySacrificeDiscardGold({ testCase, gold });
    if (row.verdict === "valid_layer2_gold") {
      return { finalVerdict: "genuine_parser_fn", policyClass: row.policyClass, reason: row.policyReason };
    }
    if (row.verdict === "evaluator_evidence_mismatch") {
      return { finalVerdict: "evaluator_match_defect", policyClass: row.policyClass, reason: row.policyReason };
    }
    return { finalVerdict: "invalid_gold", policyClass: row.policyClass, reason: row.policyReason };
  }

  if (gold.actionType === "cast") {
    const row = classifyCastGold({ testCase, gold });
    if (row.verdict === "valid_layer2_gold") {
      return { finalVerdict: "genuine_parser_fn", policyClass: row.castPolicyClass, reason: row.policyReason };
    }
    if (row.verdict === "evaluator_evidence_mismatch") {
      return { finalVerdict: "evaluator_match_defect", policyClass: row.castPolicyClass, reason: row.policyReason };
    }
    return { finalVerdict: "invalid_gold", policyClass: row.castPolicyClass, reason: row.policyReason };
  }

  const stratum = testCase.coverageStratum ?? "";
  const ev = gold.evidenceContains ?? "";

  if (stratum === "policy_trigger_condition") {
    if (/^(When|Whenever|At the beginning)/i.test(ev) && !/,/.test(ev.slice(0, 40))) {
      return {
        finalVerdict: "invalid_gold",
        policyClass: "trigger_event_reference",
        reason: "Policy stratum gold appears to be trigger-event reference, not resolving effect.",
      };
    }
    if (gold.actionType === "cast") {
      return { finalVerdict: "invalid_gold", policyClass: "cast_permission", reason: "Cast in policy_trigger_condition stratum." };
    }
  }

  if (gold.actionType === "put_counter" && /put a \+1\/\+1 counter/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Imperative put_counter — valid L2." };
  }
  if (gold.actionType === "create_token" && /create (?:a|an|X|\d+)/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Create token effect — valid L2." };
  }
  if (gold.actionType === "draw" && /draw (?:a|cards?)/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Draw effect — valid L2." };
  }
  if (gold.actionType === "return_to_battlefield" && /return .* to the battlefield/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Gy→bf return — valid L2." };
  }
  if (gold.actionType === "exile" && /exile (?:target|any number|up to)/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Exile effect — valid L2." };
  }
  if (gold.actionType === "search_library" && /search(?:es)? (?:their )?(?:library|graveyard)/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Search/tutor effect — valid L2." };
  }
  if (
    gold.actionType === "draw" &&
    /draw in each of their draw steps/i.test(ev) &&
    /Whenever an opponent draws/i.test(testCase.oracleText)
  ) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "trigger_event_reference",
      reason: "Draw reference embedded in trigger-event condition — not resolving effect draw.",
    };
  }
  if (stratum === "challenge_replacement" && gold.actionType === "draw" && /draw three cards/i.test(ev)) {
    if (/Whenever this creature attacks.*draw three cards/i.test(testCase.oracleText.replace(/\n/g, " "))) {
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: "triggered_effect_layer2",
        reason: "Triggered draw on attack — valid L2 (gold semanticJustification mis-tagged replacement_event).",
      };
    }
  }
  if (gold.actionType === "destroy" && /destroy target/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Destroy effect — valid L2." };
  }
  if (gold.actionType === "search_library" && /search (?:your )?library/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Search effect — valid L2." };
  }
  if (gold.actionType === "copy" && /\bcopy\b/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Copy effect — valid L2." };
  }
  if (gold.actionType === "deal_damage" && /deals? \d+ damage/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Damage effect — valid L2." };
  }
  if (gold.actionType === "return_to_hand" && /return .* to (?:your )?hand/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Return to hand — valid L2." };
  }
  if (gold.actionType === "return_to_battlefield" && /return .* to your hand/i.test(ev)) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "wrong_primitive_label",
      reason: "Gold labels return_to_battlefield but evidence is gy→hand (return_to_hand).",
    };
  }
  if (gold.actionType === "tap" && /\btap\b/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Tap effect — valid L2." };
  }
  if (gold.actionType === "mill" && /\bmills?\b/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Mill effect — valid L2." };
  }
  if (gold.actionType === "shuffle_into_library" && /shuffle .* into .* library/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Shuffle into library — valid L2." };
  }
  if (gold.actionType === "put_onto_battlefield" && /put .* onto the battlefield/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Put onto battlefield — valid L2." };
  }
  if (gold.actionType === "play" && /play lands?/i.test(ev)) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "static_play_permission_layer1",
      reason: "Play lands permission — Layer-1 static permission, not resolving L2 play action.",
    };
  }
  if (stratum === "challenge_replacement") {
    if (/,\s*instead\b/i.test(testCase.oracleText) && gold.actionType === "draw") {
      return {
        finalVerdict: "invalid_gold",
        policyClass: "replacement_event_reference",
        reason: "Draw inside replacement 'instead' clause — replacement structural event, not imperative L2 draw gold.",
      };
    }
    if (gold.actionType === "tap" && /,\s*instead\b/i.test(testCase.oracleText)) {
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: "replacement_resolving_effect",
        reason: "Tap in replacement resolving branch — valid L2 if parser emits.",
      };
    }
  }
  if (gold.actionType === "shuffle_library" && /shuffle/i.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Shuffle — valid L2." };
  }
  if (gold.actionType === "add_mana" && /Add \{/.test(ev)) {
    return { finalVerdict: "genuine_parser_fn", policyClass: "resolving_effect_layer2", reason: "Add mana effect — valid L2." };
  }

  return { finalVerdict: "unsupported", policyClass: "unclassified", reason: "Requires human review." };
}

function classifyInvalidGoldSubpartition(
  policyClass: string,
  gold: ExpectedPrimitiveAction,
): string {
  if (policyClass === "wrong_primitive_label") return "wrong_primitive_label";
  if (policyClass === "replacement_event_reference") return "replacement_event_reference";
  if (policyClass === "trigger_event_reference") return "trigger_event_reference";
  if (
    policyClass === "alternative_spell_cost_layer1" ||
    policyClass === "alternative_additional_cost_layer1" ||
    policyClass === "activated_additional_cost_layer1" ||
    policyClass === "additional_spell_cost_layer1"
  ) {
    return "alternative_additional_cost_layer1";
  }
  if (policyClass === "static_play_permission_layer1" || policyClass === "cast_play_permission_layer1") {
    return "cast_play_permission_layer1";
  }
  if (gold.actionType === "cast" && policyClass === "other") return "cast_trigger_condition_reference";
  if (gold.actionType === "play") return "cast_play_permission_layer1";
  if (gold.actionType === "cast") return "cast_play_permission_layer1";
  return policyClass;
}

function adjudicateFp(
  testCase: OracleActionEvalCaseV2,
  observedAction: string,
  observedEvidence: string,
): { finalVerdict: FpVerdict; policyClass: string; reason: string; recommendedGoldAddition?: ExpectedPrimitiveAction } {
  const blind = adjudicateOfficialFpGoldCompleteness({
    testCase,
    actionType: observedAction,
    evidenceContains: observedEvidence,
    abilityType: "unknown",
  });

  if (blind.verdict === "missing_gold") {
    return {
      finalVerdict: "missing_gold",
      policyClass: blind.policyReason.slice(0, 40),
      reason: blind.policyReason,
      recommendedGoldAddition: blind.recommendedGoldAddition,
    };
  }
  if (blind.verdict === "evaluator_defect") {
    return { finalVerdict: "evaluator_match_defect", policyClass: "evaluator", reason: blind.policyReason };
  }
  if (blind.verdict === "out_of_scope_emission") {
    return { finalVerdict: "scope_defect", policyClass: "scope", reason: blind.policyReason };
  }
  return { finalVerdict: "genuine_parser_fp", policyClass: "parser", reason: blind.policyReason };
}

function buildDenominatorReconciliation(
  preCases: OracleActionEvalCaseV2[],
  postCases: OracleActionEvalCaseV2[],
) {
  const preById = Object.fromEntries(preCases.map((c) => [c.id, c]));
  const postById = Object.fromEntries(postCases.map((c) => [c.id, c]));
  const removed: Array<Record<string, unknown>> = [];
  const added: Array<Record<string, unknown>> = [];
  const retained = { count: 0 };

  for (const id of Object.keys(preById)) {
    const preGold = preById[id]!.expectedPrimitiveActions.filter((g) => !g.negative);
    const postGold = postById[id]?.expectedPrimitiveActions.filter((g) => !g.negative) ?? [];
    const postKeys = new Set(postGold.map(goldKey));
    for (const g of preGold) {
      if (postKeys.has(goldKey(g))) {
        retained.count++;
      } else {
        removed.push({ caseId: id, cardName: preById[id]!.cardName, actionType: g.actionType, evidenceContains: g.evidenceContains });
      }
    }
  }
  for (const id of Object.keys(postById)) {
    const preGold = preById[id]?.expectedPrimitiveActions.filter((g) => !g.negative) ?? [];
    const postGold = postById[id]!.expectedPrimitiveActions.filter((g) => !g.negative);
    const preKeys = new Set(preGold.map(goldKey));
    for (const g of postGold) {
      if (!preKeys.has(goldKey(g))) {
        added.push({ caseId: id, cardName: postById[id]!.cardName, actionType: g.actionType, evidenceContains: g.evidenceContains });
      }
    }
  }

  const preTotal = countPositiveGold(preCases);
  const postTotal = countPositiveGold(postCases);
  return {
    prePolicyDenominator: preTotal,
    postPolicyDenominator: postTotal,
    delta: postTotal - preTotal,
    accounting: {
      start: preTotal,
      removedInvalidGold: removed.length,
      addedMissingOrCompleteGold: added.length,
      end: preTotal - removed.length + added.length,
      matchesPostTotal: preTotal - removed.length + added.length === postTotal,
    },
    removed,
    added,
    retainedCount: retained.count,
  };
}

function simulateValidatorWithoutPermissionBranch(testCase: OracleActionEvalCaseV2, gold: ExpectedPrimitiveAction): boolean {
  if (gold.negative || gold.actionType !== "cast") return false;
  const semantic = enrichGoldAction(testCase, gold);
  const castAdj = classifyCastGold({ testCase, gold });
  const invalidVerdict =
    castAdj.verdict === "gold_defect_remove_from_l2" || castAdj.verdict === "gold_defect_relabel";
  if (invalidVerdict) return true;
  if (isPersistentZoneCastPermission(gold.evidenceContains ?? "")) return true;
  return false;
}

function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const head = execSync("git rev-parse HEAD", { cwd: resolve("."), encoding: "utf8" }).trim();

  const envelope = JSON.parse(readFileSync(V14_PATH, "utf8")) as {
    contentHash: string;
    cases: OracleActionEvalCaseV2[];
    parserExecutionCount: number;
  };
  const pre = JSON.parse(readFileSync(PRE_POLICY_PATH, "utf8")) as { contentHash: string; cases: OracleActionEvalCaseV2[] };
  const cert = JSON.parse(readFileSync(CERT_PATH, "utf8"));
  const corr = JSON.parse(readFileSync(CORR_PATH, "utf8"));
  const aggregate = JSON.parse(readFileSync(AGGREGATE_PATH, "utf8"));
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as {
    cases: Array<{ caseId: string; semanticParse: OracleSemanticParse }>;
  };

  if (envelope.parserExecutionCount !== 1) throw new Error("v14 must be spent");
  const rawById = Object.fromEntries(raw.cases.map((c) => [c.caseId, c.semanticParse]));
  const caseById = Object.fromEntries(envelope.cases.map((c) => [c.id, c]));

  const liveValidation = validateBenchmarkGoldPolicy({
    cases: envelope.cases,
    benchmarkHash: envelope.contentHash,
    benchmarkPath: V14_PATH,
  });
  const permHits = liveValidation.violations.filter((v) => v.policyFamily === "cast_play_permission_layer1");

  const policyStackPinned = computeGoldPolicyStackHashes();

  const certDiscrepancy = {
    classification: "validator_changed_after_certification",
    summary:
      "Certificate (20:51) recorded violations=0 on benchmark hash 07675ba1. Execution preflight live validator found 10 cast_play_permission_layer1 hits on the same hash. " +
      "All 10 retained cast gold entries already carry stored semanticJustification.executionContext=permission from correction-time enrichGoldAction. " +
      "Eight of ten fail only via validator branch executionContext===permission (wouldFailWithoutPermissionBranch=false); classifyCastGold still returns valid_layer2_gold. " +
      "Certificate reflected a validator stack that did not yet enforce permission-context rejection — that guard became active before execution. " +
      "Contributing drift: oracle-span-role-classifier.ts modified during RC4; policy registry hash differs (cert dd83f64c vs live f04feed1).",
    hashes: {
      benchmarkHash: envelope.contentHash,
      benchmarkHashMatchCert: envelope.contentHash === cert.benchmarkHash,
      policyRegistryHashCertified: cert.policyRegistryHash,
      policyRegistryHashLive: sha256File("data/milestones/rc3-foundations/gold-policy-registry-v1.json"),
      validatorSourceHash: validatorSourceHash(),
      validatorSourceHashCert: cert.validatorHash,
      validatorReportHash: liveValidation.validatorHash,
      enrichmentFileHash: sha256File("scripts/lib/gold-semantic-enrichment-v1.ts"),
      validatorFileHash: sha256File("scripts/lib/gold-policy-validator-v1.ts"),
      spanRoleClassifierHash: sha256File("src/lib/deck-builder/golden-catalog/oracle-span-role-classifier.ts"),
      runnerConfigHash: sha256File("scripts/run-gold-policy-validator.ts"),
      correctionReportValidatorHash: corr.validation.validatorHash,
      certificateGenerationCommit: "unknown-uncommitted-worktree",
      liveValidationCommit: head,
      policyStackPinned,
    },
    rejectedClassifications: {
      certificate_stale: "partial — cert accurate at issuance instant but not at execution preflight",
      validator_changed: true,
      policy_registry_changed: true,
      enrichment_changed: "partial — span-role classifier drift contributes to permission routing",
      live_validator_false_positive: false,
      certificate_validator_false_negative: true,
    },
    livePermissionHits: permHits.map((v) => ({
      caseId: v.caseId,
      cardName: v.cardName,
      actionType: v.actionType,
      evidenceContains: v.evidenceContains,
      storedSemanticExecutionContext:
        caseById[v.caseId]?.expectedPrimitiveActions.find(
          (g) => g.actionType === v.actionType && g.evidenceContains === v.evidenceContains,
        )?.semanticJustification?.executionContext ?? null,
      wouldFailWithoutPermissionBranch: simulateValidatorWithoutPermissionBranch(
        caseById[v.caseId]!,
        caseById[v.caseId]!.expectedPrimitiveActions.find(
          (g) => g.actionType === v.actionType && g.evidenceContains === v.evidenceContains,
        )!,
      ),
      isOneShotCastNow: (() => {
        const tc = caseById[v.caseId]!;
        const gold = tc.expectedPrimitiveActions.find((g) => g.actionType === v.actionType)!;
        const sem = enrichGoldAction(tc, gold);
        const idx = tc.oracleText.toLowerCase().indexOf((gold.evidenceContains ?? "").toLowerCase().slice(0, 20));
        const hostStart = Math.max(0, idx);
        return isOneShotCastPermission(tc.oracleText, hostStart, gold.evidenceContains ?? "");
      })(),
      isPersistentZoneCast: isPersistentZoneCastPermission(v.evidenceContains),
    })),
  };

  const freeze = JSON.parse(readFileSync("data/milestones/validation-v14-certification/validation-v14-freeze-manifest-v140.json", "utf8"));
  const denominator = buildDenominatorReconciliation(pre.cases, envelope.cases);
  const authoritativeDenominator = {
    prePolicyLayer2GoldPrimitiveCount: freeze.validationV14.layer2GoldPrimitiveCount,
    prePolicyGoldDenominatorField: freeze.validationV14.goldDenominator,
    postPolicyScoredDenominator: corr.validation.goldActionCount,
    correctionReportPass: corr.validation.pass,
    prePolicyViolationsBeforeCorrection: freeze.goldPolicyValidation.prePolicyViolations,
    accounting: {
      start: freeze.validationV14.layer2GoldPrimitiveCount,
      removedInvalidGold:
        freeze.validationV14.layer2GoldPrimitiveCount - corr.validation.goldActionCount,
      addedMissingOrCompleteGold: 0,
      end: corr.validation.goldActionCount,
      matchesExecutionDenominator: corr.validation.goldActionCount === OFFICIAL.goldDenominator,
    },
    note:
      "On-disk pre-policy sealed artifact was overwritten post-correction (contentHash=07675ba1). " +
      "Authoritative lineage uses freeze manifest + correction report metadata, not file diff.",
    fileDiffAttempt: denominator,
  };

  const allFp: Array<Record<string, unknown>> = [];
  const allFn: Array<Record<string, unknown>> = [];
  let tp = 0;
  for (const tc of envelope.cases) {
    const parse = rawById[tc.id];
    const { tp: t, fpRows, fnRows } = evaluateOfficialFpFn(tc, parse);
    tp += t;
    allFp.push(...fpRows);
    allFn.push(...fnRows);
  }

  if (allFp.length !== OFFICIAL.fp) throw new Error(`FP row count ${allFp.length} !== ${OFFICIAL.fp}`);
  if (allFn.length !== OFFICIAL.fn) throw new Error(`FN row count ${allFn.length} !== ${OFFICIAL.fn}`);
  if (tp !== OFFICIAL.tp) throw new Error(`TP ${tp} !== ${OFFICIAL.tp}`);

  const fnLedger = allFn.map((row) => {
    const tc = caseById[row.caseId as string];
    const gold = tc.expectedPrimitiveActions.find(
      (g) =>
        !g.negative &&
        g.actionType === row.expectedAction &&
        g.evidenceContains === row.goldEvidence,
    )!;
    const adj = adjudicateFn(tc, gold);
    return {
      mismatchId: createHash("sha256")
        .update(`${row.caseId}|${row.expectedAction}|${row.goldEvidence}`)
        .digest("hex")
        .slice(0, 16),
      ...row,
      caseScope: tc.caseScope,
      coverageStratum: tc.coverageStratum,
      finalVerdict: adj.finalVerdict,
      policyClass: adj.policyClass,
      invalidGoldSubpartition:
        adj.finalVerdict === "invalid_gold" ? classifyInvalidGoldSubpartition(adj.policyClass, gold) : null,
      adjudicationReason: adj.reason,
      livePolicyViolationFamilies: validateGoldAction(tc, gold).map((v) => v.policyFamily),
    };
  });

  const fpLedger = allFp.map((row) => {
    const tc = caseById[row.caseId as string];
    const adj = adjudicateFp(tc, row.observedAction as string, row.observedEvidence as string);
    return {
      gateFpId: `${row.caseId}|${row.observedAction}|${row.observedEvidence}|${row.actionIndex}`,
      ...row,
      caseScope: tc.caseScope,
      coverageStratum: tc.coverageStratum,
      finalVerdict: adj.finalVerdict,
      policyClass: adj.policyClass,
      adjudicationReason: adj.reason,
      recommendedGoldAddition: adj.recommendedGoldAddition,
    };
  });

  const fnIds = new Set(fnLedger.map((r) => r.mismatchId));
  const fpIds = new Set(fpLedger.map((r) => r.gateFpId));
  if (fnLedger.length !== 42 || fnIds.size !== 42) throw new Error("FN ledger integrity failed");
  if (fpLedger.length !== 11 || fpIds.size !== 11) throw new Error("FP ledger integrity failed");

  const invalidGoldFnKeys = new Set(
    fnLedger.filter((r) => r.finalVerdict === "invalid_gold").map((r) => `${r.caseId}|${r.expectedAction}|${r.goldEvidence}`),
  );
  const missingGoldAdds = fpLedger.filter((r) => r.finalVerdict === "missing_gold" && r.recommendedGoldAddition);

  let diagTp = 0;
  let diagFp = 0;
  let diagFn = 0;
  for (const tc of envelope.cases) {
    const parse = rawById[tc.id];
    const filteredGold = tc.expectedPrimitiveActions.filter((g) => {
      if (g.negative) return true;
      const key = `${tc.id}|${g.actionType}|${g.evidenceContains}`;
      return !invalidGoldFnKeys.has(key);
    });
    const additions = missingGoldAdds.filter((r) => r.caseId === tc.id).map((r) => r.recommendedGoldAddition!);
    const adjustedCase = { ...tc, expectedPrimitiveActions: [...filteredGold.filter((g) => !g.negative), ...additions] };
    const { tp: t, fpRows, fnRows } = evaluateOfficialFpFn(adjustedCase, parse);
    diagTp += t;
    diagFp += fpRows.length;
    diagFn += fnRows.length;
  }
  const diagPrecision = diagTp + diagFp > 0 ? diagTp / (diagTp + diagFp) : 1;
  const diagRecall = diagTp + diagFn > 0 ? diagTp / (diagTp + diagFn) : 1;

  const genuineParserFn = fnLedger.filter((r) => r.finalVerdict === "genuine_parser_fn");
  const genuineParserFp = fpLedger.filter((r) => r.finalVerdict === "genuine_parser_fp");
  const invalidGoldFn = fnLedger.filter((r) => r.finalVerdict === "invalid_gold");
  const missingGoldFp = fpLedger.filter((r) => r.finalVerdict === "missing_gold");
  const unsupportedFn = fnLedger.filter((r) => r.finalVerdict === "unsupported");

  const invalidGoldSubpartition = invalidGoldFn.reduce<Record<string, number>>((a, r) => {
    const k = (r.invalidGoldSubpartition as string) ?? "unclassified";
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});
  const subpartitionSum = Object.values(invalidGoldSubpartition).reduce((s, n) => s + n, 0);
  if (invalidGoldFn.length !== subpartitionSum) throw new Error("invalid_gold subpartition sum mismatch");
  if (unsupportedFn.length > 0) throw new Error(`unsupported FN rows: ${unsupportedFn.length}`);

  const accountingAssertions = {
    fnRowCount: 42,
    fpRowCount: 11,
    fnPartitionSum: fnLedger.length,
    fpPartitionSum: fpLedger.length,
    invalidGoldCount: invalidGoldFn.length,
    invalidGoldSubpartitionSum: subpartitionSum,
    invalidGoldSubpartition,
    genuineParserFnCount: genuineParserFn.length,
    genuineParserFpCount: genuineParserFp.length,
    missingGoldFpCount: missingGoldFp.length,
    unsupportedFnCount: unsupportedFn.length,
    policyCorrectedTpPlusFnEqualsDenominator: diagTp + diagFn === 254 - invalidGoldFn.length + missingGoldFp.length,
    arithmeticClosure:
      invalidGoldFn.length + genuineParserFn.length === 42 &&
      missingGoldFp.length + genuineParserFp.length === 11,
  };
  if (!accountingAssertions.arithmeticClosure) throw new Error("FN/FP arithmetic closure failed");
  if (!accountingAssertions.policyCorrectedTpPlusFnEqualsDenominator) {
    throw new Error("Policy-corrected TP+FN != adjusted denominator");
  }

  const familyCensus: Record<string, number> = {};
  for (const r of genuineParserFn) {
    const k = `${r.coverageStratum}|${r.expectedAction}`;
    familyCensus[k] = (familyCensus[k] ?? 0) + 1;
  }

  const policyTriggerFn = fnLedger.filter((r) => r.coverageStratum === "policy_trigger_condition");
  const sagaFp = fpLedger.filter((r) => r.coverageStratum === "broad_saga_planeswalker");
  const replacementFn = fnLedger.filter((r) => r.coverageStratum === "challenge_replacement");
  const grantedFn = fnLedger.filter((r) => r.coverageStratum === "challenge_granted_nested_actions");

  const artifact = {
    artifactType: "ValidationForensicAdjudication",
    version: "validation-v14-forensic-adjudication-v2",
    frozen: true,
    frozenAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    policyStackPinned,
    officialV14: OFFICIAL,
    accountingAssertions,
    certificateDiscrepancy: certDiscrepancy,
    denominatorReconciliation: authoritativeDenominator,
    fnLedger: {
      rowCount: fnLedger.length,
      partition: fnLedger.reduce<Record<string, number>>((a, r) => {
        a[r.finalVerdict] = (a[r.finalVerdict] ?? 0) + 1;
        return a;
      }, {}),
      rows: fnLedger,
    },
    fpLedger: {
      rowCount: fpLedger.length,
      partition: fpLedger.reduce<Record<string, number>>((a, r) => {
        a[r.finalVerdict] = (a[r.finalVerdict] ?? 0) + 1;
        return a;
      }, {}),
      rows: fpLedger,
    },
    focusAreas: {
      policyTriggerCondition: {
        fnRows: policyTriggerFn,
        overlapWithLivePermissionHits: policyTriggerFn.filter((r) =>
          certDiscrepancy.livePermissionHits.some((h) => h.caseId === r.caseId),
        ),
      },
      broadSagaPlaneswalkerFpCluster: {
        fpRows: sagaFp,
        detail: sagaFp.map((r) => {
          const tc = caseById[r.caseId as string];
          return {
            ...r,
            oracleText: tc.oracleText,
            goldActions: tc.expectedPrimitiveActions.filter((g) => !g.negative),
          };
        }),
      },
      challengeReplacementFn: replacementFn,
      challengeGrantedNestedFn: grantedFn,
    },
    policyCorrectedDiagnostic: {
      label: "validation_v14_mismatch_adjudicated_forensic_v2",
      note: "NOT official v14 — forensic view only; does not rewrite spent holdout",
      tp: diagTp,
      fp: diagFp,
      fn: diagFn,
      precision: diagPrecision,
      recall: diagRecall,
      invalidGoldFnRemoved: invalidGoldFn.length,
      missingGoldFpAdded: missingGoldFp.length,
    },
    genuineParserFailureCensus: {
      genuineParserFnCount: genuineParserFn.length,
      genuineParserFpCount: genuineParserFp.length,
      byStratumAction: familyCensus,
      genuineParserFnRows: genuineParserFn,
      genuineParserFpRows: genuineParserFp,
    },
  };

  const outPath = resolve(OUT_DIR, "validation-v14-forensic-adjudication-v2.json");
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

  const freezeManifest = {
    manifestVersion: "validation-v14-forensic-freeze-v2",
    frozenAt: artifact.frozenAt,
    forensicArtifactPath: "data/milestones/validation-v14-certification/validation-v14-forensic-adjudication-v2.json",
    forensicArtifactHash: createHash("sha256").update(JSON.stringify(artifact, null, 2)).digest("hex"),
    policyStackCompositeHash: policyStackPinned.stackCompositeHash,
    officialV14: OFFICIAL,
    note: "Frozen forensic ledger — do not mutate. v14 official result remains FAIL/SPENT.",
  };
  writeFileSync(
    resolve(OUT_DIR, "validation-v14-forensic-freeze-manifest-v2.json"),
    `${JSON.stringify(freezeManifest, null, 2)}\n`,
  );

  const adjudicationPath = resolve(OUT_DIR, "validation-v14-policy-adjudication-v2.json");
  writeFileSync(
    adjudicationPath,
    `${JSON.stringify(
      {
        artifactType: "ValidationPolicyAdjudication",
        version: "validation-v14-policy-adjudication-v2",
        frozen: true,
        frozenAt: artifact.frozenAt,
        generatedAt: artifact.generatedAt,
        parserBlind: true,
        policyStackPinned,
        officialSpentFirstRun: {
          ...OFFICIAL,
          note: "IMMUTABLE OFFICIAL v14 FIRST RUN — FAIL / SPENT — never rewrite",
        },
        accountingAssertions,
        certificateDiscrepancy: certDiscrepancy,
        denominatorReconciliation: authoritativeDenominator,
        canonicalFnLedger: artifact.fnLedger,
        canonicalFpLedger: artifact.fpLedger,
        focusAreas: artifact.focusAreas,
        genuineParserFailureCensus: artifact.genuineParserFailureCensus,
      },
      null,
      2,
    )}\n`,
  );

  const diagnosticPath = resolve(OUT_DIR, "validation-v14-policy-corrected-diagnostic-v2.json");
  writeFileSync(
    diagnosticPath,
    `${JSON.stringify(
      {
        artifactType: "ValidationPolicyCorrectedDiagnostic",
        version: "validation-v14-policy-corrected-diagnostic-v2",
        frozen: true,
        frozenAt: artifact.frozenAt,
        generatedAt: artifact.generatedAt,
        adjudicationRef: "validation-v14-policy-adjudication-v2.json",
        policyStackPinned,
        officialSpentFirstRun: {
          ...OFFICIAL,
          note: "IMMUTABLE OFFICIAL v14 FIRST RUN — FAIL / SPENT — never rewrite",
        },
        accountingFormula: {
          goldDenominator: "original(254) - invalidGoldFn + missingGoldFp",
          tp: "original(212) + missingGoldFp",
          fp: "genuineParserFp + evaluatorFp + scopeFp",
          fn: "genuineParserFn + evaluatorFn + unsupportedFn",
          invariant: "TP + FN === goldDenominator",
        },
        policyCorrected: {
          goldDenominator: diagTp + diagFn,
          tp: diagTp,
          fp: diagFp,
          fn: diagFn,
          precision: diagPrecision,
          recall: diagRecall,
        },
        inputs: {
          invalidGoldFnRemoved: invalidGoldFn.length,
          missingGoldFpAdded: missingGoldFp.length,
          genuineParserFnRetained: genuineParserFn.length,
          genuineParserFpRetained: genuineParserFp.length,
        },
        releaseGatePassUnderPolicyCorrection: false,
        note: "Hypothetical post-adjudication view — v14 official result remains FAIL/SPENT.",
      },
      null,
      2,
    )}\n`,
  );

  console.log(JSON.stringify({ outPath, adjudicationPath, diagnosticPath, summary: {
    certClass: certDiscrepancy.classification,
    livePermissionHits: certDiscrepancy.livePermissionHits.length,
    denominator: authoritativeDenominator.accounting,
    fnPartition: artifact.fnLedger.partition,
    fpPartition: artifact.fpLedger.partition,
    policyCorrected: artifact.policyCorrectedDiagnostic,
    genuineParserFn: genuineParserFn.length,
    genuineParserFp: genuineParserFp.length,
  }}, null, 2));
}

main();
