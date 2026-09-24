/**
 * v15 forensic diagnosis v1.4 — reminder-derived gold audit under validator v1.6 + policy-corrected diagnostic.
 * Run: cd web && npx tsx scripts/forensic-validation-v15-v1.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { OracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { matchGoldToSemanticActions, semanticActionsForMatch } from "./oracle-action-semantic-matcher";
import { countParserFalsePositives } from "./oracle-action-unified-matcher";
import {
  adjudicateOfficialFpGoldCompleteness,
  classifyCastGold,
  classifySacrificeDiscardGold,
} from "./lib/validation-v13-policy-adjudication";
import { validateBenchmarkGoldPolicy, validateGoldAction } from "./lib/gold-policy-validator-v1";
import { enrichGoldAction } from "./lib/gold-semantic-enrichment-v1";
import {
  isOneShotCastPermission,
  isPersistentZoneCastPermission,
} from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { computeGoldPolicyStackHashes } from "./lib/gold-policy-stack-v1";

const OUT_DIR = "data/milestones/validation-v15-certification";
const V15_PATH = "data/oracle-action-eval-validation-v15.json";
const AGGREGATE_PATH = `${OUT_DIR}/validation-v15-rc5-execution-1-aggregate.json`;
const RAW_PATH = `${OUT_DIR}/validation-v15-rc5-execution-1-raw.json`;
const CERT_V2_PATH = `${OUT_DIR}/validation-v15-gold-policy-certificate-v2.json`;
const CORR_PATH = `${OUT_DIR}/validation-v15-gold-policy-correction-report-v1.json`;
const FREEZE_PATH = `${OUT_DIR}/validation-v15-freeze-manifest-v150.json`;

const OFFICIAL = {
  tp: 207,
  fp: 5,
  fn: 33,
  precision: 0.9764150943396226,
  recall: 0.8625,
  goldDenominator: 240,
  validationPass: false,
  holdoutStatus: "FAIL / SPENT",
};

type FnVerdict =
  | "genuine_parser_fn"
  | "invalid_gold"
  | "wrong_primitive_gold"
  | "evaluator_defect"
  | "scope_defect"
  | "unsupported";

type FpVerdict = "genuine_parser_fp" | "missing_gold" | "evaluator_defect" | "scope_defect";

function goldKey(g: ExpectedPrimitiveAction): string {
  return `${g.actionType}|${(g.evidenceContains ?? "").toLowerCase().trim()}|${g.cardFace ?? ""}`;
}

function goldRowKey(caseId: string, gold: ExpectedPrimitiveAction): string {
  return `${caseId}|${gold.actionType}|${gold.evidenceContains}`;
}

function scanReminderDerivedAcceptedGold(cases: OracleActionEvalCaseV2[]) {
  const rows: Array<Record<string, unknown>> = [];
  for (const tc of cases) {
    for (const gold of tc.expectedPrimitiveActions.filter((g) => !g.negative)) {
      const violations = validateGoldAction(tc, gold).filter((v) => v.policyFamily === "reminder_mechanic_definition");
      if (violations.length === 0) continue;
      const semantic = enrichGoldAction(tc, gold);
      rows.push({
        caseId: tc.id,
        cardName: tc.cardName,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains,
        semanticOwner: semantic.semanticOwner,
        executionContext: semantic.executionContext,
        cardNativeLayer2Eligible: semantic.cardNativeLayer2Eligible,
        inReminderSpan: semantic.inReminderSpan,
        inTypeLineMechanicReminder: semantic.inTypeLineMechanicReminder,
        violations: violations.map((v) => ({
          code: v.code,
          policyFamily: v.policyFamily,
          reason: v.policyReason,
        })),
        adjudicationVerdict: "invalid_gold",
        note: "Reminder/mechanic span — not card-native Layer-2 under validator v1.6.",
      });
    }
  }
  return rows;
}

function policyValidGold(tc: OracleActionEvalCaseV2): ExpectedPrimitiveAction[] {
  return tc.expectedPrimitiveActions.filter((g) => !g.negative && validateGoldAction(tc, g).length === 0);
}

function rc6PolicyFilteredGenuineParserCensus(cases: OracleActionEvalCaseV2[]) {
  const baselineCases = [
    "vh15-0009",
    "vh15-0038",
    "vh15-0064",
    "vh15-0085",
    "vh15-0089",
    "vh15-0105",
    "vh15-0108",
    "vh15-0142",
  ];
  const recovered: string[] = [];
  const remaining: Array<{ caseId: string; fn: number; unmatchedGold: string[] }> = [];
  for (const caseId of baselineCases) {
    const tc = cases.find((c) => c.id === caseId);
    if (!tc) continue;
    const parse = parseOracleSemanticsRC3({
      oracleId: tc.oracleId,
      oracleText: tc.oracleText,
      cardFace: tc.cardFace,
    });
    const expected = policyValidGold(tc);
    const match = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: tc.oracleText,
      caseId: tc.id,
    });
    const fn = match.unmatchedExpectedIndices.length;
    if (fn > 0) {
      remaining.push({
        caseId,
        fn,
        unmatchedGold: match.unmatchedExpectedIndices.map((i) => {
          const g = expected[i]!;
          return `${g.actionType}|${g.evidenceContains}`;
        }),
      });
    } else {
      recovered.push(caseId);
    }
  }
  return {
    parserVersion: "oracle-action-v1.41-rc6-reminder-grant-promotion",
    baselineGenuineFnCases: baselineCases,
    recoveredCases: recovered,
    recoveredCount: recovered.length,
    remainingGenuineFnCount: remaining.length,
    remainingCases: remaining.map((r) => r.caseId),
    remainingRows: remaining,
    note: "Mechanical RC6 parser against v1.6 policy-valid gold — independent of spent RC5 raw; not a gate.",
  };
}

function evaluateOfficialFpFn(testCase: OracleActionEvalCaseV2, parse: OracleSemanticParse) {
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
      semanticOwner: a.semanticOwner,
      cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
      textRole: parse.actions[idx]?.textRole ?? null,
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

function sameTypeEmissions(parse: OracleSemanticParse, actionType: string) {
  return semanticActionsForMatch(parse)
    .filter((a) => a.reviewStatus === "accepted" && a.actionType === actionType)
    .map((a) => ({
      actionType: a.actionType,
      evidence: a.evidenceText,
      executionContext: a.executionContext,
      semanticOwner: a.semanticOwner,
      abilityIndex: a.segmentAbilityIndex,
      textRole: parse.actions[a.index]?.textRole ?? null,
    }));
}

function inferFailureStage(
  parse: OracleSemanticParse,
  gold: ExpectedPrimitiveAction,
): string {
  const sameType = sameTypeEmissions(parse, gold.actionType);
  if (sameType.length === 0) return "primitive_extraction";
  const ev = (gold.evidenceContains ?? "").toLowerCase();
  const hit = sameType.some((a) => a.evidence.toLowerCase().includes(ev.slice(0, Math.min(20, ev.length))));
  if (!hit) return "referent_resolution";
  return "evaluator";
}

function isEldraziTokenDefinitionAddManaGold(testCase: OracleActionEvalCaseV2, gold: ExpectedPrimitiveAction): boolean {
  if (gold.actionType !== "add_mana" || !/Add \{C\}/.test(gold.evidenceContains ?? "")) return false;
  return /\bThey have "[^"]*(?:Sacrifice this (?:token|creature)|Add \{C\})/i.test(testCase.oracleText);
}

function isTokenDefinitionInlineGold(testCase: OracleActionEvalCaseV2, gold: ExpectedPrimitiveAction): boolean {
  const violations = validateGoldAction(testCase, gold);
  return violations.some((v) => v.policyFamily === "token_definition_not_card_native_l2");
}

function structuralTokenCapabilityNote(
  testCase: OracleActionEvalCaseV2,
  gold?: ExpectedPrimitiveAction,
): Record<string, unknown> {
  const withQuote = /\bCreate [^.!\n]{0,160}? tokens? with "/i.test(testCase.oracleText);
  const theyHave = /\bThey have "/i.test(testCase.oracleText);
  const tokenKind = /Nightmare/i.test(testCase.oracleText)
    ? "Nightmare token"
    : /Eldrazi Scion/i.test(testCase.oracleText)
      ? "Eldrazi Scion"
      : /Eldrazi Spawn/i.test(testCase.oracleText)
        ? "Eldrazi Spawn"
        : "created_token";
  const effect =
    gold?.actionType === "put_counter"
      ? "put_counter on this token"
      : gold?.actionType === "add_mana"
        ? "add_mana {C}"
        : gold?.actionType ?? "token_defined_effect";
  return {
    createdObject: tokenKind,
    syntax: withQuote ? "create_tokens_with_quote" : theyHave ? "create_tokens_they_have" : "token_definition",
    definedTriggeredOrActivatedAbility: effect,
    correctSemanticOwner: "created_object",
    correctExecutionContext: "token_definition",
    correctCardNativeLayer2Eligible: false,
    note: "Structural token-defined capability — not a source-card card-native L2 action.",
  };
}

function adjudicateFn(
  testCase: OracleActionEvalCaseV2,
  gold: ExpectedPrimitiveAction,
  parse: OracleSemanticParse,
): { finalVerdict: FnVerdict; policyClass: string; reason: string; rc6FamilyHint?: string } {
  const livePolicyViolations = validateGoldAction(testCase, gold);
  if (livePolicyViolations.length > 0) {
    const family = livePolicyViolations[0]!.policyFamily;
    if (family === "wrong_primitive_label" || family === "target_assignment_not_copy") {
      return {
        finalVerdict: "wrong_primitive_gold",
        policyClass: family,
        reason: livePolicyViolations[0]!.policyReason,
      };
    }
    return {
      finalVerdict: "invalid_gold",
      policyClass: family,
      reason: livePolicyViolations[0]!.policyReason,
    };
  }

  const stratum = testCase.coverageStratum ?? "";
  const ev = gold.evidenceContains ?? "";
  const oracle = testCase.oracleText;
  const semantic = enrichGoldAction(testCase, gold);

  if (isEldraziTokenDefinitionAddManaGold(testCase, gold) || isTokenDefinitionInlineGold(testCase, gold)) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "token_definition_not_card_native_l2",
      reason:
        "Token definition quoted ability defines created-object capability — not source-card card-native Layer-2.",
      rc6FamilyHint: undefined,
    };
  }

  if (gold.actionType === "return_to_battlefield" && /to your hand/i.test(ev)) {
    return {
      finalVerdict: "wrong_primitive_gold",
      policyClass: "wrong_primitive_label",
      reason: "Gold labels return_to_battlefield but evidence describes gy→hand (return_to_hand).",
      rc6FamilyHint: "saga_planeswalker_semantics",
    };
  }

  if (gold.actionType === "play" && /play lands?/i.test(ev)) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "static_play_permission_layer1",
      reason: "Play lands permission — Layer-1 static permission, not resolving L2 play action.",
      rc6FamilyHint: "library_movement_distinction",
    };
  }

  if (gold.actionType === "play" && /You may play that card/i.test(ev)) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "cast_play_permission_layer1",
      reason: "Granted play permission on exiled/card reference — L1 permission, not resolving L2 play.",
      rc6FamilyHint: "granted_nested_generalization",
    };
  }

  if (gold.actionType === "cast") {
    if (/you may cast[^.]*without paying its mana cost/i.test(ev)) {
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: "one_shot_cast_without_paying",
        reason: "One-shot cast without paying mana cost — valid resolving L2 cast in triggered/immediate effect clause.",
        rc6FamilyHint: "immediate_cast_grammar",
      };
    }
    if (/cast (?:instant and sorcery|creature spells from|spells with the chosen name|if you control)/i.test(ev)) {
      return {
        finalVerdict: "invalid_gold",
        policyClass: "cast_play_permission_layer1",
        reason: "Static or conditional cast permission — L1 permission grammar, not one-shot resolving cast.",
        rc6FamilyHint: stratum.includes("immediate_cast")
          ? "immediate_cast_grammar"
          : "triggered_compound_grammar",
      };
    }
    if (/cast spells or activate abilities that aren't mana abilities/i.test(ev)) {
      return {
        finalVerdict: "invalid_gold",
        policyClass: "static_restriction_layer1",
        reason: "Replacement/static restriction on casting — not a resolving cast primitive.",
        rc6FamilyHint: "replacement_effect_parsing",
      };
    }
    if (/cast an Ally spell/i.test(ev) && /Whenever you cast/i.test(oracle)) {
      return {
        finalVerdict: "invalid_gold",
        policyClass: "trigger_event_reference",
        reason: "Cast reference inside trigger condition — L1 trigger event, not resolving cast.",
        rc6FamilyHint: "triggered_compound_grammar",
      };
    }
    const castAdj = classifyCastGold({ testCase, gold });
    if (castAdj.verdict === "valid_layer2_gold") {
      const oneShot = isOneShotCastPermission(oracle, 0, ev);
      const persistent = isPersistentZoneCastPermission(ev);
      if (persistent && !oneShot) {
        return {
          finalVerdict: "invalid_gold",
          policyClass: "cast_play_permission_layer1",
          reason: "Persistent zone cast permission — L1, not one-shot L2 cast.",
          rc6FamilyHint: "immediate_cast_grammar",
        };
      }
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: castAdj.castPolicyClass,
        reason: castAdj.policyReason,
        rc6FamilyHint: stratum.includes("immediate_cast")
          ? "immediate_cast_grammar"
          : stratum.includes("granted")
            ? "granted_nested_generalization"
            : "triggered_compound_grammar",
      };
    }
    if (castAdj.verdict === "evaluator_evidence_mismatch") {
      return {
        finalVerdict: "evaluator_defect",
        policyClass: castAdj.castPolicyClass,
        reason: castAdj.policyReason,
      };
    }
    return {
      finalVerdict: "invalid_gold",
      policyClass: castAdj.castPolicyClass,
      reason: castAdj.policyReason,
    };
  }

  if (gold.actionType === "draw" && /draw step|draw an additional/i.test(ev)) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "trigger_event_reference",
      reason: "Draw reference embedded in trigger/step condition — not resolving effect draw.",
      rc6FamilyHint: "triggered_compound_grammar",
    };
  }

  if (gold.actionType === "sacrifice" || gold.actionType === "discard") {
    const row = classifySacrificeDiscardGold({ testCase, gold });
    if (row.verdict === "valid_layer2_gold") {
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: row.policyClass,
        reason: row.policyReason,
        rc6FamilyHint: "player_subject_imperative_extraction",
      };
    }
    if (row.verdict === "evaluator_evidence_mismatch") {
      return { finalVerdict: "evaluator_defect", policyClass: row.policyClass, reason: row.policyReason };
    }
    return { finalVerdict: "invalid_gold", policyClass: row.policyClass, reason: row.policyReason };
  }

  if (stratum === "challenge_granted_nested_actions") {
    if (gold.actionType === "add_mana" && /Add \{/.test(ev)) {
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: "nested_granted_mana_ability",
        reason: "Nested granted activated mana ability — valid L2; parser failed nested extraction.",
        rc6FamilyHint: "granted_nested_generalization",
      };
    }
    if (gold.actionType === "draw" && /draw a card/i.test(ev)) {
      return {
        finalVerdict: "genuine_parser_fn",
        policyClass: "nested_granted_triggered_effect",
        reason: "Nested granted triggered draw — valid L2; parser failed nested extraction.",
        rc6FamilyHint: "granted_nested_generalization",
      };
    }
  }

  if (gold.actionType === "put_counter") {
    const emissions = sameTypeEmissions(parse, "put_counter");
    if (emissions.length > 0) {
      return {
        finalVerdict: "evaluator_defect",
        policyClass: "evaluator_evidence_mismatch",
        reason: "Parser emitted put_counter but evaluator did not match gold evidence span.",
        rc6FamilyHint: "saga_planeswalker_semantics",
      };
    }
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Put counter resolving effect — valid L2; no accepted emission.",
      rc6FamilyHint: "saga_planeswalker_semantics",
    };
  }

  if (gold.actionType === "add_mana" && /Add \{/.test(ev)) {
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Add mana resolving effect — valid L2.",
      rc6FamilyHint: stratum.includes("granted") ? "granted_nested_generalization" : undefined,
    };
  }
  if (gold.actionType === "draw" && /draw/i.test(ev)) {
    const emissions = sameTypeEmissions(parse, "draw");
    if (emissions.length > 0) {
      return {
        finalVerdict: "evaluator_defect",
        policyClass: "evaluator_evidence_mismatch",
        reason: "Parser emitted draw but gold evidence span did not match.",
        rc6FamilyHint: "mdfc_face_provenance",
      };
    }
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Draw effect — valid L2.",
    };
  }
  if (gold.actionType === "mill" && /\bmill/i.test(ev)) {
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Mill effect — valid L2.",
      rc6FamilyHint: "mdfc_face_provenance",
    };
  }
  if (gold.actionType === "deal_damage" && /deals? \d+ damage/i.test(ev)) {
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Damage effect — valid L2.",
      rc6FamilyHint: "mdfc_face_provenance",
    };
  }
  if (gold.actionType === "return_to_hand" && /return target/i.test(ev)) {
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Return to hand resolving effect — valid L2.",
      rc6FamilyHint: "zone_transition_effects",
    };
  }
  if (gold.actionType === "shuffle_into_library" && /shuffle/i.test(ev)) {
    return {
      finalVerdict: "genuine_parser_fn",
      policyClass: "resolving_effect_layer2",
      reason: "Shuffle into library — valid L2.",
      rc6FamilyHint: "saga_planeswalker_semantics",
    };
  }

  if (semantic.executionContext === "permission" && semantic.cardNativeLayer2Eligible === false) {
    return {
      finalVerdict: "invalid_gold",
      policyClass: "permission_context_layer1",
      reason: "Semantic enrichment marks permission context — not card-native L2.",
    };
  }

  const stage = inferFailureStage(parse, gold);
  if (stage === "evaluator") {
    return {
      finalVerdict: "evaluator_defect",
      policyClass: "evaluator_evidence_mismatch",
      reason: "Same-type emission present but official matcher missed gold evidence.",
    };
  }

  return {
    finalVerdict: "genuine_parser_fn",
    policyClass: "resolving_effect_layer2",
    reason: `Valid L2 ${gold.actionType} — parser missing emission (${stage}).`,
    rc6FamilyHint: stratum.includes("granted")
      ? "granted_nested_generalization"
      : stratum.includes("immediate_cast")
        ? "immediate_cast_grammar"
        : stratum.includes("library")
          ? "library_movement_distinction"
          : stratum.includes("saga") || stratum.includes("planeswalker")
            ? "saga_planeswalker_semantics"
            : "triggered_compound_grammar",
  };
}

function adjudicateFp(
  testCase: OracleActionEvalCaseV2,
  observedAction: string,
  observedEvidence: string,
): {
  finalVerdict: FpVerdict;
  policyClass: string;
  reason: string;
  recommendedGoldAddition?: ExpectedPrimitiveAction;
} {
  const blind = adjudicateOfficialFpGoldCompleteness({
    testCase,
    actionType: observedAction,
    evidenceContains: observedEvidence,
    abilityType: "unknown",
  });

  if (blind.verdict === "missing_gold") {
    return {
      finalVerdict: "missing_gold",
      policyClass: "missing_gold_label",
      reason: blind.policyReason,
      recommendedGoldAddition: blind.recommendedGoldAddition,
    };
  }
  if (blind.verdict === "evaluator_defect") {
    return { finalVerdict: "evaluator_defect", policyClass: "evaluator", reason: blind.policyReason };
  }
  if (blind.verdict === "out_of_scope_emission") {
    return { finalVerdict: "scope_defect", policyClass: "scope", reason: blind.policyReason };
  }

  if (observedAction === "cast" && /You may cast this /i.test(observedEvidence)) {
    return {
      finalVerdict: "genuine_parser_fp",
      policyClass: "flashback_permission_fragment",
      reason: "Partial cast-permission fragment emission — not a resolving one-shot cast.",
      rc6FamilyHint: "immediate_cast_grammar",
    } as ReturnType<typeof adjudicateFp> & { rc6FamilyHint?: string };
  }

  if (observedAction === "create_token" && /create two tapped/i.test(observedEvidence)) {
    return {
      finalVerdict: "evaluator_defect",
      policyClass: "evaluator_evidence_mismatch",
      reason: "Parser emission may match gold with relaxed evidence — evaluator defect suspected.",
    };
  }

  if (observedAction === "add_mana" && /Add one mana of any color/i.test(observedEvidence)) {
    const hasGold = testCase.expectedPrimitiveActions.some(
      (g) => !g.negative && g.actionType === "add_mana" && /Add one mana/i.test(g.evidenceContains ?? ""),
    );
    if (hasGold) {
      return {
        finalVerdict: "evaluator_defect",
        policyClass: "evaluator_evidence_mismatch",
        reason: "Gold exists for add_mana but official matcher missed — evaluator defect.",
      };
    }
    return {
      finalVerdict: "missing_gold",
      policyClass: "missing_gold_label",
      reason: "Activated mana ability emission lacks matching gold label.",
      recommendedGoldAddition: {
        actionType: "add_mana",
        evidenceContains: observedEvidence.slice(0, 80),
      } as ExpectedPrimitiveAction,
    };
  }

  if (observedAction === "sacrifice" && /Sacrifice this (Case|enchantment)/i.test(observedEvidence)) {
    return {
      finalVerdict: "missing_gold",
      policyClass: "missing_gold_label",
      reason: "Case/enchantment sacrifice cost/effect lacks gold label.",
      recommendedGoldAddition: {
        actionType: "sacrifice",
        evidenceContains: observedEvidence,
      } as ExpectedPrimitiveAction,
    };
  }

  return { finalVerdict: "genuine_parser_fp", policyClass: "parser", reason: blind.policyReason };
}

function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const envelope = JSON.parse(readFileSync(V15_PATH, "utf8")) as {
    contentHash: string;
    cases: OracleActionEvalCaseV2[];
    parserExecutionCount: number;
  };
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as {
    cases: Array<{ caseId: string; semanticParse: OracleSemanticParse }>;
  };
  const cert = JSON.parse(readFileSync(CERT_V2_PATH, "utf8"));
  const corr = JSON.parse(readFileSync(CORR_PATH, "utf8"));
  const freeze = JSON.parse(readFileSync(FREEZE_PATH, "utf8"));

  if (envelope.parserExecutionCount !== 1) throw new Error("v15 must be spent (parserExecutionCount=1)");

  const rawById = Object.fromEntries(raw.cases.map((c) => [c.caseId, c.semanticParse]));
  const caseById = Object.fromEntries(envelope.cases.map((c) => [c.id, c]));
  const policyStackPinned = computeGoldPolicyStackHashes();

  const liveValidation = validateBenchmarkGoldPolicy({
    cases: envelope.cases,
    benchmarkHash: envelope.contentHash,
    benchmarkPath: V15_PATH,
  });

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
      (g) => !g.negative && g.actionType === row.expectedAction && g.evidenceContains === row.goldEvidence,
    )!;
    const parse = rawById[row.caseId as string];
    const semantic = enrichGoldAction(tc, gold);
    const adj = adjudicateFn(tc, gold, parse);
    const emissions = semanticActionsForMatch(parse)
      .filter((a) => a.reviewStatus === "accepted")
      .map((a) => ({
        actionType: a.actionType,
        evidence: a.evidenceText,
        executionContext: a.executionContext,
        semanticOwner: a.semanticOwner,
        textRole: parse.actions[a.index]?.textRole ?? null,
      }));
    return {
      mismatchId: createHash("sha256")
        .update(`${row.caseId}|${row.expectedAction}|${row.goldEvidence}`)
        .digest("hex")
        .slice(0, 16),
      ...row,
      oracleClause: gold.evidenceContains,
      expectedPrimitive: gold.actionType,
      clauseRole: semantic.clauseRole,
      abilityType: semantic.abilityType,
      semanticOwner: semantic.semanticOwner,
      executionContext: semantic.executionContext,
      cardNativeLayer2Eligible: semantic.cardNativeLayer2Eligible,
      parserEmissions: emissions,
      failureStage: inferFailureStage(parse, gold),
      caseScope: tc.caseScope,
      coverageStratum: tc.coverageStratum,
      finalVerdict: adj.finalVerdict,
      policyClass: adj.policyClass,
      adjudicationReason: adj.reason,
      rc6FamilyHint: adj.rc6FamilyHint ?? null,
      livePolicyViolationFamilies: validateGoldAction(tc, gold).map((v) => v.policyFamily),
      validatorGapNote:
        isEldraziTokenDefinitionAddManaGold(tc, gold) && validateGoldAction(tc, gold).length === 0
          ? "Live validator missed token-definition add_mana (pre-v1.5 created-object plural detection)."
          : isTokenDefinitionInlineGold(tc, gold) && validateGoldAction(tc, gold).length === 0
            ? "Live validator missed create-with-quote token definition (pre-v1.6 inline quote detection)."
            : null,
      structuralSemanticTarget:
        isEldraziTokenDefinitionAddManaGold(tc, gold) || isTokenDefinitionInlineGold(tc, gold)
          ? structuralTokenCapabilityNote(tc, gold)
          : null,
    };
  });

  const fpLedger = allFp.map((row) => {
    const tc = caseById[row.caseId as string];
    const adj = adjudicateFp(tc, row.observedAction as string, row.observedEvidence as string);
    return {
      gateFpId: `${row.caseId}|${row.observedAction}|${row.observedEvidence}|${row.actionIndex}`,
      ...row,
      oracleTextExcerpt: tc.oracleText.slice(0, 200),
      goldActions: tc.expectedPrimitiveActions.filter((g) => !g.negative).map((g) => ({
        actionType: g.actionType,
        evidenceContains: g.evidenceContains,
      })),
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
  if (fnLedger.length !== 33 || fnIds.size !== 33) throw new Error("FN ledger integrity failed");
  if (fpLedger.length !== 5 || fpIds.size !== 5) throw new Error("FP ledger integrity failed");

  const unsupportedFn = fnLedger.filter((r) => r.finalVerdict === "unsupported");
  if (unsupportedFn.length > 0) throw new Error(`unclassified FN rows: ${unsupportedFn.length}`);

  const reminderDerivedGoldAudit = scanReminderDerivedAcceptedGold(envelope.cases);
  const invalidReminderGoldKeys = new Set(
    reminderDerivedGoldAudit.map(
      (r) => `${r.caseId}|${r.actionType}|${r.evidenceContains}`,
    ),
  );

  const invalidGoldFnKeys = new Set(
    fnLedger
      .filter((r) => r.finalVerdict === "invalid_gold" || r.finalVerdict === "wrong_primitive_gold")
      .map((r) => `${r.caseId}|${r.expectedAction}|${r.goldEvidence}`),
  );
  const missingGoldAdds = fpLedger.filter((r) => r.finalVerdict === "missing_gold" && r.recommendedGoldAddition);

  let diagTp = 0;
  let diagFp = 0;
  let diagFn = 0;
  for (const tc of envelope.cases) {
    const parse = rawById[tc.id];
    const filteredGold = tc.expectedPrimitiveActions.filter((g) => {
      if (g.negative) return true;
      const key = goldRowKey(tc.id, g);
      return !invalidGoldFnKeys.has(key) && !invalidReminderGoldKeys.has(key);
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
  const correctedDenominator = diagTp + diagFn;

  const genuineParserFn = fnLedger.filter((r) => r.finalVerdict === "genuine_parser_fn");
  const genuineParserFp = fpLedger.filter((r) => r.finalVerdict === "genuine_parser_fp");
  const invalidGoldFn = fnLedger.filter((r) => r.finalVerdict === "invalid_gold");
  const wrongPrimitiveFn = fnLedger.filter((r) => r.finalVerdict === "wrong_primitive_gold");
  const evaluatorFn = fnLedger.filter((r) => r.finalVerdict === "evaluator_defect");
  const missingGoldFp = fpLedger.filter((r) => r.finalVerdict === "missing_gold");
  const evaluatorFp = fpLedger.filter((r) => r.finalVerdict === "evaluator_defect");

  const familyCensus: Record<string, number> = {};
  for (const r of genuineParserFn) {
    const hint = (r.rc6FamilyHint as string) ?? `${r.coverageStratum}|${r.expectedAction}`;
    familyCensus[hint] = (familyCensus[hint] ?? 0) + 1;
  }
  for (const r of genuineParserFp) {
    const hint = (r as { rc6FamilyHint?: string }).rc6FamilyHint ?? `${r.coverageStratum}|${r.observedAction}`;
    familyCensus[`FP:${hint}`] = (familyCensus[`FP:${hint}`] ?? 0) + 1;
  }

  const recommendedRc6Families = [
    {
      priority: 1,
      family: "granted_nested_generalization",
      genuineParserFn: genuineParserFn.filter((r) => r.rc6FamilyHint === "granted_nested_generalization").length,
      status: "accepted_rc6_1",
      note: "vh15-0009 Candlekeep — RC6-1 you-own-have grant detection accepted.",
      auditCases: ["vh15-0009"],
    },
    {
      priority: 2,
      family: "compound_paragraph_promotion",
      genuineParserFn: genuineParserFn.filter(
        (r) =>
          r.expectedAction === "shuffle_into_library" ||
          (r.caseId === "vh15-0108" && r.expectedAction === "deal_damage"),
      ).length,
      status: "accepted_rc6_2",
      note: "vh15-0038 shuffle_into_library + vh15-0108 If-you-do branch — RC6-2 promotion governance accepted.",
      auditCases: ["vh15-0038", "vh15-0108"],
    },
    {
      priority: 3,
      family: "imperative_lexeme_coverage",
      genuineParserFn: genuineParserFn.filter((r) =>
        ["vh15-0064", "vh15-0085", "vh15-0089", "vh15-0105"].includes(r.caseId as string),
      ).length,
      status: "wait_v16",
      note: "RC6-3 STOP — independent pattern gaps remain until post-v16.",
      auditCases: ["vh15-0064", "vh15-0085", "vh15-0089", "vh15-0105"],
    },
    {
      priority: 4,
      family: "player_subject_imperative_extraction",
      genuineParserFn: genuineParserFn.filter((r) => r.caseId === "vh15-0142").length,
      status: "wait_v16",
      note: "RC6-4 STOP — Barrin's Spite deferred until post-v16.",
      auditCases: ["vh15-0142"],
    },
  ].filter((f) => (f.genuineParserFn ?? 0) + (f.genuineParserFp ?? 0) > 0 || f.status.startsWith("accepted"));

  const rc6FamilyAudit = [
    {
      family: "granted_nested_generalization",
      cases: ["vh15-0009"],
      sharedRootHypothesis: "Quoted have-grant (including you own have) — recursive granted_object L2 extraction.",
    },
    {
      family: "compound_paragraph_promotion",
      cases: ["vh15-0038", "vh15-0108"],
      sharedRootHypothesis: "Structurally valid L2 demoted by then-clause or If-you-do optional-branch governance.",
    },
    {
      family: "imperative_lexeme_coverage",
      cases: ["vh15-0064", "vh15-0085", "vh15-0089", "vh15-0105"],
      sharedRootHypothesis: "Independent imperative pattern-table gaps — batch only for efficiency.",
    },
    {
      family: "player_subject_imperative_extraction",
      cases: ["vh15-0142"],
      sharedRootHypothesis: "Player-subject sacrifice construction in ordinary spell resolution text.",
    },
  ];

  function auditEmissionPolicy(caseId: string) {
    const parse = rawById[caseId];
    if (!parse) return null;
    return parse.actions.map((a, index) => ({
      actionIndex: index,
      actionType: a.actionType,
      evidence: a.provenance?.actionSpan?.text ?? "",
      reviewStatus: a.reviewStatus,
      extractionSource: a.extractionSource,
      executionContext: a.executionContext,
      semanticOwner: a.semanticOwner,
      cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
      textRole: parse.actions[index]?.textRole ?? null,
      parentAbilityId: a.parentAbilityId,
    }));
  }

  const emissionPolicyAudit = {
    "vh15-0038": {
      caseId: "vh15-0038",
      note: "Investigate reminder parenthetical create_token emission.",
      emissions: auditEmissionPolicy("vh15-0038"),
      finding:
        auditEmissionPolicy("vh15-0038")?.find((e) => e.actionType === "create_token")?.reviewStatus === "accepted"
          ? "INVARIANT_BLIND_SPOT: accepted card-native L2 from investigate reminder span (They create a Clue token.) — reminder must not score as L2."
          : "No accepted reminder-derived L2 — policy OK.",
    },
    "vh15-0089": {
      caseId: "vh15-0089",
      note: "Cleave mechanic reminder cast fragment vs spell-line return_to_hand.",
      emissions: auditEmissionPolicy("vh15-0089"),
      finding:
        auditEmissionPolicy("vh15-0089")?.find((e) => e.actionType === "cast")?.reviewStatus === "accepted"
          ? "INVARIANT_BLIND_SPOT: accepted cast fragment from cleave reminder (You may cast this…) — reminder must not score as L2; separate FN for spell-line return_to_hand."
          : "No accepted cleave-reminder cast L2 — policy OK.",
    },
  };

  const artifact = {
    artifactType: "ValidationForensicAdjudication",
    version: "validation-v15-forensic-adjudication-v1.4",
    supersedes: "validation-v15-forensic-adjudication-v1.3",
    readjudicationNote:
      "v1.4: mechanical re-adjudication of all reminder-derived accepted gold under validator v1.6; vh15-0038 investigate Clue create_token invalid card-native gold; RC6 policy-filtered genuine parser census; RC6-0/1/2 families accepted; RC6-3/4 wait v16.",
    frozen: true,
    frozenAt: new Date().toISOString(),
    policyStackPinned,
    officialV15: OFFICIAL,
    goldPolicyAtCertification: {
      violations: cert.violations,
      benchmarkHash: cert.benchmarkHash,
      stackCompositeHash: cert.policyStack.stackCompositeHash,
      liveViolationsNow: liveValidation.violations.length,
    },
    denominatorReconciliation: {
      prePolicyL2: freeze.validationV15?.prePolicyLayer2GoldPrimitiveCount ?? corr.prePolicyL2,
      certifiedL2: freeze.validationV15?.layer2GoldPrimitiveCount ?? corr.certifiedL2,
      officialScoredDenominator: OFFICIAL.goldDenominator,
    },
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
      challengeGrantedNested: fnLedger.filter((r) => r.coverageStratum === "challenge_granted_nested_actions"),
      challengeImmediateCast: fnLedger.filter((r) => r.coverageStratum === "challenge_immediate_cast_vs_permission"),
      broadTriggered: fnLedger.filter((r) => r.coverageStratum === "broad_triggered"),
      broadSagaPlaneswalker: [...fnLedger, ...fpLedger].filter((r) => r.coverageStratum === "broad_saga_planeswalker"),
      challengeLibraryMovement: fnLedger.filter((r) => r.coverageStratum === "challenge_library_movement_vs_search"),
    },
    policyCorrectedDiagnostic: {
      label: "validation_v15_mismatch_adjudicated_forensic_v1",
      note: "NOT official v15 — forensic view only; official remains FAIL/SPENT",
      tp: diagTp,
      fp: diagFp,
      fn: diagFn,
      correctedDenominator,
      precision: diagPrecision,
      recall: diagRecall,
      invalidGoldFnRemoved: invalidGoldFn.length + wrongPrimitiveFn.length,
      invalidReminderGoldRemoved: reminderDerivedGoldAudit.length,
      missingGoldFpAdded: missingGoldAdds.length,
    },
    reminderDerivedGoldAudit: {
      rowCount: reminderDerivedGoldAudit.length,
      invalidReminderGoldKeys: [...invalidReminderGoldKeys],
      rows: reminderDerivedGoldAudit,
    },
    rc6PolicyFilteredGenuineParserCensus: rc6PolicyFilteredGenuineParserCensus(envelope.cases),
    genuineParserFailureCensus: {
      genuineParserFnCount: genuineParserFn.length,
      genuineParserFpCount: genuineParserFp.length,
      invalidGoldFnCount: invalidGoldFn.length,
      wrongPrimitiveGoldFnCount: wrongPrimitiveFn.length,
      evaluatorFnCount: evaluatorFn.length,
      missingGoldFpCount: missingGoldFp.length,
      evaluatorFpCount: evaluatorFp.length,
      byFamilyHint: familyCensus,
      genuineParserFnRows: genuineParserFn,
      genuineParserFpRows: genuineParserFp,
    },
    recommendedRc6Families,
    rc6FamilyAudit,
    emissionPolicyAudit,
  };

  const outPath = resolve(OUT_DIR, "validation-v15-forensic-adjudication-v1.4.json");
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  writeFileSync(
    resolve(OUT_DIR, "validation-v15-policy-adjudication-v1.4.json"),
    `${JSON.stringify(
      {
        artifactType: "ValidationPolicyAdjudication",
        version: "validation-v15-policy-adjudication-v1.4",
        supersedes: "validation-v15-policy-adjudication-v1.3",
        parserBlind: true,
        officialSpentFirstRun: OFFICIAL,
        fnLedger: artifact.fnLedger,
        fpLedger: artifact.fpLedger,
        reminderDerivedGoldAudit: artifact.reminderDerivedGoldAudit,
        rc6PolicyFilteredGenuineParserCensus: artifact.rc6PolicyFilteredGenuineParserCensus,
        genuineParserFailureCensus: artifact.genuineParserFailureCensus,
        recommendedRc6Families: artifact.recommendedRc6Families,
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    resolve(OUT_DIR, "validation-v15-policy-corrected-diagnostic-v1.4.json"),
    `${JSON.stringify(
      {
        artifactType: "ValidationPolicyCorrectedDiagnostic",
        version: "validation-v15-policy-corrected-diagnostic-v1.4",
        supersedes: "validation-v15-policy-corrected-diagnostic-v1.3",
        officialSpentFirstRun: OFFICIAL,
        policyCorrected: artifact.policyCorrectedDiagnostic,
        adjudicationRef: "validation-v15-policy-adjudication-v1.4.json",
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    resolve(OUT_DIR, "validation-v15-forensic-freeze-manifest-v1.4.json"),
    `${JSON.stringify(
      {
        manifestVersion: "validation-v15-forensic-freeze-v1.4",
        supersedes: "validation-v15-forensic-freeze-manifest-v1.3.json",
        frozenAt: artifact.frozenAt,
        forensicArtifactPath: "validation-v15-forensic-adjudication-v1.4.json",
        forensicArtifactHash: createHash("sha256").update(JSON.stringify(artifact, null, 2)).digest("hex"),
        officialV15: OFFICIAL,
        note: "Frozen forensic ledger — official v15 result remains FAIL/SPENT.",
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        fnLedger: artifact.fnLedger.partition,
        fpLedger: artifact.fpLedger.partition,
        policyCorrected: artifact.policyCorrectedDiagnostic,
        reminderDerivedGoldAudit: {
          rowCount: reminderDerivedGoldAudit.length,
          rows: reminderDerivedGoldAudit.map((r) => r.caseId),
        },
        rc6PolicyFilteredGenuineParserCensus: artifact.rc6PolicyFilteredGenuineParserCensus,
        genuineParserFailureCensus: {
          fn: genuineParserFn.length,
          fp: genuineParserFp.length,
        },
        recommendedRc6Families,
      },
      null,
      2,
    ),
  );
}

main();
