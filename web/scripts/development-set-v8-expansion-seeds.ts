/**
 * Generalization-focused development expansion seeds (NOT validation cards).
 * Covers validation failure families with different Oracle texts.
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { inferDerivedRoles, type PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type DevExpansionFamily =
  | "hand_to_battlefield_put_not_search"
  | "static_cast_restriction_not_cast"
  | "alternative_cost_not_cast_primitive"
  | "return_zone_disambiguation"
  | "third_person_draw_discard_sacrifice"
  | "trigger_condition_action_words"
  | "compound_then_clauses"
  | "cast_vs_play_permission"
  | "replacement_effect_clauses"
  | "unsupported_wording_must_abstain";

export interface DevExpansionSeed {
  family: DevExpansionFamily;
  name: string;
  category: string;
  text: string;
  layout?: string;
  face?: string;
  primitives: Array<{ actionType: PrimitiveActionType; evidenceContains: string; optional?: boolean }>;
  structure?: OracleActionEvalCaseV2["expectedStructure"];
  forbidden?: PrimitiveActionType[];
  notes: string;
}

/** Cards deliberately different from validation_set held-out seeds. */
export const DEV_EXPANSION_V8_SEEDS: DevExpansionSeed[] = [
  {
    family: "hand_to_battlefield_put_not_search",
    name: "Harrow",
    category: "dev-exp put-from-hand",
    text: "As an additional cost to cast this spell, sacrifice a land.\nSearch your library for up to two basic land cards, put them onto the battlefield, then shuffle.",
    primitives: [
      { actionType: "sacrifice", evidenceContains: "sacrifice a land" },
      { actionType: "search_library", evidenceContains: "Search your library" },
    ],
    notes: "Search+put pattern — distinct from Growth Spiral hand-put mislabel family.",
  },
  {
    family: "hand_to_battlefield_put_not_search",
    name: "Mox Diamond",
    category: "dev-exp put-from-hand",
    text: "If you would draw a card, you may instead put a land card from your hand onto the battlefield.",
    primitives: [{ actionType: "play", evidenceContains: "put a land card from your hand onto the battlefield", optional: true }],
    notes: "Hand→battlefield permission is play, not search_library.",
  },
  {
    family: "hand_to_battlefield_put_not_search",
    name: "Arbor Elf",
    category: "dev-exp put-from-hand",
    text: "{T}: Untap target Forest.\nAs long as you control a Forest, you may put a land card from your hand onto the battlefield tapped.",
    primitives: [
      { actionType: "untap", evidenceContains: "Untap target Forest" },
      { actionType: "play", evidenceContains: "put a land card from your hand onto the battlefield", optional: true },
    ],
    notes: "Static play permission for lands from hand.",
  },
  {
    family: "hand_to_battlefield_put_not_search",
    name: "Burgeoning",
    category: "dev-exp put-from-hand",
    text: "Whenever an opponent plays a land, you may put a land card from your hand onto the battlefield.",
    primitives: [{ actionType: "play", evidenceContains: "put a land card from your hand onto the battlefield", optional: true }],
    structure: { minTriggeredAbilities: 1 },
    notes: "Triggered play permission — not search.",
  },
  {
    family: "static_cast_restriction_not_cast",
    name: "Rule of Law",
    category: "dev-exp static restriction",
    text: "Each player can't cast more than one spell each turn.",
    primitives: [],
    forbidden: ["cast"],
    notes: "Static cast restriction must not emit cast primitive.",
  },
  {
    family: "static_cast_restriction_not_cast",
    name: "Eidolon of Rhetoric",
    category: "dev-exp static restriction",
    text: "Each player can't cast spells during each other's turn.",
    primitives: [],
    forbidden: ["cast"],
    notes: "Opponent turn restriction — structural only.",
  },
  {
    family: "static_cast_restriction_not_cast",
    name: "Chalice of the Void",
    category: "dev-exp static restriction",
    text: "Spells with mana value equal to the number of charge counters on this artifact can't be cast.",
    primitives: [],
    forbidden: ["cast"],
    notes: "Static can't cast — not player cast action.",
  },
  {
    family: "alternative_cost_not_cast_primitive",
    name: "Force of Will",
    category: "dev-exp alt cost",
    text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell.",
    primitives: [{ actionType: "counter", evidenceContains: "Counter target spell" }],
    notes: "Alternative cost is not cast-from-zone primitive.",
  },
  {
    family: "alternative_cost_not_cast_primitive",
    name: "Pyrokinesis",
    category: "dev-exp alt cost",
    text: "You may exile a red card from your hand rather than pay this spell's mana cost.\nPyrokinesis deals 4 damage divided as you choose among any number of targets.",
    primitives: [{ actionType: "deal_damage", evidenceContains: "deals 4 damage" }],
    notes: "Exile-from-hand cost + damage effect only.",
  },
  {
    family: "alternative_cost_not_cast_primitive",
    name: "Solitude",
    category: "dev-exp alt cost",
    text: "You may exile a white card from your hand rather than pay this spell's mana cost.\nExile target creature or enchantment.",
    primitives: [{ actionType: "exile", evidenceContains: "Exile target creature or enchantment" }],
    notes: "MH2 evoke-style alt cost — not cast permission.",
  },
  {
    family: "return_zone_disambiguation",
    name: "Regrowth",
    category: "dev-exp return zones",
    text: "Return target card from your graveyard to your hand.",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "from your graveyard to your hand" }],
    notes: "Graveyard→hand is return_to_hand not return_to_battlefield.",
  },
  {
    family: "return_zone_disambiguation",
    name: "Reanimate",
    category: "dev-exp return zones",
    text: "Put target creature card from a graveyard onto the battlefield. You lose life equal to its mana value.",
    primitives: [
      { actionType: "return_to_battlefield", evidenceContains: "from a graveyard onto the battlefield" },
      { actionType: "lose_life", evidenceContains: "lose life" },
    ],
    notes: "Graveyard→battlefield distinct primitive.",
  },
  {
    family: "return_zone_disambiguation",
    name: "Call of the Herd",
    category: "dev-exp return zones",
    text: "Create a 3/3 green Elephant creature token.\nFlashback {3}{G}{G}",
    primitives: [{ actionType: "create_token", evidenceContains: "Create a 3/3" }],
    notes: "Flashback keyword is structural; no play primitive.",
  },
  {
    family: "return_zone_disambiguation",
    name: "Unearth",
    category: "dev-exp return zones",
    text: "{B}: Return target creature card with mana value 3 or less from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead.",
    primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }],
    notes: "Activated return-to-battlefield with replacement exile.",
  },
  {
    family: "third_person_draw_discard_sacrifice",
    name: "Howling Mine",
    category: "dev-exp third person",
    text: "At the beginning of each player's draw step, that player draws an additional card.",
    primitives: [{ actionType: "draw", evidenceContains: "draws an additional card" }],
    structure: { minTriggeredAbilities: 1 },
    notes: "Third-person draw on draw step trigger.",
  },
  {
    family: "third_person_draw_discard_sacrifice",
    name: "Cathartic Reunion",
    category: "dev-exp third person",
    text: "Discard two cards, then draw three cards.",
    primitives: [
      { actionType: "discard", evidenceContains: "Discard two cards" },
      { actionType: "draw", evidenceContains: "draw three cards" },
    ],
    notes: "Compound discard-then-draw on single card.",
  },
  {
    family: "third_person_draw_discard_sacrifice",
    name: "Smallpox",
    category: "dev-exp third person",
    text: "Each player loses 1 life, discards a card, sacrifices a creature, and sacrifices a land.",
    primitives: [
      { actionType: "lose_life", evidenceContains: "loses 1 life" },
      { actionType: "discard", evidenceContains: "discards a card" },
      { actionType: "sacrifice", evidenceContains: "sacrifices a creature" },
      { actionType: "sacrifice", evidenceContains: "sacrifices a land" },
    ],
    notes: "Each player sacrifices — third-person pattern.",
  },
  {
    family: "trigger_condition_action_words",
    name: "Soul Warden",
    category: "dev-exp trigger condition",
    text: "Whenever another creature enters, you gain 1 life.",
    primitives: [{ actionType: "gain_life", evidenceContains: "gain 1 life" }],
    structure: { minTriggeredAbilities: 1 },
    notes: "Enters trigger — no enters-the-battlefield as primitive.",
  },
  {
    family: "trigger_condition_action_words",
    name: "Zulaport Cutthroat",
    category: "dev-exp trigger condition",
    text: "Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life.",
    primitives: [
      { actionType: "lose_life", evidenceContains: "loses 1 life" },
      { actionType: "gain_life", evidenceContains: "gain 1 life" },
    ],
    structure: { minTriggeredAbilities: 1 },
    notes: "Dies in trigger condition — not sacrifice primitive.",
  },
  {
    family: "trigger_condition_action_words",
    name: "Harmonic Sliver",
    category: "dev-exp trigger condition",
    text: "Whenever a player plays a spell, each other player may draw a card.",
    primitives: [{ actionType: "draw", evidenceContains: "draw a card", optional: true }],
    structure: { minTriggeredAbilities: 1 },
    notes: "Play in trigger condition; optional draw is effect.",
  },
  {
    family: "trigger_condition_action_words",
    name: "Garruk's Uprising",
    category: "dev-exp trigger condition",
    text: "Whenever a creature you control with power 4 or greater enters, draw a card.",
    primitives: [{ actionType: "draw", evidenceContains: "draw a card" }],
    structure: { minTriggeredAbilities: 1 },
    notes: "Enters condition must not extract enters as action.",
  },
  {
    family: "compound_then_clauses",
    name: "Faithless Looting",
    category: "dev-exp compound",
    text: "Draw two cards, then discard two cards.",
    primitives: [
      { actionType: "draw", evidenceContains: "Draw two cards" },
      { actionType: "discard", evidenceContains: "discard two cards" },
    ],
    notes: "Comma-then sequencing on one line.",
  },
  {
    family: "compound_then_clauses",
    name: "Night's Whisper",
    category: "dev-exp compound",
    text: "You draw two cards and you lose 2 life.",
    primitives: [
      { actionType: "draw", evidenceContains: "draw two cards" },
      { actionType: "lose_life", evidenceContains: "lose 2 life" },
    ],
    notes: "Compound draw+lose on single instruction.",
  },
  {
    family: "compound_then_clauses",
    name: "Read the Bones",
    category: "dev-exp compound",
    text: "Scry 2, then draw two cards. You lose 2 life.",
    primitives: [
      { actionType: "scry", evidenceContains: "Scry 2" },
      { actionType: "draw", evidenceContains: "draw two cards" },
      { actionType: "lose_life", evidenceContains: "lose 2 life" },
    ],
    notes: "Scry-then-draw compound.",
  },
  {
    family: "cast_vs_play_permission",
    name: "Crucible of Worlds",
    category: "dev-exp cast vs play",
    text: "You may play land cards from your graveyard.",
    primitives: [{ actionType: "play", evidenceContains: "play land cards from your graveyard", optional: true }],
    notes: "Play lands from graveyard — play not cast.",
  },
  {
    family: "cast_vs_play_permission",
    name: "Underworld Breach",
    category: "dev-exp cast vs play",
    text: "During each of your turns, you may play lands and cast spells from your graveyard.",
    primitives: [
      { actionType: "play", evidenceContains: "play lands", optional: true },
      { actionType: "cast", evidenceContains: "cast spells from your graveyard", optional: true },
    ],
    notes: "Split play/cast permission like dev v7 calibration.",
  },
  {
    family: "cast_vs_play_permission",
    name: "Voldaren Epicure",
    category: "dev-exp cast vs play",
    text: "When this creature enters, it deals 1 damage to any target. Create a Blood token.",
    primitives: [
      { actionType: "deal_damage", evidenceContains: "deals 1 damage" },
      { actionType: "create_token", evidenceContains: "Create a Blood token" },
    ],
    structure: { minTriggeredAbilities: 1 },
    notes: "Enters trigger with damage+token — not cast.",
  },
  {
    family: "replacement_effect_clauses",
    name: "Rest in Peace",
    category: "dev-exp replacement",
    text: "If a card would be put into a graveyard from anywhere, exile it instead.",
    primitives: [{ actionType: "exile", evidenceContains: "exile it instead" }],
    notes: "Replacement exile — not search or mill.",
  },
  {
    family: "replacement_effect_clauses",
    name: "Platinum Angel",
    category: "dev-exp replacement",
    text: "You can't lose the game and your opponents can't win the game.",
    primitives: [],
    forbidden: ["draw", "destroy"],
    notes: "Static game rule — no primitives.",
  },
  {
    family: "unsupported_wording_must_abstain",
    name: "Ice-Fang Coatl",
    category: "dev-exp abstain",
    text: "Flash\nFlying\nWhen this creature enters, draw a card.\nSnow landwalk",
    primitives: [{ actionType: "draw", evidenceContains: "draw a card" }],
    structure: { minTriggeredAbilities: 1 },
    notes: "Keyword ability lines must not invent actions.",
  },
  {
    family: "unsupported_wording_must_abstain",
    name: "Trinket Mage",
    category: "dev-exp abstain",
    text: "When this creature enters, you may search your library for an artifact card with mana value 1 or less, reveal it, put it into your hand, then shuffle.",
    primitives: [{ actionType: "search_library", evidenceContains: "search your library", optional: true }],
    structure: { minTriggeredAbilities: 1 },
    notes: "Tutor-to-hand — supported search; contrast with hand-put mislabels.",
  },
];

export function buildDevExpansionCases(startIndex: number): OracleActionEvalCaseV2[] {
  return DEV_EXPANSION_V8_SEEDS.map((seed, i) => {
    const id = `dev-exp-${String(startIndex + i).padStart(3, "0")}`;
    const primitives = seed.primitives.map((p) => ({
      actionType: p.actionType,
      evidenceContains: p.evidenceContains,
      cardFace: seed.face,
      optional: p.optional,
    }));
    return {
      id,
      category: seed.category,
      layout: seed.layout,
      oracleId: `dev-exp-oracle-${startIndex + i}`,
      oracleText: seed.text,
      cardFace: seed.face,
      expectedStructure: seed.structure,
      expectedPrimitiveActions: primitives,
      expectedRoles: inferDerivedRoles(primitives.map((p) => p.actionType)).map((role) => ({
        role,
        fromPrimitiveActions: primitives
          .map((p) => p.actionType)
          .filter((p) =>
            role === "tutor"
              ? p === "search_library"
              : role === "ramp"
                ? p === "add_mana" || p === "play"
                : role === "removal"
                  ? ["destroy", "exile", "deal_damage", "counter"].includes(p)
                  : role === "card_advantage"
                    ? p === "draw"
                    : false,
          ),
      })),
      forbiddenPrimitiveActions: seed.forbidden,
    };
  });
}

export function familyCounts(): Record<DevExpansionFamily, number> {
  const counts = {} as Record<DevExpansionFamily, number>;
  for (const seed of DEV_EXPANSION_V8_SEEDS) {
    counts[seed.family] = (counts[seed.family] ?? 0) + 1;
  }
  return counts;
}
