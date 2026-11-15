/**
 * Phase 6A.1 — Per-case CandidateIntent adjudication (28-case product population).
 * Deck-side causal intents are independent of RetrievalSpecification field names.
 */
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type {
  CandidateIntent,
  CaseCandidateIntentProfile,
  CausalRole,
  IntentPriority,
  NoCoreCandidateIntentDeclaration,
} from "./phase6a1-candidate-intent-types-v1";

export const CANDIDATE_INTENT_ADJUDICATION_V1_VERSION = "phase6a1-candidate-intent-adjudication-v1";

type IntentDraft = Omit<CandidateIntent, "caseId" | "intentId"> & { intentId: string };

function intent(caseId: string, draft: IntentDraft): CandidateIntent {
  return { ...draft, caseId };
}

function core(
  caseId: string,
  id: string,
  p: Omit<IntentDraft, "intentId" | "priority">,
): CandidateIntent {
  return intent(caseId, { ...p, intentId: id, priority: "CORE" });
}

function secondary(
  caseId: string,
  id: string,
  p: Omit<IntentDraft, "intentId" | "priority">,
): CandidateIntent {
  return intent(caseId, { ...p, intentId: id, priority: "SECONDARY" });
}

function noCore(caseId: string, justification: string): NoCoreCandidateIntentDeclaration {
  return { caseId, declaration: "NO_CORE_CANDIDATE_INTENT", causalJustification: justification };
}

const PROFILES: CaseCandidateIntentProfile[] = [
  {
    caseId: "single-graveyard-meren",
    commanderMechanismSummary:
      "Meren returns creature from graveyard at end step when experience threshold met; experience from your creatures dying.",
    coreIntents: [
      core("single-graveyard-meren", "deck-graveyard-population", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Populate graveyard via creature deaths and self-mill",
        commanderMechanismSupported: "Experience counters when creatures you control die; recursion needs targets in graveyard",
        oracleEvidence: "Whenever a creature you control dies, put a +1/+1 counter on Meren",
        causalDefense:
          "Deck must supply creatures that die and fill the graveyard — Meren does not mill or sacrifice by herself.",
        sourceSemanticFields: ["requiredInputs:creature_dies_controller_controls", "desiredFunctions:mill"],
        matchConstraints: ["requiredInputs:creature_dies_controller_controls"],
        retrievalBucket: "STATE_BUILDERS",
        linkedSpecField: "requiredFunctions:graveyard_setup",
        retrievalToken: "graveyard_setup",
      }),
      core("single-graveyard-meren", "deck-reanimation-redundancy", {
        causalRole: "REDUNDANCY",
        targetMechanic: "Additional creature reanimation beyond Meren",
        commanderMechanismSupported: "Meren is one recursion engine; deck adds parallel reanimation lines",
        oracleEvidence: "Return target creature card from your graveyard to the battlefield",
        causalDefense: "Redundant reanimation increases reliability — distinct from Meren's commander recursion.",
        sourceSemanticFields: ["requiredFunctions:reanimation"],
        matchConstraints: ["requiredInputs:creature_dies_controller_controls"],
        retrievalBucket: "RECURSION",
        linkedSpecField: "requiredFunctions:reanimation",
        retrievalToken: "reanimation",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "single-tokens-krenko",
    commanderMechanismSummary: "Krenko creates Goblin tokens equal to Goblins you control when tapped.",
    coreIntents: [
      core("single-tokens-krenko", "deck-untap-support", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Untap Krenko or other mana/untap support for repeated activations",
        commanderMechanismSupported: "Krenko uses {T} activation — external untap multiplies token output",
        oracleEvidence: "{T}: Create X 1/1 red Goblin creature tokens where X is Goblins you control",
        causalDefense: "Untap is deck-side causal support; Krenko does not untap permanents.",
        sourceSemanticFields: ["desiredFunctions:untap_support"],
        matchConstraints: ["requiredInputs:goblins_controlled"],
        retrievalBucket: "ENABLERS",
        linkedSpecField: "desiredFunctions:untap_support",
        retrievalToken: "untap_support",
      }),
      core("single-tokens-krenko", "deck-goblin-density", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Additional Goblins to scale token count",
        commanderMechanismSupported: "Token count scales with Goblins controlled",
        oracleEvidence: "where X is the number of Goblins you control",
        causalDefense: "Deck supplies baseline Goblin density — token generation is commander output, not deck intent.",
        sourceSemanticFields: ["requiredInputs:goblins_controlled", "outputsToExploit:goblin_tokens"],
        matchConstraints: ["requiredInputs:goblins_controlled"],
        retrievalBucket: "ENGINE_PIECES",
        linkedSpecField: "requiredFunctions:token_generation",
        retrievalToken: "token_generation",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "single-aristocrats-teysa",
    commanderMechanismSummary: "Teysa doubles death-triggered abilities of permanents you control.",
    coreIntents: [
      core("single-aristocrats-teysa", "deck-sacrifice-outlets", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Sacrifice outlets to cause creature deaths",
        commanderMechanismSupported: "Death-trigger events feed Teysa doubling",
        oracleEvidence: "If a creature dying causes a triggered ability of a permanent you control to trigger",
        causalDefense: "Deck must cause deaths — Teysa does not sacrifice creatures herself.",
        sourceSemanticFields: ["requiredFunctions:sacrifice_outlet"],
        matchConstraints: ["requiredInputs:creature_dies_triggers_controller_ability"],
        retrievalBucket: "RESOURCE_CONSUMERS",
        linkedSpecField: "requiredFunctions:sacrifice_outlet",
        retrievalToken: "sacrifice_outlet",
      }),
      core("single-aristocrats-teysa", "deck-sacrifice-payoffs", {
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        targetMechanic: "Death-trigger payoffs doubled by Teysa",
        commanderMechanismSupported: "Doubled death-trigger resolution",
        oracleEvidence: "that ability triggers an additional time",
        causalDefense: "Payoff cards exploit doubled death triggers — commander provides multiplication, deck provides payoffs.",
        sourceSemanticFields: ["requiredFunctions:sacrifice_payoff"],
        matchConstraints: ["requiredInputs:creature_dies_triggers_controller_ability"],
        retrievalBucket: "PAYOFFS",
        linkedSpecField: "requiredFunctions:sacrifice_payoff",
        retrievalToken: "sacrifice_payoff",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "single-mill-bruvac",
    commanderMechanismSummary: "Bruvac doubles opponent mill.",
    coreIntents: [
      core("single-mill-bruvac", "deck-mill-spells", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Mill spells and effects targeting opponents",
        commanderMechanismSupported: "Opponent mill is doubled",
        oracleEvidence: "If a player would mill one or more cards, they mill twice that many cards instead",
        causalDefense: "Deck supplies mill actions — Bruvac only amplifies opponent mill.",
        sourceSemanticFields: ["requiredFunctions:mill"],
        matchConstraints: [],
        retrievalBucket: "STRUCTURAL_SUPPORT",
        linkedSpecField: "requiredFunctions:mill",
        retrievalToken: "mill",
      }),
      core("single-mill-bruvac", "deck-mill-amplification", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Additional opponent-mill amplification beyond Bruvac",
        commanderMechanismSupported: "Stacked mill doubling",
        oracleEvidence: "mill twice that many cards instead",
        causalDefense: "Typed mill amplification requirement for build coherence.",
        sourceSemanticFields: ["requiredFunctions:opponent_mill_amplification"],
        matchConstraints: [],
        retrievalBucket: "STRUCTURAL_SUPPORT",
        linkedSpecField: "requiredFunctions:opponent_mill_amplification",
        retrievalToken: "opponent_mill_amplification",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "multi-korvold",
    commanderMechanismSummary: "Korvold draws and grows when you sacrifice a permanent.",
    coreIntents: [
      core("multi-korvold", "deck-sacrifice-outlets", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Sacrifice outlets to trigger Korvold",
        commanderMechanismSupported: "Sacrifice events trigger draw/counters",
        oracleEvidence: "Whenever you sacrifice a permanent",
        causalDefense: "Deck must enable sacrifice events — Korvold is payoff, not outlet.",
        sourceSemanticFields: ["requiredFunctions:sacrifice_outlet", "resourcesToConsume:sacrifice_fodder"],
        matchConstraints: ["requiredInputs:permanent_sacrificed", "resourcesToConsume:sacrifice_fodder"],
        retrievalBucket: "RESOURCE_CONSUMERS",
        linkedSpecField: "requiredFunctions:sacrifice_outlet",
        retrievalToken: "sacrifice_outlet",
      }),
      core("multi-korvold", "deck-sacrifice-payoffs", {
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        targetMechanic: "Sacrifice payoffs beyond Korvold's draw",
        commanderMechanismSupported: "Sacrifice chain value",
        oracleEvidence: "Whenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card",
        causalDefense: "Deck payoffs exploit sacrifice events Korvold also rewards.",
        sourceSemanticFields: ["requiredFunctions:sacrifice_payoff"],
        matchConstraints: ["requiredInputs:permanent_sacrificed"],
        retrievalBucket: "PAYOFFS",
        linkedSpecField: "requiredFunctions:sacrifice_payoff",
        retrievalToken: "sacrifice_payoff",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "multi-kenrith",
    commanderMechanismSummary: "Kenrith provides five activated branches (life, draw, haste/trample, counters, reanimation).",
    coreIntents: [],
    secondaryIntents: [
      secondary("multi-kenrith", "deck-graveyard-for-reanimation", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Creature cards in graveyard for Kenrith reanimation branch",
        commanderMechanismSupported: "{4}{B} reanimation activation",
        oracleEvidence: "Return target creature card from your graveyard to the battlefield",
        causalDefense: "Secondary support — no single deck mechanic dominates Kenrith toolbox.",
        sourceSemanticFields: ["requiredInputs:creature_card_in_graveyard"],
        matchConstraints: ["requiredInputs:creature_card_in_graveyard"],
        retrievalBucket: "RECURSION",
        linkedSpecField: "requiredInputs:creature_card_in_graveyard",
        retrievalToken: "creature_card_in_graveyard",
      }),
    ],
    noCoreDeclaration: noCore(
      "multi-kenrith",
      "Kenrith is a five-color activated toolbox; all primary outputs are commander-provided. Deck supplies diverse inputs via match constraints only — no single CORE deck-side causal intent dominates the build.",
    ),
  },

  {
    caseId: "hybrid-kinnan",
    commanderMechanismSummary: "Kinnan doubles mana from tapped nonland permanents and has a paid top-five creature deployment.",
    coreIntents: [
      core("hybrid-kinnan", "deck-nonland-mana-permanents", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Nonland permanents that tap for mana",
        commanderMechanismSupported: "Doubled mana from nonland permanent taps",
        oracleEvidence: "Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced",
        causalDefense: "Deck feeds mana permanents — library deployment is commander activated, not deck CORE intent.",
        sourceSemanticFields: ["requiredInputs:nonland_permanent_tapped_for_mana"],
        matchConstraints: ["requiredInputs:nonland_permanent_tapped_for_mana"],
        retrievalBucket: "MANA_SUPPORT",
        linkedSpecField: "requiredFunctions:ramp",
        retrievalToken: "ramp",
      }),
      core("hybrid-kinnan", "deck-untap-support", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Untap support for mana permanents",
        commanderMechanismSupported: "Repeat tapping for doubled mana",
        oracleEvidence: "Whenever you tap a nonland permanent for mana",
        causalDefense: "Untap multiplies Kinnan mana — indirect deck-side enabler.",
        sourceSemanticFields: ["desiredFunctions:untap_support"],
        matchConstraints: ["requiredInputs:nonland_permanent_tapped_for_mana"],
        retrievalBucket: "ENABLERS",
        linkedSpecField: "desiredFunctions:untap_support",
        retrievalToken: "untap_support",
      }),
    ],
    secondaryIntents: [
      secondary("hybrid-kinnan", "deck-creature-from-library", {
        causalRole: "REDUNDANCY",
        targetMechanic: "Redundant top-deck creature deployment",
        commanderMechanismSupported: "Kinnan {5}{G}{U} top-five creature",
        oracleEvidence: "Look at the top five cards of your library. Put a creature card from among them onto the battlefield",
        causalDefense: "Commander provides this — listed SECONDARY only for redundancy tutoring.",
        sourceSemanticFields: ["requiredFunctions:creature_from_library_top"],
        matchConstraints: [],
        retrievalBucket: "ENABLERS",
        linkedSpecField: "requiredFunctions:creature_from_library_top",
        retrievalToken: "creature_from_library_top",
      }),
    ],
  },

  {
    caseId: "hybrid-prosper",
    commanderMechanismSummary: "Prosper exiles top card on sorcery cast; playing from exile creates Treasure.",
    coreIntents: [
      core("hybrid-prosper", "deck-play-from-exile", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Additional ways to play cards from exile (lands and spells)",
        commanderMechanismSupported: "Treasure on playing land or casting from exile",
        oracleEvidence: "Whenever you play a land or cast a spell from exile or a land you don't own, create a Treasure token",
        causalDefense: "Deck extends exile-play beyond single end-step impulse — commander exiles, deck enables play.",
        sourceSemanticFields: ["requiredFunctions:play_card_from_exile", "requiredInputs:spell_cast_from_exile"],
        matchConstraints: ["requiredInputs:spell_cast_from_exile"],
        retrievalBucket: "CARD_ADVANTAGE",
        linkedSpecField: "requiredFunctions:play_card_from_exile",
        retrievalToken: "play_card_from_exile",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "partner-thrasios-tymna",
    commanderMechanismSummary: "Thrasios ramps/draws on {4}; Tymna draws on combat damage to opponents.",
    coreIntents: [
      core("partner-thrasios-tymna", "deck-mana-acceleration", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Mana rocks and ramp to pay Thrasios and cast spells",
        commanderMechanismSupported: "Fuel for Thrasios {4} activation",
        oracleEvidence: "Pay {4}: Scry 1, reveal the top card of your library",
        causalDefense: "Deck mana acceleration — Thrasios land ramp is commander output, deck still needs mana base.",
        sourceSemanticFields: ["requiredFunctions:ramp", "requiredInputs:thrasios_mana_activation"],
        matchConstraints: ["requiredInputs:thrasios_mana_activation"],
        retrievalBucket: "MANA_SUPPORT",
        linkedSpecField: "requiredFunctions:ramp",
        retrievalToken: "ramp",
      }),
      core("partner-thrasios-tymna", "deck-combat-evasion", {
        causalRole: "TRIGGER_PROVIDER",
        targetMechanic: "Evasive attackers to connect for Tymna draw",
        commanderMechanismSupported: "Tymna draws equal to combat damage dealt to opponents",
        oracleEvidence: "Whenever you deal combat damage to a player, draw that many cards",
        causalDefense: "Deck supplies combat connect — Tymna draw is commander payoff.",
        sourceSemanticFields: ["requiredInputs:combat_damage_to_opponents"],
        matchConstraints: ["requiredInputs:combat_damage_to_opponents"],
        retrievalBucket: "PAYOFFS",
        linkedSpecField: "requiredFunctions:combat_payoff",
        retrievalToken: "combat_payoff",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "stax-augustin",
    commanderMechanismSummary: "Augustin reduces your W/U spell costs and taxes opponents' spells.",
    coreIntents: [],
    secondaryIntents: [],
    noCoreDeclaration: noCore(
      "stax-augustin",
      "Augustin provides both cost reduction and opponent tax directly. Deck stax pieces are generic support — no single deck-side mechanic is the CORE causal input to Augustin's Oracle text.",
    ),
  },

  {
    caseId: "yuriko-ninja",
    commanderMechanismSummary: "Yuriko Ninjutsu chain reveals top of library and drains on ninja combat damage.",
    coreIntents: [
      core("yuriko-ninja", "deck-ninjutsu-setup", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Ninja creatures and evasive/unblockable attackers",
        commanderMechanismSupported: "Ninjutsu combat damage triggers reveal/drain",
        oracleEvidence: "Whenever a Ninja you control deals combat damage to a player",
        causalDefense: "Deck supplies ninjutsu setup — Yuriko is the payoff engine, not generic combat_payoff cards.",
        sourceSemanticFields: ["requiredInputs:ninjutsu_combat_damage"],
        matchConstraints: ["requiredInputs:ninjutsu_combat_damage"],
        retrievalBucket: "PAYOFFS",
        linkedSpecField: "requiredFunctions:combat_payoff",
        retrievalToken: "combat_payoff",
      }),
      core("yuriko-ninja", "deck-top-library-construction", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Top-of-library manipulation and high-CMC density",
        commanderMechanismSupported: "Reveal top on ninja damage — life loss scales with CMC",
        oracleEvidence: "Reveal the top card of your library. Each opponent loses life equal to that card's mana value",
        causalDefense: "Deck constructs top-of-library for Yuriko chain — commander reveals, deck curates.",
        sourceSemanticFields: ["outputsToExploit:top_of_library"],
        matchConstraints: ["requiredInputs:ninjutsu_combat_damage"],
        retrievalBucket: "STRUCTURAL_SUPPORT",
        linkedSpecField: "desiredFunctions:topdeck_manipulation",
        retrievalToken: "topdeck_manipulation",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-01-partner-pair",
    commanderMechanismSummary: "Leonardo triggers on token enter; Reyhan moves counters when creatures die or go to command zone.",
    coreIntents: [
      core("blindv5-01-partner-pair", "deck-token-generation", {
        causalRole: "TRIGGER_PROVIDER",
        targetMechanic: "Token generation to trigger Leonardo",
        commanderMechanismSupported: "Whenever a token you control enters",
        oracleEvidence: "Whenever a token you control enters, put a +1/+1 counter on Leonardo",
        causalDefense: "Deck supplies tokens — Leonardo rewards token entry, does not create tokens.",
        sourceSemanticFields: ["requiredInputs:token_enters"],
        matchConstraints: ["requiredInputs:token_enters"],
        retrievalBucket: "ENGINE_PIECES",
        linkedSpecField: "requiredFunctions:token_generation",
        retrievalToken: "token_generation",
      }),
      core("blindv5-01-partner-pair", "deck-counter-placement", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Counter placement on creatures for Reyhan transfer",
        commanderMechanismSupported: "Counters move when creature dies or goes to command zone",
        oracleEvidence: "Whenever a creature you control dies or is put into the command zone, put its counters on Reyhan",
        causalDefense: "Deck places counters on creatures Reyhan later transfers.",
        sourceSemanticFields: ["requiredInputs:creature_dies_or_command_zone_with_counters"],
        matchConstraints: ["requiredInputs:creature_dies_or_command_zone_with_counters"],
        retrievalBucket: "ENGINE_PIECES",
        linkedSpecField: "requiredFunctions:counter_placement",
        retrievalToken: "counter_placement",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-11-commander-background",
    commanderMechanismSummary: "Erinis attack-recurs lands; Clan Crafter sacrifices artifacts for counters/draw.",
    coreIntents: [
      core("blindv5-11-commander-background", "deck-sacrifice-outlets", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Artifact sacrifice outlets for Clan Crafter",
        commanderMechanismSupported: "Sacrifice an artifact → counters/draw",
        oracleEvidence: "Sacrifice an artifact: Put a +1/+1 counter on Clan Crafter and draw a card",
        causalDefense: "Deck supplies sacrifice outlets — Clan Crafter is payoff on sacrifice.",
        sourceSemanticFields: ["requiredInputs:artifact_sacrifice"],
        matchConstraints: ["requiredInputs:artifact_sacrifice", "resourcesToConsume:artifacts"],
        retrievalBucket: "RESOURCE_CONSUMERS",
        linkedSpecField: "requiredFunctions:sacrifice_outlet",
        retrievalToken: "sacrifice_outlet",
      }),
      core("blindv5-11-commander-background", "deck-artifact-fodder", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Cheap artifacts to sacrifice",
        commanderMechanismSupported: "Artifact sacrifice fuel",
        oracleEvidence: "Sacrifice an artifact",
        causalDefense: "Deck provides artifact fodder for sacrifice chain.",
        sourceSemanticFields: ["resourcesToConsume:artifacts"],
        matchConstraints: ["requiredInputs:artifact_sacrifice"],
        retrievalBucket: "RESOURCE_CONSUMERS",
        linkedSpecField: "resourcesToConsume:artifacts",
        retrievalToken: "artifacts",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-19-narrow-single-engine",
    commanderMechanismSummary: "Dionus untaps and draws when this creature becomes tapped during your turn.",
    coreIntents: [
      core("blindv5-19-narrow-single-engine", "deck-tap-enablers", {
        causalRole: "TRIGGER_PROVIDER",
        targetMechanic: "Creatures/artifacts with tap abilities during your turn",
        commanderMechanismSupported: "Whenever this creature becomes tapped during your turn",
        oracleEvidence: "Whenever this creature becomes tapped during your turn, untap it and draw a card",
        causalDefense: "Deck supplies tap triggers — Dionus rewards being tapped, not generic counters.",
        sourceSemanticFields: ["requiredInputs:creature_tapped_during_your_turn"],
        matchConstraints: ["requiredInputs:creature_tapped_during_your_turn"],
        retrievalBucket: "ENABLERS",
        linkedSpecField: "requiredInputs:creature_tapped_during_your_turn",
        retrievalToken: "creature_tapped_during_your_turn",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-22-broad-composite",
    commanderMechanismSummary:
      "Curie draws on combat damage to player; exiles nontoken artifact creature and becomes a copy.",
    coreIntents: [
      core("blindv5-22-broad-composite", "deck-nontoken-artifact-creatures", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Nontoken artifact creatures worth exiling and copying",
        commanderMechanismSupported: "Exile nontoken artifact creature → Curie becomes copy",
        oracleEvidence: "Exile target nontoken artifact or creature. Curie becomes a copy of the exiled card",
        causalDefense:
          "Curie copies exiled creatures — deck supplies copy targets. NOT token generation; Curie does not create tokens.",
        sourceSemanticFields: ["requiredInputs:exiled_nontoken_artifact_creature"],
        matchConstraints: ["requiredInputs:exiled_nontoken_artifact_creature"],
        retrievalBucket: "ENGINE_PIECES",
        linkedSpecField: "requiredInputs:exiled_nontoken_artifact_creature",
        retrievalToken: "exiled_nontoken_artifact_creature",
      }),
      core("blindv5-22-broad-composite", "deck-combat-connect", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Combat damage connection, evasion, and power scaling for draw triggers",
        commanderMechanismSupported: "Combat damage to player draws equal to power",
        oracleEvidence: "Whenever Curie deals combat damage to a player, draw cards equal to her power",
        causalDefense: "Deck enables combat connect — draw is commander output on damage.",
        sourceSemanticFields: ["requiredInputs:combat_damage_to_player", "requiredFunctions:combat_payoff"],
        matchConstraints: ["requiredInputs:combat_damage_to_player"],
        retrievalBucket: "PAYOFFS",
        linkedSpecField: "requiredFunctions:combat_payoff",
        retrievalToken: "combat_payoff",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-23-triggered-engine",
    commanderMechanismSummary: "Elsha creates Soldier tokens when attacking; combat-triggered engine.",
    coreIntents: [
      core("blindv5-23-triggered-engine", "deck-combat-triggers", {
        causalRole: "TRIGGER_PROVIDER",
        targetMechanic: "Combat triggers and evasive attackers",
        commanderMechanismSupported: "Attack-triggered token creation and combat payoffs",
        oracleEvidence: "Whenever Elsha attacks, create a 1/1 white Soldier creature token",
        causalDefense: "Deck supplies combat setup — token creation is commander output on attack.",
        sourceSemanticFields: ["requiredInputs:combat_damage_to_player"],
        matchConstraints: ["requiredInputs:combat_damage_to_player"],
        retrievalBucket: "PAYOFFS",
        linkedSpecField: "requiredFunctions:combat_payoff",
        retrievalToken: "combat_payoff",
      }),
      core("blindv5-23-triggered-engine", "deck-combat-payoffs", {
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        targetMechanic: "Combat payoffs exploiting Soldier tokens and attacks",
        commanderMechanismSupported: "Combat damage and token army",
        oracleEvidence: "create a 1/1 white Soldier creature token",
        causalDefense: "Payoff cards exploit combat/token board — not generic token_generation requirement.",
        sourceSemanticFields: ["requiredFunctions:combat_payoff"],
        matchConstraints: [],
        retrievalBucket: "PAYOFFS",
        linkedSpecField: "requiredFunctions:combat_payoff",
        retrievalToken: "combat_payoff",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-25-activated-engine",
    commanderMechanismSummary: "Daxos the Returned creates Spirit enchantment tokens when you cast enchantments.",
    coreIntents: [
      core("blindv5-25-activated-engine", "deck-enchantment-density", {
        causalRole: "TRIGGER_PROVIDER",
        targetMechanic: "Cheap enchantments to trigger Daxos Spirit creation",
        commanderMechanismSupported: "Cast enchantment → Spirit token",
        oracleEvidence: "Whenever you cast an enchantment spell, create a 1/1 white Spirit enchantment creature token",
        causalDefense: "Deck supplies enchantment spells — token creation is commander output.",
        sourceSemanticFields: ["requiredInputs:controller_enchantment_spell_cast"],
        matchConstraints: ["requiredInputs:controller_enchantment_spell_cast"],
        retrievalBucket: "ENGINE_PIECES",
        linkedSpecField: "requiredInputs:controller_enchantment_spell_cast",
        retrievalToken: "controller_enchantment_spell_cast",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-26-activated-engine",
    commanderMechanismSummary: "Shaun & Rebecca sacrifice artifacts/clues for value.",
    coreIntents: [],
    secondaryIntents: [
      secondary("blindv5-26-activated-engine", "deck-artifact-clue-fodder", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Artifacts and Clues to sacrifice",
        commanderMechanismSupported: "Sacrifice an artifact or a Clue",
        oracleEvidence: "Sacrifice an artifact or a Clue",
        causalDefense: "Secondary fodder support — activated sacrifice is narrow engine.",
        sourceSemanticFields: ["requiredInputs:artifact_or_clue_sacrifice"],
        matchConstraints: ["requiredInputs:artifact_or_clue_sacrifice"],
        retrievalBucket: "RESOURCE_CONSUMERS",
        linkedSpecField: "requiredInputs:artifact_or_clue_sacrifice",
        retrievalToken: "artifact_or_clue_sacrifice",
      }),
    ],
    noCoreDeclaration: noCore(
      "blindv5-26-activated-engine",
      "Shaun & Rebecca's engine is a narrow activated sacrifice loop; deck fodder is match-constraint support without a distinct CORE catalog retrieval intent beyond constraint evaluation.",
    ),
  },

  {
    caseId: "blindv5-29-static-restriction",
    commanderMechanismSummary: "Hua Tuo puts creature from graveyard on top of library when tapped.",
    coreIntents: [
      core("blindv5-29-static-restriction", "deck-graveyard-population", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Creature cards in graveyard for recursion target",
        commanderMechanismSupported: "{T}: Put target creature card from graveyard on top of library",
        oracleEvidence: "Put target creature card from your graveyard on top of your library",
        causalDefense: "Deck fills graveyard — recursion to library top is commander ability.",
        sourceSemanticFields: ["requiredInputs:creature_card_in_graveyard", "desiredFunctions:mill"],
        matchConstraints: ["requiredInputs:creature_card_in_graveyard"],
        retrievalBucket: "STATE_BUILDERS",
        linkedSpecField: "requiredFunctions:graveyard_setup",
        retrievalToken: "graveyard_setup",
      }),
      core("blindv5-29-static-restriction", "deck-draw-top-utilization", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Draw and top-of-library manipulation to exploit recurring top card",
        commanderMechanismSupported: "Library-top recursion loop",
        oracleEvidence: "Put target creature card from your graveyard on top of your library",
        causalDefense: "Deck exploits top-of-library after Hua Tuo recursion — not graveyard_to_library_top as deck function.",
        sourceSemanticFields: ["desiredFunctions:card_draw", "desiredFunctions:topdeck_manipulation"],
        matchConstraints: ["requiredInputs:creature_card_in_graveyard"],
        retrievalBucket: "CARD_ADVANTAGE",
        linkedSpecField: "requiredFunctions:card_draw",
        retrievalToken: "card_draw",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-16-commander-background",
    commanderMechanismSummary: "Zellix mills on attack; Acolyte of Bahamut creates Dragon tokens when Dragon dies.",
    coreIntents: [
      core("blindv5-16-commander-background", "deck-mill-enablers", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Mill effects targeting players",
        commanderMechanismSupported: "Zellix attack triggers mill",
        oracleEvidence: "Whenever Zellix attacks, mill half the number of cards in your hand",
        causalDefense: "Deck extends mill beyond Zellix attack — typed mill requirement.",
        sourceSemanticFields: ["requiredFunctions:mill_target_player"],
        matchConstraints: [],
        retrievalBucket: "STRUCTURAL_SUPPORT",
        linkedSpecField: "requiredFunctions:mill_target_player",
        retrievalToken: "mill_target_player",
      }),
      core("blindv5-16-commander-background", "deck-dragon-support", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Dragon creatures that can die to trigger Acolyte token",
        commanderMechanismSupported: "When Dragon dies, create Dragon token",
        oracleEvidence: "Whenever a Dragon you control dies, create a tapped 5/5 red Dragon creature token with flying",
        causalDefense: "Deck supplies Dragons — token creation is background output on Dragon death.",
        sourceSemanticFields: ["requiredInputs:dragon_dies"],
        matchConstraints: ["requiredInputs:dragon_dies"],
        retrievalBucket: "ENGINE_PIECES",
        linkedSpecField: "requiredFunctions:token_generation",
        retrievalToken: "token_generation",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-45-graveyard",
    commanderMechanismSummary: "Mishra grants unearth to artifact cards in your graveyard.",
    coreIntents: [
      core("blindv5-45-graveyard", "deck-artifact-graveyard", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Artifact cards that enter graveyard for unearth",
        commanderMechanismSupported: "Each artifact card in your graveyard has unearth",
        oracleEvidence: "Each artifact card in your graveyard has unearth {2}",
        causalDefense: "Deck supplies artifacts to graveyard — unearth is commander-granted, not deck function.",
        sourceSemanticFields: ["requiredInputs:artifact_card_in_graveyard", "requiredFunctions:unearth"],
        matchConstraints: ["requiredInputs:artifact_card_in_graveyard"],
        retrievalBucket: "RECURSION",
        linkedSpecField: "requiredInputs:artifact_card_in_graveyard",
        retrievalToken: "artifact_card_in_graveyard",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-47-artifacts",
    commanderMechanismSummary: "Kain draws, creates Treasure, and drains on combat damage to player.",
    coreIntents: [
      core("blindv5-47-artifacts", "deck-combat-connect", {
        causalRole: "TRIGGER_PROVIDER",
        targetMechanic: "Evasive combat creatures to deal damage to players",
        commanderMechanismSupported: "Combat damage triggers draw/treasure/life loss",
        oracleEvidence: "Whenever Kain deals combat damage to a player, you draw a card and create a Treasure token",
        causalDefense: "Deck enables combat connect — draw/treasure are commander outputs.",
        sourceSemanticFields: ["requiredInputs:combat_damage_to_player"],
        matchConstraints: ["requiredInputs:combat_damage_to_player"],
        retrievalBucket: "PAYOFFS",
        linkedSpecField: "requiredInputs:combat_damage_to_player",
        retrievalToken: "combat_damage_to_player",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-50-enchantments",
    commanderMechanismSummary: "Terra mills and returns enchantments; Esper Terra creates enchantment/Saga token copies.",
    coreIntents: [
      core("blindv5-50-enchantments", "deck-enchantment-casting", {
        causalRole: "TRIGGER_PROVIDER",
        targetMechanic: "Enchantment spells to trigger experience/token engines",
        commanderMechanismSupported: "Enchantments cast and milled enchantment recovery",
        oracleEvidence: "Mill five cards. You may put an enchantment card milled this way into your hand",
        causalDefense: "Deck supplies enchantment density — recursion/copy are commander-side outputs.",
        sourceSemanticFields: ["requiredInputs:enchantment_in_graveyard_or_milled"],
        matchConstraints: ["requiredInputs:enchantment_in_graveyard_or_milled"],
        retrievalBucket: "RECURSION",
        linkedSpecField: "requiredFunctions:enchantment_recursion",
        retrievalToken: "enchantment_recursion",
      }),
      core("blindv5-50-enchantments", "deck-enchantment-recursion", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Recover enchantments from mill/graveyard",
        commanderMechanismSupported: "Mill five → return enchantment to hand",
        oracleEvidence: "put an enchantment card milled this way into your hand",
        causalDefense: "Deck extends enchantment availability beyond commander mill impulse.",
        sourceSemanticFields: ["requiredFunctions:enchantment_recursion"],
        matchConstraints: ["requiredInputs:enchantment_in_graveyard_or_milled"],
        retrievalBucket: "RECURSION",
        linkedSpecField: "requiredFunctions:enchantment_recursion",
        retrievalToken: "enchantment_recursion",
      }),
    ],
    secondaryIntents: [
      secondary("blindv5-50-enchantments", "deck-saga-copy-support", {
        causalRole: "REDUNDANCY",
        targetMechanic: "Saga/enchantment token copy support",
        commanderMechanismSupported: "Esper Terra creates enchantment/Saga token copies",
        oracleEvidence: "Create a token that's a copy of enchantment or Saga",
        causalDefense: "Commander provides copy — SECONDARY redundancy only.",
        sourceSemanticFields: ["requiredFunctions:saga_token_copy"],
        matchConstraints: [],
        retrievalBucket: "ENGINE_PIECES",
        linkedSpecField: "requiredFunctions:saga_token_copy",
        retrievalToken: "saga_token_copy",
      }),
    ],
  },

  {
    caseId: "blindv5-51-tokens",
    commanderMechanismSummary: "Orvar creates token copy when you cast instant/sorcery targeting another permanent you control.",
    coreIntents: [
      core("blindv5-51-tokens", "deck-targeted-cantrips", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Cheap instants/sorceries that target another permanent you control",
        commanderMechanismSupported: "Cast inst/sorc targeting own permanent → token copy of target",
        oracleEvidence:
          "Whenever you cast an instant or sorcery spell, if it targets one or more other permanents you control, create a token that's a copy of one of those permanents",
        causalDefense:
          "Deck supplies targeting spells — token copy is commander output. NOT token_generation as deck CORE intent.",
        sourceSemanticFields: [
          "requiredInputs:controller_instant_or_sorcery_targets_own_permanent",
          "requiredFunctions:targeted_cantrip",
        ],
        matchConstraints: ["requiredInputs:controller_instant_or_sorcery_targets_own_permanent"],
        retrievalBucket: "ENABLERS",
        linkedSpecField: "requiredFunctions:targeted_cantrip",
        retrievalToken: "targeted_cantrip",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-53-counters",
    commanderMechanismSummary: "Nita connives/counters engine with exile and graveyard instant/sorcery availability.",
    coreIntents: [
      core("blindv5-53-counters", "deck-counter-synergy", {
        causalRole: "ENGINE_ENABLER",
        targetMechanic: "Counter placement and counter synergies",
        commanderMechanismSupported: "Connive and counter-based value",
        oracleEvidence: "Connive",
        causalDefense: "Deck supplies counter synergies feeding Nita engine.",
        sourceSemanticFields: ["requiredFunctions:counter_synergy"],
        matchConstraints: [],
        retrievalBucket: "ENGINE_PIECES",
        linkedSpecField: "requiredFunctions:counter_synergy",
        retrievalToken: "counter_synergy",
      }),
      core("blindv5-53-counters", "deck-cast-from-exile", {
        causalRole: "CONVERSION_PIECE",
        targetMechanic: "Play cards from exile",
        commanderMechanismSupported: "Exile zone exploitation",
        oracleEvidence: "cast from exile",
        causalDefense: "Deck extends exile-play beyond commander connive impulses.",
        sourceSemanticFields: ["requiredFunctions:cast_from_exile"],
        matchConstraints: [],
        retrievalBucket: "CARD_ADVANTAGE",
        linkedSpecField: "requiredFunctions:cast_from_exile",
        retrievalToken: "cast_from_exile",
      }),
      core("blindv5-53-counters", "deck-opponent-gy-instant-sorcery", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Opponent graveyard instant/sorcery availability",
        commanderMechanismSupported: "Graveyard instant/sorcery exploitation",
        oracleEvidence: "instant or sorcery card in an opponent's graveyard",
        causalDefense: "Deck enables opponent graveyard instant/sorcery access.",
        sourceSemanticFields: ["requiredFunctions:opponent_graveyard_instant_sorcery_availability"],
        matchConstraints: [],
        retrievalBucket: "STRUCTURAL_SUPPORT",
        linkedSpecField: "requiredFunctions:opponent_graveyard_instant_sorcery_availability",
        retrievalToken: "opponent_graveyard_instant_sorcery_availability",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-42-resource-conversion",
    commanderMechanismSummary: "Cyclonus connives and converts resources on combat damage.",
    coreIntents: [],
    secondaryIntents: [
      secondary("blindv5-42-resource-conversion", "deck-connive-support", {
        causalRole: "CONVERSION_PIECE",
        targetMechanic: "Connive and discard synergy",
        commanderMechanismSupported: "Connive on combat damage",
        oracleEvidence: "Connive",
        causalDefense: "Secondary support — commander provides conversion engine.",
        sourceSemanticFields: ["outputsToExploit:connive"],
        matchConstraints: [],
        retrievalBucket: "CARD_ADVANTAGE",
        linkedSpecField: "desiredFunctions:connive",
        retrievalToken: "connive",
      }),
    ],
    noCoreDeclaration: noCore(
      "blindv5-42-resource-conversion",
      "Cyclonus connive/conversion is commander-provided on combat damage. Deck connive support is indirect — no single CORE deck-side intent separate from commander mechanism.",
    ),
  },

  {
    caseId: "blindv5-44-unusual-zones",
    commanderMechanismSummary: "Chainer reanimates from graveyard for life; Nightmare synergy.",
    coreIntents: [
      core("blindv5-44-unusual-zones", "deck-graveyard-setup", {
        causalRole: "RESOURCE_PROVIDER",
        targetMechanic: "Populate graveyard with creature cards for reanimation",
        commanderMechanismSupported: "Put target creature card from graveyard onto battlefield",
        oracleEvidence: "Put target creature card from a graveyard onto the battlefield under your control",
        causalDefense: "Deck fills graveyard — Chainer reanimates, does not mill.",
        sourceSemanticFields: ["requiredFunctions:graveyard_setup", "requiredInputs:creature_card_in_graveyard"],
        matchConstraints: ["requiredInputs:creature_card_in_graveyard"],
        retrievalBucket: "STATE_BUILDERS",
        linkedSpecField: "requiredFunctions:graveyard_setup",
        retrievalToken: "graveyard_setup",
      }),
    ],
    secondaryIntents: [],
  },

  {
    caseId: "blindv5-59-tutor-toolbox",
    commanderMechanismSummary: "Earth King searches lands on power 4+ attack; creates Bear on ETB.",
    coreIntents: [
      core("blindv5-59-tutor-toolbox", "deck-power4-attackers", {
        causalRole: "TRIGGER_PROVIDER",
        targetMechanic: "Creatures with power 4 or greater that attack",
        commanderMechanismSupported: "Power 4+ attack → search basic lands",
        oracleEvidence: "Whenever a creature you control with power 4 or greater attacks, search your library for up to two basic land cards",
        causalDefense: "Deck supplies power 4+ attackers — land ramp is commander output on attack, NOT deck CORE intent.",
        sourceSemanticFields: ["requiredInputs:power4_creature_attack"],
        matchConstraints: ["requiredInputs:power4_creature_attack", "requiredInputs:commander_etb"],
        retrievalBucket: "PAYOFFS",
        linkedSpecField: "requiredInputs:power4_creature_attack",
        retrievalToken: "power4_creature_attack",
      }),
    ],
    secondaryIntents: [],
  },
];

export function getCandidateIntentProfile(caseId: string): CaseCandidateIntentProfile | undefined {
  return PROFILES.find((p) => p.caseId === caseId);
}

export function getAllCandidateIntentProfiles(): CaseCandidateIntentProfile[] {
  return PROFILES;
}

export function getCoreCandidateIntents(caseId: string): CandidateIntent[] {
  return getCandidateIntentProfile(caseId)?.coreIntents ?? [];
}

export function getAllCoreCandidateIntents(): CandidateIntent[] {
  return PROFILES.flatMap((p) => p.coreIntents);
}

export function getReviewPopulationCaseIds(): string[] {
  return PROFILES.map((p) => p.caseId);
}
