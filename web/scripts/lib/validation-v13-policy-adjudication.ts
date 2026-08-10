/**
 * Parser-blind v13 policy/gold adjudication helpers.
 * Inputs: oracle text, case scope, current gold only — never parser output.
 */
import type { OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import type { ExpectedPrimitiveAction } from "../audit-oracle-action-eval-cases";

export type CastPolicyClass =
  | "immediate_resolution_cast"
  | "future_specific_object_permission"
  | "future_object_class_permission"
  | "duration_limited_permission"
  | "trigger_event_reference"
  | "termination_condition"
  | "additional_spell_cost"
  | "static_cost_reduction"
  | "mana_restriction_reference"
  | "reminder_mechanic_definition"
  | "other";

export type SacrificeDiscardPolicyClass =
  | "activated_cost_layer1"
  | "additional_spell_cost_layer1"
  | "granted_nested_activated_cost_layer1"
  | "landcycling_cost_layer1"
  | "resolving_effect_layer2"
  | "trigger_event_reference"
  | "condition_reference"
  | "reminder_mechanic_definition"
  | "opponent_forced_effect_layer2";

export type GoldAdjudicationVerdict =
  | "valid_layer2_gold"
  | "gold_defect_remove_from_l2"
  | "gold_defect_relabel"
  | "gold_defect_add_missing"
  | "evaluator_evidence_mismatch"
  | "indeterminate_requires_human";

export type SacrificeDiscardAdjudication = {
  caseId: string;
  cardName: string;
  actionType: "sacrifice" | "discard";
  evidenceContains: string;
  coverageStratum: string;
  caseScope: string;
  abilityType: string;
  colonBoundary: boolean;
  costRegion: boolean;
  effectRegion: boolean;
  additionalSpellCost: boolean;
  policyClass: SacrificeDiscardPolicyClass;
  layer2Eligible: boolean;
  verdict: GoldAdjudicationVerdict;
  policyReason: string;
  recommendedGoldAction?: Partial<ExpectedPrimitiveAction>;
};

export type CastAdjudication = {
  caseId: string;
  cardName: string;
  evidenceContains: string;
  coverageStratum: string;
  caseScope: string;
  castPolicyClass: CastPolicyClass;
  layer2Eligible: boolean;
  verdict: GoldAdjudicationVerdict;
  policyReason: string;
};

export type PolicyStratumAdjudication = {
  caseId: string;
  cardName: string;
  actionType: string;
  evidenceContains: string;
  stratum: "policy_reminder_heavy" | "policy_trigger_condition";
  cardNativeLayer2Eligible: boolean;
  clauseRole: "effect" | "trigger" | "condition" | "reminder" | "permission" | "cost";
  verdict: GoldAdjudicationVerdict;
  policyReason: string;
};

export type OfficialFpAdjudication = {
  caseId: string;
  cardName: string;
  caseScope: string;
  canonicalOracleExcerpt: string;
  emittedAction: string;
  emittedEvidence: string;
  abilityType: string;
  modalOptionKey?: string;
  actionInScope: boolean;
  shouldBeInGold: boolean;
  verdict: "missing_gold" | "genuine_parser_fp" | "evaluator_defect" | "out_of_scope_emission";
  policyReason: string;
  recommendedGoldAddition?: ExpectedPrimitiveAction;
};

export type IntegrityFailureLedgerEntry = {
  caseId: string;
  card: string;
  offendingNode: string;
  violationCode: string;
  violationMessage: string;
  actionId?: string;
  abilityId?: string;
  expectedParent?: string;
  actualParent?: string;
  face?: string;
  clause?: string;
  provenanceSpan?: string;
  constructionPath?: string;
  repairableByGold: false;
};

function normalizeEvidence(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function evidenceInOracle(oracleText: string, evidence: string): boolean {
  return oracleText.toLowerCase().includes(normalizeEvidence(evidence).toLowerCase());
}

function colonActivatedCost(evidence: string): { costRegion: boolean; effectRegion: boolean } {
  const m = evidence.match(/^(.+?):\s*(.+)$/s);
  if (!m) return { costRegion: false, effectRegion: false };
  const cost = m[1]!;
  const effect = m[2]!;
  const costIsPayment =
    /^(?:\{[^}]+\}(?:,\s*)?)*(?:Sacrifice|Discard|Tap|Exile|Pay|Remove)/i.test(cost.trim()) ||
    /^Discard this card$/i.test(cost.trim());
  return { costRegion: costIsPayment, effectRegion: effect.trim().length > 0 };
}

export function classifySacrificeDiscardGold(input: {
  testCase: OracleActionEvalCaseV2;
  gold: ExpectedPrimitiveAction;
}): SacrificeDiscardAdjudication {
  const { testCase, gold } = input;
  const evidence = gold.evidenceContains ?? "";
  const oracleText = testCase.oracleText;
  const actionType = gold.actionType as "sacrifice" | "discard";
  const { costRegion, effectRegion } = colonActivatedCost(evidence);

  let policyClass: SacrificeDiscardPolicyClass = "resolving_effect_layer2";
  let verdict: GoldAdjudicationVerdict = "valid_layer2_gold";
  let policyReason = "Post-colon or imperative resolving effect — valid Layer-2 primitive.";
  let abilityType = "unknown";

  const imperativeCost = /^(?:Sacrifice|Discard)\b/i.test(evidence.trim());
  const additionalSpellCost =
    /as an additional cost to cast|as you cast this spell|casualty \d/i.test(oracleText) &&
    /cast this spell.*(?:sacrifice|discard)|(?:sacrifice|discard).*cast this spell/i.test(
      `${oracleText} ${evidence}`,
    );

  if (/landcycling|basic landcycling|cycling \{/i.test(oracleText) && /^Discard this card:/i.test(evidence)) {
    policyClass = "landcycling_cost_layer1";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Landcycling discard payment is Layer-1 activated cost, not Layer-2 primitive.";
    abilityType = "activated";
  } else if (additionalSpellCost && new RegExp(actionType, "i").test(evidence) && !costRegion) {
    policyClass = "additional_spell_cost_layer1";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Additional/casualty spell cost is Layer-1 only — not Layer-2 sacrifice/discard.";
    abilityType = "spell_cost";
  } else if (
    /rather than pay/i.test(evidence) &&
    /(?:discard|sacrifice)/i.test(evidence) &&
    /this spell/i.test(oracleText)
  ) {
    policyClass = "alternative_spell_cost_layer1";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Alternative/additional spell cost (rather than pay) — Layer-1 only.";
    abilityType = "spell_cost";
  } else if (
    (/\([^)]*To investigate|\([^)]*It's an artifact with|\([^)]*They're artifacts with/i.test(oracleText) ||
      /have "[^"]*(?:Sacrifice|Discard)/i.test(oracleText)) &&
    costRegion
  ) {
    policyClass = "granted_nested_activated_cost_layer1";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Granted/nested activated cost before colon is Layer-1 only.";
    abilityType = "granted_activated";
  } else if (costRegion && /^(?:\{[^}]+\}(?:,\s*)*)?(?:Sacrifice|Discard)/i.test(evidence)) {
    policyClass = "activated_cost_layer1";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Pre-colon activated cost (Sacrifice/Discard payment) is Layer-1 only.";
    abilityType = "activated";
  } else if (/Whenever you (?:sacrifice|discard)|When you (?:sacrifice|discard)/i.test(evidence)) {
    policyClass = "trigger_event_reference";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Trigger-event sacrifice/discard reference — not imperative Layer-2 primitive.";
    abilityType = "triggered";
  } else if (
    /Whenever you (?:sacrifice|discard)/i.test(oracleText) &&
    new RegExp(actionType, "i").test(evidence)
  ) {
    policyClass = "trigger_event_reference";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Sacrifice/discard label inside Whenever-trigger clause — trigger event, not L2 primitive.";
    abilityType = "triggered";
  } else if (
    /\b(?:sacrificed|discarded)\b/i.test(evidence) &&
    !imperativeCost
  ) {
    policyClass = "condition_reference";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Past-tense/condition reference to sacrifice/discard — not imperative Layer-2.";
    abilityType = "condition";
  } else if (
    /discards? a (?:card|land)/i.test(evidence) &&
    /Whenever (?:an opponent )?discards?/i.test(oracleText)
  ) {
    policyClass = "trigger_event_reference";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Opponent-discard trigger event — effect primitive is create_token/etc., not discard.";
    abilityType = "triggered";
  } else if (
    /discarded a nonland|If you discarded/i.test(evidence) ||
    (/discard a card/i.test(evidence) && /connive/i.test(oracleText) && /\(Draw a card, then discard/i.test(oracleText))
  ) {
    policyClass = "reminder_mechanic_definition";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Connive/mechanic reminder text — cardNativeLayer2Eligible=false.";
    abilityType = "reminder";
  } else if (/discard one or more artifact cards, add/i.test(evidence)) {
    policyClass = "trigger_event_reference";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Whenever-discard trigger event — add_mana is L2 effect, not discard.";
    abilityType = "triggered";
  } else if (/sacrificed creature was suspected/i.test(evidence)) {
    policyClass = "condition_reference";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Replacement/condition branch referencing sacrificed creature — not imperative sacrifice.";
    abilityType = "condition";
  } else if (/\([^)]*(?:Draw a card, then discard|If you discarded|To mill)/i.test(evidence)) {
    policyClass = "reminder_mechanic_definition";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Reminder/mechanic parenthetical — cardNativeLayer2Eligible=false; not card-native L2 gold.";
    abilityType = "reminder";
  } else if (/^Discard a card: Draw|^Discard a card, Sacrifice/i.test(evidence)) {
    policyClass = "activated_cost_layer1";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Discard-as-payment in activated cost chain is Layer-1 only.";
    abilityType = "activated";
  } else if (/discards a (?:card|land)/i.test(evidence) && !imperativeCost) {
    if (/Whenever an opponent discards/i.test(evidence)) {
      policyClass = "trigger_event_reference";
      verdict = "gold_defect_remove_from_l2";
      policyReason = "Opponent-discard trigger event — create_token is effect; discard is trigger reference.";
      abilityType = "triggered";
    } else {
      policyClass = "opponent_forced_effect_layer2";
      verdict = "valid_layer2_gold";
      policyReason = "Opponent discard as resolving triggered effect — valid Layer-2.";
      abilityType = "triggered";
    }
  } else if (/discard a card for each/i.test(evidence)) {
    policyClass = "resolving_effect_layer2";
    verdict = "valid_layer2_gold";
    policyReason = "Imperative discard as spell resolving effect — valid Layer-2.";
    abilityType = "spell_effect";
  } else if (/^discard a card$/i.test(evidence.trim()) && /connive/i.test(oracleText)) {
    policyClass = "resolving_effect_layer2";
    verdict = "valid_layer2_gold";
    policyReason = "Connive resolution discard step — valid Layer-2 in effect clause.";
    abilityType = "triggered";
  }

  if (!evidenceInOracle(oracleText, evidence)) {
    verdict = "evaluator_evidence_mismatch";
    policyReason = "Gold evidence not found verbatim in oracle text.";
  }

  return {
    caseId: testCase.id,
    cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
    actionType,
    evidenceContains: evidence,
    coverageStratum: (testCase as { coverageStratum?: string }).coverageStratum ?? "unknown",
    caseScope: testCase.caseScope ?? "full_card",
    abilityType,
    colonBoundary: costRegion || effectRegion,
    costRegion,
    effectRegion,
    additionalSpellCost,
    policyClass,
    layer2Eligible: verdict === "valid_layer2_gold",
    verdict,
    policyReason,
  };
}

export function classifyCastGold(input: {
  testCase: OracleActionEvalCaseV2;
  gold: ExpectedPrimitiveAction;
}): CastAdjudication {
  const { testCase, gold } = input;
  const evidence = gold.evidenceContains ?? "";
  const oracleText = testCase.oracleText;

  let castPolicyClass: CastPolicyClass = "other";
  let verdict: GoldAdjudicationVerdict = "indeterminate_requires_human";
  let policyReason = "Unclassified cast evidence.";

  if (/cast this spell/i.test(evidence) && /kicker|additional cost|collect evidence|casualty/i.test(oracleText)) {
    castPolicyClass = "additional_spell_cost";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Kicker/additional/casualty spell-cost context — not Layer-2 cast primitive.";
  } else if (/You may cast .+ for as long as it remains/i.test(evidence)) {
    castPolicyClass = "future_specific_object_permission";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Future specific-object cast permission — Layer-1 permission, not L2 cast.";
  } else if (/You may cast .+ later from exile|cast .+ later from exile/i.test(evidence)) {
    castPolicyClass = "future_specific_object_permission";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Deferred exile cast permission — Layer-1 permission.";
  } else if (/Until end of turn, you may (?:cast|play)/i.test(evidence)) {
    castPolicyClass = "duration_limited_permission";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Duration-limited cast permission — Layer-1, not L2 cast.";
  } else if (/you may cast .+ as though they had flash/i.test(evidence)) {
    castPolicyClass = "duration_limited_permission";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Flash-grant permission — Layer-1 permission.";
  } else if (/can't cast spells during/i.test(evidence)) {
    castPolicyClass = "mana_restriction_reference";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Static cast restriction — not imperative cast primitive.";
  } else if (/cast cost .* less to cast|costs? .* less to cast/i.test(evidence)) {
    castPolicyClass = "static_cost_reduction";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Static cost reduction — not cast primitive.";
  } else if (/this mana can't be spent to cast/i.test(evidence) || /only to cast a/i.test(evidence)) {
    castPolicyClass = "mana_restriction_reference";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Mana restriction/permission reference — not cast primitive.";
  } else if (
    /Whenever you cast|When you cast|If you cast|cast a spell,|cast an? .+ spell,|cast or copy|cast from your hand with/i.test(
      evidence,
    )
  ) {
    castPolicyClass = "trigger_event_reference";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Trigger-event cast reference — not imperative Layer-2 cast.";
  } else if (/until .+ is cast/i.test(evidence)) {
    castPolicyClass = "termination_condition";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Termination condition referencing cast — Layer-1 condition.";
  } else if (/cast it for \{[^}]+\} rather than its mana cost/i.test(evidence)) {
    castPolicyClass = "reminder_mechanic_definition";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Airbend/reminder alternative-cost definition — not card-native L2 cast.";
  } else if (/You may cast that card\.|You may cast the copy|you may cast a copy of its spell/i.test(evidence)) {
    castPolicyClass = "immediate_resolution_cast";
    verdict = "valid_layer2_gold";
    policyReason = "One-shot immediate resolution cast — valid Layer-2.";
  } else if (/cast this spell, exile|cast this spell, sacrifice|cast this spell, you may/i.test(evidence)) {
    castPolicyClass = "additional_spell_cost";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Spell additional cost line — not cast primitive.";
  } else if (/cast from exile/i.test(evidence)) {
    castPolicyClass = "future_specific_object_permission";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Cast-from-exile permission shorthand — Layer-1 permission.";
  } else if (/cast this card from your hand|you may cast it without paying/i.test(evidence)) {
    castPolicyClass = "future_object_class_permission";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Suspend/permission cast line — not imperative resolution cast.";
  } else if (/cast this spell/i.test(evidence)) {
    castPolicyClass = "additional_spell_cost";
    verdict = "gold_defect_remove_from_l2";
    policyReason = "Generic 'cast this spell' in reminder/kicker — Layer-1 cost context.";
  }

  if (!evidenceInOracle(oracleText, evidence)) {
    verdict = "evaluator_evidence_mismatch";
    policyReason = "Gold evidence not found verbatim in oracle text.";
  }

  return {
    caseId: testCase.id,
    cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
    evidenceContains: evidence,
    coverageStratum: (testCase as { coverageStratum?: string }).coverageStratum ?? "unknown",
    caseScope: testCase.caseScope ?? "full_card",
    castPolicyClass,
    layer2Eligible: verdict === "valid_layer2_gold",
    verdict,
    policyReason,
  };
}

/** Manual oracle-policy overrides where heuristics need explicit adjudication. */
export const V13_POLICY_OVERRIDES: Record<
  string,
  Partial<SacrificeDiscardAdjudication | CastAdjudication | PolicyStratumAdjudication>
> = {
  "vh13-0094|sacrifice|Sacrifice this enchantment": {
    verdict: "gold_defect_remove_from_l2",
    policyClass: "activated_cost_layer1",
    policyReason:
      "Sacrifice this enchantment is pre-colon activated cost before Reveal/effect — Layer-1 only.",
  },
  "vh13-0107|sacrifice|sacrifice one or more": {
    verdict: "gold_defect_remove_from_l2",
    policyClass: "trigger_event_reference",
    policyReason: "Whenever you sacrifice… trigger event; deal_damage is the L2 effect.",
  },
  "vh13-0160|cast|you may cast a copy": {
    verdict: "valid_layer2_gold",
    castPolicyClass: "immediate_resolution_cast",
    layer2Eligible: true,
    policyReason: "Prepared-state one-shot copy cast during resolution — valid L2 cast.",
  },
  "vh13-0207|put_counter|put a +1/+1 counter on target": {
    verdict: "valid_layer2_gold",
    cardNativeLayer2Eligible: true,
    clauseRole: "effect",
    policyReason: "Put counter is in When-you-do effect clause — valid L2.",
  },
};

export function applyOverride<T extends { caseId: string; evidenceContains?: string; actionType?: string }>(
  row: T,
  keyParts: string[],
): T {
  const key = keyParts.join("|");
  const override = V13_POLICY_OVERRIDES[key];
  if (!override) return row;
  return { ...row, ...override };
}

export function adjudicatePolicyStratumFn(input: {
  testCase: OracleActionEvalCaseV2;
  gold: ExpectedPrimitiveAction;
  stratum: "policy_reminder_heavy" | "policy_trigger_condition";
}): PolicyStratumAdjudication {
  const { testCase, gold, stratum } = input;
  const evidence = gold.evidenceContains ?? "";

  if (stratum === "policy_trigger_condition" && gold.actionType === "cast") {
    return {
      caseId: testCase.id,
      cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
      actionType: gold.actionType,
      evidenceContains: evidence,
      stratum,
      cardNativeLayer2Eligible: false,
      clauseRole: "trigger",
      verdict: "gold_defect_remove_from_l2",
      policyReason: "Cast primitive in trigger/condition clause — trigger_event_reference, not L2 cast.",
    };
  }

  if (stratum === "policy_reminder_heavy") {
    const inReminder = /\([^)]{10,}\)/.test(evidence) || /\(To |\(Draw a card, then discard/i.test(evidence);
    const kickerReminder = /cast this spell/i.test(evidence) && /kicker/i.test(testCase.oracleText);
    if (inReminder || kickerReminder || /put the top card of your library into your graveyard/i.test(evidence)) {
      return {
        caseId: testCase.id,
        cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
        actionType: gold.actionType,
        evidenceContains: evidence,
        stratum,
        cardNativeLayer2Eligible: false,
        clauseRole: "reminder",
        verdict: "gold_defect_remove_from_l2",
        policyReason: "Reminder/kicker/mechanic definition — cardNativeLayer2Eligible=false.",
      };
    }
  }

  const castAdj = classifyCastGold({ testCase, gold });
  const sacAdj =
    gold.actionType === "sacrifice" || gold.actionType === "discard"
      ? classifySacrificeDiscardGold({ testCase, gold })
      : null;

  const verdict = castAdj.verdict !== "indeterminate_requires_human" ? castAdj.verdict : sacAdj?.verdict ?? "valid_layer2_gold";
  const policyReason = castAdj.verdict !== "indeterminate_requires_human" ? castAdj.policyReason : sacAdj?.policyReason ?? "Effect clause primitive.";

  return {
    caseId: testCase.id,
    cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
    actionType: gold.actionType,
    evidenceContains: evidence,
    stratum,
    cardNativeLayer2Eligible: verdict === "valid_layer2_gold",
    clauseRole: verdict === "valid_layer2_gold" ? "effect" : "reminder",
    verdict,
    policyReason,
  };
}

/** Parser-blind FP gold-completeness audit using oracle + scope only. */
export function adjudicateOfficialFpGoldCompleteness(input: {
  testCase: OracleActionEvalCaseV2;
  actionType: string;
  evidenceContains: string;
  abilityType: string;
}): Omit<OfficialFpAdjudication, "emittedAction" | "emittedEvidence"> & {
  shouldBeInGold: boolean;
  verdict: OfficialFpAdjudication["verdict"];
} {
  const { testCase, actionType, evidenceContains, abilityType } = input;
  const oracleText = testCase.oracleText;
  const scope = testCase.caseScope ?? "full_card";

  if (scope === "structure_only") {
    return {
      caseId: testCase.id,
      cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
      caseScope: scope,
      canonicalOracleExcerpt: evidenceContains,
      abilityType,
      actionInScope: false,
      shouldBeInGold: false,
      verdict: "out_of_scope_emission",
      policyReason: "structure_only scope — card-native L2 scoring excluded; emission not an official FP.",
    };
  }

  const inOracle = evidenceInOracle(oracleText, evidenceContains);
  if (!inOracle) {
    return {
      caseId: testCase.id,
      cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
      caseScope: scope,
      canonicalOracleExcerpt: evidenceContains,
      abilityType,
      actionInScope: true,
      shouldBeInGold: false,
      verdict: "genuine_parser_fp",
      policyReason: "Evidence not in canonical oracle — parser hallucination/span defect.",
    };
  }

  const gold = testCase.expectedPrimitiveActions.filter((g) => !g.negative);
  const matchingGold = gold.some(
    (g) => g.actionType === actionType && evidenceInOracle(g.evidenceContains ?? "", evidenceContains),
  );

  if (matchingGold) {
    return {
      caseId: testCase.id,
      cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
      caseScope: scope,
      canonicalOracleExcerpt: evidenceContains,
      abilityType,
      actionInScope: true,
      shouldBeInGold: true,
      verdict: "evaluator_defect",
      policyReason: "Gold exists but matcher failed — evaluator defect not parser FP.",
    };
  }

  const isObviousEffect =
    (actionType === "deal_damage" && /deals damage equal to/i.test(evidenceContains)) ||
    (actionType === "put_counter" && /Put (?:two|three|four|\d+) \+1\/\+1 counters/i.test(evidenceContains)) ||
    (actionType === "put_counter" && /put a \+1\/\+1 counter/i.test(evidenceContains)) ||
    (actionType === "put_counter" && /put that many \+1\/\+1 counters/i.test(evidenceContains)) ||
    (actionType === "put_into_hand" && /put the other into your hand/i.test(evidenceContains)) ||
    (actionType === "put_into_hand" && /put (?:it|that card|that permanent) into (?:your|their) hand/i.test(evidenceContains));

  if (isObviousEffect) {
    return {
      caseId: testCase.id,
      cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
      caseScope: scope,
      canonicalOracleExcerpt: evidenceContains,
      abilityType,
      actionInScope: true,
      shouldBeInGold: true,
      verdict: "missing_gold",
      policyReason: "Canonical resolving effect in scored scope — incomplete gold (Cabaretti Charm lesson).",
      recommendedGoldAddition: { actionType: actionType as ExpectedPrimitiveAction["actionType"], evidenceContains },
    };
  }

  if (actionType === "search_library" && /put a card from your hand on top of your library/i.test(evidenceContains)) {
    return {
      caseId: testCase.id,
      cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
      caseScope: scope,
      canonicalOracleExcerpt: evidenceContains,
      abilityType,
      actionInScope: true,
      shouldBeInGold: false,
      verdict: "genuine_parser_fp",
      policyReason: "Put hand card on library top is not search_library — wrong primitive taxonomy.",
    };
  }

  return {
    caseId: testCase.id,
    cardName: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
    caseScope: scope,
    canonicalOracleExcerpt: evidenceContains,
    abilityType,
    actionInScope: true,
    shouldBeInGold: false,
    verdict: "genuine_parser_fp",
    policyReason: "Emission not covered by oracle policy for missing gold.",
  };
}
