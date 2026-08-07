/**
 * development_set_v9 expansion seeds — three-layer-v1.2 taxonomy.
 * NOT validation cards. Each seed manually reviewed against Oracle text (catalog-audit-agent).
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { inferDerivedRoles, type PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type DevV9LayerLabel =
  | "layer2_primitive"
  | "layer1_static_restriction"
  | "layer1_trigger_condition"
  | "alternative_cost"
  | "unsupported_abstain_expected";

export type DevExpansionFamily =
  | "hand_to_battlefield_put_not_search"
  | "graveyard_to_battlefield_put"
  | "search_library_then_put_onto_battlefield"
  | "explicit_play_land"
  | "explicit_cast_spell"
  | "play_lands_or_spells_permission"
  | "action_words_in_restrictions_or_costs"
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
  primitives: Array<{
    actionType: PrimitiveActionType;
    evidenceContains: string;
    optional?: boolean;
    sourceZone?: string;
    destinationZone?: string;
    affectedObject?: string;
    layerLabel: DevV9LayerLabel;
  }>;
  structure?: OracleActionEvalCaseV2["expectedStructure"];
  forbidden?: PrimitiveActionType[];
  layerNotes: string;
  manualReviewConfirmed: true;
  reviewer: "catalog-audit-agent";
}

export const DEV_EXPANSION_V9_SEEDS: DevExpansionSeed[] = [
  {
    family: "hand_to_battlefield_put_not_search",
    name: "Mox Diamond",
    category: "dev-v9 put-from-hand",
    text: "If you would draw a card, you may instead put a land card from your hand onto the battlefield.",
    primitives: [
      {
        actionType: "put_onto_battlefield",
        evidenceContains: "put a land card from your hand onto the battlefield",
        optional: true,
        sourceZone: "hand",
        destinationZone: "battlefield",
        affectedObject: "land_card",
        layerLabel: "layer2_primitive",
      },
    ],
    layerNotes: "Hand→battlefield put is put_onto_battlefield, not play or search_library.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "hand_to_battlefield_put_not_search",
    name: "Arbor Elf",
    category: "dev-v9 put-from-hand",
    text: "{T}: Untap target Forest.\nAs long as you control a Forest, you may put a land card from your hand onto the battlefield tapped.",
    primitives: [
      { actionType: "untap", evidenceContains: "Untap target Forest", layerLabel: "layer2_primitive" },
      {
        actionType: "put_onto_battlefield",
        evidenceContains: "put a land card from your hand onto the battlefield",
        optional: true,
        sourceZone: "hand",
        destinationZone: "battlefield",
        affectedObject: "land_card",
        layerLabel: "layer2_primitive",
      },
    ],
    layerNotes: "Untap is primitive; land put from hand is put_onto_battlefield not play.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "hand_to_battlefield_put_not_search",
    name: "Burgeoning",
    category: "dev-v9 put-from-hand",
    text: "Whenever an opponent plays a land, you may put a land card from your hand onto the battlefield.",
    primitives: [
      {
        actionType: "put_onto_battlefield",
        evidenceContains: "put a land card from your hand onto the battlefield",
        optional: true,
        sourceZone: "hand",
        destinationZone: "battlefield",
        affectedObject: "land_card",
        layerLabel: "layer2_primitive",
      },
    ],
    structure: { minTriggeredAbilities: 1 },
    layerNotes: "'plays a land' in trigger header is Layer 1; put effect is put_onto_battlefield.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "hand_to_battlefield_put_not_search",
    name: "Elvish Reclaimer",
    category: "dev-v9 put-from-hand",
    text: "You may put a land card from your graveyard onto the battlefield.",
    primitives: [
      {
        actionType: "put_onto_battlefield",
        evidenceContains: "put a land card from your graveyard onto the battlefield",
        optional: true,
        sourceZone: "graveyard",
        destinationZone: "battlefield",
        affectedObject: "land_card",
        layerLabel: "layer2_primitive",
      },
    ],
    layerNotes: "Graveyard-origin put wording uses put_onto_battlefield.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "graveyard_to_battlefield_put",
    name: "Zombify",
    category: "dev-v9 put-from-graveyard",
    text: "Put target creature card from a graveyard onto the battlefield.",
    primitives: [
      {
        actionType: "put_onto_battlefield",
        evidenceContains: "from a graveyard onto the battlefield",
        sourceZone: "graveyard",
        destinationZone: "battlefield",
        affectedObject: "creature_card",
        layerLabel: "layer2_primitive",
      },
    ],
    layerNotes: "Put-from-graveyard wording — put_onto_battlefield not play/cast.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "graveyard_to_battlefield_put",
    name: "Reanimate",
    category: "dev-v9 put-from-graveyard",
    text: "Put target creature card from a graveyard onto the battlefield. You lose life equal to its mana value.",
    primitives: [
      {
        actionType: "return_to_battlefield",
        evidenceContains: "from a graveyard onto the battlefield",
        layerLabel: "layer2_primitive",
      },
      { actionType: "lose_life", evidenceContains: "lose life", layerLabel: "layer2_primitive" },
    ],
    layerNotes: "Classic reanimate target — return_to_battlefield retained for this template.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "search_library_then_put_onto_battlefield",
    name: "Harrow",
    category: "dev-v9 search-then-put",
    text: "As an additional cost to cast this spell, sacrifice a land.\nSearch your library for up to two basic land cards, put them onto the battlefield, then shuffle.",
    primitives: [
      { actionType: "sacrifice", evidenceContains: "sacrifice a land", layerLabel: "layer2_primitive" },
      { actionType: "search_library", evidenceContains: "Search your library", layerLabel: "layer2_primitive" },
    ],
    layerNotes: "Requires explicit search instruction for search_library primitive.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "search_library_then_put_onto_battlefield",
    name: "Kodama's Reach",
    category: "dev-v9 search-then-put",
    text: "Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.",
    primitives: [
      { actionType: "search_library", evidenceContains: "Search your library", layerLabel: "layer2_primitive" },
    ],
    layerNotes: "Library search with battlefield destination — search_library only at Layer 2.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "search_library_then_put_onto_battlefield",
    name: "Rampant Growth",
    category: "dev-v9 search-then-put",
    text: "Search your library for a basic land card, put that card onto the battlefield, then shuffle.",
    primitives: [
      { actionType: "search_library", evidenceContains: "Search your library", layerLabel: "layer2_primitive" },
    ],
    layerNotes: "Contrast with hand-origin put_onto_battlefield mislabels.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "explicit_play_land",
    name: "Exploration",
    category: "dev-v9 play-land",
    text: "You may play an additional land on each of your turns.",
    primitives: [
      {
        actionType: "play",
        evidenceContains: "play an additional land",
        optional: true,
        layerLabel: "layer2_primitive",
      },
    ],
    layerNotes: "Explicit play-a-land permission — play primitive, not put_onto_battlefield.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "explicit_cast_spell",
    name: "Omniscience",
    category: "dev-v9 cast-spell",
    text: "You may cast spells from your hand without paying their mana cost.",
    primitives: [
      {
        actionType: "cast",
        evidenceContains: "cast spells from your hand",
        optional: true,
        layerLabel: "layer2_primitive",
      },
    ],
    layerNotes: "Explicit cast-spells permission from hand.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "explicit_cast_spell",
    name: "Yawgmoth's Will",
    category: "dev-v9 cast-spell",
    text: "Until end of turn, you may play lands and cast spells from your graveyard.",
    primitives: [
      { actionType: "play", evidenceContains: "play lands", optional: true, layerLabel: "layer2_primitive" },
      {
        actionType: "cast",
        evidenceContains: "cast spells from your graveyard",
        optional: true,
        layerLabel: "layer2_primitive",
      },
    ],
    layerNotes: "Split play lands + cast spells permissions.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "play_lands_or_spells_permission",
    name: "Underworld Breach",
    category: "dev-v9 play-or-cast",
    text: "During each of your turns, you may play lands and cast spells from your graveyard.",
    primitives: [
      { actionType: "play", evidenceContains: "play lands", optional: true, layerLabel: "layer2_primitive" },
      {
        actionType: "cast",
        evidenceContains: "cast spells from your graveyard",
        optional: true,
        layerLabel: "layer2_primitive",
      },
    ],
    layerNotes: "Play lands OR cast spells both permitted.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "play_lands_or_spells_permission",
    name: "Crucible of Worlds",
    category: "dev-v9 play-or-cast",
    text: "You may play land cards from your graveyard.",
    primitives: [
      {
        actionType: "play",
        evidenceContains: "play land cards from your graveyard",
        optional: true,
        layerLabel: "layer2_primitive",
      },
    ],
    layerNotes: "Play lands only from graveyard — no cast permission.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "action_words_in_restrictions_or_costs",
    name: "Rule of Law",
    category: "dev-v9 restriction-cost",
    text: "Each player can't cast more than one spell each turn.",
    primitives: [],
    forbidden: ["cast"],
    layerNotes: "Layer 1 static restriction — cast word must not emit cast primitive.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "action_words_in_restrictions_or_costs",
    name: "Force of Will",
    category: "dev-v9 restriction-cost",
    text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell.",
    primitives: [{ actionType: "counter", evidenceContains: "Counter target spell", layerLabel: "layer2_primitive" }],
    layerNotes: "Alternative cost clause is not cast-from-zone primitive.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "action_words_in_restrictions_or_costs",
    name: "Chalice of the Void",
    category: "dev-v9 restriction-cost",
    text: "Spells with mana value equal to the number of charge counters on this artifact can't be cast.",
    primitives: [],
    forbidden: ["cast"],
    layerNotes: "Can't cast restriction — action word in prohibition only.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "static_cast_restriction_not_cast",
    name: "Ashiok, Dream Render",
    category: "dev-v9 static restriction",
    text: "Players can't cast spells from graveyards or libraries.",
    primitives: [],
    forbidden: ["cast"],
    layerNotes: "Negative contrast for can't-cast-from-zone static (not Grafdigger's Cage validation card).",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "alternative_cost_not_cast_primitive",
    name: "Pyrokinesis",
    category: "dev-v9 alt cost",
    text: "You may exile a red card from your hand rather than pay this spell's mana cost.\nPyrokinesis deals 4 damage divided as you choose among any number of targets.",
    primitives: [{ actionType: "deal_damage", evidenceContains: "deals 4 damage", layerLabel: "layer2_primitive" }],
    layerNotes: "Exile-from-hand alt cost + damage only.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "alternative_cost_not_cast_primitive",
    name: "Solitude",
    category: "dev-v9 alt cost",
    text: "You may exile a white card from your hand rather than pay this spell's mana cost.\nExile target creature or enchantment.",
    primitives: [{ actionType: "exile", evidenceContains: "Exile target creature or enchantment", layerLabel: "layer2_primitive" }],
    layerNotes: "Evoke-style alt cost — not cast permission.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "return_zone_disambiguation",
    name: "Regrowth",
    category: "dev-v9 return zones",
    text: "Return target card from your graveyard to your hand.",
    primitives: [
      {
        actionType: "return_to_hand",
        evidenceContains: "from your graveyard to your hand",
        layerLabel: "layer2_primitive",
      },
    ],
    layerNotes: "Graveyard→hand is return_to_hand.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "return_zone_disambiguation",
    name: "Unearth",
    category: "dev-v9 return zones",
    text: "{B}: Return target creature card with mana value 3 or less from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead.",
    primitives: [
      {
        actionType: "return_to_battlefield",
        evidenceContains: "from your graveyard to the battlefield",
        layerLabel: "layer2_primitive",
      },
    ],
    layerNotes: "Positive contrast for 'to the battlefield' wording (Storm the Festival family).",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "third_person_draw_discard_sacrifice",
    name: "Howling Mine",
    category: "dev-v9 third person",
    text: "At the beginning of each player's draw step, that player draws an additional card.",
    primitives: [{ actionType: "draw", evidenceContains: "draws an additional card", layerLabel: "layer2_primitive" }],
    structure: { minTriggeredAbilities: 1 },
    layerNotes: "Third-person draw — positive contrast for Windfall family.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "third_person_draw_discard_sacrifice",
    name: "Return to Nature",
    category: "dev-v9 third person",
    text: "Destroy target artifact, enchantment, or card in a graveyard. Its controller gains 3 life.",
    primitives: [
      { actionType: "destroy", evidenceContains: "Destroy target artifact", layerLabel: "layer2_primitive" },
      { actionType: "gain_life", evidenceContains: "gains 3 life", layerLabel: "layer2_primitive" },
    ],
    layerNotes: "Third-person 'gains N life' positive (Nature's Claim family, different card).",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "third_person_draw_discard_sacrifice",
    name: "Smallpox",
    category: "dev-v9 third person",
    text: "Each player loses 1 life, discards a card, sacrifices a creature, and sacrifices a land.",
    primitives: [
      { actionType: "lose_life", evidenceContains: "loses 1 life", layerLabel: "layer2_primitive" },
      { actionType: "discard", evidenceContains: "discards a card", layerLabel: "layer2_primitive" },
      { actionType: "sacrifice", evidenceContains: "sacrifices a creature", layerLabel: "layer2_primitive" },
      { actionType: "sacrifice", evidenceContains: "sacrifices a land", layerLabel: "layer2_primitive" },
    ],
    layerNotes: "Third-person compound clause.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "trigger_condition_action_words",
    name: "Soul Warden",
    category: "dev-v9 trigger condition",
    text: "Whenever another creature enters, you gain 1 life.",
    primitives: [{ actionType: "gain_life", evidenceContains: "gain 1 life", layerLabel: "layer2_primitive" }],
    structure: { minTriggeredAbilities: 1 },
    layerNotes: "'enters' in trigger header is Layer 1 — not a primitive.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "trigger_condition_action_words",
    name: "Harmonic Sliver",
    category: "dev-v9 trigger condition",
    text: "Whenever a player plays a spell, each other player may draw a card.",
    primitives: [
      { actionType: "draw", evidenceContains: "draw a card", optional: true, layerLabel: "layer2_primitive" },
    ],
    structure: { minTriggeredAbilities: 1 },
    layerNotes: "'plays a spell' in trigger condition; optional draw is effect.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "compound_then_clauses",
    name: "Faithless Looting",
    category: "dev-v9 compound",
    text: "Draw two cards, then discard two cards.",
    primitives: [
      { actionType: "draw", evidenceContains: "Draw two cards", layerLabel: "layer2_primitive" },
      { actionType: "discard", evidenceContains: "discard two cards", layerLabel: "layer2_primitive" },
    ],
    layerNotes: "Compound draw-then-discard.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "compound_then_clauses",
    name: "Read the Bones",
    category: "dev-v9 compound",
    text: "Scry 2, then draw two cards. You lose 2 life.",
    primitives: [
      { actionType: "scry", evidenceContains: "Scry 2", layerLabel: "layer2_primitive" },
      { actionType: "draw", evidenceContains: "draw two cards", layerLabel: "layer2_primitive" },
      { actionType: "lose_life", evidenceContains: "lose 2 life", layerLabel: "layer2_primitive" },
    ],
    layerNotes: "Scry-then-draw compound.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "cast_vs_play_permission",
    name: "Voldaren Epicure",
    category: "dev-v9 cast vs play",
    text: "When this creature enters, it deals 1 damage to any target. Create a Blood token.",
    primitives: [
      { actionType: "deal_damage", evidenceContains: "deals 1 damage", layerLabel: "layer2_primitive" },
      { actionType: "create_token", evidenceContains: "Create a Blood token", layerLabel: "layer2_primitive" },
    ],
    structure: { minTriggeredAbilities: 1 },
    layerNotes: "Enters trigger — not cast/play permission.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "replacement_effect_clauses",
    name: "Rest in Peace",
    category: "dev-v9 replacement",
    text: "If a card would be put into a graveyard from anywhere, exile it instead.",
    primitives: [{ actionType: "exile", evidenceContains: "exile it instead", layerLabel: "layer2_primitive" }],
    layerNotes: "Replacement exile effect.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "unsupported_wording_must_abstain",
    name: "Traumatize",
    category: "dev-v9 mill-nonstandard",
    text: "Target player mills half their library, rounded down.",
    primitives: [{ actionType: "mill", evidenceContains: "mills half", layerLabel: "layer2_primitive" }],
    layerNotes: "Non-numeric mill quantity — positive contrast for mill family.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
  {
    family: "unsupported_wording_must_abstain",
    name: "Trinket Mage",
    category: "dev-v9 abstain",
    text: "When this creature enters, you may search your library for an artifact card with mana value 1 or less, reveal it, put it into your hand, then shuffle.",
    primitives: [
      {
        actionType: "search_library",
        evidenceContains: "search your library",
        optional: true,
        layerLabel: "layer2_primitive",
      },
    ],
    structure: { minTriggeredAbilities: 1 },
    layerNotes: "Supported tutor — contrast with hand-put mislabels.",
    manualReviewConfirmed: true,
    reviewer: "catalog-audit-agent",
  },
];

export function buildDevV9ExpansionCases(startIndex: number): OracleActionEvalCaseV2[] {
  return DEV_EXPANSION_V9_SEEDS.map((seed, i) => {
    const id = `dev-v9-${String(startIndex + i).padStart(3, "0")}`;
    const primitives = seed.primitives.map((p) => ({
      actionType: p.actionType,
      evidenceContains: p.evidenceContains,
      cardFace: seed.face,
      optional: p.optional,
      optionalEffect: p.optional,
      sourceZone: p.sourceZone,
      destinationZone: p.destinationZone,
      affectedObject: p.affectedObject,
    }));
    return {
      id,
      category: seed.category,
      layout: seed.layout,
      oracleId: `dev-v9-oracle-${startIndex + i}`,
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
                ? p === "add_mana" || p === "play" || p === "put_onto_battlefield"
                : role === "removal"
                  ? ["destroy", "exile", "deal_damage", "counter", "mill"].includes(p)
                  : role === "card_advantage"
                    ? p === "draw"
                    : role === "recursion"
                      ? ["return_to_battlefield", "play", "cast", "put_onto_battlefield"].includes(p)
                      : false,
          ),
      })),
      forbiddenPrimitiveActions: seed.forbidden,
    };
  });
}

export function familyCounts(): Record<DevExpansionFamily, number> {
  const counts = {} as Record<DevExpansionFamily, number>;
  for (const seed of DEV_EXPANSION_V9_SEEDS) {
    counts[seed.family] = (counts[seed.family] ?? 0) + 1;
  }
  return counts;
}
