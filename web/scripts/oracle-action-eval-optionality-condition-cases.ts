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
  // --- Up to constraints (expanded manual review set, ≥20 cases) ---
  {
    id: "dev-opt-013",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-13",
    oracleText: "Return up to one target creature to its owner's hand.",
    expectedPrimitiveActions: [
      {
        actionType: "return_to_hand",
        evidenceContains: "Return up to one target creature",
        targetMaximum: 1,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-014",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-14",
    oracleText: "Counter up to two target spells.",
    expectedPrimitiveActions: [
      {
        actionType: "counter",
        evidenceContains: "Counter up to two target spells",
        targetMaximum: 2,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-015",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-15",
    oracleText: "Exile up to X target creatures.",
    expectedPrimitiveActions: [
      {
        actionType: "exile",
        evidenceContains: "Exile up to X target creatures",
        targetMaximum: "X",
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-016",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-16",
    oracleText: "Choose up to one card of each card type from your graveyard.",
    expectedPrimitiveActions: [
      {
        actionType: "return_to_battlefield",
        evidenceContains: "Choose up to one card of each card type",
        targetMaximum: 1,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-017",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-17",
    oracleText: "Destroy up to one target creature you control.",
    expectedPrimitiveActions: [
      {
        actionType: "destroy",
        evidenceContains: "Destroy up to one target creature you control",
        targetMaximum: 1,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-018",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-18",
    oracleText: "You may choose not to target any permanents.",
    expectedPrimitiveActions: [],
    expectedStructure: { optional: true },
  },
  {
    id: "dev-opt-019",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-19",
    oracleText: "Put up to that many +1/+1 counters on target creature.",
    expectedPrimitiveActions: [
      {
        actionType: "put_counter",
        evidenceContains: "Put up to that many +1/+1 counters",
        targetMaximum: "X",
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-020",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-20",
    oracleText: "Draw up to three cards.",
    expectedPrimitiveActions: [
      {
        actionType: "draw",
        evidenceContains: "Draw up to three cards",
        targetMaximum: 3,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-021",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-21",
    oracleText: "Mill up to four cards.",
    expectedPrimitiveActions: [
      {
        actionType: "mill",
        evidenceContains: "Mill up to four cards",
        targetMaximum: 4,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-022",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-22",
    oracleText: "Create up to two 1/1 white Soldier creature tokens.",
    expectedPrimitiveActions: [
      {
        actionType: "create_token",
        evidenceContains: "Create up to two 1/1 white Soldier creature tokens",
        targetMaximum: 2,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-023",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-23",
    oracleText: "Discard up to two cards, then draw that many cards.",
    expectedPrimitiveActions: [
      {
        actionType: "discard",
        evidenceContains: "Discard up to two cards",
        targetMaximum: 2,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
      { actionType: "draw", evidenceContains: "draw that many cards" },
    ],
  },
  {
    id: "dev-opt-024",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-24",
    oracleText: "Put up to one +1/+1 counter on up to one target creature.",
    expectedPrimitiveActions: [
      {
        actionType: "put_counter",
        evidenceContains: "Put up to one +1/+1 counter on up to one target creature",
        targetMaximum: 1,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-025",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-25",
    oracleText: "Exile up to three target cards from a graveyard.",
    expectedPrimitiveActions: [
      {
        actionType: "exile",
        evidenceContains: "Exile up to three target cards from a graveyard",
        targetMaximum: 3,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-026",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-26",
    oracleText: "Tap up to two target creatures.",
    expectedPrimitiveActions: [
      {
        actionType: "tap",
        evidenceContains: "Tap up to two target creatures",
        targetMaximum: 2,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-027",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-27",
    oracleText: "Sacrifice up to one creature.",
    expectedPrimitiveActions: [
      {
        actionType: "sacrifice",
        evidenceContains: "Sacrifice up to one creature",
        targetMaximum: 1,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-028",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-28",
    oracleText: "Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.",
    expectedPrimitiveActions: [
      {
        actionType: "search_library",
        evidenceContains: "Search your library for up to two basic land cards",
        targetMaximum: 2,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-029",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-29",
    oracleText: "Deal up to 3 damage divided as you choose among one, two, or three targets.",
    expectedPrimitiveActions: [
      {
        actionType: "deal_damage",
        evidenceContains: "Deal up to 3 damage",
        targetMaximum: 3,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-030",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-30",
    oracleText: "Target player loses up to 5 life.",
    expectedPrimitiveActions: [
      {
        actionType: "lose_life",
        evidenceContains: "loses up to 5 life",
        targetMaximum: 5,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-031",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-31",
    oracleText: "Scry up to 2, then draw a card.",
    expectedPrimitiveActions: [
      {
        actionType: "scry",
        evidenceContains: "Scry up to 2",
        targetMaximum: 2,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
      { actionType: "draw", evidenceContains: "draw a card" },
    ],
  },
  {
    id: "dev-opt-032",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-32",
    oracleText: "Choose up to three target permanents. Destroy them.",
    expectedPrimitiveActions: [
      {
        actionType: "destroy",
        evidenceContains: "Destroy them",
        targetMaximum: 3,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
    ],
  },
  {
    id: "dev-opt-033",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-33",
    oracleText: "An opponent may sacrifice a creature rather than pay this spell's mana cost.",
    expectedPrimitiveActions: [
      {
        actionType: "sacrifice",
        evidenceContains: "sacrifice a creature",
        optionalCost: true,
        optionalEffect: false,
        optionalityController: "opponent",
      },
    ],
  },
  {
    id: "dev-opt-034",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-34",
    oracleText: "That player may pay {2}. If they don't, you draw a card.",
    expectedPrimitiveActions: [{ actionType: "draw", evidenceContains: "draw a card" }],
    expectedConditions: [{ textContains: "If they don't", attachesToEvidence: "draw a card", type: "unless" }],
  },
  {
    id: "dev-opt-035",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-35",
    oracleText: "You may draw a card. You may put a card from your hand on top of your library.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "You may draw a card", optionalEffect: true, optionalityScopeId: "scope-a" },
      {
        actionType: "search_library",
        evidenceContains: "put a card from your hand on top of your library",
        optionalEffect: true,
        optionalityScopeId: "scope-b",
      },
    ],
  },
  {
    id: "dev-opt-036",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-36",
    oracleText: "You may search your library for a basic land card and a basic Island card, reveal them, put them into your hand, then shuffle.",
    expectedPrimitiveActions: [
      {
        actionType: "search_library",
        evidenceContains: "search your library for a basic land card and a basic Island card",
        optionalEffect: true,
        optionalityScopeId: "shared-may",
      },
    ],
  },
  {
    id: "dev-opt-037",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-37",
    oracleText: "You may destroy target artifact. When you do, draw a card.",
    expectedStructure: { minTriggeredAbilities: 1 },
    expectedPrimitiveActions: [
      { actionType: "destroy", evidenceContains: "destroy target artifact", optionalEffect: true },
      { actionType: "draw", evidenceContains: "draw a card" },
    ],
    expectedConditions: [{ textContains: "When you do", attachesToEvidence: "draw a card", type: "when_you_do" }],
  },
  {
    id: "dev-opt-038",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-38",
    oracleText: "Copy target instant or sorcery spell. You may choose new targets for the copy.",
    expectedPrimitiveActions: [
      { actionType: "copy", evidenceContains: "Copy target instant" },
      { actionType: "copy", evidenceContains: "choose new targets for the copy", optionalEffect: true },
    ],
  },
  {
    id: "dev-opt-039",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-39",
    oracleText: "You may cast this spell from your graveyard.",
    expectedPrimitiveActions: [
      { actionType: "cast", evidenceContains: "You may cast this spell from your graveyard", optionalEffect: true },
    ],
  },
  {
    id: "dev-opt-040",
    category: "optionality gold",
    oracleId: "dev-opt-oracle-40",
    oracleText: "Until end of turn, you may play lands and cast spells from your graveyard.",
    expectedPrimitiveActions: [
      { actionType: "play", evidenceContains: "play lands and cast spells from your graveyard", optionalEffect: true },
    ],
  },
];
