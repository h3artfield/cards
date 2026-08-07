/**
 * Manual adjudication of v1.14 accepted gold_omission FPs (20 emissions).
 * Run: npx tsx scripts/adjudicate-gold-omission-v14.ts
 */
export const GOLD_OMISSION_V14_REVIEWER = "gold-omission-audit-v14";
export const GOLD_OMISSION_V14_REVIEWED_AT = "2026-08-07T08:30:00.000Z";

export type GoldOmissionDecision = "add_gold" | "reject_parser_output";

export interface GoldOmissionAdjudication {
  caseId: string;
  cardName: string;
  oracleId?: string;
  face: "front" | "back";
  exactOracleText: string;
  parserPrimitive: string;
  parserEvidence: string;
  spanRole: string;
  existingGold: string;
  decision: GoldOmissionDecision;
  reason: string;
  reviewer: string;
  reviewedAt: string;
  goldAddition?: {
    actionType: string;
    evidenceContains: string;
    cardFace?: "front" | "back";
    optionalEffect?: boolean;
  };
  goldEvidenceFix?: {
    actionType: string;
    oldEvidenceContains: string;
    newEvidenceContains: string;
  };
  forbiddenPrimitive?: string;
}

/** Twenty v1.14 gold_omission accepted FPs — manually verified against catalog Oracle text. */
export const GOLD_OMISSION_V14_ADJUDICATIONS: GoldOmissionAdjudication[] = [
  {
    caseId: "dev-cond-006",
    cardName: "Unscrupulous Contractor",
    face: "front",
    exactOracleText:
      "When this creature enters, you may sacrifice a creature. When you do, target player draws two cards and loses 2 life.\nPlot {2}{B} (You may pay {2}{B} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
    parserPrimitive: "sacrifice",
    parserEvidence: "you may sacrifice a creature",
    spanRole: "effect",
    existingGold: "draw (truncated evidence)",
    decision: "add_gold",
    reason: "Optional antecedent sacrifice on ETB trigger is Layer-2 under the established optional-antecedent model.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    goldAddition: {
      actionType: "sacrifice",
      evidenceContains: "you may sacrifice a creature",
      optionalEffect: true,
    },
  },
  {
    caseId: "dev-cond-006",
    cardName: "Unscrupulous Contractor",
    face: "front",
    exactOracleText:
      "When this creature enters, you may sacrifice a creature. When you do, target player draws two cards and loses 2 life.\nPlot {2}{B} (You may pay {2}{B} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
    parserPrimitive: "lose_life",
    parserEvidence: "loses 2 life",
    spanRole: "effect",
    existingGold: "draw (truncated evidence)",
    decision: "add_gold",
    reason: "Life loss is part of the When-you-do consequent effect, distinct from draw.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    goldAddition: { actionType: "lose_life", evidenceContains: "loses 2 life" },
    goldEvidenceFix: {
      actionType: "draw",
      oldEvidenceContains: "u do, target player draws",
      newEvidenceContains: "draws two cards",
    },
  },
  {
    caseId: "dev-cond-007",
    cardName: "Keldon Raider",
    face: "front",
    exactOracleText: "When this creature enters, you may discard a card. If you do, draw a card.",
    parserPrimitive: "discard",
    parserEvidence: "you may discard a card",
    spanRole: "effect",
    existingGold: "draw",
    decision: "add_gold",
    reason: "Optional discard antecedent is Layer-2; draw remains separate consequent effect.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    goldAddition: {
      actionType: "discard",
      evidenceContains: "you may discard a card",
      optionalEffect: true,
    },
  },
  {
    caseId: "dev-cond-008",
    cardName: "Vizier of Deferment",
    face: "front",
    exactOracleText:
      "Flash\nWhen this creature enters, you may exile target creature if it attacked or blocked this turn. Return that card to the battlefield under its owner's control at the beginning of the next end step.",
    parserPrimitive: "return_to_battlefield",
    parserEvidence: "Return that card to the battlefield",
    spanRole: "effect",
    existingGold: "exile",
    decision: "add_gold",
    reason: "Delayed return at next end step is a distinct Layer-2 return_to_battlefield primitive.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    goldAddition: {
      actionType: "return_to_battlefield",
      evidenceContains: "Return that card to the battlefield",
    },
  },
  {
    caseId: "dev-cond-012",
    cardName: "Mystic Remora",
    face: "front",
    exactOracleText:
      "Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.",
    parserPrimitive: "sacrifice",
    parserEvidence: "sacrifice it unless you pay its upkeep cost",
    spanRole: "effect",
    existingGold: "draw",
    decision: "reject_parser_output",
    reason: "Emission is inside cumulative-upkeep reminder parentheses — mechanic reminder, not card Layer-2.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    forbiddenPrimitive: "sacrifice",
  },
  {
    caseId: "dev-v9-001",
    cardName: "Mox Diamond",
    face: "front",
    exactOracleText:
      "If this artifact would enter, you may discard a land card instead. If you do, put this artifact onto the battlefield. If you don't, put it into its owner's graveyard.\n{T}: Add one mana of any color.",
    parserPrimitive: "discard",
    parserEvidence: "you may discard a land card instead",
    spanRole: "effect",
    existingGold: "put_onto_battlefield, add_mana",
    decision: "add_gold",
    reason: "Replacement-effect optional discard is a Layer-2 optional antecedent, not merely structure.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    goldAddition: {
      actionType: "discard",
      evidenceContains: "you may discard a land card instead",
      optionalEffect: true,
    },
  },
  {
    caseId: "eval-0033",
    cardName: "Teferi's Protection",
    face: "front",
    exactOracleText:
      "Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection.",
    parserPrimitive: "untap",
    parserEvidence: "untap during your untap step",
    spanRole: "effect",
    existingGold: "(none)",
    decision: "reject_parser_output",
    reason: "Untap reference is inside phased-out rules reminder — not a card effect primitive.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    forbiddenPrimitive: "untap",
  },
  {
    caseId: "eval-0059",
    cardName: "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki",
    face: "front",
    exactOracleText:
      "II — You may discard up to two cards. If you do, draw that many cards.",
    parserPrimitive: "discard",
    parserEvidence: "You may discard up to two cards",
    spanRole: "effect",
    existingGold: "create_token, draw",
    decision: "add_gold",
    reason: "Saga chapter II optional discard antecedent is Layer-2 alongside draw consequent.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    goldAddition: {
      actionType: "discard",
      evidenceContains: "You may discard up to two cards",
      optionalEffect: true,
    },
  },
  {
    caseId: "eval-0064",
    cardName: "Snapcaster Mage",
    face: "front",
    exactOracleText:
      "When this creature enters, target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost. (You may cast that card from your graveyard for its flashback cost. Then exile it.)",
    parserPrimitive: "cast",
    parserEvidence: "You may cast that",
    spanRole: "effect",
    existingGold: "(none)",
    decision: "reject_parser_output",
    reason: "Cast text is inside flashback rules reminder parentheses — Layer-1 mechanic reminder.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    forbiddenPrimitive: "cast",
  },
  {
    caseId: "eval-0079",
    cardName: "Blind Obedience",
    face: "front",
    exactOracleText:
      "Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\nArtifacts and creatures your opponents control enter tapped.",
    parserPrimitive: "lose_life",
    parserEvidence: "loses 1 life",
    spanRole: "effect",
    existingGold: "(none)",
    decision: "reject_parser_output",
    reason: "Life loss is inside Extort keyword reminder — not this card's Layer-2 effect (static enter-tapped).",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    forbiddenPrimitive: "lose_life",
  },
  {
    caseId: "eval-0092",
    cardName: "Unscrupulous Contractor",
    face: "front",
    exactOracleText:
      "When this creature enters, you may sacrifice a creature. When you do, target player draws two cards and loses 2 life.",
    parserPrimitive: "lose_life",
    parserEvidence: "loses 2 life",
    spanRole: "effect",
    existingGold: "sacrifice, draw",
    decision: "add_gold",
    reason: "When-you-do consequent life loss is a distinct Layer-2 primitive.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    goldAddition: { actionType: "lose_life", evidenceContains: "loses 2 life" },
    goldEvidenceFix: {
      actionType: "sacrifice",
      oldEvidenceContains: "You may",
      newEvidenceContains: "you may sacrifice a creature",
    },
  },
  {
    caseId: "eval-0109",
    cardName: "Founding the Third Path",
    face: "front",
    exactOracleText: "Read ahead (… Sacrifice after III.)",
    parserPrimitive: "sacrifice",
    parserEvidence: "Sacrifice after III",
    spanRole: "effect",
    existingGold: "exile, cast",
    decision: "reject_parser_output",
    reason: "Sacrifice-after-III is inside Read ahead saga reminder — not a card effect emission.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    forbiddenPrimitive: "sacrifice",
  },
  {
    caseId: "eval-0112",
    cardName: "Vizier of Deferment",
    face: "front",
    exactOracleText:
      "When this creature enters, you may exile target creature if it attacked or blocked this turn. Return that card to the battlefield under its owner's control at the beginning of the next end step.",
    parserPrimitive: "return_to_battlefield",
    parserEvidence: "Return that card to the battlefield",
    spanRole: "effect",
    existingGold: "exile",
    decision: "add_gold",
    reason: "Delayed return is Layer-2 return_to_battlefield alongside optional exile.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    goldAddition: {
      actionType: "return_to_battlefield",
      evidenceContains: "Return that card to the battlefield",
    },
  },
  {
    caseId: "eval-0116",
    cardName: "Nova Hellkite",
    face: "front",
    exactOracleText:
      "Warp {2}{R} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)",
    parserPrimitive: "cast",
    parserEvidence: "You may cast this",
    spanRole: "effect",
    existingGold: "deal_damage",
    decision: "reject_parser_output",
    reason: "Cast text is inside Warp keyword reminder parentheses — not card Layer-2 (ETB damage is gold).",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    forbiddenPrimitive: "cast",
  },
  {
    caseId: "eval-0135",
    cardName: "Flawless Forgery",
    face: "front",
    exactOracleText:
      "Exile target instant or sorcery card from an opponent's graveyard. Copy that card. You may cast the copy without paying its mana cost.",
    parserPrimitive: "cast",
    parserEvidence: "You may cast the copy",
    spanRole: "effect",
    existingGold: "exile",
    decision: "add_gold",
    reason: "Resolution-time optional cast-without-paying is Layer-2 cast under cast-permission policy.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    goldAddition: {
      actionType: "cast",
      evidenceContains: "You may cast the copy",
      optionalEffect: true,
    },
  },
  {
    caseId: "eval-0163",
    cardName: "Nyssa of Traken",
    face: "front",
    exactOracleText:
      "Sonic Booster — Whenever Nyssa of Traken attacks, sacrifice any number of artifacts. When you sacrifice one or more artifacts this way, tap up to that many target creatures and draw that many cards.",
    parserPrimitive: "sacrifice",
    parserEvidence: "sacrifice any number of artifacts",
    spanRole: "effect",
    existingGold: "draw",
    decision: "add_gold",
    reason: "Attack-trigger antecedent sacrifice is Layer-2; draw/tap are separate consequent effects.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    goldAddition: {
      actionType: "sacrifice",
      evidenceContains: "sacrifice any number of artifacts",
    },
  },
  {
    caseId: "eval-0193",
    cardName: "Codie, Vociferous Codex",
    face: "front",
    exactOracleText:
      "Until end of turn, you may cast that card without paying its mana cost.",
    parserPrimitive: "cast",
    parserEvidence: "you may cast that",
    spanRole: "effect",
    existingGold: "(none)",
    decision: "add_gold",
    reason: "Turn-limited resolution cast permission on triggered ability is Layer-2 cast per policy.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    goldAddition: {
      actionType: "cast",
      evidenceContains: "you may cast that card without paying its mana cost",
      optionalEffect: true,
    },
  },
  {
    caseId: "eval-0199",
    cardName: "Combat Thresher",
    face: "front",
    exactOracleText:
      "Prototype {2}{W} — 1/1 (You may cast this spell with different mana cost, color, and size. It keeps its abilities and types.)",
    parserPrimitive: "cast",
    parserEvidence: "You may cast this",
    spanRole: "effect",
    existingGold: "draw",
    decision: "reject_parser_output",
    reason: "Cast is inside Prototype keyword reminder — not card Layer-2 (ETB draw is gold).",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    forbiddenPrimitive: "cast",
  },
  {
    caseId: "eval-0200",
    cardName: "Goring Warplow",
    face: "front",
    exactOracleText:
      "Prototype {1}{B} — 1/1 (You may cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nDeathtouch",
    parserPrimitive: "cast",
    parserEvidence: "You may cast this",
    spanRole: "effect",
    existingGold: "(none)",
    decision: "reject_parser_output",
    reason: "Prototype reminder only — no card Layer-2 cast effect on this face.",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    forbiddenPrimitive: "cast",
  },
  {
    caseId: "eval-0202",
    cardName: "Porcuparrot",
    face: "front",
    exactOracleText:
      "Mutate {2}{R} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)",
    parserPrimitive: "cast",
    parserEvidence: "cast this",
    spanRole: "effect",
    existingGold: "(none)",
    decision: "reject_parser_output",
    reason: "Cast reference is inside Mutate keyword reminder — not card Layer-2 (activated damage is separate).",
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
    forbiddenPrimitive: "cast",
  },
];

export function isAdjudicatedRejectV14(input: {
  caseId: string;
  parserPrimitive: string;
  parserEvidence: string;
}): GoldOmissionAdjudication | undefined {
  return GOLD_OMISSION_V14_ADJUDICATIONS.find(
    (a) =>
      a.decision === "reject_parser_output" &&
      a.caseId === input.caseId &&
      a.parserPrimitive === input.parserPrimitive &&
      (input.parserEvidence.startsWith(a.parserEvidence.slice(0, 12)) ||
        a.parserEvidence.startsWith(input.parserEvidence.slice(0, 12))),
  );
}
