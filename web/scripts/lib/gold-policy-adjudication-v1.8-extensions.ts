/**
 * Gold Policy v1.8 adjudication extensions — parser-blind structural rules.
 * v1.7 adjudication remains frozen in validation-v13-policy-adjudication.ts.
 */
import type { OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import type { ExpectedPrimitiveAction } from "../audit-oracle-action-eval-cases";
import type {
  CastAdjudication,
  CastPolicyClass,
  GoldAdjudicationVerdict,
  SacrificeDiscardAdjudication,
  SacrificeDiscardPolicyClass,
} from "./validation-v13-policy-adjudication";

export function isStaticCastActivatePaymentRestriction(oracleText: string, evidence: string): boolean {
  if (!/(?:can't|cannot)\b/i.test(oracleText)) return false;
  if (/to cast spells or activate abilities/i.test(oracleText)) {
    return /(?:cast spells or activate abilities|sacrifice creatures to cast spells or activate abilities)/i.test(
      evidence,
    );
  }
  if (/(?:Players|Each player) can't [^.\n]* cast spells/i.test(oracleText)) {
    return /\bcast spells\b/i.test(evidence) && !/^You may cast/i.test(evidence.trim());
  }
  return false;
}

export function isDeferredMechanicCastReminder(evidence: string): boolean {
  return /Cast it on a later turn for its (?:foretell|suspend) cost/i.test(evidence);
}

export function adjudicateCastGoldV18Extensions(input: {
  testCase: OracleActionEvalCaseV2;
  gold: ExpectedPrimitiveAction;
}): CastAdjudication | null {
  const { testCase, gold } = input;
  const evidence = gold.evidenceContains ?? "";
  const oracleText = testCase.oracleText;

  if (isDeferredMechanicCastReminder(evidence)) {
    return castVerdict(testCase, gold, "reminder_mechanic_definition", "gold_defect_remove_from_l2", {
      castPolicyClass: "reminder_mechanic_definition",
      policyReason: "Foretell/suspend deferred-cast reminder — Layer-1 mechanic definition, not L2 cast.",
    });
  }
  if (isStaticCastActivatePaymentRestriction(oracleText, evidence)) {
    return castVerdict(testCase, gold, "static_cast_activate_restriction", "gold_defect_remove_from_l2", {
      castPolicyClass: "mana_restriction_reference" as CastPolicyClass,
      policyReason: "Static cast/activate payment restriction — Layer-1 restriction reference, not L2 cast.",
    });
  }
  return null;
}

export function adjudicateSacrificeDiscardGoldV18Extensions(input: {
  testCase: OracleActionEvalCaseV2;
  gold: ExpectedPrimitiveAction;
}): SacrificeDiscardAdjudication | null {
  const { testCase, gold } = input;
  const evidence = gold.evidenceContains ?? "";
  const oracleText = testCase.oracleText;
  const actionType = gold.actionType as "sacrifice" | "discard";

  if (
    actionType === "sacrifice" &&
    isStaticCastActivatePaymentRestriction(oracleText, evidence)
  ) {
    return sacrificeVerdict(testCase, gold, "static_payment_restriction_reference", "gold_defect_remove_from_l2", {
      policyClass: "condition_reference" as SacrificeDiscardPolicyClass,
      policyReason: "Static sacrifice-to-cast/activate restriction — Layer-1 restriction reference, not L2 sacrifice.",
      abilityType: "static",
    });
  }
  return null;
}

function castVerdict(
  testCase: OracleActionEvalCaseV2,
  gold: ExpectedPrimitiveAction,
  _class: string,
  verdict: GoldAdjudicationVerdict,
  extra: { castPolicyClass: CastPolicyClass; policyReason: string },
): CastAdjudication {
  return {
    caseId: testCase.id,
    cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
    evidenceContains: gold.evidenceContains ?? "",
    coverageStratum: (testCase as { coverageStratum?: string }).coverageStratum ?? "unknown",
    caseScope: testCase.caseScope ?? "full_card",
    castPolicyClass: extra.castPolicyClass,
    layer2Eligible: verdict === "valid_layer2_gold",
    verdict,
    policyReason: extra.policyReason,
  };
}

function sacrificeVerdict(
  testCase: OracleActionEvalCaseV2,
  gold: ExpectedPrimitiveAction,
  _class: string,
  verdict: GoldAdjudicationVerdict,
  extra: { policyClass: SacrificeDiscardPolicyClass; policyReason: string; abilityType: string },
): SacrificeDiscardAdjudication {
  return {
    caseId: testCase.id,
    cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
    actionType: gold.actionType as "sacrifice" | "discard",
    evidenceContains: gold.evidenceContains ?? "",
    coverageStratum: (testCase as { coverageStratum?: string }).coverageStratum ?? "unknown",
    caseScope: testCase.caseScope ?? "full_card",
    abilityType: extra.abilityType,
    colonBoundary: false,
    costRegion: false,
    effectRegion: false,
    additionalSpellCost: false,
    policyClass: extra.policyClass,
    layer2Eligible: verdict === "valid_layer2_gold",
    verdict,
    policyReason: extra.policyReason,
  };
}
