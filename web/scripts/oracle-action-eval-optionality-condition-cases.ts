/**
 * Manually reviewed optionality and condition gold cases for development_set_v2.
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

export const OPTIONALITY_CONDITION_EVAL_CASES: OracleActionEvalCaseV2[] = [
  // --- Optionality: may ---
  {
    id: "dev-opt-001",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-1",
    oracleText: "You may draw a card.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "You may draw a card", optionalEffect: true, optional: true },
    ],
  },
  {
    id: "dev-opt-002",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-2",
    oracleText: "When this creature enters, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
    expectedStructure: { minTriggeredAbilities: 1 },
    expectedPrimitiveActions: [
      {
        actionType: "search_library",
        evidenceContains: "search your library for a basic land",
        optionalEffect: true,
        optional: true,
      },
    ],
  },
  {
    id: "dev-opt-003",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-3",
    oracleText: "You may cast this spell from your graveyard.",
    expectedPrimitiveActions: [
      { actionType: "cast", evidenceContains: "You may cast this spell from your graveyard", optionalEffect: true, optional: true },
    ],
  },
  {
    id: "dev-opt-004",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-4",
    oracleText: "If you control a Swamp, you may pay {B} rather than pay this spell's mana cost.",
    expectedPrimitiveActions: [],
    expectedStructure: { optional: true },
  },
  {
    id: "dev-opt-005",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-5",
    oracleText: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.",
    expectedStructure: { minTriggeredAbilities: 1 },
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "you may draw a card", optionalEffect: true, optional: true },
    ],
  },
  {
    id: "dev-opt-006",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-6",
    oracleText: "That player may pay {2}. If they don't, you create a Treasure token.",
    expectedPrimitiveActions: [
      { actionType: "create_token", evidenceContains: "create a Treasure token" },
    ],
    expectedStructure: { minTriggeredAbilities: 1 },
  },
  {
    id: "dev-opt-007",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-7",
    oracleText: "Draw a card, then you may put a land card from your hand onto the battlefield.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "Draw a card" },
      {
        actionType: "search_library",
        evidenceContains: "put a land card from your hand onto the battlefield",
        optionalEffect: true,
        optional: true,
      },
    ],
  },
  // --- Up to constraints (not may) ---
  {
    id: "dev-opt-008",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-8",
    oracleText: "Destroy up to one target creature.",
    expectedPrimitiveActions: [
      {
        actionType: "destroy",
        evidenceContains: "Destroy up to one target creature",
        targetMaximum: 1,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-009",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-9",
    oracleText: "Exile up to two target creatures.",
    expectedPrimitiveActions: [
      {
        actionType: "exile",
        evidenceContains: "Exile up to two target creatures",
        targetMaximum: 2,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-010",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-10",
    oracleText: "Any number of target players each discard a card.",
    expectedPrimitiveActions: [
      {
        actionType: "discard",
        evidenceContains: "discard a card",
        targetMinimum: 0,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-011",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-11",
    oracleText: "As an additional cost to cast this spell, you may sacrifice a creature.",
    expectedPrimitiveActions: [
      {
        actionType: "sacrifice",
        evidenceContains: "sacrifice a creature",
        optionalCost: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-012",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-12",
    oracleText: "You may draw two cards. If you do, discard a card.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "You may draw two cards", optionalEffect: true, optional: true },
      { actionType: "discard", evidenceContains: "discard a card" },
    ],
    expectedConditions: [{ textContains: "If you do", attachesToEvidence: "discard a card", type: "if_you_do" }],
  },
  // --- Conditions ---
  {
    id: "dev-cond-001",
    category: "condition gold",
    oracleId: "dev-cond-oracle-1",
    oracleText: "If you control a Plains, you gain 3 life.",
    expectedPrimitiveActions: [{ actionType: "gain_life", evidenceContains: "gain 3 life" }],
    expectedConditions: [{ textContains: "If you control a Plains", attachesToEvidence: "gain 3 life", type: "if" }],
  },
  {
    id: "dev-cond-002",
    category: "condition gold",
    oracleId: "dev-cond-oracle-2",
    oracleText: "Destroy target creature if it is tapped.",
    expectedPrimitiveActions: [{ actionType: "destroy", evidenceContains: "Destroy target creature" }],
    expectedConditions: [{ textContains: "if it is tapped", attachesToEvidence: "Destroy target creature", type: "if" }],
  },
  {
    id: "dev-cond-003",
    category: "condition gold",
    oracleId: "dev-cond-oracle-3",
    oracleText: "Creatures can't attack you unless their controller pays {2}.",
    expectedPrimitiveActions: [],
    expectedConditions: [{ textContains: "unless their controller pays", type: "unless" }],
  },
  {
    id: "dev-cond-004",
    category: "condition gold",
    oracleId: "dev-cond-oracle-4",
    oracleText: "You may cast this spell only if you control a commander.",
    expectedPrimitiveActions: [],
    expectedConditions: [{ textContains: "only if you control a commander", type: "only_if" }],
  },
  {
    id: "dev-cond-005",
    category: "condition gold",
    oracleId: "dev-cond-oracle-5",
    oracleText: "As long as you control a Wizard, this spell costs {1} less to cast.",
    expectedPrimitiveActions: [],
    expectedConditions: [{ textContains: "As long as you control a Wizard", type: "as_long_as" }],
  },
  {
    id: "dev-cond-006",
    category: "condition gold",
    oracleId: "dev-cond-oracle-6",
    oracleText: "When you do, draw a card.",
    expectedStructure: { minTriggeredAbilities: 1 },
    expectedPrimitiveActions: [{ actionType: "draw", evidenceContains: "draw a card" }],
    expectedConditions: [{ textContains: "When you do", attachesToEvidence: "draw a card", type: "when_you_do" }],
  },
  {
    id: "dev-cond-007",
    category: "condition gold",
    oracleId: "dev-cond-oracle-7",
    oracleText: "Exile target creature. If you do, draw a card.",
    expectedPrimitiveActions: [
      { actionType: "exile", evidenceContains: "Exile target creature" },
      { actionType: "draw", evidenceContains: "draw a card" },
    ],
    expectedConditions: [{ textContains: "If you do", attachesToEvidence: "draw a card", type: "if_you_do" }],
  },
  {
    id: "dev-cond-008",
    category: "condition gold",
    oracleId: "dev-cond-oracle-8",
    oracleText: "+1: Draw a card. At the beginning of the next end step, untap two lands.",
    expectedPrimitiveActions: [{ actionType: "draw", evidenceContains: "Draw a card" }],
    expectedConditions: [
      { textContains: "At the beginning of the next end step", type: "delayed", attachesToEvidence: "untap two lands" },
    ],
  },
  {
    id: "dev-cond-009",
    category: "condition gold",
    oracleId: "dev-cond-oracle-9",
    oracleText: "When this creature enters, you may destroy target artifact. When you do, draw a card.",
    expectedStructure: { minTriggeredAbilities: 1 },
    expectedPrimitiveActions: [
      { actionType: "destroy", evidenceContains: "destroy target artifact", optionalEffect: true, optional: true },
      { actionType: "draw", evidenceContains: "draw a card" },
    ],
    expectedConditions: [{ textContains: "When you do", attachesToEvidence: "draw a card", type: "intervening_if" }],
  },
  {
    id: "dev-cond-010",
    category: "condition gold",
    oracleId: "dev-cond-oracle-10",
    oracleText: "If a source would deal damage to you, prevent 3 of that damage.",
    expectedPrimitiveActions: [],
    expectedConditions: [{ textContains: "If a source would deal damage", type: "replacement" }],
  },
  {
    id: "dev-cond-011",
    category: "condition gold",
    oracleId: "dev-cond-oracle-11",
    oracleText: "Destroy target creature. Then if you control a Swamp, draw a card.",
    expectedPrimitiveActions: [
      { actionType: "destroy", evidenceContains: "Destroy target creature" },
      { actionType: "draw", evidenceContains: "draw a card" },
    ],
    expectedConditions: [{ textContains: "if you control a Swamp", attachesToEvidence: "draw a card", type: "if" }],
  },
  {
    id: "dev-cond-012",
    category: "condition gold",
    oracleId: "dev-cond-oracle-12",
    oracleText: "For as long as this enchantment is on the battlefield, you may play an additional land on each of your turns.",
    expectedPrimitiveActions: [
      { actionType: "play", evidenceContains: "play an additional land", optionalEffect: true, optional: true },
    ],
    expectedConditions: [{ textContains: "For as long as this enchantment is on the battlefield", type: "as_long_as" }],
  },
];
