/**
 * One-time forensic diagnosis of validation v12 using preserved RC2 execution output only.
 * Does NOT rerun RC2 on validation, modify gold, evaluator, parser, or thresholds.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { OracleSemanticParse, SemanticAction } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  matchGoldToSemanticActions,
  semanticActionsForMatch,
  semanticPrimitiveMatchesExpected,
  type SemanticActionForMatch,
} from "./oracle-action-semantic-matcher";
import {
  countParserFalsePositives,
  faceIdsEquivalent,
  type ExtractedActionForMatch,
} from "./oracle-action-unified-matcher";
import {
  evidenceMatchesExtracted,
  evidenceMatchesOracle,
  inferSupportedPrimitiveFromEvidence,
  type ExpectedPrimitiveAction,
} from "./oracle-action-eval-shared";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const RAW_PATH = "data/milestones/validation-v12-fresh-certification/validation-v12-rc2-execution-1-raw.json";
const DATASET_PATH = "data/oracle-action-eval-validation-v12-fresh.json";
const AGGREGATE_PATH = "data/milestones/validation-v12-fresh-certification/validation-v12-rc2-execution-1-aggregate.json";

type FnPrimaryClass =
  | "primitive_not_emitted"
  | "emitted_needs_review_only"
  | "wrong_primitive"
  | "wrong_face"
  | "wrong_ability_scope"
  | "wrong_modal_option"
  | "argument_mismatch"
  | "optionality_or_dependency_mismatch"
  | "quantity_mismatch"
  | "zone_or_object_mismatch"
  | "evidence_or_matcher_only"
  | "evaluator_defect"
  | "independently_demonstrable_gold_defect";

type FpPrimaryClass =
  | "actual_parser_over_extraction"
  | "scope_leakage"
  | "wrong_primitive"
  | "cost_reminder_static_leakage"
  | "duplicate_emission"
  | "argument_matcher_mismatch"
  | "missing_incomplete_gold"
  | "gold_taxonomy_defect"
  | "evaluator_defect";

type UnsupportedClass =
  | "evaluator_support_map_gap"
  | "malformed_truncated_evidence"
  | "genuinely_unsupported_semantic_construction"
  | "incorrect_parser_emission"
  | "taxonomy_mismatch";

interface SavedCase {
  caseId: string;
  cardName?: string;
  oracleId: string;
  semanticParse: OracleSemanticParse;
}

function stratumFromCategory(category?: string): string {
  if (!category) return "unknown";
  return category.replace(/^validation-v12-/, "");
}

function inferSemanticFamily(testCase: OracleActionEvalCaseV2, parse?: OracleSemanticParse): string {
  const gold = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const oracle = testCase.oracleText;
  const meta = (testCase as { expansionMetadata?: { family?: string } }).expansionMetadata;
  if (meta?.family) return meta.family;

  if (gold.some((g) => g.loyaltyCost) || parse?.abilities.some((a) => a.loyaltyCost)) {
    return "loyalty_ability_scoping";
  }
  if (/Choose one(?: or more|\s+or\s+both|\s+or\s+two|\s+or\s+three)?/i.test(oracle)) return "modal_structure";
  if (/Spree/i.test(oracle)) return "modal_spree_structure";
  if (gold.some((g) => g.actionType === "search_library")) return "search_destination_chain";
  if (gold.some((g) => g.actionType === "create_token" && (g as { tokenCopyOf?: string }).tokenCopyOf)) {
    return "token_copy";
  }
  if (/\bIf you would\b/i.test(oracle)) return "replacement_effect";
  if (/\b(?:can't|cannot|don't|do not)\b/i.test(oracle) && gold.length === 0) {
    return "static_permission_restriction";
  }
  if (/\bhave "/i.test(oracle)) return "granted_ability";
  if (gold.some((g) => g.actionType === "return_to_hand" || g.actionType === "return_to_battlefield")) {
    return "zone_transition";
  }
  if (gold.some((g) => g.quantityMayBeZero !== undefined) || /\bhalf\b|\ba third\b|\btwo-thirds\b/i.test(oracle)) {
    return "variable_derived_quantity";
  }
  if (/\{[^}]+\}:/.test(oracle) && !gold.some((g) => g.loyaltyCost)) return "activated_ability";
  if (/\b(?:When|Whenever|At the beginning of)\b/i.test(oracle)) return "triggered_ability";
  if (gold.some((g) => g.optionalEffect === true || g.optional === true)) return "optional_conditional";
  if (/\([^)]{20,}\)/.test(oracle)) return "reminder_heavy";
  if (testCase.cardFace || oracle.includes("\n//\n")) return "multiface";
  if (gold.some((g) => g.actionType === "play" || g.actionType === "cast")) return "recursion";
  if (gold.length > 1) return "compound_actions";
  return "simple_single_action";
}

function allTierActions(parse: OracleSemanticParse): SemanticActionForMatch[] {
  return semanticActionsForMatch(parse);
}

function acceptedActions(parse: OracleSemanticParse): SemanticActionForMatch[] {
  return allTierActions(parse).filter((a) => a.reviewStatus === "accepted");
}

function levelAMatch(exp: ExpectedPrimitiveAction, actions: SemanticActionForMatch[]): SemanticActionForMatch | null {
  for (const a of actions) {
    if (a.actionType !== exp.actionType) continue;
    if (exp.cardFace && !faceIdsEquivalent(a.faceId, exp.cardFace)) continue;
    return a;
  }
  return null;
}

function levelBMatch(
  exp: ExpectedPrimitiveAction,
  actions: SemanticActionForMatch[],
  parse: OracleSemanticParse,
): SemanticActionForMatch | null {
  for (const a of actions) {
    if (a.actionType !== exp.actionType) continue;
    if (exp.cardFace && !faceIdsEquivalent(a.faceId, exp.cardFace)) continue;
    if (exp.loyaltyCost) {
      const parent = parse.abilities.find((ab) => ab.abilityId === a.parentAbilityId);
      if (!parent || parent.loyaltyCost !== exp.loyaltyCost) continue;
    }
    if (exp.optionId) {
      const key = a.modalOptionKey ?? a.modalOptionId;
      if (!key || (key !== exp.optionId && !key.endsWith(`.${exp.optionId}`))) continue;
    }
    if (exp.abilityIndex !== undefined && a.segmentAbilityIndex !== exp.abilityIndex) continue;
    return a;
  }
  return null;
}

function goldArgMatches(action: SemanticAction, exp: ExpectedPrimitiveAction, parse: OracleSemanticParse): boolean {
  const expectedOptional = exp.optionalEffect ?? exp.optional;
  if (expectedOptional !== undefined && (action.optionalEffect ?? false) !== expectedOptional) return false;
  if (exp.optionalCost !== undefined && action.optionalCost !== exp.optionalCost) return false;
  if (exp.sourceZone) {
    const zones = action.arguments.sourceZone ?? [];
    if (!zones.some((z) => z.toLowerCase().includes(exp.sourceZone!.toLowerCase()))) return false;
  }
  if (exp.destinationZone) {
    const zones = action.arguments.destinationZone ?? [];
    if (!zones.some((z) => z.toLowerCase().includes(exp.destinationZone!.toLowerCase()))) return false;
  }
  if (exp.affectedObject) {
    const obj = action.arguments.object?.type ?? action.arguments.object?.zone ?? "";
    if (!obj.toLowerCase().includes(exp.affectedObject.toLowerCase())) return false;
  }
  if (exp.condition) {
    const cond = action.arguments.condition?.evidence?.text ?? action.arguments.condition?.payment ?? "";
    if (!cond.toLowerCase().includes(exp.condition.toLowerCase())) return false;
  }
  if (exp.targetMinimum !== undefined || exp.targetMaximum !== undefined) {
    // quantity constraints in gold — treat absence as mismatch at level C
    if (!action.arguments.quantity && (exp.targetMinimum !== undefined || exp.targetMaximum !== undefined)) {
      return false;
    }
  }
  return true;
}

function levelCMatch(
  exp: ExpectedPrimitiveAction,
  actions: SemanticActionForMatch[],
  parse: OracleSemanticParse,
): SemanticActionForMatch | null {
  for (const a of actions) {
    const b = levelBMatch(exp, [a], parse);
    if (!b) continue;
    const raw = parse.actions[a.index];
    if (!goldArgMatches(raw, exp, parse)) continue;
    return a;
  }
  return null;
}

function levelDMatch(
  exp: ExpectedPrimitiveAction,
  actions: SemanticActionForMatch[],
  parse: OracleSemanticParse,
): SemanticActionForMatch | null {
  for (const a of actions) {
    if (semanticPrimitiveMatchesExpected(a, exp, parse)) return a;
  }
  return null;
}

function recallAtLevel(
  cases: Array<{ testCase: OracleActionEvalCaseV2; parse: OracleSemanticParse }>,
  level: "A" | "B" | "C" | "D",
) {
  let tp = 0;
  let fn = 0;
  for (const { testCase, parse } of cases) {
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const allActs = allTierActions(parse);
    const accActs = acceptedActions(parse);
    if (level === "D") {
      const strict = matchGoldToSemanticActions({
        expected,
        parse,
        tier: "accepted",
        oracleText: testCase.oracleText,
      });
      tp += strict.matches.filter((m) => m.matched).length;
      fn += strict.unmatchedExpectedIndices.length;
      continue;
    }
    for (const exp of expected) {
      let matched = false;
      if (level === "A") matched = levelAMatch(exp, allActs) !== null;
      else if (level === "B") matched = levelBMatch(exp, allActs, parse) !== null;
      else matched = levelCMatch(exp, allActs, parse) !== null;
      if (matched) tp += 1;
      else fn += 1;
    }
  }
  return {
    tp,
    fn,
    goldPositive: tp + fn,
    recall: tp + fn > 0 ? tp / (tp + fn) : 1,
  };
}

function classifyFn(
  testCase: OracleActionEvalCaseV2,
  parse: OracleSemanticParse,
  exp: ExpectedPrimitiveAction,
  expIndex: number,
): { primary: FnPrimaryClass; secondary: string[]; abilityType?: string } {
  const secondary: string[] = [];
  const allActs = allTierActions(parse);
  const accActs = acceptedActions(parse);
  const strict = matchGoldToSemanticActions({
    expected: testCase.expectedPrimitiveActions.filter((e) => !e.negative),
    parse,
    tier: "accepted",
    oracleText: testCase.oracleText,
  });
  if (strict.matches[expIndex]?.matched) {
    return { primary: "evaluator_defect", secondary: ["classified_as_fn_but_strict_matched"] };
  }

  const anyTypeFace = allActs.filter(
    (a) =>
      a.actionType === exp.actionType &&
      (!exp.cardFace || faceIdsEquivalent(a.faceId, exp.cardFace)),
  );
  if (anyTypeFace.length === 0) {
    const wrongType = allActs.find((a) => evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains));
    if (wrongType && wrongType.actionType !== exp.actionType) {
      secondary.push(`emitted_${wrongType.actionType}`);
      return { primary: "wrong_primitive", secondary };
    }
    const evidenceInOracle = evidenceMatchesOracle(testCase.oracleText, exp.evidenceContains);
    if (!evidenceInOracle) {
      return { primary: "independently_demonstrable_gold_defect", secondary: ["evidence_not_in_oracle"] };
    }
    return { primary: "primitive_not_emitted", secondary };
  }

  const needsReviewOnly = anyTypeFace.every((a) => a.reviewStatus === "needs_review");
  const acceptedType = anyTypeFace.filter((a) => a.reviewStatus === "accepted");
  if (needsReviewOnly) {
    return { primary: "emitted_needs_review_only", secondary };
  }

  if (exp.cardFace && acceptedType.every((a) => !faceIdsEquivalent(a.faceId, exp.cardFace!))) {
    return { primary: "wrong_face", secondary };
  }

  if (exp.optionId) {
    const optMatch = acceptedType.some((a) => {
      const key = a.modalOptionKey ?? a.modalOptionId;
      return key === exp.optionId || key?.endsWith(`.${exp.optionId}`);
    });
    if (!optMatch && acceptedType.length > 0) {
      return { primary: "wrong_modal_option", secondary };
    }
  }

  if (exp.loyaltyCost || exp.abilityIndex !== undefined) {
    const scopeMatch = levelBMatch(exp, acceptedType, parse);
    if (!scopeMatch) {
      return {
        primary: exp.loyaltyCost ? "wrong_ability_scope" : "wrong_ability_scope",
        secondary: exp.loyaltyCost ? [`expected_loyalty_${exp.loyaltyCost}`] : [`expected_ability_${exp.abilityIndex}`],
        abilityType: parse.abilities.find((a) => a.loyaltyCost)?.abilityType,
      };
    }
  }

  const bMatch = levelBMatch(exp, accActs, parse);
  const cMatch = levelCMatch(exp, accActs, parse);
  if (bMatch && !cMatch) {
    const raw = parse.actions[bMatch.index];
    const expectedOptional = exp.optionalEffect ?? exp.optional;
    if (expectedOptional !== undefined && (raw.optionalEffect ?? false) !== expectedOptional) {
      return { primary: "optionality_or_dependency_mismatch", secondary };
    }
    if (exp.sourceZone || exp.destinationZone) {
      return { primary: "zone_or_object_mismatch", secondary };
    }
    if (exp.targetMinimum !== undefined || exp.targetMaximum !== undefined || exp.quantityMayBeZero !== undefined) {
      return { primary: "quantity_mismatch", secondary };
    }
    if (exp.condition || exp.affectedObject) {
      return { primary: "argument_mismatch", secondary };
    }
    return { primary: "argument_mismatch", secondary };
  }

  const aMatch = levelAMatch(exp, accActs);
  if (aMatch && !levelDMatch(exp, accActs, parse)) {
    if (!evidenceMatchesExtracted(aMatch.evidenceText, exp.evidenceContains)) {
      return { primary: "evidence_or_matcher_only", secondary: ["evidence_span_mismatch"] };
    }
    const expectedOptional = exp.optionalEffect ?? exp.optional;
    if (expectedOptional !== undefined && (parse.actions[aMatch.index].optionalEffect ?? false) !== expectedOptional) {
      return { primary: "optionality_or_dependency_mismatch", secondary };
    }
    return { primary: "evidence_or_matcher_only", secondary };
  }

  if (acceptedType.length > 0 && acceptedType.every((a) => a.actionType !== exp.actionType)) {
    return { primary: "wrong_primitive", secondary };
  }

  return { primary: "primitive_not_emitted", secondary: ["unresolved"] };
}

function classifyFp(
  testCase: OracleActionEvalCaseV2,
  parse: OracleSemanticParse,
  action: SemanticActionForMatch,
): FpPrimaryClass {
  const evidence = action.evidenceText;
  const primitive = action.actionType;
  const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, evidence);
  if (!supported) return "cost_reminder_static_leakage";
  if (supported !== primitive) return "wrong_primitive";

  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const forbidden = testCase.forbiddenPrimitiveActions ?? [];
  if (forbidden.includes(primitive as never)) return "actual_parser_over_extraction";

  const dup = acceptedActions(parse).filter(
    (a) => a.actionType === primitive && a.evidenceText === evidence && a.index !== action.index,
  );
  if (dup.length > 0) return "duplicate_emission";

  const goldSame = expected.some(
    (e) => e.actionType === primitive && evidenceMatchesExtracted(evidence, e.evidenceContains),
  );
  if (!goldSame && evidenceMatchesOracle(testCase.oracleText, evidence)) {
    return "missing_incomplete_gold";
  }
  if (!goldSame) return "actual_parser_over_extraction";

  if (testCase.cardFace && !faceIdsEquivalent(action.faceId, testCase.cardFace)) {
    return "scope_leakage";
  }

  const partialGold = expected.some((e) => e.actionType === primitive);
  if (partialGold) return "argument_matcher_mismatch";
  return "evaluator_defect";
}

function classifyUnsupported(
  testCase: OracleActionEvalCaseV2,
  action: SemanticActionForMatch,
): { classification: UnsupportedClass; reason: string } {
  const evidence = action.evidenceText;
  const primitive = action.actionType;
  const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, evidence);

  if (!evidenceMatchesOracle(testCase.oracleText, evidence)) {
    return { classification: "malformed_truncated_evidence", reason: "evidence not substring of oracle" };
  }
  if (evidence.length < 8) {
    return { classification: "malformed_truncated_evidence", reason: "truncated evidence span" };
  }
  if (!supported) {
    return { classification: "evaluator_support_map_gap", reason: "inferSupportedPrimitiveFromEvidence returned null" };
  }
  if (supported !== primitive) {
    if (primitive === "copy" && supported === "create_token") {
      return { classification: "taxonomy_mismatch", reason: "parser taxonomy differs from support map" };
    }
    return { classification: "incorrect_parser_emission", reason: `supported=${supported}, emitted=${primitive}` };
  }
  return { classification: "genuinely_unsupported_semantic_construction", reason: "support map agrees but flagged unsupported" };
}

function loyaltyLeakageEntries(
  testCase: OracleActionEvalCaseV2,
  parse: OracleSemanticParse,
): Array<{
  card: string;
  owningLoyaltyAbility?: string;
  loyaltyCost?: string;
  actionType: string;
  actionSpan: string;
  assignedParentAbilityId: string;
  correctParentAbilityId?: string;
  sourceOfLeakage: string;
}> {
  const leaks: ReturnType<typeof loyaltyLeakageEntries> = [];
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const match = matchGoldToSemanticActions({
    expected,
    parse,
    tier: "accepted",
    oracleText: testCase.oracleText,
  });
  const actions = semanticActionsForMatch(parse);

  for (const idx of match.unmatchedActionIndices) {
    const action = actions[idx];
    if (action.reviewStatus !== "accepted") continue;
    const parent = parse.abilities.find((a) => a.abilityId === action.parentAbilityId);
    if (parent?.loyaltyCost && !/^[-−+0-9]+:/.test(action.evidenceText)) {
      const goldLoyalty = expected.filter((e) => e.loyaltyCost).map((e) => e.loyaltyCost);
      const correctParent = parse.abilities.find(
        (a) =>
          a.loyaltyCost &&
          action.evidenceText &&
          parse.actions.some(
            (act) =>
              act.parentAbilityId === a.abilityId &&
              act.actionType === action.actionType &&
              evidenceMatchesExtracted(act.provenance.actionSpan.text, action.evidenceText),
          ),
      );
      leaks.push({
        card: testCase.cardName ?? testCase.id,
        owningLoyaltyAbility: parent.abilityId,
        loyaltyCost: parent.loyaltyCost,
        actionType: action.actionType,
        actionSpan: action.evidenceText,
        assignedParentAbilityId: action.parentAbilityId,
        correctParentAbilityId: correctParent?.abilityId,
        sourceOfLeakage:
          parent.loyaltyCost && goldLoyalty.length > 0 && !goldLoyalty.includes(parent.loyaltyCost)
            ? "action_to_block_attachment"
            : "LoyaltyAbility block construction",
      });
    }
  }
  return leaks;
}

function metricsForCases(
  rows: Array<{ testCase: OracleActionEvalCaseV2; parse: OracleSemanticParse }>,
  tier: "accepted" | "all" = "accepted",
) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let unsupported = 0;

  for (const { testCase, parse } of rows) {
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const match = matchGoldToSemanticActions({
      expected,
      parse,
      tier: tier === "accepted" ? "accepted" : "all",
      oracleText: testCase.oracleText,
    });
    const actions = semanticActionsForMatch(parse);
    const matchedGold = new Set(match.matches.filter((m) => m.matched).map((m) => m.expectedIndex));
    tp += match.matches.filter((m) => m.matched).length;
    fn += expected.length - matchedGold.size;

    const extractedForFp = actions.map((a) => ({
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
    })) as ExtractedActionForMatch[];

    if (tier === "accepted") {
      fp += countParserFalsePositives(testCase, match.unmatchedActionIndices, extractedForFp);
    }

    for (const a of parse.actions.filter((act) => act.reviewStatus === "accepted")) {
      const primitive = normalizeToPrimitive(a.actionType, a.provenance.actionSpan.text);
      const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, a.provenance.actionSpan.text);
      if (!supported || supported !== primitive) unsupported += 1;
    }
  }

  return {
    tp,
    fp,
    fn,
    precision: tp + fp > 0 ? tp / (tp + fp) : 1,
    recall: tp + fn > 0 ? tp / (tp + fn) : 1,
    unsupported,
  };
}

async function main() {
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as {
    cases: SavedCase[];
    contentHash: string;
  };
  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const aggregate = JSON.parse(readFileSync(AGGREGATE_PATH, "utf8"));

  const caseById = new Map(dataset.cases.map((c) => [c.id, c]));
  const paired = raw.cases.map((saved) => {
    const testCase = caseById.get(saved.caseId);
    if (!testCase) throw new Error(`Missing case ${saved.caseId}`);
    return { testCase, parse: saved.semanticParse, saved };
  });

  // --- Diagnostic recall levels ---
  const recallLevels = {
    levelA_primitiveExistence: recallAtLevel(paired, "A"),
    levelB_structural: recallAtLevel(paired, "B"),
    levelC_semanticArguments: recallAtLevel(paired, "C"),
    levelD_strictAccepted: recallAtLevel(paired, "D"),
  };

  // --- FN inventory (68 at strict accepted) ---
  const fnEntries: Array<{
    caseId: string;
    cardName?: string;
    stratum: string;
    family: string;
    expectedIndex: number;
    actionType: string;
    evidenceContains: string;
    primary: FnPrimaryClass;
    secondary: string[];
    abilityType?: string;
  }> = [];

  for (const { testCase, parse } of paired) {
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const strict = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: testCase.oracleText,
    });
    expected.forEach((exp, expIndex) => {
      if (strict.matches[expIndex]?.matched) return;
      const cls = classifyFn(testCase, parse, exp, expIndex);
      fnEntries.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        stratum: stratumFromCategory(testCase.category),
        family: inferSemanticFamily(testCase, parse),
        expectedIndex: expIndex,
        actionType: exp.actionType,
        evidenceContains: exp.evidenceContains,
        primary: cls.primary,
        secondary: cls.secondary,
        abilityType: cls.abilityType,
      });
    });
  }

  const fnFamilyBreakdown: Record<
    string,
    {
      goldEntries: number;
      uniqueCards: Set<string>;
      primitiveTypes: Set<string>;
      abilityTypes: Set<string>;
      examples: string[];
    }
  > = {};
  for (const fn of fnEntries) {
    if (!fnFamilyBreakdown[fn.primary]) {
      fnFamilyBreakdown[fn.primary] = {
        goldEntries: 0,
        uniqueCards: new Set(),
        primitiveTypes: new Set(),
        abilityTypes: new Set(),
        examples: [],
      };
    }
    const bucket = fnFamilyBreakdown[fn.primary];
    bucket.goldEntries += 1;
    bucket.uniqueCards.add(fn.caseId);
    bucket.primitiveTypes.add(fn.actionType);
    if (fn.abilityType) bucket.abilityTypes.add(fn.abilityType);
    if (bucket.examples.length < 3) {
      bucket.examples.push(`${fn.actionType}: ${fn.evidenceContains.slice(0, 60)}`);
    }
  }

  const fnBreakdownSerialized = Object.fromEntries(
    Object.entries(fnFamilyBreakdown).map(([k, v]) => [
      k,
      {
        goldEntriesAffected: v.goldEntries,
        uniqueCardsAffected: v.uniqueCards.size,
        primitiveTypes: [...v.primitiveTypes].sort(),
        abilityTypes: [...v.abilityTypes].sort(),
        exampleConstructions: v.examples,
      },
    ]),
  );

  // --- FP inventory (authoritative accepted-tier FPs via countParserFalsePositives) ---
  const fpEntries: Array<{
    caseId: string;
    cardName?: string;
    actionType: string;
    evidenceText: string;
    primary: FpPrimaryClass;
  }> = [];

  for (const { testCase, parse } of paired) {
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const match = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: testCase.oracleText,
    });
    const actions = semanticActionsForMatch(parse);
    const extractedForFp = actions.map((a) => ({
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
    })) as ExtractedActionForMatch[];

    const fpCount = countParserFalsePositives(testCase, match.unmatchedActionIndices, extractedForFp);
    if (fpCount === 0) continue;

    const fpIndices = match.unmatchedActionIndices.filter((idx) => {
      const action = actions[idx];
      if (action.reviewStatus !== "accepted") return false;
      const single = countParserFalsePositives(testCase, [idx], extractedForFp);
      return single > 0;
    });

    for (const idx of fpIndices) {
      const action = actions[idx];
      fpEntries.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        actionType: action.actionType,
        evidenceText: action.evidenceText,
        primary: classifyFp(testCase, parse, action),
      });
    }
  }

  const fpBreakdown: Record<string, { count: number; entries: typeof fpEntries }> = {};
  for (const fp of fpEntries) {
    if (!fpBreakdown[fp.primary]) fpBreakdown[fp.primary] = { count: 0, entries: [] };
    fpBreakdown[fp.primary].count += 1;
    fpBreakdown[fp.primary].entries.push(fp);
  }

  // --- Unsupported (11) ---
  const unsupportedEntries: Array<{
    caseId: string;
    cardName?: string;
    actionType: string;
    evidence: string;
    reviewStatus: string;
    arguments: unknown;
    classification: UnsupportedClass;
    reason: string;
  }> = [];

  for (const { testCase, parse } of paired) {
    for (const action of parse.actions.filter((a) => a.reviewStatus === "accepted")) {
      const primitive = normalizeToPrimitive(action.actionType, action.provenance.actionSpan.text);
      const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, action.provenance.actionSpan.text);
      if (!supported || supported !== primitive) {
        const row = semanticActionsForMatch(parse).find((a) => a.index === parse.actions.indexOf(action));
        const cls = classifyUnsupported(testCase, row!);
        unsupportedEntries.push({
          caseId: testCase.id,
          cardName: testCase.cardName,
          actionType: action.actionType,
          evidence: action.provenance.actionSpan.text,
          reviewStatus: action.reviewStatus,
          arguments: action.arguments,
          classification: cls.classification,
          reason: cls.reason,
        });
      }
    }
  }

  const unsupportedBreakdown: Record<string, number> = {};
  for (const u of unsupportedEntries) {
    unsupportedBreakdown[u.classification] = (unsupportedBreakdown[u.classification] ?? 0) + 1;
  }

  // --- Loyalty leakage (3) ---
  const loyaltyLeaks = paired.flatMap(({ testCase, parse }) => loyaltyLeakageEntries(testCase, parse));

  // --- Per-stratum metrics ---
  const stratumGroups = new Map<string, typeof paired>();
  for (const row of paired) {
    const s = stratumFromCategory(row.testCase.category);
    if (!stratumGroups.has(s)) stratumGroups.set(s, []);
    stratumGroups.get(s)!.push(row);
  }
  const stratumMetrics = Object.fromEntries(
    [...stratumGroups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([stratum, rows]) => [stratum, metricsForCases(rows)]),
  );

  // --- Dev vs v12 family matrix ---
  const devV26 = JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const expV2 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v2.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const expV3 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v3.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const expV5 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v5.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const expV2Training = expV2.cases.filter(
    (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
  );
  const devCombined = [...devV26.cases, ...expV2Training, ...expV3.cases, ...expV5.cases];

  const familyMatrix: Record<
    string,
    {
      devExamples: number;
      v12Examples: number;
      devGoldEntries: number;
      v12GoldEntries: number;
      devRecall?: number;
      v12Recall?: number;
    }
  > = {};

  function addFamilyExamples(testCase: OracleActionEvalCaseV2, split: "dev" | "v12") {
    const family = inferSemanticFamily(testCase);
    if (!familyMatrix[family]) {
      familyMatrix[family] = { devExamples: 0, v12Examples: 0, devGoldEntries: 0, v12GoldEntries: 0 };
    }
    const goldCount = testCase.expectedPrimitiveActions.filter((e) => !e.negative).length;
    if (split === "dev") {
      familyMatrix[family].devExamples += 1;
      familyMatrix[family].devGoldEntries += goldCount;
    } else {
      familyMatrix[family].v12Examples += 1;
      familyMatrix[family].v12GoldEntries += goldCount;
    }
  }

  for (const c of devCombined) addFamilyExamples(c, "dev");
  for (const { testCase } of paired) addFamilyExamples(testCase, "v12");

  const devFamilyTpFn = new Map<string, { tp: number; fn: number }>();
  const v12FamilyTpFn = new Map<string, { tp: number; fn: number }>();

  for (const testCase of devCombined) {
    const parse = parseOracleSemantics({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const family = inferSemanticFamily(testCase, parse);
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const match = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: testCase.oracleText,
    });
    const matched = match.matches.filter((m) => m.matched).length;
    const cur = devFamilyTpFn.get(family) ?? { tp: 0, fn: 0 };
    cur.tp += matched;
    cur.fn += expected.length - matched;
    devFamilyTpFn.set(family, cur);
  }

  for (const { testCase, parse } of paired) {
    const family = inferSemanticFamily(testCase, parse);
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const match = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: testCase.oracleText,
    });
    const matched = match.matches.filter((m) => m.matched).length;
    const cur = v12FamilyTpFn.get(family) ?? { tp: 0, fn: 0 };
    cur.tp += matched;
    cur.fn += expected.length - matched;
    v12FamilyTpFn.set(family, cur);
  }

  for (const [family, counts] of devFamilyTpFn) {
    if (!familyMatrix[family]) continue;
    familyMatrix[family].devRecall = counts.tp + counts.fn > 0 ? counts.tp / (counts.tp + counts.fn) : 1;
  }
  for (const [family, counts] of v12FamilyTpFn) {
    if (!familyMatrix[family]) continue;
    familyMatrix[family].v12Recall = counts.tp + counts.fn > 0 ? counts.tp / (counts.tp + counts.fn) : 1;
  }

  const uniqueFnCards = new Set(fnEntries.map((f) => f.caseId)).size;

  const report = {
    generatedAt: new Date().toISOString(),
    diagnosisVersion: "validation-v12-rc2-forensic-v1",
    candidate: {
      label: "oracle-action-rc2",
      commit: "87916b12acb2fed8151981bdb893f4eefb144d09",
      blob: "9f59114912a350dbd7b3cef5fcf975713f8075a9",
    },
    inputs: {
      rawOutputRef: RAW_PATH,
      aggregateRef: AGGREGATE_PATH,
      datasetRef: DATASET_PATH,
      noParserRerunOnValidation: true,
    },
    authoritativeAggregate: {
      accepted: aggregate.accepted,
      needsReview: aggregate.needsReview,
      allEmission: aggregate.allEmission,
      unsupported: aggregate.unsupported,
      loyaltyLeakage: aggregate.invariants.loyaltyAbilityLeakage,
    },
    diagnosticRecallLevels: recallLevels,
    fnInventory: {
      totalGoldEntries: fnEntries.length,
      uniqueCardsAffected: uniqueFnCards,
      primaryFamilyBreakdown: fnBreakdownSerialized,
      entries: fnEntries,
    },
    fpInventory: {
      total: fpEntries.length,
      breakdown: fpBreakdown,
      entries: fpEntries,
    },
    unsupportedInventory: {
      total: unsupportedEntries.length,
      breakdown: unsupportedBreakdown,
      entries: unsupportedEntries,
    },
    loyaltyLeakageInventory: {
      total: loyaltyLeaks.length,
      entries: loyaltyLeaks,
    },
    stratumMetrics,
    developmentVsValidationFamilyMatrix: Object.fromEntries(
      Object.entries(familyMatrix).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };

  const outDir = resolve(process.cwd(), "data/milestones/validation-v12-fresh-certification");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "validation-v12-rc2-forensic-diagnosis.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const summary = {
    diagnosticRecall: {
      levelA_primitiveExistence: recallLevels.levelA_primitiveExistence.recall,
      levelB_structural: recallLevels.levelB_structural.recall,
      levelC_semanticArguments: recallLevels.levelC_semanticArguments.recall,
      levelD_strictAccepted: recallLevels.levelD_strictAccepted.recall,
    },
    fnCount: fnEntries.length,
    uniqueFnCards,
    fpCount: fpEntries.length,
    unsupportedCount: unsupportedEntries.length,
    loyaltyLeakCount: loyaltyLeaks.length,
    fnPrimaryBreakdown: Object.fromEntries(
      Object.entries(fnBreakdownSerialized).map(([k, v]) => [k, v.goldEntriesAffected]),
    ),
    fpPrimaryBreakdown: Object.fromEntries(Object.entries(fpBreakdown).map(([k, v]) => [k, v.count])),
    unsupportedBreakdown,
    topStrataByFn: Object.fromEntries(
      Object.entries(
        fnEntries.reduce(
          (acc, fn) => {
            acc[fn.stratum] = (acc[fn.stratum] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      ).sort(([, a], [, b]) => b - a),
    ),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
