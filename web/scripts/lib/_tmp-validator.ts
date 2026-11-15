/**
 * Parser-blind Gold Policy Validator v1 — validates benchmark answer keys.
 */
import { createHash } from "node:crypto";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import {
  classifyCastGold,
  classifySacrificeDiscardGold,
  type GoldAdjudicationVerdict,
} from "./validation-v13-policy-adjudication";
import { enrichGoldAction, isTriggerConditionEventReferenceGold, type SemanticGoldJustification } from "./gold-semantic-enrichment-v1";
import { segmentAbilities, segmentCardFaces } from "../../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { isOneShotCastPermission, isPersistentZoneCastPermission } from "../../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";

export const GOLD_POLICY_VALIDATOR_VERSION = "gold-policy-validator-v1.7";
export const GOLD_POLICY_VERSION = "semantic-gold-policy-v1.7";

export type GoldPolicyViolationCode =
  | "invalid_layer2_cost_gold"
  | "trigger_reference_action_gold"
  | "condition_reference_action_gold"
  | "invalid_permission_action_gold"
  | "reminder_card_native_gold"
  | "created_object_ownership_violation"
  | "invalid_replacement_gold"
  | "duplicate_semantic_gold"
  | "invalid_evidence_span"
  | "scope_completeness_violation"
  | "primitive_distinction_violation"
  | "card_native_ineligible_layer2";

export type GoldPolicyViolation = {
  code: GoldPolicyViolationCode;
  metric:
    | "goldPolicyViolations"
    | "invalidLayer2CostGold"
    | "triggerReferenceActionGold"
    | "invalidPermissionActionGold"
    | "reminderCardNativeGold"
    | "createdObjectOwnershipViolations"
    | "invalidReplacementGold"
    | "duplicateSemanticGold"
    | "invalidEvidenceSpan"
    | "scopeCompletenessViolations";
  caseId: string;
  cardName: string;
  actionType: string;
  evidenceContains: string;
  policyFamily: string;
  policyReason: string;
  semanticJustification: SemanticGoldJustification;
};

export type GoldPolicyCaseResult = {
  caseId: string;
  cardName: string;
  violationCount: number;
  violations: GoldPolicyViolation[];
};

export type GoldPolicyValidationResult = {
  validatorVersion: typeof GOLD_POLICY_VALIDATOR_VERSION;
  policyVersion: typeof GOLD_POLICY_VERSION;
  validatorHash: string;
  benchmarkHash: string;
  benchmarkPath: string;
  caseCount: number;
  goldActionCount: number;
  violations: GoldPolicyViolation[];
  caseResults: GoldPolicyCaseResult[];
  census: {
    goldPolicyViolations: number;
    invalidLayer2CostGold: number;
    triggerReferenceActionGold: number;
    invalidPermissionActionGold: number;
    reminderCardNativeGold: number;
    createdObjectOwnershipViolations: number;
    invalidReplacementGold: number;
    duplicateSemanticGold: number;
    invalidEvidenceSpan: number;
    scopeCompletenessViolations: number;
  };
  perPolicyFamily: Record<string, number>;
  pass: boolean;
};

function metricForCode(code: GoldPolicyViolationCode): GoldPolicyViolation["metric"] {
  switch (code) {
    case "invalid_layer2_cost_gold":
      return "invalidLayer2CostGold";
    case "trigger_reference_action_gold":
      return "triggerReferenceActionGold";
    case "invalid_permission_action_gold":
      return "invalidPermissionActionGold";
    case "reminder_card_native_gold":
      return "reminderCardNativeGold";
    case "created_object_ownership_violation":
      return "createdObjectOwnershipViolations";
    case "invalid_replacement_gold":
      return "invalidReplacementGold";
    case "duplicate_semantic_gold":
      return "duplicateSemanticGold";
    case "invalid_evidence_span":
      return "invalidEvidenceSpan";
    case "scope_completeness_violation":
      return "scopeCompletenessViolations";
    default:
      return "goldPolicyViolations";
  }
}

function isInvalidLayer2Verdict(verdict: GoldAdjudicationVerdict): boolean {
  return verdict === "gold_defect_remove_from_l2" || verdict === "gold_defect_relabel";
}

export function segmentHostParagraph(
  testCase: OracleActionEvalCaseV2,
  point: number,
): { paragraphText: string; paragraphStart: number } | null {
  for (const face of segmentCardFaces(testCase.oracleText)) {
    for (const ability of segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start)) {
      if (point >= ability.paragraphStart && point < ability.paragraphEnd) {
        return { paragraphText: ability.paragraphText, paragraphStart: ability.paragraphStart };
      }
    }
  }
  return null;
}

function validateGoldAction(
  testCase: OracleActionEvalCaseV2 & { cardName?: string; caseScope?: string; certifiedEmptyLayer2?: boolean },
  gold: ExpectedPrimitiveAction,
): GoldPolicyViolation[] {
  if (gold.negative) return [];
  const violations: GoldPolicyViolation[] = [];
  const semantic = enrichGoldAction(testCase, gold);
  const cardName = testCase.cardName ?? testCase.id;
  const push = (code: GoldPolicyViolationCode, policyFamily: string, policyReason: string) => {
    violations.push({
      code,
      metric: metricForCode(code),
      caseId: testCase.id,
      cardName,
      actionType: gold.actionType,
      evidenceContains: gold.evidenceContains,
      policyFamily,
      policyReason,
      semanticJustification: semantic,
    });
  };

  if (!semantic.evidenceSpan) {
    push("invalid_evidence_span", "invalid_evidence_span", "Gold evidence not found verbatim in oracle text.");
  }

  if (
    ["sacrifice", "discard", "tap", "exile"].includes(gold.actionType) &&
    (semantic.inCostRegion || semantic.clauseRole === "cost" || semantic.executionContext === "activated_cost")
  ) {
    push(
      "invalid_layer2_cost_gold",
      "activated_additional_cost_layer1",
      "Payment primitive in activated/additional cost region is Layer 1 only.",
    );
  }

  if (
    ["sacrifice", "discard"].includes(gold.actionType) &&
    isInvalidLayer2Verdict(classifySacrificeDiscardGold({ testCase, gold }).verdict)
  ) {
    push(
      "invalid_layer2_cost_gold",
      "activated_additional_cost_layer1",
      classifySacrificeDiscardGold({ testCase, gold }).policyReason,
    );
  }

  if (
    gold.actionType === "tap" &&
    (semantic.inCostRegion || semantic.clauseRole === "cost") &&
    semantic.executionContext === "activated_cost"
  ) {
    push("invalid_layer2_cost_gold", "activated_additional_cost_layer1", "Tap payment in activated cost region is Layer 1.");
  }

  if (
    gold.actionType === "exile" &&
    semantic.inCostRegion &&
    /\{[^}]+\}/.test(testCase.oracleText)
  ) {
    push("invalid_layer2_cost_gold", "activated_additional_cost_layer1", "Exile payment in cost region is Layer 1.");
  }

  if (gold.actionType === "cast") {
    const castAdj = classifyCastGold({ testCase, gold });
    if (isInvalidLayer2Verdict(castAdj.verdict)) {
      push("invalid_permission_action_gold", "cast_play_permission_layer1", castAdj.policyReason);
    } else if (
      semantic.executionContext === "permission" ||
      isPersistentZoneCastPermission(gold.evidenceContains ?? "")
    ) {
      push(
        "invalid_permission_action_gold",
        "cast_play_permission_layer1",
        "Persistent/static zone cast permission — Layer-1 only.",
      );
    }
  }

  if (
    semantic.executionContext === "trigger_reference" ||
    semantic.clauseRole === "trigger_event" ||
    semantic.inTriggerEventHeader
  ) {
    push(
      "trigger_reference_action_gold",
      "trigger_event_reference",
      "Action evidence lies in trigger-event/condition reference — Layer-1 only, not resolving effect.",
    );
  } else if (semantic.evidenceSpan) {
    const host = segmentHostParagraph(testCase, semantic.evidenceSpan.start);
    if (
      host &&
      isTriggerConditionEventReferenceGold({
        gold,
        paragraph: host.paragraphText,
        localStart: semantic.evidenceSpan.start - host.paragraphStart,
        localEnd: semantic.evidenceSpan.end - host.paragraphStart,
      })
    ) {
      push(
        "trigger_reference_action_gold",
        "trigger_event_reference",
        "Action evidence lies in trigger-event/condition reference — Layer-1 only, not resolving effect.",
      );
    }
  }

  if (semantic.executionContext === "condition_reference") {
    push("condition_reference_action_gold", "condition_reference", "Condition clause must not produce Layer-2 gold.");
  }

  if (semantic.inReminderSpan || semantic.inTypeLineMechanicReminder) {
    push("reminder_card_native_gold", "reminder_mechanic_definition", "Reminder/mechanic span — not card-native Layer-2.");
  }

  if (semantic.inCreatedObjectDefinition) {
    push(
      "card_native_ineligible_layer2",
      "token_definition_not_card_native_l2",
      "Created/token object definition capability — not source-card card-native Layer-2 gold.",
    );
  }

  if (semantic.inReplacementEvent && gold.actionType !== "exile" && gold.actionType !== "destroy") {
    push("invalid_replacement_gold", "replacement_structure", "Replacement event clause — only replacement effect primitive allowed.");
  }

  if (gold.actionType === "return_to_hand" && /\bonto the battlefield\b/i.test(gold.evidenceContains)) {
    push("primitive_distinction_violation", "primitive_distinction", "return_to_battlefield evidence labeled return_to_hand.");
  }
  if (gold.actionType === "put_into_hand" && /\bfrom (?:your )?graveyard\b/i.test(gold.evidenceContains)) {
    push("primitive_distinction_violation", "primitive_distinction", "Graveyard-to-hand must be return_to_hand, not put_into_hand.");
  }
  if (gold.actionType === "draw" && /\bput [^.\n]+ into (?:your )?hand\b/i.test(gold.evidenceContains)) {
    push("primitive_distinction_violation", "primitive_distinction", "Put-into-hand evidence must not use draw primitive.");
  }
  if (
    gold.actionType === "search_library" &&
    !/\bsearch (?:your |their )?library\b/i.test(gold.evidenceContains) &&
    /\bon top of (?:your )?library\b/i.test(gold.evidenceContains)
  ) {
    push(
      "primitive_distinction_violation",
      "primitive_distinction",
      "Library-top placement is not search_library.",
    );
  }
  if (gold.actionType === "shuffle_library" && /\binto (?:your )?library\b/i.test(gold.evidenceContains)) {
    push("primitive_distinction_violation", "primitive_distinction", "Shuffle-into-library must use shuffle_into_library.");
  }
  if (
    gold.actionType === "copy" &&
    /\bcopy target\b/i.test(gold.evidenceContains) &&
    /\bThe copy targets\b/i.test(testCase.oracleText) &&
    !/\bcopy target (?:instant|sorcery|spell|creature|permanent|player|each)\b/i.test(gold.evidenceContains)
  ) {
    push(
      "primitive_distinction_violation",
      "target_assignment_not_copy",
      "Target assignment on an existing copy (The copy targets…) is not a second copy primitive.",
    );
  }

  return violations;
}

function validateScope(testCase: OracleActionEvalCaseV2 & { caseScope?: string; certifiedEmptyLayer2?: boolean; goldCompletenessStatus?: string }): GoldPolicyViolation[] {
  const violations: GoldPolicyViolation[] = [];
  const gold = testCase.expectedPrimitiveActions.filter((g) => !g.negative);
  const cardName = (testCase as { cardName?: string }).cardName ?? testCase.id;

  if (testCase.certifiedEmptyLayer2 && gold.length > 0) {
    violations.push({
      code: "scope_completeness_violation",
      metric: "scopeCompletenessViolations",
      caseId: testCase.id,
      cardName,
      actionType: "*",
      evidenceContains: "",
      policyFamily: "scope_completeness",
      policyReason: "certifiedEmptyLayer2=true but gold contains Layer-2 actions.",
      semanticJustification: enrichGoldAction(testCase, gold[0] ?? { actionType: "draw", evidenceContains: "" }),
    });
  }

  if (
    testCase.goldCompletenessStatus === "complete_within_scope" &&
    gold.length === 0 &&
    !testCase.certifiedEmptyLayer2 &&
    !testCase.expectedStructure
  ) {
    violations.push({
      code: "scope_completeness_violation",
      metric: "scopeCompletenessViolations",
      caseId: testCase.id,
      cardName,
      actionType: "*",
      evidenceContains: "",
      policyFamily: "scope_completeness",
      policyReason: "complete_within_scope with empty gold requires certifiedEmptyLayer2 or expectedStructure.",
      semanticJustification: enrichGoldAction(testCase, { actionType: "draw", evidenceContains: "" }),
    });
  }

  return violations;
}

export function validateBenchmarkGoldPolicy(input: {
  cases: Array<OracleActionEvalCaseV2 & Record<string, unknown>>;
  benchmarkHash: string;
  benchmarkPath: string;
}): GoldPolicyValidationResult {
  const allViolations: GoldPolicyViolation[] = [];
  const caseResults: GoldPolicyCaseResult[] = [];
  let goldActionCount = 0;
  const seen = new Map<string, string>();

  for (const testCase of input.cases) {
    const caseViolations: GoldPolicyViolation[] = [...validateScope(testCase)];
    for (const gold of testCase.expectedPrimitiveActions) {
      if (gold.negative) continue;
      goldActionCount++;
      const key = `${gold.actionType}|${gold.evidenceContains.toLowerCase().trim()}`;
      if (seen.has(key) && seen.get(key) === testCase.id) {
        caseViolations.push({
          code: "duplicate_semantic_gold",
          metric: "duplicateSemanticGold",
          caseId: testCase.id,
          cardName: (testCase.cardName as string) ?? testCase.id,
          actionType: gold.actionType,
          evidenceContains: gold.evidenceContains,
          policyFamily: "duplicate_semantic_gold",
          policyReason: "Duplicate actionType+evidence within case.",
          semanticJustification: enrichGoldAction(testCase, gold),
        });
      }
      seen.set(key, testCase.id);
      caseViolations.push(...validateGoldAction(testCase, gold));
    }
    caseResults.push({
      caseId: testCase.id,
      cardName: (testCase.cardName as string) ?? testCase.id,
      violationCount: caseViolations.length,
      violations: caseViolations,
    });
    allViolations.push(...caseViolations);
  }

  const census = {
    goldPolicyViolations: allViolations.filter((v) => v.metric === "goldPolicyViolations").length,
    invalidLayer2CostGold: allViolations.filter((v) => v.metric === "invalidLayer2CostGold").length,
    triggerReferenceActionGold: allViolations.filter((v) => v.metric === "triggerReferenceActionGold").length,
    invalidPermissionActionGold: allViolations.filter((v) => v.metric === "invalidPermissionActionGold").length,
    reminderCardNativeGold: allViolations.filter((v) => v.metric === "reminderCardNativeGold").length,
    createdObjectOwnershipViolations: allViolations.filter((v) => v.metric === "createdObjectOwnershipViolations").length,
    invalidReplacementGold: allViolations.filter((v) => v.metric === "invalidReplacementGold").length,
    duplicateSemanticGold: allViolations.filter((v) => v.metric === "duplicateSemanticGold").length,
    invalidEvidenceSpan: allViolations.filter((v) => v.metric === "invalidEvidenceSpan").length,
    scopeCompletenessViolations: allViolations.filter((v) => v.metric === "scopeCompletenessViolations").length,
  };

  const perPolicyFamily: Record<string, number> = {};
  for (const v of allViolations) {
    perPolicyFamily[v.policyFamily] = (perPolicyFamily[v.policyFamily] ?? 0) + 1;
  }

  const pass = allViolations.length === 0;

  return {
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    policyVersion: GOLD_POLICY_VERSION,
    validatorHash: createHash("sha256")
      .update(`${GOLD_POLICY_VALIDATOR_VERSION}:${GOLD_POLICY_VERSION}`)
      .digest("hex"),
    benchmarkHash: input.benchmarkHash,
    benchmarkPath: input.benchmarkPath,
    caseCount: input.cases.length,
    goldActionCount,
    violations: allViolations,
    caseResults: caseResults.filter((c) => c.violationCount > 0),
    census,
    perPolicyFamily,
    pass,
  };
}

export function validatorSourceHash(): string {
  return createHash("sha256")
    .update(`${GOLD_POLICY_VALIDATOR_VERSION}:${GOLD_POLICY_VERSION}:v1-core`)
    .digest("hex");
}
