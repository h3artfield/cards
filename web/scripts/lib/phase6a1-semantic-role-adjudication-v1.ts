/**
 * Phase 6A.1 — Per-case semantic role adjudication (Gate C field-role cleanup).
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  collectScalarFields,
} from "./phase6a1-p11-residual-spec-audit-rules-v2";
import type { FieldRoleAdjudication, SpecFieldKey } from "./phase6a1-semantic-role-types-v1";

export const SEMANTIC_ROLE_ADJUDICATION_V1_VERSION = "phase6a1-semantic-role-adjudication-v1";

type Adj = FieldRoleAdjudication;

function adj(p: Adj): Adj {
  return p;
}

function removeAll(
  caseEntries: Array<{ field: SpecFieldKey; value: string; reason: string }>,
  defaults: Partial<Adj> = {},
): Adj[] {
  return caseEntries.map(({ field, value, reason }) =>
    adj({
      originalField: field,
      originalValue: value,
      mechanicalVerdict: "UNSUPPORTED",
      semanticRole: "CONTEXT_ONLY",
      disposition: "REMOVE",
      intentClass: "GENERIC_SUPPORT_CONTEXT",
      causalDefense: reason,
      oracleEvidence: reason,
      ...defaults,
    }),
  );
}

function moveOut(
  field: SpecFieldKey,
  value: string,
  effectiveField: SpecFieldKey,
  effectiveValue: string,
  role: Adj["semanticRole"],
  mech: Adj["mechanicalVerdict"],
  intent: Adj["intentClass"],
  defense: string,
  evidence: string,
): Adj {
  return adj({
    originalField: field,
    originalValue: value,
    mechanicalVerdict: mech,
    semanticRole: role,
    disposition: "MOVE_FIELD",
    effectiveField,
    effectiveValue,
    intentClass: intent,
    causalDefense: defense,
    oracleEvidence: evidence,
  });
}

function retain(
  field: SpecFieldKey,
  value: string,
  role: Adj["semanticRole"],
  mech: Adj["mechanicalVerdict"],
  intent: Adj["intentClass"],
  defense: string,
  evidence: string,
): Adj {
  return adj({
    originalField: field,
    originalValue: value,
    mechanicalVerdict: mech,
    semanticRole: role,
    disposition: "RETAIN",
    effectiveField: field,
    effectiveValue: value,
    intentClass: intent,
    causalDefense: defense,
    oracleEvidence: evidence,
  });
}

function downgrade(
  field: SpecFieldKey,
  value: string,
  effectiveValue: string,
  defense: string,
  evidence: string,
): Adj {
  return adj({
    originalField: field,
    originalValue: value,
    mechanicalVerdict: "DERIVED_CAUSAL_SUPPORT",
    semanticRole: "DECK_DESIRED_SUPPORT",
    disposition: "DOWNGRADE_TO_INDIRECT_SUPPORT",
    effectiveField: "desiredFunctions",
    effectiveValue,
    intentClass: "GENERIC_SUPPORT_CONTEXT",
    causalDefense: defense,
    oracleEvidence: evidence,
  });
}

const CASE_ADJUDICATIONS: Record<string, Adj[]> = {
  "single-tokens-krenko": [
    moveOut(
      "requiredFunctions",
      "token_generation",
      "outputsToExploit",
      "goblin_tokens",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "{T}: Create X 1/1 red Goblin creature tokens where X is Goblins you control.",
      "Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.",
    ),
    ...removeAll([{ field: "resourcesToProduce", value: "tokens", reason: "Consolidated into typed goblin_tokens output." }]),
    retain(
      "requiredInputs",
      "goblins_controlled",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Token count scales with goblins controlled.",
      "where X is the number of Goblins you control",
    ),
    downgrade(
      "requiredInputs",
      "untap",
      "untap_support",
      "Untap effects support Krenko's tap activation but Krenko does not untap permanents.",
      "Krenko uses {T} activation — external untap is derived support only.",
    ),
    moveOut(
      "outputsToExploit",
      "tokens",
      "outputsToExploit",
      "goblin_tokens",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Rename generic tokens output to typed goblin token output.",
      "Create X 1/1 red Goblin creature tokens",
    ),
  ],

  "multi-kenrith": [
    ...removeAll([
      { field: "requiredInputs", value: "damage_to_opponent_creatures", reason: "Not in Kenrith Oracle." },
      { field: "requiredFunctions", value: "counter_synergy", reason: "Generic counter_synergy is not a deck requirement for Kenrith." },
      { field: "requiredFunctions", value: "graveyard_setup", reason: "Kenrith reanimates by activated ability." },
    ]),
    moveOut(
      "requiredFunctions",
      "life_gain",
      "outputsToExploit",
      "life_gain",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "{W}: Target player gains 1 life — commander-provided output, not deck required function.",
      "Target player gains 1 life.",
    ),
    moveOut(
      "requiredFunctions",
      "card_draw",
      "outputsToExploit",
      "card_draw",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "{U}: Target player draws a card — commander provides card draw.",
      "Target player draws a card.",
    ),
    moveOut(
      "requiredFunctions",
      "combat_buff",
      "outputsToExploit",
      "combat_buff",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "{R}: All creatures gain trample and haste until end of turn.",
      "All creatures gain trample and haste until end of turn.",
    ),
    moveOut(
      "requiredFunctions",
      "counter_placement",
      "outputsToExploit",
      "counter_placement",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "{1}{G}: Put a +1/+1 counter on target creature.",
      "Put a +1/+1 counter on target creature.",
    ),
    moveOut(
      "requiredFunctions",
      "reanimation",
      "outputsToExploit",
      "reanimation",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "{4}{B}: Return target creature card from graveyard to battlefield.",
      "Return target creature card from your graveyard to the battlefield.",
    ),
    retain(
      "requiredInputs",
      "creature_card_in_graveyard",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Deck supplies creature cards in graveyard for Kenrith reanimation activation.",
      "Return target creature card from your graveyard",
    ),
    moveOut(
      "outputsToExploit",
      "card_draw",
      "outputsToExploit",
      "card_draw",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Consolidate commander draw output.",
      "Target player draws a card.",
    ),
  ],

  "multi-korvold": [
    ...removeAll([
      { field: "requiredFunctions", value: "counter_synergy", reason: "Generic counter_synergy not commander-derived." },
      { field: "outputsToExploit", value: "combat_payoff", reason: "No combat payoff engine in Korvold Oracle." },
      { field: "requiredInputs", value: "sacrifice_outlet", reason: "Sacrifice outlet belongs in deck enabler support, not typed input." },
    ]),
    retain(
      "requiredFunctions",
      "sacrifice_payoff",
      "PAYOFF",
      "DERIVED_CAUSAL_SUPPORT",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Deck supplies sacrifice payoffs triggered by Korvold sacrifice events.",
      "Whenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.",
    ),
    downgrade(
      "requiredFunctions",
      "sacrifice_outlet",
      "sacrifice_outlet",
      "Additional sacrifice outlets are derived deck support, not commander oracle input.",
      "Whenever you sacrifice a permanent",
    ),
    retain(
      "requiredInputs",
      "permanent_sacrificed",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Sacrifice event is the typed engine input.",
      "Whenever you sacrifice a permanent",
    ),
    retain(
      "outputsToExploit",
      "card_draw",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Korvold draws on each sacrifice — commander-provided output.",
      "draw a card",
    ),
    moveOut(
      "resourcesToConsume",
      "sacrifice_fodder",
      "resourcesToConsume",
      "sacrifice_fodder",
      "RESOURCE_TO_CONSUME",
      "DERIVED_CAUSAL_SUPPORT",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Deck must supply permanents to sacrifice.",
      "Whenever you sacrifice a permanent",
    ),
  ],

  "hybrid-prosper": [
    ...removeAll([
      { field: "requiredFunctions", value: "ramp", reason: "Not commander-derived." },
      { field: "requiredFunctions", value: "token_generation", reason: "Treasure is typed output, not generic token generation requirement." },
      { field: "requiredInputs", value: "artifacts", reason: "Replace with typed exile/play chain." },
      { field: "requiredInputs", value: "exiled_cards", reason: "Replace with typed play-from-exile input." },
      { field: "requiredFunctions", value: "cast_from_exile", reason: "Rename to play_card_from_exile — Prosper triggers on lands too." },
      { field: "outputsToExploit", value: "tokens", reason: "Replace with typed treasure_tokens output." },
      { field: "outputsToExploit", value: "free_cast", reason: "Play permission is not free cast." },
    ]),
    retain(
      "requiredFunctions",
      "play_card_from_exile",
      "DECK_REQUIRED_ENABLER",
      "DERIVED_CAUSAL_SUPPORT",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Deck needs additional ways to play cards from exile beyond single end-step impulse.",
      "Whenever you play a land or cast a spell from exile",
    ),
    retain(
      "requiredInputs",
      "spell_cast_from_exile",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Treasure trigger fires when playing from exile.",
      "Whenever you play a land or cast a spell from exile or a land you don't own",
    ),
    adj({
      originalField: "requiredFunctions",
      originalValue: "play_card_from_exile",
      mechanicalVerdict: "DERIVED_CAUSAL_SUPPORT",
      semanticRole: "DECK_REQUIRED_ENABLER",
      disposition: "RETAIN",
      effectiveField: "requiredFunctions",
      effectiveValue: "play_card_from_exile",
      intentClass: "CANDIDATE_GENERATING_REQUIREMENT",
      causalDefense: "Deck needs additional ways to play cards from exile — includes lands, not just casts.",
      oracleEvidence: "Whenever you play a land or cast a spell from exile",
    }),
    retain(
      "outputsToExploit",
      "treasure_tokens",
      "OUTPUT_TO_EXPLOIT",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Create a Treasure token when playing from exile.",
      "Create a Treasure token.",
    ),
  ],

  "partner-thrasios-tymna": [
    moveOut(
      "outputsToExploit",
      "card_draw",
      "outputsToExploit",
      "partner_card_draw",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Thrasios draw branch and Tymna combat-draw are commander-provided outputs.",
      "Draw a card / draw cards equal to damage dealt",
    ),
    retain(
      "requiredInputs",
      "thrasios_mana_activation",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "{4}: Scry 1, reveal top — land or draw.",
      "Pay {4}",
    ),
    retain(
      "requiredInputs",
      "combat_damage_to_opponents",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Tymna draw scales with combat damage dealt to opponents.",
      "dealt combat damage to player this turn",
    ),
    retain(
      "requiredFunctions",
      "ramp",
      "DECK_REQUIRED_ENABLER",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Thrasios puts land onto battlefield.",
      "Put it onto the battlefield",
    ),
    moveOut(
      "requiredFunctions",
      "card_draw",
      "outputsToExploit",
      "partner_card_draw",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Commander provides draw — not deck-required function.",
      "Draw a card",
    ),
  ],

  "yuriko-ninja": [
    ...removeAll([
      { field: "outputsToExploit", value: "card_draw", reason: "Yuriko reveals to hand — not generic card_draw output." },
      { field: "outputsToExploit", value: "combat_payoff", reason: "Replace with typed ninjutsu chain outputs." },
    ]),
    retain(
      "requiredFunctions",
      "combat_payoff",
      "PAYOFF",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Ninja combat damage triggers reveal/hand/life loss chain.",
      "Whenever a Ninja you control deals combat damage to a player",
    ),
    retain(
      "requiredInputs",
      "ninjutsu_combat_damage",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Unblocked attacker / ninjutsu damage triggers top reveal.",
      "deals combat damage to a player",
    ),
    retain(
      "outputsToExploit",
      "top_of_library",
      "OUTPUT_TO_EXPLOIT",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Reveal top of library on ninja damage.",
      "Reveal the top card of your library",
    ),
  ],

  "single-aristocrats-teysa": [
    ...removeAll([
      { field: "requiredFunctions", value: "blink_flicker", reason: "Not commander-derived." },
    ]),
    retain(
      "requiredFunctions",
      "sacrifice_payoff",
      "PAYOFF",
      "DERIVED_CAUSAL_SUPPORT",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Deck needs death-trigger payoffs Teysa doubles.",
      "If a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.",
    ),
    retain(
      "requiredFunctions",
      "sacrifice_outlet",
      "DECK_REQUIRED_ENABLER",
      "DERIVED_CAUSAL_SUPPORT",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Deck needs sacrifice outlets to cause death-trigger events.",
      "creature dying causes a triggered ability",
    ),
    retain(
      "requiredInputs",
      "creature_dies_triggers_controller_ability",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Typed death-trigger engine input.",
      "If a creature dying causes a triggered ability of a permanent you control to trigger",
    ),
    moveOut(
      "requiredFunctions",
      "death_trigger_multiplication",
      "outputsToExploit",
      "death_trigger_multiplication",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Teysa doubles death-caused triggers — commander-provided output.",
      "that ability triggers an additional time",
    ),
  ],

  "single-mill-bruvac": [
    retain(
      "requiredFunctions",
      "mill",
      "DECK_REQUIRED_ENABLER",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Deck supplies mill spells — Bruvac doubles opponent mill.",
      "If a player would mill one or more cards, they mill twice that many cards instead.",
    ),
    retain(
      "requiredFunctions",
      "opponent_mill_amplification",
      "DECK_REQUIRED_ENABLER",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Typed mill amplification requirement.",
      "mill twice that many cards instead",
    ),
    downgrade(
      "desiredFunctions",
      "mill",
      "mill",
      "Redundant contextual reinforcement of canonical mill requirement.",
      "mill twice that many",
    ),
    adj({
      originalField: "relevantZones",
      originalValue: "graveyard",
      mechanicalVerdict: "DERIVED_CAUSAL_SUPPORT",
      semanticRole: "CONTEXT_ONLY",
      disposition: "MOVE_TO_CONTEXT_ONLY",
      effectiveField: "relevantZones",
      effectiveValue: "graveyard",
      intentClass: "STATE_OR_ZONE_CONTEXT",
      causalDefense: "Graveyard zone context for mill strategy — not independent candidate requirement.",
      oracleEvidence: "Milled cards go to graveyard.",
    }),
  ],

  "single-graveyard-meren": [
    moveOut(
      "requiredFunctions",
      "recursion",
      "outputsToExploit",
      "commander_recursion",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Meren returns creature from graveyard at end step — commander-provided recursion.",
      "Return target creature card from your graveyard to the battlefield",
    ),
    retain(
      "requiredFunctions",
      "reanimation",
      "DECK_REQUIRED_ENABLER",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Return creature from graveyard to battlefield.",
      "Return target creature card from your graveyard to the battlefield",
    ),
    retain(
      "requiredInputs",
      "creature_dies_controller_controls",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Experience counters when controller's creatures die.",
      "Whenever a creature you control dies",
    ),
    retain(
      "outputsToExploit",
      "death_triggers",
      "OUTPUT_TO_EXPLOIT",
      "DERIVED_CAUSAL_SUPPORT",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Death-trigger density supports Meren experience engine.",
      "Whenever a creature you control dies",
    ),
    downgrade(
      "desiredFunctions",
      "mill",
      "mill",
      "Generic mill is deck support context, not separate acceptance requirement.",
      "graveyard",
    ),
    adj({
      originalField: "relevantZones",
      originalValue: "graveyard",
      mechanicalVerdict: "DERIVED_CAUSAL_SUPPORT",
      semanticRole: "CONTEXT_ONLY",
      disposition: "MOVE_TO_CONTEXT_ONLY",
      effectiveField: "relevantZones",
      effectiveValue: "graveyard",
      intentClass: "STATE_OR_ZONE_CONTEXT",
      causalDefense: "Graveyard zone context — not independent candidate-generating requirement.",
      oracleEvidence: "Return target creature card from your graveyard",
    }),
  ],

  "stax-augustin": [
    moveOut(
      "requiredFunctions",
      "spell_cost_reduction",
      "outputsToExploit",
      "controller_spell_cost_reduction",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Augustin reduces your white/blue spell costs — commander-provided.",
      "White spells you cast cost {1} less to cast. Blue spells you cast cost {1} less to cast.",
    ),
    moveOut(
      "requiredFunctions",
      "opponent_spell_tax",
      "outputsToExploit",
      "opponent_spell_tax",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Opponents' spells cost more — commander-provided stax output.",
      "Spells your opponents cast cost {1} more to cast.",
    ),
    ...removeAll([{ field: "requiredFunctions", value: "countermagic", reason: "Augustin does not counter spells." }]),
  ],

  "hybrid-kinnan": [
    moveOut(
      "requiredFunctions",
      "mana_doubling",
      "outputsToExploit",
      "mana_doubling",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Kinnan doubles mana from tapped nonland permanents.",
      "Add one mana of any type that permanent produced.",
    ),
    moveOut(
      "requiredFunctions",
      "creature_from_library_top",
      "outputsToExploit",
      "commander_library_creature",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Kinnan {5}{G}{U} top-five creature deployment is commander activated — not deck CORE intent.",
      "Look at the top five cards of your library. Put a creature card from among them onto the battlefield",
    ),
    retain(
      "requiredInputs",
      "nonland_permanent_tapped_for_mana",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Tap nonland permanent for mana triggers doubling.",
      "Whenever you tap a nonland permanent for mana",
    ),
    downgrade(
      "requiredInputs",
      "untap",
      "untap_support",
      "Untap is indirect support — Kinnan does not untap permanents.",
      "Whenever you tap a nonland permanent for mana",
    ),
  ],

  "blindv5-01-partner-pair": [
    ...removeAll([{ field: "requiredFunctions", value: "counter_synergy", reason: "Replace with typed Leonardo/Reyhan counter engines." }]),
    retain(
      "requiredInputs",
      "token_enters",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Leonardo: whenever a token enters.",
      "Whenever a token you control enters",
    ),
    retain(
      "requiredInputs",
      "creature_dies_or_command_zone_with_counters",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Reyhan: creature dies or put into command zone with counters.",
      "Whenever a creature you control dies or is put into the command zone",
    ),
  ],

  "blindv5-11-commander-background": [
    ...removeAll([
      { field: "requiredFunctions", value: "counter_synergy", reason: "Replace with typed Erinis/Clan Crafter engines." },
      { field: "requiredInputs", value: "sacrifice_outlet", reason: "Artifact sacrifice is typed input, not generic outlet." },
      { field: "requiredInputs", value: "artifacts", reason: "Replace with artifact_sacrifice typed input." },
    ]),
    retain(
      "requiredInputs",
      "erinis_attacks",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Erinis attack triggers land recursion.",
      "Whenever Erinis attacks",
    ),
    retain(
      "requiredInputs",
      "artifact_sacrifice",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Clan Crafter: sacrifice artifact for counters/draw.",
      "Sacrifice an artifact",
    ),
    moveOut(
      "requiredFunctions",
      "card_draw",
      "outputsToExploit",
      "card_draw",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Clan Crafter draw is commander-provided on sacrifice.",
      "Draw a card",
    ),
    moveOut(
      "outputsToExploit",
      "card_draw",
      "outputsToExploit",
      "card_draw",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Consolidate commander draw output.",
      "Draw a card",
    ),
  ],

  "blindv5-19-narrow-single-engine": [
    ...removeAll([
      { field: "requiredFunctions", value: "counter_synergy", reason: "Replace with typed Dionus tap engine." },
      { field: "requiredInputs", value: "tapped_creatures", reason: "Rename to creature_tapped_during_your_turn." },
      { field: "outputsToExploit", value: "combat_payoff", reason: "Dionus provides counters/un tap, not generic combat payoff." },
    ]),
    retain(
      "requiredInputs",
      "creature_tapped_during_your_turn",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Whenever this creature becomes tapped during your turn.",
      "Whenever this creature becomes tapped during your turn",
    ),
  ],

  "blindv5-22-broad-composite": [
    ...removeAll([
      { field: "outputsToExploit", value: "card_draw", reason: "Curie draw is combat-damage triggered — typed separately." },
      { field: "outputsToExploit", value: "combat_payoff", reason: "Use typed combat_payoff requiredFunction instead." },
      { field: "requiredFunctions", value: "token_generation", reason: "Curie becomes a copy — does not create tokens." },
    ]),
    retain(
      "requiredFunctions",
      "combat_payoff",
      "PAYOFF",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Combat damage to player draws equal to power.",
      "Whenever Curie deals combat damage to a player, draw cards equal to her power.",
    ),
    retain(
      "requiredInputs",
      "exiled_nontoken_artifact_creature",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Deck supplies nontoken artifact creatures worth exiling and copying.",
      "Exile target nontoken artifact or creature. Curie becomes a copy",
    ),
    retain(
      "requiredInputs",
      "combat_damage_to_player",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Combat damage to player triggers draw.",
      "Whenever Curie deals combat damage to a player",
    ),
  ],

  "blindv5-26-activated-engine": [
    retain(
      "requiredInputs",
      "artifact_or_clue_sacrifice",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Activated sacrifice of artifacts/clues.",
      "Sacrifice an artifact or a Clue",
    ),
  ],

  "blindv5-29-static-restriction": [
    ...removeAll([{ field: "requiredFunctions", value: "graveyard_setup", reason: "Replace with graveyard_to_library_top typed function." }]),
    moveOut(
      "requiredFunctions",
      "graveyard_to_library_top",
      "outputsToExploit",
      "commander_graveyard_to_library_top",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Hua Tuo {T} puts creature from graveyard on top of library — commander ability.",
      "Put target creature card from your graveyard on top of your library",
    ),
    retain(
      "requiredInputs",
      "creature_card_in_graveyard",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Activated ability targets creature card in graveyard.",
      "target creature card from your graveyard",
    ),
    downgrade(
      "desiredFunctions",
      "mill",
      "mill",
      "Generic mill is contextual support for Hua Tuo strategy.",
      "graveyard",
    ),
    adj({
      originalField: "relevantZones",
      originalValue: "graveyard",
      mechanicalVerdict: "DERIVED_CAUSAL_SUPPORT",
      semanticRole: "CONTEXT_ONLY",
      disposition: "MOVE_TO_CONTEXT_ONLY",
      effectiveField: "relevantZones",
      effectiveValue: "graveyard",
      intentClass: "STATE_OR_ZONE_CONTEXT",
      causalDefense: "Graveyard zone context only.",
      oracleEvidence: "creature card from your graveyard",
    }),
  ],

  "blindv5-45-graveyard": [
    ...removeAll([
      { field: "requiredFunctions", value: "graveyard_setup", reason: "Mishra grants unearth — not generic graveyard setup." },
      { field: "requiredFunctions", value: "recursion", reason: "Unearth is typed — not generic recursion requirement." },
      { field: "requiredInputs", value: "graveyard_permanents", reason: "Replace with artifact_card_in_graveyard." },
      { field: "outputsToExploit", value: "recursion", reason: "Unearth output is commander-provided." },
    ]),
    retain(
      "requiredFunctions",
      "unearth",
      "DECK_REQUIRED_ENABLER",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Each artifact in graveyard has unearth.",
      "Unearth {2}",
    ),
    retain(
      "requiredInputs",
      "artifact_card_in_graveyard",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Unearth targets artifact cards in graveyard.",
      "Each artifact card in your graveyard has unearth",
    ),
  ],

  "blindv5-47-artifacts": [
    ...removeAll([
      { field: "requiredFunctions", value: "combat_payoff", reason: "Kain combat chain is typed separately." },
      { field: "requiredFunctions", value: "card_draw", reason: "Draw is commander output on combat damage." },
      { field: "outputsToExploit", value: "tokens", reason: "Replace with treasure_tokens." },
      { field: "outputsToExploit", value: "card_draw", reason: "Commander-provided on combat damage." },
      { field: "outputsToExploit", value: "combat_payoff", reason: "Not generic combat payoff." },
    ]),
    retain(
      "requiredInputs",
      "combat_damage_to_player",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Combat damage triggers draw/treasure/life loss chain.",
      "Whenever Kain deals combat damage to a player",
    ),
    moveOut(
      "requiredFunctions",
      "card_draw",
      "outputsToExploit",
      "card_draw",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "You draw a card when Kain deals combat damage.",
      "You draw a card",
    ),
  ],

  "blindv5-50-enchantments": [
    ...removeAll([{ field: "outputsToExploit", value: "tokens", reason: "Saga copies are typed enchantment tokens, not generic tokens." }]),
    retain(
      "requiredFunctions",
      "enchantment_recursion",
      "DECK_REQUIRED_ENABLER",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Recover enchantments from mill.",
      "Mill five cards. You may put an enchantment card milled this way into your hand",
    ),
    retain(
      "requiredFunctions",
      "saga_token_copy",
      "DECK_REQUIRED_ENABLER",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Esper Terra creates enchantment/Saga token copies.",
      "Create a token that's a copy of enchantment or Saga",
    ),
    retain(
      "requiredInputs",
      "enchantment_in_graveyard_or_milled",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Mill five, put enchantment from milled into hand.",
      "put an enchantment card milled this way into your hand",
    ),
  ],

  "blindv5-59-tutor-toolbox": [
    ...removeAll([
      { field: "requiredFunctions", value: "token_generation", reason: "Earth King creates Bear token on ETB — typed output." },
      { field: "outputsToExploit", value: "tokens", reason: "Replace with bear_token output." },
      { field: "resourcesToProduce", value: "tokens", reason: "Consolidated into bear_token commander output." },
    ]),
    moveOut(
      "requiredFunctions",
      "land_ramp",
      "outputsToExploit",
      "commander_land_ramp",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Earth King searches basic lands when power 4+ creature attacks — commander output, not deck CORE intent.",
      "Search your library for up to two basic land cards",
    ),
    retain(
      "requiredInputs",
      "power4_creature_attack",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "Creatures with power 4 or greater attack.",
      "Whenever a creature you control with power 4 or greater attacks",
    ),
    retain(
      "requiredInputs",
      "commander_etb",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_MATCH_CONSTRAINT",
      "When The Earth King enters — typed ETB.",
      "When The Earth King enters the battlefield",
    ),
    moveOut(
      "requiredFunctions",
      "token_generation",
      "outputsToExploit",
      "bear_token",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Create 2/2 green Bear creature token on ETB.",
      "Create a 2/2 green Bear creature token",
    ),
  ],

  "blindv5-51-tokens": [
    moveOut(
      "requiredFunctions",
      "token_generation",
      "outputsToExploit",
      "commander_token_copy",
      "COMMANDER_PROVIDES",
      "DIRECT_ORACLE_MECHANIC",
      "OUTPUT_OR_PAYOFF_CONTEXT",
      "Orvar creates token copy when inst/sorc targets own permanent — commander output, not deck CORE intent.",
      "create a token that's a copy of one of those permanents",
    ),
    retain(
      "requiredInputs",
      "controller_instant_or_sorcery_targets_own_permanent",
      "DECK_REQUIRED_INPUT",
      "DIRECT_ORACLE_MECHANIC",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Deck supplies cheap instants/sorceries targeting own permanent to trigger Orvar copy.",
      "Whenever you cast an instant or sorcery spell, if it targets one or more other permanents you control",
    ),
    moveOut(
      "desiredFunctions",
      "targeted_cantrip",
      "requiredFunctions",
      "targeted_cantrip",
      "DECK_REQUIRED_ENABLER",
      "DERIVED_CAUSAL_SUPPORT",
      "CANDIDATE_GENERATING_REQUIREMENT",
      "Cheap targeted cantrips are direct ENGINE_ENABLER for Orvar — not generic support.",
      "cast an instant or sorcery spell, if it targets one or more other permanents you control",
    ),
  ],
};

/** Adjudications keyed by originalField:originalValue for lookup. */
export function getSemanticRoleAdjudications(caseId: string): Adj[] {
  return CASE_ADJUDICATIONS[caseId] ?? [];
}

function defaultRoleForField(field: SpecFieldKey): { role: Adj["semanticRole"]; intent: Adj["intentClass"]; mech: Adj["mechanicalVerdict"] } {
  switch (field) {
    case "requiredFunctions":
      return { role: "DECK_REQUIRED_ENABLER", intent: "CANDIDATE_GENERATING_REQUIREMENT", mech: "DIRECT_ORACLE_MECHANIC" };
    case "requiredInputs":
      return { role: "DECK_REQUIRED_INPUT", intent: "CANDIDATE_MATCH_CONSTRAINT", mech: "DIRECT_ORACLE_MECHANIC" };
    case "outputsToExploit":
      return { role: "OUTPUT_TO_EXPLOIT", intent: "OUTPUT_OR_PAYOFF_CONTEXT", mech: "DIRECT_ORACLE_MECHANIC" };
    case "resourcesToProduce":
      return { role: "RESOURCE_TO_PRODUCE", intent: "OUTPUT_OR_PAYOFF_CONTEXT", mech: "DERIVED_CAUSAL_SUPPORT" };
    case "resourcesToConsume":
      return { role: "RESOURCE_TO_CONSUME", intent: "CANDIDATE_MATCH_CONSTRAINT", mech: "DERIVED_CAUSAL_SUPPORT" };
    case "statesToMaintain":
    case "statesToIncrease":
      return { role: "STATE_TO_MAINTAIN", intent: "STATE_OR_ZONE_CONTEXT", mech: "DERIVED_CAUSAL_SUPPORT" };
    case "relevantZones":
    case "relevantCardTypes":
    case "structuralNeeds":
    case "protectionNeeds":
    case "redundancyNeeds":
    case "constructionConstraints":
      return { role: "CONTEXT_ONLY", intent: "STATE_OR_ZONE_CONTEXT", mech: "DERIVED_CAUSAL_SUPPORT" };
    default:
      return { role: "CONTEXT_ONLY", intent: "GENERIC_SUPPORT_CONTEXT", mech: "DERIVED_CAUSAL_SUPPORT" };
  }
}

export function buildDefaultRetainAdjudications(
  caseId: string,
  spec: RetrievalSpecification,
  oracleBlob: string,
): Adj[] {
  const explicit = getSemanticRoleAdjudications(caseId);
  const explicitKeys = new Set(explicit.map((a) => `${a.originalField}:${a.originalValue}`));
  const defaults: Adj[] = [];

  for (const { field, value } of collectScalarFields(spec)) {
    const key = `${field}:${value}`;
    if (explicitKeys.has(key)) continue;
    if (field === "desiredFunctions") {
      defaults.push(
        downgrade(field, value, value, "Generic desired support retained as indirect context.", oracleBlob.slice(0, 80)),
      );
      continue;
    }
    const placement = defaultRoleForField(field);
    defaults.push(
      retain(
        field,
        value,
        placement.role,
        placement.mech,
        placement.intent,
        `Retained post-overlay field ${key} with default semantic role placement.`,
        oracleBlob.slice(0, 80),
      ),
    );
  }
  return defaults;
}

export function getAllAdjudicationsForCase(
  caseId: string,
  spec: RetrievalSpecification,
  oracleBlob: string,
): Adj[] {
  const explicit = getSemanticRoleAdjudications(caseId);
  const defaults = buildDefaultRetainAdjudications(caseId, spec, oracleBlob);
  const explicitKeys = new Set(explicit.map((a) => `${a.originalField}:${a.originalValue}`));
  return [...explicit, ...defaults.filter((d) => !explicitKeys.has(`${d.originalField}:${d.originalValue}`))];
}
