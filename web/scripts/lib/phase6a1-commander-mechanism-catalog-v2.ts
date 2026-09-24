/**
 * Commander mechanism catalog v2 — SUPERSEDED / DEVELOPMENTAL.
 * Do not route. Authoritative mechanism semantics:
 *   phase6a1-independent-commander-mechanism-truth-v1.json
 *   phase6a1-commander-mechanism-facts-v4-implemented.json
 */
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type { CausalRole } from "../../src/lib/deck-synthesis/build-path-types-v1";

export const COMMANDER_MECHANISM_CATALOG_V2_VERSION = "phase6a1-commander-mechanism-catalog-v2";

export type MechanismSlot = {
  id: string;
  label: string;
  targetMechanic: string;
  linkedSpecField: string;
  retrievalToken: string;
  retrievalBucket: RetrievalBucketId;
  causalRole: CausalRole;
  matchConstraints: string[];
  oracleEvidence: string;
};

export type BridgeSlot = {
  id: string;
  label: string;
  targetMechanic: string;
  linkedSpecField: string;
  retrievalToken: string;
  retrievalBucket: RetrievalBucketId;
  causalRole: CausalRole;
  commanderJob: string;
  independentJob: string;
  matchConstraints: string[];
  oracleEvidence: string;
};

export type CommanderMechanismEntry = {
  caseId: string;
  oracleSummary: string;
  commanderInputs: MechanismSlot[];
  commanderOutputExploits: MechanismSlot[];
  independentEngine: { enabler: MechanismSlot; payoff: MechanismSlot };
  bridges: BridgeSlot[];
  failureWithoutCommander: string;
  functionWithoutCommander: string;
};

function slot(p: MechanismSlot): MechanismSlot {
  return p;
}

function bridge(p: BridgeSlot): BridgeSlot {
  return p;
}

export const COMMANDER_MECHANISM_CATALOG: CommanderMechanismEntry[] = [
  {
    caseId: "single-graveyard-meren",
    oracleSummary: "Creatures you control die → experience → end-step recursion from graveyard.",
    commanderInputs: [
      slot({
        id: "dep-creature-deaths",
        label: "Creature death density",
        targetMechanic: "Creatures dying under your control for experience",
        linkedSpecField: "requiredInputs:creature_dies_controller_controls",
        retrievalToken: "creature_dies_controller_controls",
        retrievalBucket: "STATE_BUILDERS",
        causalRole: "TRIGGER_PROVIDER",
        matchConstraints: ["requiredInputs:creature_dies_controller_controls"],
        oracleEvidence: "Whenever a creature you control dies",
      }),
    ],
    commanderOutputExploits: [
      slot({
        id: "dep-recursion-targets",
        label: "Graveyard targets for Meren recursion",
        targetMechanic: "High-impact creature cards in graveyard for end-step return",
        linkedSpecField: "requiredFunctions:graveyard_setup",
        retrievalToken: "graveyard_setup",
        retrievalBucket: "STATE_BUILDERS",
        causalRole: "RESOURCE_PROVIDER",
        matchConstraints: ["requiredInputs:creature_dies_controller_controls"],
        oracleEvidence: "Return target creature card from your graveyard to the battlefield",
      }),
    ],
    independentEngine: {
      enabler: slot({
        id: "ind-gy-setup",
        label: "Graveyard self-mill setup",
        targetMechanic: "Fill graveyard without Meren online",
        linkedSpecField: "desiredFunctions:mill",
        retrievalToken: "mill",
        retrievalBucket: "STRUCTURAL_SUPPORT",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Mill effects populate graveyard",
      }),
      payoff: slot({
        id: "ind-standalone-reanimation",
        label: "Non-Meren reanimation",
        targetMechanic: "Return creatures from graveyard without commander",
        linkedSpecField: "requiredFunctions:reanimation",
        retrievalToken: "reanimation",
        retrievalBucket: "RECURSION",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Return target creature card from your graveyard",
      }),
    },
    bridges: [
      bridge({
        id: "harm-death-recursion",
        label: "Death triggers that also recur",
        targetMechanic: "Creatures that die for value and return from graveyard",
        linkedSpecField: "outputsToExploit:death_triggers",
        retrievalToken: "death_triggers",
        retrievalBucket: "PAYOFFS",
        causalRole: "CONVERSION_PIECE",
        commanderJob: "Feed experience and Meren targets",
        independentJob: "Standalone death-value engine",
        matchConstraints: ["requiredInputs:creature_dies_controller_controls"],
        oracleEvidence: "Whenever a creature you control dies",
      }),
    ],
    failureWithoutCommander: "Experience stops growing and end-step recursion disappears.",
    functionWithoutCommander: "Self-mill plus standalone reanimation and death-value loops continue.",
  },

  {
    caseId: "single-tokens-krenko",
    oracleSummary: "{T}: Create X Goblins where X = Goblins you control.",
    commanderInputs: [
      slot({
        id: "dep-goblin-density",
        label: "Goblin count scaling",
        targetMechanic: "Additional Goblins to maximize X",
        linkedSpecField: "requiredInputs:goblins_controlled",
        retrievalToken: "goblins_controlled",
        retrievalBucket: "ENGINE_PIECES",
        causalRole: "RESOURCE_PROVIDER",
        matchConstraints: ["requiredInputs:goblins_controlled"],
        oracleEvidence: "where X is the number of Goblins you control",
      }),
      slot({
        id: "dep-untap-krenko",
        label: "Untap Krenko",
        targetMechanic: "Untap effects for repeated Krenko activations",
        linkedSpecField: "desiredFunctions:untap_support",
        retrievalToken: "untap_support",
        retrievalBucket: "ENABLERS",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: ["requiredInputs:goblins_controlled"],
        oracleEvidence: "{T}: Create X 1/1 red Goblin creature tokens",
      }),
    ],
    commanderOutputExploits: [
      slot({
        id: "dep-goblin-payoff",
        label: "Exploit goblin swarm",
        targetMechanic: "Payoffs that scale with goblin tokens Krenko creates",
        linkedSpecField: "outputsToExploit:goblin_tokens",
        retrievalToken: "goblin_tokens",
        retrievalBucket: "PAYOFFS",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Create X 1/1 red Goblin creature tokens",
      }),
    ],
    independentEngine: {
      enabler: slot({
        id: "ind-goblin-aggro",
        label: "Goblin aggro shell",
        targetMechanic: "Goblin density and haste without Krenko",
        linkedSpecField: "requiredFunctions:combat_payoff",
        retrievalToken: "combat_payoff",
        retrievalBucket: "PAYOFFS",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Goblin tribal combat strategies",
      }),
      payoff: slot({
        id: "ind-token-payoff",
        label: "Generic token payoffs",
        targetMechanic: "Anthems and token doublers independent of Krenko",
        linkedSpecField: "requiredFunctions:token_generation",
        retrievalToken: "token_generation",
        retrievalBucket: "ENGINE_PIECES",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Token payoff cards",
      }),
    },
    bridges: [
      bridge({
        id: "harm-goblin-multirole",
        label: "Goblins that scale and aggro",
        targetMechanic: "Goblins that increase X and attack effectively alone",
        linkedSpecField: "requiredInputs:goblins_controlled",
        retrievalToken: "goblins_controlled",
        retrievalBucket: "ENGINE_PIECES",
        causalRole: "CONVERSION_PIECE",
        commanderJob: "Increase Krenko token count",
        independentJob: "Standalone go-wide aggro",
        matchConstraints: ["requiredInputs:goblins_controlled"],
        oracleEvidence: "Goblins you control",
      }),
    ],
    failureWithoutCommander: "Exponential token generation stops; deck loses primary engine.",
    functionWithoutCommander: "Goblin aggro and token payoffs still pressure the table.",
  },

  {
    caseId: "single-aristocrats-teysa",
    oracleSummary: "Creature dying → death-triggered ability triggers an additional time.",
    commanderInputs: [
      slot({
        id: "dep-sacrifice-outlets",
        label: "Sacrifice outlets",
        targetMechanic: "Cause creature deaths on demand",
        linkedSpecField: "requiredFunctions:sacrifice_outlet",
        retrievalToken: "sacrifice_outlet",
        retrievalBucket: "RESOURCE_CONSUMERS",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: ["requiredInputs:creature_dies_triggers_controller_ability"],
        oracleEvidence: "If a creature dying causes a triggered ability",
      }),
    ],
    commanderOutputExploits: [
      slot({
        id: "dep-death-payoffs",
        label: "Death-trigger payoffs",
        targetMechanic: "Payoffs doubled by Teysa",
        linkedSpecField: "requiredFunctions:sacrifice_payoff",
        retrievalToken: "sacrifice_payoff",
        retrievalBucket: "PAYOFFS",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: ["requiredInputs:creature_dies_triggers_controller_ability"],
        oracleEvidence: "that ability triggers an additional time",
      }),
    ],
    independentEngine: {
      enabler: slot({
        id: "ind-blood-artist-shell",
        label: "Passive death value",
        targetMechanic: "Creatures that drain or draw on any death",
        linkedSpecField: "outputsToExploit:death_triggers",
        retrievalToken: "death_triggers",
        retrievalBucket: "PAYOFFS",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Whenever a creature dies",
      }),
      payoff: slot({
        id: "ind-aristocrats-payoff",
        label: "Non-doubled aristocrats payoffs",
        targetMechanic: "Sacrifice payoffs that work once without Teysa",
        linkedSpecField: "requiredFunctions:sacrifice_payoff",
        retrievalToken: "sacrifice_payoff",
        retrievalBucket: "PAYOFFS",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Whenever a creature dies",
      }),
    },
    bridges: [
      bridge({
        id: "harm-doubled-death-value",
        label: "Death triggers worth doubling",
        targetMechanic: "High-impact death triggers that still matter once",
        linkedSpecField: "requiredInputs:creature_dies_triggers_controller_ability",
        retrievalToken: "creature_dies_triggers_controller_ability",
        retrievalBucket: "PAYOFFS",
        causalRole: "CONVERSION_PIECE",
        commanderJob: "Teysa doubles the trigger",
        independentJob: "Strong single-trigger value",
        matchConstraints: ["requiredInputs:creature_dies_triggers_controller_ability"],
        oracleEvidence: "If a creature dying causes a triggered ability",
      }),
    ],
    failureWithoutCommander: "Death triggers fire only once — aristocrats chain loses primary multiplier.",
    functionWithoutCommander: "Sacrifice outlets plus death payoffs still drain and draw.",
  },

  {
    caseId: "single-mill-bruvac",
    oracleSummary: "Opponent mill is doubled.",
    commanderInputs: [
      slot({
        id: "dep-mill-spells",
        label: "Opponent mill actions",
        targetMechanic: "Mill spells Bruvac doubles",
        linkedSpecField: "requiredFunctions:mill",
        retrievalToken: "mill",
        retrievalBucket: "STRUCTURAL_SUPPORT",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "If a player would mill one or more cards, they mill twice",
      }),
    ],
    commanderOutputExploits: [
      slot({
        id: "dep-mill-amplification",
        label: "Stacked mill amplification",
        targetMechanic: "Additional doubling beyond Bruvac",
        linkedSpecField: "requiredFunctions:opponent_mill_amplification",
        retrievalToken: "opponent_mill_amplification",
        retrievalBucket: "STRUCTURAL_SUPPORT",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "mill twice that many cards instead",
      }),
    ],
    independentEngine: {
      enabler: slot({
        id: "ind-self-mill-setup",
        label: "Self-mill for graveyard strategies",
        targetMechanic: "Fill own graveyard for alternate win",
        linkedSpecField: "requiredFunctions:graveyard_setup",
        retrievalToken: "graveyard_setup",
        retrievalBucket: "STATE_BUILDERS",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Mill yourself to set up recursion",
      }),
      payoff: slot({
        id: "ind-gy-win",
        label: "Graveyard win conditions",
        targetMechanic: "Thoracle/Dread Return style wins from self-mill",
        linkedSpecField: "requiredFunctions:reanimation",
        retrievalToken: "reanimation",
        retrievalBucket: "RECURSION",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Win from graveyard",
      }),
    },
    bridges: [
      bridge({
        id: "harm-mill-recursion",
        label: "Mill that feeds both plans",
        targetMechanic: "Mill opponents while stocking own graveyard",
        linkedSpecField: "requiredFunctions:mill",
        retrievalToken: "mill",
        retrievalBucket: "STRUCTURAL_SUPPORT",
        causalRole: "CONVERSION_PIECE",
        commanderJob: "Doubled opponent mill",
        independentJob: "Self-mill setup",
        matchConstraints: [],
        oracleEvidence: "Mill effects",
      }),
    ],
    failureWithoutCommander: "Opponent mill loses doubling — primary mill plan slows sharply.",
    functionWithoutCommander: "Self-mill graveyard wins and recursion still function.",
  },

  {
    caseId: "multi-korvold",
    oracleSummary: "Sacrifice permanent → +1/+1 counter and draw on Korvold.",
    commanderInputs: [
      slot({
        id: "dep-sacrifice-fodder",
        label: "Sacrifice fodder",
        targetMechanic: "Permanents to sacrifice for Korvold triggers",
        linkedSpecField: "resourcesToConsume:sacrifice_fodder",
        retrievalToken: "sacrifice_fodder",
        retrievalBucket: "RESOURCE_CONSUMERS",
        causalRole: "RESOURCE_PROVIDER",
        matchConstraints: ["requiredInputs:permanent_sacrificed"],
        oracleEvidence: "Whenever you sacrifice a permanent",
      }),
      slot({
        id: "dep-sacrifice-outlets",
        label: "Sacrifice outlets",
        targetMechanic: "Enable sacrifice events",
        linkedSpecField: "requiredFunctions:sacrifice_outlet",
        retrievalToken: "sacrifice_outlet",
        retrievalBucket: "RESOURCE_CONSUMERS",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: ["requiredInputs:permanent_sacrificed"],
        oracleEvidence: "Whenever you sacrifice a permanent",
      }),
    ],
    commanderOutputExploits: [
      slot({
        id: "dep-sacrifice-payoffs",
        label: "Sacrifice payoffs with Korvold draw",
        targetMechanic: "Payoffs on each sacrifice event",
        linkedSpecField: "requiredFunctions:sacrifice_payoff",
        retrievalToken: "sacrifice_payoff",
        retrievalBucket: "PAYOFFS",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: ["requiredInputs:permanent_sacrificed"],
        oracleEvidence: "draw a card",
      }),
    ],
    independentEngine: {
      enabler: slot({
        id: "ind-food-chain",
        label: "Food token / artifact fodder engine",
        targetMechanic: "Generate fodder without Korvold",
        linkedSpecField: "requiredFunctions:token_generation",
        retrievalToken: "token_generation",
        retrievalBucket: "ENGINE_PIECES",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Create token fodder",
      }),
      payoff: slot({
        id: "ind-aristocrats",
        label: "Standalone aristocrats drain",
        targetMechanic: "Drain on sacrifice without Korvold counters",
        linkedSpecField: "outputsToExploit:death_triggers",
        retrievalToken: "death_triggers",
        retrievalBucket: "PAYOFFS",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Whenever a creature dies",
      }),
    },
    bridges: [
      bridge({
        id: "harm-sacrifice-multirole",
        label: "Sacrifice outlets that also pay off alone",
        targetMechanic: "Outlets with built-in payoff",
        linkedSpecField: "requiredFunctions:sacrifice_outlet",
        retrievalToken: "sacrifice_outlet",
        retrievalBucket: "RESOURCE_CONSUMERS",
        causalRole: "CONVERSION_PIECE",
        commanderJob: "Trigger Korvold",
        independentJob: "Standalone sacrifice value",
        matchConstraints: ["requiredInputs:permanent_sacrificed"],
        oracleEvidence: "Sacrifice a permanent",
      }),
    ],
    failureWithoutCommander: "Sacrifice loses primary card-advantage engine and counter growth.",
    functionWithoutCommander: "Aristocrats and fodder loops still generate value.",
  },

  {
    caseId: "multi-kenrith",
    oracleSummary: "Five activated branches: life, draw, haste, counters, reanimation.",
    commanderInputs: [
      slot({
        id: "dep-mana-for-activations",
        label: "Mana for repeated activations",
        targetMechanic: "Ramp and rocks to pay Kenrith abilities",
        linkedSpecField: "requiredFunctions:ramp",
        retrievalToken: "ramp",
        retrievalBucket: "MANA_SUPPORT",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Pay {W}, {U}, {R}, {1}{G}, {4}{B}",
      }),
      slot({
        id: "dep-gy-for-reanimate",
        label: "Graveyard fodder for reanimation branch",
        targetMechanic: "Creature cards in graveyard for {4}{B}",
        linkedSpecField: "requiredInputs:creature_card_in_graveyard",
        retrievalToken: "creature_card_in_graveyard",
        retrievalBucket: "RECURSION",
        causalRole: "RESOURCE_PROVIDER",
        matchConstraints: ["requiredInputs:creature_card_in_graveyard"],
        oracleEvidence: "Return target creature card from your graveyard",
      }),
    ],
    commanderOutputExploits: [
      slot({
        id: "dep-exploit-toolbox",
        label: "Exploit multi-activated outputs",
        targetMechanic: "Cards that benefit from draw/counters/combat buff",
        linkedSpecField: "outputsToExploit:partner_card_draw",
        retrievalToken: "card_draw",
        retrievalBucket: "CARD_ADVANTAGE",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Draw a card / put a +1/+1 counter",
      }),
    ],
    independentEngine: {
      enabler: slot({
        id: "ind-counter-shell",
        label: "+1/+1 counter enablers",
        targetMechanic: "Place counters without Kenrith {1}{G}",
        linkedSpecField: "requiredFunctions:counter_placement",
        retrievalToken: "counter_placement",
        retrievalBucket: "ENGINE_PIECES",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Put a +1/+1 counter on target creature",
      }),
      payoff: slot({
        id: "ind-standalone-recursion",
        label: "Non-Kenrith reanimation",
        targetMechanic: "Reanimate without {4}{B} activation",
        linkedSpecField: "requiredFunctions:reanimation",
        retrievalToken: "reanimation",
        retrievalBucket: "RECURSION",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Return creature from graveyard",
      }),
    },
    bridges: [
      bridge({
        id: "harm-value-creatures",
        label: "Creatures that ramp, grow, and die into reanimation",
        targetMechanic: "Flexible creature-value infrastructure",
        linkedSpecField: "requiredFunctions:ramp",
        retrievalToken: "ramp",
        retrievalBucket: "MANA_SUPPORT",
        causalRole: "CONVERSION_PIECE",
        commanderJob: "Fuel Kenrith activations and reanimation",
        independentJob: "Counter and recursion shell",
        matchConstraints: [],
        oracleEvidence: "Creatures with ETB ramp or counters",
      }),
    ],
    failureWithoutCommander: "Five-color activated toolbox disappears — deck loses flexible conversion hub.",
    functionWithoutCommander: "Counter synergies and standalone reanimation still operate.",
  },

  {
    caseId: "hybrid-kinnan",
    oracleSummary: "Double mana from tapped nonland permanents; {5}{G}{U} put creature from top five.",
    commanderInputs: [
      slot({
        id: "dep-mana-permanents",
        label: "Nonland mana permanents",
        targetMechanic: "Permanents that tap for mana to double",
        linkedSpecField: "requiredInputs:nonland_permanent_tapped_for_mana",
        retrievalToken: "nonland_permanent_tapped_for_mana",
        retrievalBucket: "MANA_SUPPORT",
        causalRole: "RESOURCE_PROVIDER",
        matchConstraints: ["requiredInputs:nonland_permanent_tapped_for_mana"],
        oracleEvidence: "Whenever you tap a nonland permanent for mana",
      }),
      slot({
        id: "dep-untap-permanents",
        label: "Untap for repeated taps",
        targetMechanic: "Untap mana permanents for extra doubling",
        linkedSpecField: "desiredFunctions:untap_support",
        retrievalToken: "untap_support",
        retrievalBucket: "ENABLERS",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: ["requiredInputs:nonland_permanent_tapped_for_mana"],
        oracleEvidence: "Whenever you tap a nonland permanent for mana",
      }),
    ],
    commanderOutputExploits: [
      slot({
        id: "dep-exploit-mana-doubling",
        label: "Exploit doubled mana",
        targetMechanic: "Big mana sinks and X spells",
        linkedSpecField: "requiredFunctions:combat_payoff",
        retrievalToken: "combat_payoff",
        retrievalBucket: "PAYOFFS",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Add one mana of any type that permanent produced",
      }),
    ],
    independentEngine: {
      enabler: slot({
        id: "ind-ramp-shell",
        label: "Standard ramp package",
        targetMechanic: "Ramp without Kinnan doubling",
        linkedSpecField: "requiredFunctions:ramp",
        retrievalToken: "ramp",
        retrievalBucket: "MANA_SUPPORT",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Add mana / put land",
      }),
      payoff: slot({
        id: "ind-creature-tutor",
        label: "Creature cheat without Kinnan ability",
        targetMechanic: "Put creatures onto battlefield from library",
        linkedSpecField: "requiredFunctions:creature_from_library_top",
        retrievalToken: "creature_from_library_top",
        retrievalBucket: "ENABLERS",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Put creature onto battlefield",
      }),
    },
    bridges: [
      bridge({
        id: "harm-dork-hydra",
        label: "Mana dorks that scale and cast big creatures",
        targetMechanic: "Creatures that tap for mana and benefit from extra mana",
        linkedSpecField: "requiredInputs:nonland_permanent_tapped_for_mana",
        retrievalToken: "nonland_permanent_tapped_for_mana",
        retrievalBucket: "MANA_SUPPORT",
        causalRole: "CONVERSION_PIECE",
        commanderJob: "Feed doubling",
        independentJob: "Standalone ramp into threats",
        matchConstraints: ["requiredInputs:nonland_permanent_tapped_for_mana"],
        oracleEvidence: "Tap for mana",
      }),
    ],
    failureWithoutCommander: "Mana doubling and top-five cheat stop — explosive turns collapse.",
    functionWithoutCommander: "Ramp into midrange creatures still functions.",
  },

  {
    caseId: "hybrid-prosper",
    oracleSummary: "Sorcery cast exiles top; play from exile creates Treasure.",
    commanderInputs: [
      slot({
        id: "dep-exile-play",
        label: "Play from exile enablers",
        targetMechanic: "Cast/play cards from exile beyond Prosper impulse",
        linkedSpecField: "requiredFunctions:play_card_from_exile",
        retrievalToken: "play_card_from_exile",
        retrievalBucket: "CARD_ADVANTAGE",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: ["requiredInputs:spell_cast_from_exile"],
        oracleEvidence: "Whenever you play a land or cast a spell from exile",
      }),
    ],
    commanderOutputExploits: [
      slot({
        id: "dep-treasure-payoff",
        label: "Exploit Treasure tokens",
        targetMechanic: "Payoffs for artifact/treasure density",
        linkedSpecField: "outputsToExploit:treasure_tokens",
        retrievalToken: "treasure_tokens",
        retrievalBucket: "ENGINE_PIECES",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: ["requiredInputs:spell_cast_from_exile"],
        oracleEvidence: "Create a Treasure token",
      }),
    ],
    independentEngine: {
      enabler: slot({
        id: "ind-discard-exile",
        label: "Self-exile setup",
        targetMechanic: "Exile own cards without Prosper trigger",
        linkedSpecField: "requiredFunctions:cast_from_exile",
        retrievalToken: "cast_from_exile",
        retrievalBucket: "CARD_ADVANTAGE",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Exile from hand or graveyard",
      }),
      payoff: slot({
        id: "ind-impulse-draw",
        label: "Impulse draw engine",
        targetMechanic: "Card advantage without commander",
        linkedSpecField: "requiredFunctions:card_draw",
        retrievalToken: "card_draw",
        retrievalBucket: "CARD_ADVANTAGE",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Draw cards",
      }),
    },
    bridges: [
      bridge({
        id: "harm-exile-advantage",
        label: "Cards that exile and replay cheaply",
        targetMechanic: "Exile synergy that generates Treasures and standalone value",
        linkedSpecField: "requiredFunctions:play_card_from_exile",
        retrievalToken: "play_card_from_exile",
        retrievalBucket: "CARD_ADVANTAGE",
        causalRole: "CONVERSION_PIECE",
        commanderJob: "Trigger Treasure on exile cast",
        independentJob: "Exile value engine",
        matchConstraints: ["requiredInputs:spell_cast_from_exile"],
        oracleEvidence: "Cast from exile",
      }),
    ],
    failureWithoutCommander: "End-step exile impulse and Treasure engine stop.",
    functionWithoutCommander: "Exile-matter and impulse draw packages continue.",
  },

  {
    caseId: "partner-thrasios-tymna",
    oracleSummary: "Thrasios {4} ramp/draw; Tymna combat damage draws.",
    commanderInputs: [
      slot({
        id: "dep-mana-thrasios",
        label: "Mana for Thrasios activations",
        targetMechanic: "Ramp to pay {4} repeatedly",
        linkedSpecField: "requiredInputs:thrasios_mana_activation",
        retrievalToken: "thrasios_mana_activation",
        retrievalBucket: "MANA_SUPPORT",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: ["requiredInputs:thrasios_mana_activation"],
        oracleEvidence: "Pay {4}",
      }),
      slot({
        id: "dep-combat-connect",
        label: "Combat connect for Tymna",
        targetMechanic: "Evasive attackers for Tymna draw",
        linkedSpecField: "requiredInputs:combat_damage_to_opponents",
        retrievalToken: "combat_damage_to_opponents",
        retrievalBucket: "PAYOFFS",
        causalRole: "TRIGGER_PROVIDER",
        matchConstraints: ["requiredInputs:combat_damage_to_opponents"],
        oracleEvidence: "dealt combat damage to a player",
      }),
    ],
    commanderOutputExploits: [
      slot({
        id: "dep-partner-draw",
        label: "Exploit partner card advantage",
        targetMechanic: "Payoffs for extra cards and lands",
        linkedSpecField: "requiredFunctions:ramp",
        retrievalToken: "ramp",
        retrievalBucket: "MANA_SUPPORT",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Draw a card / put land onto battlefield",
      }),
    ],
    independentEngine: {
      enabler: slot({
        id: "ind-midrange-creatures",
        label: "Standalone creature midrange",
        targetMechanic: "Efficient creatures without partner triggers",
        linkedSpecField: "requiredFunctions:combat_payoff",
        retrievalToken: "combat_payoff",
        retrievalBucket: "PAYOFFS",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Efficient threats",
      }),
      payoff: slot({
        id: "ind-card-advantage",
        label: "Non-combat card draw",
        targetMechanic: "Draw engines independent of Tymna",
        linkedSpecField: "requiredFunctions:card_draw",
        retrievalToken: "card_draw",
        retrievalBucket: "CARD_ADVANTAGE",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Draw cards",
      }),
    },
    bridges: [
      bridge({
        id: "harm-evasive-value",
        label: "Evasive creatures that draw and attack",
        targetMechanic: "Creatures good in combat and as card-advantage bodies",
        linkedSpecField: "requiredInputs:combat_damage_to_opponents",
        retrievalToken: "combat_damage_to_opponents",
        retrievalBucket: "PAYOFFS",
        causalRole: "CONVERSION_PIECE",
        commanderJob: "Trigger Tymna",
        independentJob: "Midrange board presence",
        matchConstraints: ["requiredInputs:combat_damage_to_opponents"],
        oracleEvidence: "Combat damage to player",
      }),
    ],
    failureWithoutCommander: "Partner ramp/draw engine stops — midrange loses primary card advantage.",
    functionWithoutCommander: "Creature midrange and standalone draw still apply pressure.",
  },

  {
    caseId: "stax-augustin",
    oracleSummary: "Your W/U spells cost less; opponents' spells cost more.",
    commanderInputs: [
      slot({
        id: "dep-cheap-wu-spells",
        label: "Cheap W/U spell density",
        targetMechanic: "Low-CMC spells exploiting cost reduction",
        linkedSpecField: "requiredFunctions:spell_cost_reduction",
        retrievalToken: "spell_cost_reduction",
        retrievalBucket: "MANA_SUPPORT",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "White spells you cast cost {1} less",
      }),
    ],
    commanderOutputExploits: [
      slot({
        id: "dep-tax-asymmetry",
        label: "Exploit tax asymmetry",
        targetMechanic: "Stax pieces amplified by Augustin tax",
        linkedSpecField: "requiredFunctions:opponent_spell_tax",
        retrievalToken: "opponent_spell_tax",
        retrievalBucket: "STRUCTURAL_SUPPORT",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Spells your opponents cast cost {1} more",
      }),
    ],
    independentEngine: {
      enabler: slot({
        id: "ind-stax-shell",
        label: "Standalone stax elements",
        targetMechanic: "Tax and restriction without Augustin",
        linkedSpecField: "requiredFunctions:opponent_spell_tax",
        retrievalToken: "opponent_spell_tax",
        retrievalBucket: "STRUCTURAL_SUPPORT",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Opponents cast cost more",
      }),
      payoff: slot({
        id: "ind-control-win",
        label: "Control finishers",
        targetMechanic: "Win through attrition without cost reduction",
        linkedSpecField: "requiredFunctions:combat_payoff",
        retrievalToken: "combat_payoff",
        retrievalBucket: "PAYOFFS",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Control finishers",
      }),
    },
    bridges: [
      bridge({
        id: "harm-tax-control-spells",
        label: "Control spells that tax and benefit from reduction",
        targetMechanic: "Interaction that slows opponents and is cheap with Augustin",
        linkedSpecField: "requiredFunctions:countermagic",
        retrievalToken: "countermagic",
        retrievalBucket: "INTERACTION",
        causalRole: "CONVERSION_PIECE",
        commanderJob: "Cheap with cost reduction",
        independentJob: "Standalone interaction",
        matchConstraints: [],
        oracleEvidence: "Counter / bounce spells",
      }),
    ],
    failureWithoutCommander: "Cost reduction and tax asymmetry disappear — stax plan weakens substantially.",
    functionWithoutCommander: "Tax and control elements still slow opponents.",
  },

  {
    caseId: "yuriko-ninja",
    oracleSummary: "Ninja combat damage reveals top; drains by CMC.",
    commanderInputs: [
      slot({
        id: "dep-ninjutsu-setup",
        label: "Ninjutsu and evasive setup",
        targetMechanic: "Unblockable attackers and ninjas",
        linkedSpecField: "requiredInputs:ninjutsu_combat_damage",
        retrievalToken: "ninjutsu_combat_damage",
        retrievalBucket: "PAYOFFS",
        causalRole: "TRIGGER_PROVIDER",
        matchConstraints: ["requiredInputs:ninjutsu_combat_damage"],
        oracleEvidence: "Whenever a Ninja you control deals combat damage to a player",
      }),
    ],
    commanderOutputExploits: [
      slot({
        id: "dep-high-cmc-top",
        label: "High-CMC top deck",
        targetMechanic: "Curate top for maximum drain",
        linkedSpecField: "outputsToExploit:top_of_library",
        retrievalToken: "top_of_library",
        retrievalBucket: "STRUCTURAL_SUPPORT",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: ["requiredInputs:ninjutsu_combat_damage"],
        oracleEvidence: "Reveal the top card of your library",
      }),
    ],
    independentEngine: {
      enabler: slot({
        id: "ind-evasive-threats",
        label: "Evasive creature shell",
        targetMechanic: "Flying/unblockable without Yuriko",
        linkedSpecField: "requiredFunctions:combat_payoff",
        retrievalToken: "combat_payoff",
        retrievalBucket: "PAYOFFS",
        causalRole: "ENGINE_ENABLER",
        matchConstraints: [],
        oracleEvidence: "Evasive creatures",
      }),
      payoff: slot({
        id: "ind-tempo-draw",
        label: "Tempo card advantage",
        targetMechanic: "Draw and bounce without ninja triggers",
        linkedSpecField: "requiredFunctions:card_draw",
        retrievalToken: "card_draw",
        retrievalBucket: "CARD_ADVANTAGE",
        causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT",
        matchConstraints: [],
        oracleEvidence: "Draw / bounce",
      }),
    },
    bridges: [
      bridge({
        id: "harm-ninja-tempo",
        label: "Ninjas with standalone tempo value",
        targetMechanic: "Ninjas good for Yuriko and as tempo threats",
        linkedSpecField: "requiredInputs:ninjutsu_combat_damage",
        retrievalToken: "ninjutsu_combat_damage",
        retrievalBucket: "PAYOFFS",
        causalRole: "CONVERSION_PIECE",
        commanderJob: "Trigger reveal/drain",
        independentJob: "Tempo pressure",
        matchConstraints: ["requiredInputs:ninjutsu_combat_damage"],
        oracleEvidence: "Ninja creatures",
      }),
    ],
    failureWithoutCommander: "Top-reveal drain chain stops — primary win condition gone.",
    functionWithoutCommander: "Evasive tempo and card draw still pressure.",
  },

  {
    caseId: "blindv5-01-partner-pair",
    oracleSummary: "Leonardo: token enters → counters; Reyhan: creature dies/with counters → move counters.",
    commanderInputs: [
      slot({ id: "dep-token-triggers", label: "Token generation for Leonardo", targetMechanic: "Create tokens to trigger Leonardo", linkedSpecField: "requiredInputs:token_enters", retrievalToken: "token_enters", retrievalBucket: "ENGINE_PIECES", causalRole: "TRIGGER_PROVIDER", matchConstraints: ["requiredInputs:token_enters"], oracleEvidence: "Whenever a token you control enters" }),
      slot({ id: "dep-counter-creatures", label: "Counter-bearing creatures for Reyhan", targetMechanic: "Creatures with counters that die or go to command zone", linkedSpecField: "requiredInputs:creature_dies_or_command_zone_with_counters", retrievalToken: "creature_dies_or_command_zone_with_counters", retrievalBucket: "ENGINE_PIECES", causalRole: "RESOURCE_PROVIDER", matchConstraints: ["requiredInputs:creature_dies_or_command_zone_with_counters"], oracleEvidence: "Whenever a creature you control dies or is put into the command zone" }),
    ],
    commanderOutputExploits: [slot({ id: "dep-counter-payoff", label: "Exploit moved counters", targetMechanic: "Payoffs for large creatures with counters", linkedSpecField: "requiredFunctions:counter_placement", retrievalToken: "counter_placement", retrievalBucket: "ENGINE_PIECES", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Put a +1/+1 counter" })],
    independentEngine: {
      enabler: slot({ id: "ind-token-engine", label: "Standalone token engine", targetMechanic: "Token generation without Leonardo", linkedSpecField: "requiredFunctions:token_generation", retrievalToken: "token_generation", retrievalBucket: "ENGINE_PIECES", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Create tokens" }),
      payoff: slot({ id: "ind-counter-payoff", label: "Counter synergies alone", targetMechanic: "Counter payoffs without Reyhan transfer", linkedSpecField: "requiredFunctions:counter_synergy", retrievalToken: "counter_synergy", retrievalBucket: "ENGINE_PIECES", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Counters matter" }),
    },
    bridges: [bridge({ id: "harm-token-counter", label: "Tokens that enter with counters", targetMechanic: "Tokens that trigger Leonardo and carry counters for Reyhan", linkedSpecField: "requiredInputs:token_enters", retrievalToken: "token_enters", retrievalBucket: "ENGINE_PIECES", causalRole: "CONVERSION_PIECE", commanderJob: "Leonardo trigger", independentJob: "Token/counter shell", matchConstraints: ["requiredInputs:token_enters"], oracleEvidence: "Token enters" })],
    failureWithoutCommander: "Partner counter transfer and token scaling stop.",
    functionWithoutCommander: "Token and counter midrange still develops board.",
  },

  {
    caseId: "blindv5-11-commander-background",
    oracleSummary: "Erinis attack-recurs lands; Clan Crafter sacrifices artifacts.",
    commanderInputs: [
      slot({ id: "dep-attack-triggers", label: "Enable Erinis attacks", targetMechanic: "Combat setup for land recursion", linkedSpecField: "requiredInputs:erinis_attacks", retrievalToken: "erinis_attacks", retrievalBucket: "MANA_SUPPORT", causalRole: "TRIGGER_PROVIDER", matchConstraints: ["requiredInputs:erinis_attacks"], oracleEvidence: "Whenever Erinis attacks" }),
      slot({ id: "dep-artifact-sacrifice", label: "Artifact sacrifice fodder/outlets", targetMechanic: "Sacrifice artifacts for Clan Crafter", linkedSpecField: "requiredInputs:artifact_sacrifice", retrievalToken: "artifact_sacrifice", retrievalBucket: "RESOURCE_CONSUMERS", causalRole: "ENGINE_ENABLER", matchConstraints: ["requiredInputs:artifact_sacrifice"], oracleEvidence: "Sacrifice an artifact" }),
    ],
    commanderOutputExploits: [slot({ id: "dep-land-recursion", label: "Exploit recurring lands", targetMechanic: "Payoffs for landfall and ramp", linkedSpecField: "requiredFunctions:land_ramp", retrievalToken: "land_ramp", retrievalBucket: "MANA_SUPPORT", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Return land from graveyard" })],
    independentEngine: {
      enabler: slot({ id: "ind-artifact-ramp", label: "Artifact ramp shell", targetMechanic: "Artifacts producing mana without Clan Crafter", linkedSpecField: "resourcesToConsume:artifacts", retrievalToken: "artifacts", retrievalBucket: "MANA_SUPPORT", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Artifact mana rocks" }),
      payoff: slot({ id: "ind-artifact-value", label: "Artifact value engine", targetMechanic: "Card draw from artifacts without sacrifice loop", linkedSpecField: "requiredFunctions:card_draw", retrievalToken: "card_draw", retrievalBucket: "CARD_ADVANTAGE", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Draw from artifacts" }),
    },
    bridges: [bridge({ id: "harm-sac-artifact-ramp", label: "Artifacts that ramp and sacrifice", targetMechanic: "Mana artifacts usable as sacrifice fodder", linkedSpecField: "requiredInputs:artifact_sacrifice", retrievalToken: "artifact_sacrifice", retrievalBucket: "RESOURCE_CONSUMERS", causalRole: "CONVERSION_PIECE", commanderJob: "Clan Crafter fuel", independentJob: "Ramp shell", matchConstraints: ["requiredInputs:artifact_sacrifice"], oracleEvidence: "Sacrifice an artifact" })],
    failureWithoutCommander: "Land recursion and artifact-sacrifice draw engine stop.",
    functionWithoutCommander: "Artifact ramp and value still develop.",
  },

  {
    caseId: "blindv5-19-narrow-single-engine",
    oracleSummary: "Dionus untaps and draws when tapped during your turn.",
    commanderInputs: [slot({ id: "dep-tap-abilities", label: "Tap abilities during your turn", targetMechanic: "Creatures/artifacts that tap for value", linkedSpecField: "requiredInputs:creature_tapped_during_your_turn", retrievalToken: "creature_tapped_during_your_turn", retrievalBucket: "ENABLERS", causalRole: "TRIGGER_PROVIDER", matchConstraints: ["requiredInputs:creature_tapped_during_your_turn"], oracleEvidence: "Whenever this creature becomes tapped during your turn" })],
    commanderOutputExploits: [slot({ id: "dep-draw-payoff", label: "Exploit extra draws", targetMechanic: "Payoffs for hand size and storm", linkedSpecField: "requiredFunctions:card_draw", retrievalToken: "card_draw", retrievalBucket: "CARD_ADVANTAGE", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Draw a card" })],
    independentEngine: {
      enabler: slot({ id: "ind-tap-engine", label: "Standalone tap engine", targetMechanic: "Untap/tap synergies without Dionus", linkedSpecField: "desiredFunctions:untap_support", retrievalToken: "untap_support", retrievalBucket: "ENABLERS", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Untap permanents" }),
      payoff: slot({ id: "ind-manual-value", label: "Manual activation value", targetMechanic: "Cards with repeatable activated abilities", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Activated abilities" }),
    },
    bridges: [bridge({ id: "harm-tap-draw", label: "Tap outlets that draw alone", targetMechanic: "Tap abilities strong with Dionus and alone", linkedSpecField: "requiredInputs:creature_tapped_during_your_turn", retrievalToken: "creature_tapped_during_your_turn", retrievalBucket: "ENABLERS", causalRole: "CONVERSION_PIECE", commanderJob: "Trigger Dionus", independentJob: "Tap value", matchConstraints: ["requiredInputs:creature_tapped_during_your_turn"], oracleEvidence: "Becomes tapped during your turn" })],
    failureWithoutCommander: "Self-untap draw engine stops.",
    functionWithoutCommander: "Tap/untap value loops continue.",
  },

  {
    caseId: "blindv5-22-broad-composite",
    oracleSummary: "Curie: combat damage draws; exiles creature → becomes copy.",
    commanderInputs: [
      slot({ id: "dep-combat-connect", label: "Combat damage connection", targetMechanic: "Evasion and power for Curie combat triggers", linkedSpecField: "requiredInputs:combat_damage_to_player", retrievalToken: "combat_damage_to_player", retrievalBucket: "PAYOFFS", causalRole: "TRIGGER_PROVIDER", matchConstraints: ["requiredInputs:combat_damage_to_player"], oracleEvidence: "Whenever Curie deals combat damage to a player" }),
      slot({ id: "dep-copy-targets", label: "Nontoken artifact creatures to copy", targetMechanic: "High-value copy targets for Curie exile ability", linkedSpecField: "requiredInputs:exiled_nontoken_artifact_creature", retrievalToken: "exiled_nontoken_artifact_creature", retrievalBucket: "ENGINE_PIECES", causalRole: "RESOURCE_PROVIDER", matchConstraints: ["requiredInputs:exiled_nontoken_artifact_creature"], oracleEvidence: "Exile target nontoken artifact or creature. Curie becomes a copy" }),
    ],
    commanderOutputExploits: [slot({ id: "dep-draw-payoff", label: "Exploit combat-draw", targetMechanic: "Payoffs scaling with power and card draw", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: ["requiredInputs:combat_damage_to_player"], oracleEvidence: "draw cards equal to her power" })],
    independentEngine: {
      enabler: slot({ id: "ind-artifact-creatures", label: "Artifact creature midrange", targetMechanic: "Artifact creatures as standalone threats", linkedSpecField: "requiredInputs:exiled_nontoken_artifact_creature", retrievalToken: "exiled_nontoken_artifact_creature", retrievalBucket: "ENGINE_PIECES", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Artifact creatures" }),
      payoff: slot({ id: "ind-combat-payoff", label: "Combat damage payoffs", targetMechanic: "Sneak attack and extra combat without Curie", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Combat damage" }),
    },
    bridges: [bridge({ id: "harm-copy-combat", label: "Artifact creatures that connect and copy well", targetMechanic: "Creatures worth copying that also attack effectively", linkedSpecField: "requiredInputs:exiled_nontoken_artifact_creature", retrievalToken: "exiled_nontoken_artifact_creature", retrievalBucket: "ENGINE_PIECES", causalRole: "CONVERSION_PIECE", commanderJob: "Copy target + combat", independentJob: "Midrange threats", matchConstraints: ["requiredInputs:exiled_nontoken_artifact_creature"], oracleEvidence: "Nontoken artifact creature" })],
    failureWithoutCommander: "Combat-draw and copy transformation stop.",
    functionWithoutCommander: "Artifact creature combat midrange continues.",
  },

  {
    caseId: "blindv5-23-triggered-engine",
    oracleSummary: "Elsha creates Soldiers on attack; combat-triggered engine.",
    commanderInputs: [slot({ id: "dep-attack-setup", label: "Combat attack enablers", targetMechanic: "Evasion and extra combats for Elsha attacks", linkedSpecField: "requiredInputs:combat_damage_to_player", retrievalToken: "combat_damage_to_player", retrievalBucket: "PAYOFFS", causalRole: "TRIGGER_PROVIDER", matchConstraints: ["requiredInputs:combat_damage_to_player"], oracleEvidence: "Whenever Elsha attacks" })],
    commanderOutputExploits: [slot({ id: "dep-soldier-payoff", label: "Exploit Soldier tokens", targetMechanic: "Anthems and token payoffs", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Create Soldier token" })],
    independentEngine: {
      enabler: slot({ id: "ind-combat-engine", label: "Standalone combat engine", targetMechanic: "Combat triggers without Elsha", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Combat triggers" }),
      payoff: slot({ id: "ind-token-payoff", label: "Generic token payoffs", targetMechanic: "Token doublers without Elsha soldiers", linkedSpecField: "requiredFunctions:token_generation", retrievalToken: "token_generation", retrievalBucket: "ENGINE_PIECES", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Token payoffs" }),
    },
    bridges: [bridge({ id: "harm-combat-token", label: "Combat cards that also make tokens", targetMechanic: "Attacking creates value with and without Elsha", linkedSpecField: "requiredInputs:combat_damage_to_player", retrievalToken: "combat_damage_to_player", retrievalBucket: "PAYOFFS", causalRole: "CONVERSION_PIECE", commanderJob: "Elsha attack triggers", independentJob: "Combat midrange", matchConstraints: ["requiredInputs:combat_damage_to_player"], oracleEvidence: "Attack triggers" })],
    failureWithoutCommander: "Soldier generation on attack stops.",
    functionWithoutCommander: "Combat and token midrange still attacks.",
  },

  {
    caseId: "blindv5-25-activated-engine",
    oracleSummary: "Daxos creates Spirit tokens when you cast enchantments.",
    commanderInputs: [slot({ id: "dep-enchantment-density", label: "Cheap enchantments", targetMechanic: "Enchantment spells to trigger Daxos", linkedSpecField: "requiredInputs:controller_enchantment_spell_cast", retrievalToken: "controller_enchantment_spell_cast", retrievalBucket: "ENGINE_PIECES", causalRole: "TRIGGER_PROVIDER", matchConstraints: ["requiredInputs:controller_enchantment_spell_cast"], oracleEvidence: "Whenever you cast an enchantment spell" })],
    commanderOutputExploits: [slot({ id: "dep-spirit-payoff", label: "Exploit Spirit tokens", targetMechanic: "Enchantress and token payoffs", linkedSpecField: "requiredFunctions:enchantment_recursion", retrievalToken: "enchantment_recursion", retrievalBucket: "RECURSION", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Spirit enchantment creature token" })],
    independentEngine: {
      enabler: slot({ id: "ind-enchantress", label: "Standalone enchantress", targetMechanic: "Enchantments that draw without Daxos", linkedSpecField: "requiredFunctions:enchantment_recursion", retrievalToken: "enchantment_recursion", retrievalBucket: "RECURSION", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Cast enchantment" }),
      payoff: slot({ id: "ind-constellation", label: "Constellation payoffs", targetMechanic: "Enchantments with ETB value alone", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Constellation" }),
    },
    bridges: [bridge({ id: "harm-enchant-spirit", label: "Enchantments that draw and make bodies", targetMechanic: "Enchantments strong alone and with Daxos Spirits", linkedSpecField: "requiredInputs:controller_enchantment_spell_cast", retrievalToken: "controller_enchantment_spell_cast", retrievalBucket: "ENGINE_PIECES", causalRole: "CONVERSION_PIECE", commanderJob: "Spirit tokens", independentJob: "Enchantress engine", matchConstraints: ["requiredInputs:controller_enchantment_spell_cast"], oracleEvidence: "Cast enchantment" })],
    failureWithoutCommander: "Spirit token generation on enchantment cast stops.",
    functionWithoutCommander: "Enchantress and constellation value continues.",
  },

  {
    caseId: "blindv5-26-activated-engine",
    oracleSummary: "Shaun & Rebecca: sacrifice artifact or Clue for value.",
    commanderInputs: [
      slot({ id: "dep-sacrifice-fodder", label: "Artifact and Clue fodder", targetMechanic: "Permanents to sacrifice", linkedSpecField: "requiredInputs:artifact_or_clue_sacrifice", retrievalToken: "artifact_or_clue_sacrifice", retrievalBucket: "RESOURCE_CONSUMERS", causalRole: "RESOURCE_PROVIDER", matchConstraints: ["requiredInputs:artifact_or_clue_sacrifice"], oracleEvidence: "Sacrifice an artifact or a Clue" }),
      slot({ id: "dep-sacrifice-outlet", label: "Sacrifice outlets", targetMechanic: "Repeat sacrifice activations", linkedSpecField: "requiredFunctions:sacrifice_outlet", retrievalToken: "sacrifice_outlet", retrievalBucket: "RESOURCE_CONSUMERS", causalRole: "ENGINE_ENABLER", matchConstraints: ["requiredInputs:artifact_or_clue_sacrifice"], oracleEvidence: "Sacrifice an artifact or a Clue" }),
    ],
    commanderOutputExploits: [slot({ id: "dep-sacrifice-value", label: "Exploit sacrifice triggers", targetMechanic: "Draw and counters from sacrifice", linkedSpecField: "requiredFunctions:card_draw", retrievalToken: "card_draw", retrievalBucket: "CARD_ADVANTAGE", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Sacrifice value" })],
    independentEngine: {
      enabler: slot({ id: "ind-clue-engine", label: "Clue investigation engine", targetMechanic: "Create and sacrifice Clues without commander", linkedSpecField: "requiredInputs:artifact_or_clue_sacrifice", retrievalToken: "artifact_or_clue_sacrifice", retrievalBucket: "CARD_ADVANTAGE", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Investigate" }),
      payoff: slot({ id: "ind-artifact-payoff", label: "Artifact synergies", targetMechanic: "Artifact value without Shaun loop", linkedSpecField: "resourcesToConsume:artifacts", retrievalToken: "artifacts", retrievalBucket: "RESOURCE_CONSUMERS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Artifact synergies" }),
    },
    bridges: [bridge({ id: "harm-clue-artifact", label: "Clues and artifacts that sacrifice for dual value", targetMechanic: "Fodder that fuels commander and standalone engines", linkedSpecField: "requiredInputs:artifact_or_clue_sacrifice", retrievalToken: "artifact_or_clue_sacrifice", retrievalBucket: "RESOURCE_CONSUMERS", causalRole: "CONVERSION_PIECE", commanderJob: "Shaun sacrifice", independentJob: "Clue/artifact shell", matchConstraints: ["requiredInputs:artifact_or_clue_sacrifice"], oracleEvidence: "Sacrifice artifact or Clue" })],
    failureWithoutCommander: "Primary sacrifice activation loop stops.",
    functionWithoutCommander: "Clue and artifact value engines continue.",
  },

  {
    caseId: "blindv5-29-static-restriction",
    oracleSummary: "Hua Tuo: {T} put creature from graveyard on top of library.",
    commanderInputs: [slot({ id: "dep-gy-targets", label: "Creature cards in graveyard", targetMechanic: "Targets for library-top recursion", linkedSpecField: "requiredInputs:creature_card_in_graveyard", retrievalToken: "creature_card_in_graveyard", retrievalBucket: "STATE_BUILDERS", causalRole: "RESOURCE_PROVIDER", matchConstraints: ["requiredInputs:creature_card_in_graveyard"], oracleEvidence: "target creature card from your graveyard" })],
    commanderOutputExploits: [slot({ id: "dep-top-deck-payoff", label: "Exploit recurring top card", targetMechanic: "Draw and cast from top after recursion", linkedSpecField: "requiredFunctions:card_draw", retrievalToken: "card_draw", retrievalBucket: "CARD_ADVANTAGE", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Put on top of your library" })],
    independentEngine: {
      enabler: slot({ id: "ind-self-mill", label: "Self-mill setup", targetMechanic: "Fill graveyard without Hua Tuo", linkedSpecField: "desiredFunctions:mill", retrievalToken: "mill", retrievalBucket: "STRUCTURAL_SUPPORT", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Mill yourself" }),
      payoff: slot({ id: "ind-reanimation", label: "Standalone reanimation", targetMechanic: "Return creatures without library-top loop", linkedSpecField: "requiredFunctions:reanimation", retrievalToken: "reanimation", retrievalBucket: "RECURSION", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Return from graveyard" }),
    },
    bridges: [bridge({ id: "harm-mill-top", label: "Mill that stocks graveyard and supports top-deck", targetMechanic: "Self-mill feeding both reanimation and top play", linkedSpecField: "requiredFunctions:graveyard_setup", retrievalToken: "graveyard_setup", retrievalBucket: "STATE_BUILDERS", causalRole: "CONVERSION_PIECE", commanderJob: "Targets for Hua Tuo", independentJob: "Graveyard engine", matchConstraints: ["requiredInputs:creature_card_in_graveyard"], oracleEvidence: "Creature in graveyard" })],
    failureWithoutCommander: "Library-top recursion loop stops.",
    functionWithoutCommander: "Self-mill reanimation still functions.",
  },

  {
    caseId: "blindv5-16-commander-background",
    oracleSummary: "Zellix mills on attack; Acolyte creates Dragon on Dragon death.",
    commanderInputs: [
      slot({ id: "dep-mill-enablers", label: "Mill enablers", targetMechanic: "Mill beyond Zellix attack", linkedSpecField: "requiredFunctions:mill_target_player", retrievalToken: "mill_target_player", retrievalBucket: "STRUCTURAL_SUPPORT", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Mill" }),
      slot({ id: "dep-dragon-fodder", label: "Dragon creatures", targetMechanic: "Dragons that die for Acolyte token", linkedSpecField: "requiredFunctions:token_generation", retrievalToken: "token_generation", retrievalBucket: "ENGINE_PIECES", causalRole: "RESOURCE_PROVIDER", matchConstraints: [], oracleEvidence: "Whenever a Dragon you control dies" }),
    ],
    commanderOutputExploits: [slot({ id: "dep-dragon-payoff", label: "Exploit Dragon tokens", targetMechanic: "Dragon tribal payoffs", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Dragon token" })],
    independentEngine: {
      enabler: slot({ id: "ind-mill-engine", label: "Standalone mill", targetMechanic: "Mill win without Zellix", linkedSpecField: "requiredFunctions:mill", retrievalToken: "mill", retrievalBucket: "STRUCTURAL_SUPPORT", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Mill opponent" }),
      payoff: slot({ id: "ind-dragon-midrange", label: "Dragon midrange", targetMechanic: "Dragons as standalone threats", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Dragon creatures" }),
    },
    bridges: [bridge({ id: "harm-mill-dragon", label: "Mill that finds Dragons and fuels death triggers", targetMechanic: "Mill supporting both plans", linkedSpecField: "requiredFunctions:mill_target_player", retrievalToken: "mill_target_player", retrievalBucket: "STRUCTURAL_SUPPORT", causalRole: "CONVERSION_PIECE", commanderJob: "Zellix mill", independentJob: "Dragon/mill shell", matchConstraints: [], oracleEvidence: "Mill" })],
    failureWithoutCommander: "Attack-mill and Dragon death token engine stop.",
    functionWithoutCommander: "Mill and Dragon midrange continue.",
  },

  {
    caseId: "blindv5-45-graveyard",
    oracleSummary: "Mishra grants unearth to artifacts in graveyard.",
    commanderInputs: [slot({ id: "dep-artifact-gy", label: "Artifacts in graveyard", targetMechanic: "Artifact cards to unearth", linkedSpecField: "requiredInputs:artifact_card_in_graveyard", retrievalToken: "artifact_card_in_graveyard", retrievalBucket: "RECURSION", causalRole: "RESOURCE_PROVIDER", matchConstraints: ["requiredInputs:artifact_card_in_graveyard"], oracleEvidence: "Each artifact card in your graveyard has unearth" })],
    commanderOutputExploits: [slot({ id: "dep-unearth-payoff", label: "Exploit repeated unearth", targetMechanic: "Artifact synergies with unearth", linkedSpecField: "requiredFunctions:unearth", retrievalToken: "unearth", retrievalBucket: "RECURSION", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: ["requiredInputs:artifact_card_in_graveyard"], oracleEvidence: "Unearth {2}" })],
    independentEngine: {
      enabler: slot({ id: "ind-artifact-discard", label: "Artifact discard/mill", targetMechanic: "Stock graveyard without Mishra", linkedSpecField: "requiredFunctions:graveyard_setup", retrievalToken: "graveyard_setup", retrievalBucket: "STATE_BUILDERS", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Discard/mill artifacts" }),
      payoff: slot({ id: "ind-artifact-recursion", label: "Non-unearth artifact recursion", targetMechanic: "Return artifacts without unearth ability", linkedSpecField: "requiredFunctions:recursion", retrievalToken: "recursion", retrievalBucket: "RECURSION", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Return artifact from graveyard" }),
    },
    bridges: [bridge({ id: "harm-artifact-gy", label: "Artifacts good in graveyard and as threats", targetMechanic: "Artifacts that mill in and unearth out", linkedSpecField: "requiredInputs:artifact_card_in_graveyard", retrievalToken: "artifact_card_in_graveyard", retrievalBucket: "RECURSION", causalRole: "CONVERSION_PIECE", commanderJob: "Unearth target", independentJob: "Artifact recursion", matchConstraints: ["requiredInputs:artifact_card_in_graveyard"], oracleEvidence: "Artifact in graveyard" })],
    failureWithoutCommander: "Graveyard unearth on all artifacts stops.",
    functionWithoutCommander: "Artifact recursion and graveyard value continues.",
  },

  {
    caseId: "blindv5-47-artifacts",
    oracleSummary: "Kain: combat damage → draw, Treasure, life loss.",
    commanderInputs: [slot({ id: "dep-combat-connect", label: "Combat connection", targetMechanic: "Evasive attackers for Kain triggers", linkedSpecField: "requiredInputs:combat_damage_to_player", retrievalToken: "combat_damage_to_player", retrievalBucket: "PAYOFFS", causalRole: "TRIGGER_PROVIDER", matchConstraints: ["requiredInputs:combat_damage_to_player"], oracleEvidence: "Whenever Kain deals combat damage to a player" })],
    commanderOutputExploits: [slot({ id: "dep-treasure-payoff", label: "Exploit Treasures", targetMechanic: "Payoffs for artifacts and Treasures", linkedSpecField: "outputsToExploit:treasure_tokens", retrievalToken: "treasure_tokens", retrievalBucket: "ENGINE_PIECES", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: ["requiredInputs:combat_damage_to_player"], oracleEvidence: "Create a Treasure token" })],
    independentEngine: {
      enabler: slot({ id: "ind-evasive-combat", label: "Evasive combat shell", targetMechanic: "Combat damage without Kain", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Combat damage" }),
      payoff: slot({ id: "ind-artifact-synergy", label: "Artifact/Treasure payoffs", targetMechanic: "Artifact value without Kain combat", linkedSpecField: "resourcesToConsume:artifacts", retrievalToken: "artifacts", retrievalBucket: "RESOURCE_CONSUMERS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Artifact synergies" }),
    },
    bridges: [bridge({ id: "harm-combat-artifact", label: "Combat artifacts that connect and synergize", targetMechanic: "Equipment/vehicles that attack and artifact-synergize", linkedSpecField: "requiredInputs:combat_damage_to_player", retrievalToken: "combat_damage_to_player", retrievalBucket: "PAYOFFS", causalRole: "CONVERSION_PIECE", commanderJob: "Kain combat triggers", independentJob: "Artifact combat", matchConstraints: ["requiredInputs:combat_damage_to_player"], oracleEvidence: "Combat damage" })],
    failureWithoutCommander: "Combat-draw/Treasure/life-loss chain stops.",
    functionWithoutCommander: "Evasive combat and artifact synergies continue.",
  },

  {
    caseId: "blindv5-50-enchantments",
    oracleSummary: "Terra mills enchantments to hand; Esper Terra copies enchantments/Sagas.",
    commanderInputs: [slot({ id: "dep-enchantment-mill", label: "Enchantment density and mill", targetMechanic: "Enchantments milled and cast", linkedSpecField: "requiredInputs:enchantment_in_graveyard_or_milled", retrievalToken: "enchantment_in_graveyard_or_milled", retrievalBucket: "RECURSION", causalRole: "TRIGGER_PROVIDER", matchConstraints: ["requiredInputs:enchantment_in_graveyard_or_milled"], oracleEvidence: "Mill five; put enchantment into hand" })],
    commanderOutputExploits: [slot({ id: "dep-saga-copy", label: "Exploit enchantment copies", targetMechanic: "Saga/enchantment token payoffs", linkedSpecField: "requiredFunctions:saga_token_copy", retrievalToken: "saga_token_copy", retrievalBucket: "ENGINE_PIECES", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Create token copy of enchantment or Saga" })],
    independentEngine: {
      enabler: slot({ id: "ind-enchantress", label: "Standalone enchantress", targetMechanic: "Enchantments that draw without Terra", linkedSpecField: "requiredFunctions:enchantment_recursion", retrievalToken: "enchantment_recursion", retrievalBucket: "RECURSION", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Cast enchantment" }),
      payoff: slot({ id: "ind-constellation", label: "Constellation payoffs", targetMechanic: "Enchantments with ETB value alone", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Constellation" }),
    },
    bridges: [bridge({ id: "harm-enchant-saga", label: "Enchantments/Sagas worth copying and casting", targetMechanic: "High-value enchantments for both plans", linkedSpecField: "requiredFunctions:enchantment_recursion", retrievalToken: "enchantment_recursion", retrievalBucket: "RECURSION", causalRole: "CONVERSION_PIECE", commanderJob: "Mill/recur/copy", independentJob: "Enchantress engine", matchConstraints: ["requiredInputs:enchantment_in_graveyard_or_milled"], oracleEvidence: "Enchantment" })],
    failureWithoutCommander: "Mill-to-hand and enchantment copy stop.",
    functionWithoutCommander: "Enchantress and constellation continue.",
  },

  {
    caseId: "blindv5-51-tokens",
    oracleSummary: "Orvar: inst/sorc targeting own permanent → token copy of target.",
    commanderInputs: [slot({ id: "dep-targeted-cantrips", label: "Targeted instants/sorceries", targetMechanic: "Cheap spells targeting own permanent", linkedSpecField: "requiredFunctions:targeted_cantrip", retrievalToken: "targeted_cantrip", retrievalBucket: "ENABLERS", causalRole: "ENGINE_ENABLER", matchConstraints: ["requiredInputs:controller_instant_or_sorcery_targets_own_permanent"], oracleEvidence: "cast an instant or sorcery spell, if it targets one or more other permanents you control" })],
    commanderOutputExploits: [slot({ id: "dep-copy-payoff", label: "Exploit token copies", targetMechanic: "Payoffs for duplicated permanents", linkedSpecField: "outputsToExploit:commander_token_copy", retrievalToken: "commander_token_copy", retrievalBucket: "ENGINE_PIECES", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: ["requiredInputs:controller_instant_or_sorcery_targets_own_permanent"], oracleEvidence: "create a token that's a copy" })],
    independentEngine: {
      enabler: slot({ id: "ind-spell-engine", label: "Standalone spells-matter", targetMechanic: "Instants/sorceries with value without Orvar", linkedSpecField: "requiredInputs:controller_instant_or_sorcery_targets_own_permanent", retrievalToken: "controller_instant_or_sorcery_targets_own_permanent", retrievalBucket: "ENABLERS", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Cast instant or sorcery" }),
      payoff: slot({ id: "ind-tempo", label: "Tempo/card draw", targetMechanic: "Spells-matter payoffs without copying", linkedSpecField: "requiredFunctions:card_draw", retrievalToken: "card_draw", retrievalBucket: "CARD_ADVANTAGE", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Draw / bounce" }),
    },
    bridges: [bridge({ id: "harm-copy-spell", label: "Permanents worth copying that also spell-synergize", targetMechanic: "Targets that are strong alone and as copies", linkedSpecField: "requiredFunctions:targeted_cantrip", retrievalToken: "targeted_cantrip", retrievalBucket: "ENABLERS", causalRole: "CONVERSION_PIECE", commanderJob: "Orvar copy trigger", independentJob: "Spells-matter tempo", matchConstraints: ["requiredInputs:controller_instant_or_sorcery_targets_own_permanent"], oracleEvidence: "Targets own permanent" })],
    failureWithoutCommander: "Token copy on targeted spell stops.",
    functionWithoutCommander: "Spells-matter tempo continues.",
  },

  {
    caseId: "blindv5-53-counters",
    oracleSummary: "Nita connive/counters with exile and opponent GY instant/sorcery.",
    commanderInputs: [
      slot({ id: "dep-counter-density", label: "Counter placement", targetMechanic: "Counters for connive synergies", linkedSpecField: "requiredFunctions:counter_synergy", retrievalToken: "counter_synergy", retrievalBucket: "ENGINE_PIECES", causalRole: "RESOURCE_PROVIDER", matchConstraints: [], oracleEvidence: "Connive / counters" }),
      slot({ id: "dep-exile-play", label: "Play from exile", targetMechanic: "Extend exile-play beyond Nita", linkedSpecField: "requiredFunctions:cast_from_exile", retrievalToken: "cast_from_exile", retrievalBucket: "CARD_ADVANTAGE", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Cast from exile" }),
    ],
    commanderOutputExploits: [slot({ id: "dep-opponent-gy", label: "Opponent GY instant/sorcery", targetMechanic: "Exploit opponent graveyard availability", linkedSpecField: "requiredFunctions:opponent_graveyard_instant_sorcery_availability", retrievalToken: "opponent_graveyard_instant_sorcery_availability", retrievalBucket: "STRUCTURAL_SUPPORT", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Instant or sorcery in opponent graveyard" })],
    independentEngine: {
      enabler: slot({ id: "ind-connive", label: "Standalone connive", targetMechanic: "Connive without Nita", linkedSpecField: "desiredFunctions:connive", retrievalToken: "connive", retrievalBucket: "CARD_ADVANTAGE", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Connive" }),
      payoff: slot({ id: "ind-counter-payoff", label: "Counter payoffs alone", targetMechanic: "Proliferate and counter synergies", linkedSpecField: "requiredFunctions:counter_synergy", retrievalToken: "counter_synergy", retrievalBucket: "ENGINE_PIECES", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Counters matter" }),
    },
    bridges: [bridge({ id: "harm-connive-exile", label: "Connive creatures that also exile-play", targetMechanic: "Creatures feeding counters and exile", linkedSpecField: "requiredFunctions:cast_from_exile", retrievalToken: "cast_from_exile", retrievalBucket: "CARD_ADVANTAGE", causalRole: "CONVERSION_PIECE", commanderJob: "Nita connive/exile", independentJob: "Connive shell", matchConstraints: [], oracleEvidence: "Connive and exile" })],
    failureWithoutCommander: "Connive/exile/opponent-GY engine stops.",
    functionWithoutCommander: "Connive and counter synergies continue.",
  },

  {
    caseId: "blindv5-42-resource-conversion",
    oracleSummary: "Cyclonus connives/converts on combat damage.",
    commanderInputs: [slot({ id: "dep-combat-enablers", label: "Combat damage enablers", targetMechanic: "Connect combat to trigger Cyclonus", linkedSpecField: "requiredInputs:combat_damage_to_player", retrievalToken: "combat_damage_to_player", retrievalBucket: "PAYOFFS", causalRole: "TRIGGER_PROVIDER", matchConstraints: ["requiredInputs:combat_damage_to_player"], oracleEvidence: "Combat damage" })],
    commanderOutputExploits: [slot({ id: "dep-connive-payoff", label: "Exploit connive value", targetMechanic: "Payoffs for connive and discard", linkedSpecField: "desiredFunctions:connive", retrievalToken: "connive", retrievalBucket: "CARD_ADVANTAGE", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Connive" })],
    independentEngine: {
      enabler: slot({ id: "ind-connive-engine", label: "Standalone connive engine", targetMechanic: "Connive without Cyclonus combat", linkedSpecField: "desiredFunctions:connive", retrievalToken: "connive", retrievalBucket: "CARD_ADVANTAGE", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Connive" }),
      payoff: slot({ id: "ind-discard-payoff", label: "Discard/value payoffs", targetMechanic: "Madness and discard synergies", linkedSpecField: "requiredFunctions:cast_from_exile", retrievalToken: "cast_from_exile", retrievalBucket: "CARD_ADVANTAGE", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Discard payoffs" }),
    },
    bridges: [bridge({ id: "harm-connive-combat", label: "Creatures that connive and combat", targetMechanic: "Combat connive creatures bridging plans", linkedSpecField: "requiredInputs:combat_damage_to_player", retrievalToken: "combat_damage_to_player", retrievalBucket: "PAYOFFS", causalRole: "CONVERSION_PIECE", commanderJob: "Cyclonus combat connive", independentJob: "Connive/value", matchConstraints: ["requiredInputs:combat_damage_to_player"], oracleEvidence: "Connive on combat" })],
    failureWithoutCommander: "Combat-triggered connive/conversion stops.",
    functionWithoutCommander: "Connive and discard value continues.",
  },

  {
    caseId: "blindv5-44-unusual-zones",
    oracleSummary: "Chainer reanimates from graveyard for life; Nightmare synergy.",
    commanderInputs: [slot({ id: "dep-gy-setup", label: "Graveyard population", targetMechanic: "Creature cards for Chainer reanimation", linkedSpecField: "requiredFunctions:graveyard_setup", retrievalToken: "graveyard_setup", retrievalBucket: "STATE_BUILDERS", causalRole: "RESOURCE_PROVIDER", matchConstraints: ["requiredInputs:creature_card_in_graveyard"], oracleEvidence: "Put target creature card from a graveyard onto the battlefield" })],
    commanderOutputExploits: [slot({ id: "dep-nightmare-payoff", label: "Nightmare tribal payoffs", targetMechanic: "Payoffs for reanimated Nightmares", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Nightmare in addition to its other creature types" })],
    independentEngine: {
      enabler: slot({ id: "ind-self-mill", label: "Self-mill setup", targetMechanic: "Fill graveyard without Chainer", linkedSpecField: "desiredFunctions:mill", retrievalToken: "mill", retrievalBucket: "STRUCTURAL_SUPPORT", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Mill" }),
      payoff: slot({ id: "ind-reanimation", label: "Non-Chainer reanimation", targetMechanic: "Reanimate without life payment", linkedSpecField: "requiredFunctions:reanimation", retrievalToken: "reanimation", retrievalBucket: "RECURSION", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Return from graveyard" }),
    },
    bridges: [bridge({ id: "harm-gy-recursion", label: "Creatures good in graveyard and as threats", targetMechanic: "Fodder that reanimates well alone and via Chainer", linkedSpecField: "requiredFunctions:graveyard_setup", retrievalToken: "graveyard_setup", retrievalBucket: "STATE_BUILDERS", causalRole: "CONVERSION_PIECE", commanderJob: "Chainer targets", independentJob: "Graveyard engine", matchConstraints: ["requiredInputs:creature_card_in_graveyard"], oracleEvidence: "Creature in graveyard" })],
    failureWithoutCommander: "Repeat reanimation for life and Nightmare typing stops.",
    functionWithoutCommander: "Self-mill reanimation continues.",
  },

  {
    caseId: "blindv5-59-tutor-toolbox",
    oracleSummary: "Earth King: power 4+ attack searches lands; Bear on ETB.",
    commanderInputs: [slot({ id: "dep-power4-attackers", label: "Power 4+ attackers", targetMechanic: "Creatures that trigger land search on attack", linkedSpecField: "requiredInputs:power4_creature_attack", retrievalToken: "power4_creature_attack", retrievalBucket: "PAYOFFS", causalRole: "TRIGGER_PROVIDER", matchConstraints: ["requiredInputs:power4_creature_attack"], oracleEvidence: "Whenever a creature you control with power 4 or greater attacks" })],
    commanderOutputExploits: [slot({ id: "dep-land-ramp-payoff", label: "Exploit extra lands", targetMechanic: "Landfall and big mana payoffs", linkedSpecField: "outputsToExploit:commander_land_ramp", retrievalToken: "land_ramp", retrievalBucket: "MANA_SUPPORT", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: ["requiredInputs:power4_creature_attack"], oracleEvidence: "Search your library for up to two basic land cards" })],
    independentEngine: {
      enabler: slot({ id: "ind-midrange-ramp", label: "Standalone land ramp", targetMechanic: "Ramp without Earth King attack trigger", linkedSpecField: "requiredFunctions:land_ramp", retrievalToken: "land_ramp", retrievalBucket: "MANA_SUPPORT", causalRole: "ENGINE_ENABLER", matchConstraints: [], oracleEvidence: "Search for land" }),
      payoff: slot({ id: "ind-big-creatures", label: "Big creature midrange", targetMechanic: "Powerful creatures without land search", linkedSpecField: "requiredFunctions:combat_payoff", retrievalToken: "combat_payoff", retrievalBucket: "PAYOFFS", causalRole: "PAYOFF_FOR_COMMANDER_OUTPUT", matchConstraints: [], oracleEvidence: "Large creatures" }),
    },
    bridges: [bridge({ id: "harm-power4-ramp", label: "Power 4+ creatures that ramp and attack", targetMechanic: "Creatures triggering Earth King and standing alone", linkedSpecField: "requiredInputs:power4_creature_attack", retrievalToken: "power4_creature_attack", retrievalBucket: "PAYOFFS", causalRole: "CONVERSION_PIECE", commanderJob: "Land search on attack", independentJob: "Midrange ramp", matchConstraints: ["requiredInputs:power4_creature_attack"], oracleEvidence: "Power 4 or greater attacks" })],
    failureWithoutCommander: "Attack-triggered land search and Bear ETB stop.",
    functionWithoutCommander: "Land ramp into big creatures continues.",
  },
];

export function getCommanderMechanism(caseId: string): CommanderMechanismEntry | undefined {
  return COMMANDER_MECHANISM_CATALOG.find((e) => e.caseId === caseId);
}

export function getAllCommanderMechanisms(): CommanderMechanismEntry[] {
  return COMMANDER_MECHANISM_CATALOG;
}
