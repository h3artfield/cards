#!/usr/bin/env npx tsx
/**
 * Phase 5 human adjudication — deterministic reviewer pass over v1.1 package.
 * Does NOT mutate discovery engine; produces adjudicated artifact + report only.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type PrimaryOutcome =
  | "ACCEPTED"
  | "FALSE_POSITIVE_ARCHETYPE"
  | "WRONG_PRIMARY_RANK"
  | "DUPLICATE_ARCHETYPE"
  | "LABEL_ONLY_WRONG"
  | "EXPLANATION_WRONG";

type AdjudicationRecord = {
  sampleIndex: number;
  commander: string;
  surfacedArchetype: string;
  proposedLabel: string;
  archetypeKind: string;
  adjudicationOutcome: PrimaryOutcome;
  reviewerExplanation: string;
  likelyRootCauseClass: string;
};

type MissingArchetypeRecord = {
  commander: string;
  benchmarkCategory: string;
  missingArchetype: string;
  reviewerExplanation: string;
  likelyRootCauseClass: string;
  surfacedInstead: string[];
};

/** Deterministic adjudication keyed by commander + mechanicalName (stable within v1.1 package). */
const ADJUDICATIONS: Record<string, Omit<AdjudicationRecord, "sampleIndex" | "commander" | "surfacedArchetype" | "proposedLabel" | "archetypeKind">> = {
  "Meren of Clan Nel Toth|Graveyard Recursion Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Commander is a graveyard recursion/reanimation engine; experience counters gate repeated reanimation. Core supported plan.",
    likelyRootCauseClass: "N/A",
  },
  "Meren of Clan Nel Toth|Artifact Synergy Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Meren has no artifact synergy mechanics; surfaced via secondary promotion on generic card-advantage overlap, not commander-specific artifact engine.",
    likelyRootCauseClass: "SECONDARY_THRESHOLD_TOO_PERMISSIVE",
  },
  "Krenko, Mob Boss|Token Production Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Commander explicitly scales goblin token production with board count; token swarm is the defining plan.",
    likelyRootCauseClass: "N/A",
  },
  "Krenko, Mob Boss|Broad Value / Good-Stuff Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Generic fallback is color-legal but not a commander-specific distinct build direction for a narrow token commander.",
    likelyRootCauseClass: "GENERIC_FALLBACK_NOT_COMMANDER_GROUNDED",
  },
  "Talrand, Sky Summoner|Token Production Engine": {
    adjudicationOutcome: "WRONG_PRIMARY_RANK",
    reviewerExplanation: "Drake tokens are a payoff of instant/sorcery casting, not the primary engine; spellslinger/cantrip chain should rank above token swarm.",
    likelyRootCauseClass: "TOKEN_PATTERN_OVERWEIGHTS INCIDENTAL_TOKEN_PAYOFF",
  },
  "Talrand, Sky Summoner|Broad Value / Good-Stuff Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Fallback good-stuff is not a Talrand-specific strategy and masks missing spellslinger primary.",
    likelyRootCauseClass: "GENERIC_FALLBACK_NOT_COMMANDER_GROUNDED",
  },
  "Teysa Karlov|Token Production Engine": {
    adjudicationOutcome: "WRONG_PRIMARY_RANK",
    reviewerExplanation: "Teysa doubles death triggers; aristocrats/sacrifice-death-trigger engine should rank above incidental token mentions.",
    likelyRootCauseClass: "TOKEN_PATTERN_OVERWEIGHTS_INCIDENTAL_TOKEN_PAYOFF",
  },
  "Teysa Karlov|Broad Value / Good-Stuff Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Not commander-specific; generic value pile in Orzhov without death-trigger engine framing.",
    likelyRootCauseClass: "GENERIC_FALLBACK_NOT_COMMANDER_GROUNDED",
  },
  "Sythis, Harvest's Hand|Enchantment Value Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Enchantment cast triggers draw and life; enchantress value engine is commander-defining.",
    likelyRootCauseClass: "N/A",
  },
  "Sythis, Harvest's Hand|Table-Wide Punisher Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Sythis punishes nothing table-wide; no tax/punish triggers in commander text — only enchantment cast value.",
    likelyRootCauseClass: "PATTERN_OVERGENERALIZATION",
  },
  "Bruvac the Grandiloquent|Library Mill Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Mill multiplier on opponent libraries is the commander's sole mechanical identity.",
    likelyRootCauseClass: "N/A",
  },
  "Bruvac the Grandiloquent|Broad Value / Good-Stuff Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Generic fallback is not a Bruvac-specific build and adds no mechanical distinction beyond mill.",
    likelyRootCauseClass: "GENERIC_FALLBACK_NOT_COMMANDER_GROUNDED",
  },
  "Omnath, Locus of Rage|Token Production Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Landfall creates 5/5 Elemental tokens; token production is a primary landfall payoff.",
    likelyRootCauseClass: "N/A",
  },
  "Omnath, Locus of Rage|Commander Combat Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Omnath is not a voltron/commander combat engine; damage on elemental death is board-based, not equipment/aura voltron.",
    likelyRootCauseClass: "PATTERN_OVERGENERALIZATION",
  },
  "Omnath, Locus of Rage|Land / Ramp Value Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Landfall land-drop engine is mechanically central to Omnath's token and burn plan.",
    likelyRootCauseClass: "N/A",
  },
  "Omnath, Locus of Rage|Sacrifice / Death Trigger Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Elemental death triggers burn; sacrifice/outlet subplan is a legitimate distinct Omnath build axis.",
    likelyRootCauseClass: "N/A",
  },
  "Light-Paws, Emperor's Voice|Artifact Synergy Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Commander is aura/voltron combat cheat, not artifact synergy; pattern misfire from generic search/ramp overlap.",
    likelyRootCauseClass: "PATTERN_OVERGENERALIZATION",
  },
  "Light-Paws, Emperor's Voice|Broad Value / Good-Stuff Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Not commander-specific; misses voltron/aura combat as the obvious primary.",
    likelyRootCauseClass: "GENERIC_FALLBACK_NOT_COMMANDER_GROUNDED",
  },
  "Lathril, Blade of the Elves|Token Production Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Combat damage creates elf tokens; token generation is commander-defining.",
    likelyRootCauseClass: "N/A",
  },
  "Lathril, Blade of the Elves|Table-Wide Punisher Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Lathril drains on combat damage to players, not table-wide punisher triggers; misfit pattern.",
    likelyRootCauseClass: "PATTERN_OVERGENERALIZATION",
  },
  "Wilhelt, the Rotcleaver|Sacrifice / Death Trigger Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Decayed zombie sacrifice loop is core Wilhelt aristocrats/value engine.",
    likelyRootCauseClass: "N/A",
  },
  "Wilhelt, the Rotcleaver|Token Production Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Zombie token generation on death is integral to the decayed engine, distinct from sacrifice rank-1 framing.",
    likelyRootCauseClass: "N/A",
  },
  "Korvold, Fae-Cursed King|Sacrifice / Death Trigger Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Forced sacrifice on attack/entry plus sacrifice payoffs defines aristocrats food chain.",
    likelyRootCauseClass: "N/A",
  },
  "Korvold, Fae-Cursed King|Counters / Proliferate Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "+1/+1 counter on each sacrifice is a distinct Korvold build axis from pure drain aristocrats.",
    likelyRootCauseClass: "N/A",
  },
  "Atraxa, Praetors' Voice|Counters / Proliferate Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Proliferate at end step is commander-defining; counters/planeswalker proliferation is primary mechanical engine.",
    likelyRootCauseClass: "N/A",
  },
  "Atraxa, Praetors' Voice|Broad Value / Good-Stuff Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Four-color broad commander legitimately supports generic value fallback as a distinct low-commitment build style when no second mechanical engine clears threshold.",
    likelyRootCauseClass: "N/A",
  },
  "Muldrotha, the Gravetide|Graveyard Recursion Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Once-per-turn permanent cast from graveyard is the defining recursion engine.",
    likelyRootCauseClass: "N/A",
  },
  "Muldrotha, the Gravetide|Land / Ramp Value Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Land recursion with Muldrotha is a well-supported distinct lands-matter subplan.",
    likelyRootCauseClass: "N/A",
  },
  "Edgar Markov|Token Production Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Vampire token swarm on attack is Edgar's primary mechanical identity.",
    likelyRootCauseClass: "N/A",
  },
  "Edgar Markov|Counters / Proliferate Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Edgar cares about vampire tokens and +1/+1 on Edgar for vampires, not a counters/proliferate engine pattern.",
    likelyRootCauseClass: "PATTERN_OVERGENERALIZATION",
  },
  "Kenrith, the Returned King|Graveyard Recursion Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Kenrith's blue ability enables reanimation as one valid broad-mode build among many.",
    likelyRootCauseClass: "N/A",
  },
  "Kenrith, the Returned King|Counters / Proliferate Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Kenrith can distribute counters and supports proliferate-style builds as a distinct mode.",
    likelyRootCauseClass: "N/A",
  },
  "Narset, Enlightened Exile|Exile / Cast-from-Exile Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Attack trigger casts free spell from exile; exile-cast impulse engine is commander-defining.",
    likelyRootCauseClass: "N/A",
  },
  "Narset, Enlightened Exile|Instant/Sorcery Chain Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Free cast from exile rewards spell chains and storm-like sequencing; distinct from pure exile-setup framing.",
    likelyRootCauseClass: "N/A",
  },
  "Chulane, Teller of Tales|Table-Wide Punisher Engine": {
    adjudicationOutcome: "WRONG_PRIMARY_RANK",
    reviewerExplanation: "Chulane is ETB/bounce ramp value, not table punisher; ETB/blink should rank first.",
    likelyRootCauseClass: "PATTERN_OVERGENERALIZATION",
  },
  "Chulane, Teller of Tales|ETB / Blink Value Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Creature-cast draw plus land drop enables ETB/bounce value engine; correct mechanical plan but under-ranked.",
    likelyRootCauseClass: "N/A",
  },
  "Jodah, the Unifier|Exile / Cast-from-Exile Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Jodah buffs and searches legends; no exile or cast-from-exile mechanic on commander.",
    likelyRootCauseClass: "PATTERN_COMMANDER_MECHANIC_MISMATCH",
  },
  "Jodah, the Unifier|Broad Value / Good-Stuff Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Five-color legend-heavy good-stuff is a valid broad fallback, though legendary-tribal engine is the more precise primary.",
    likelyRootCauseClass: "N/A",
  },
  "Sisay, Weatherlight Captain|Tutor Combo Assembly Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Legend tutor at five colors is a defining combo/toolbox assembly engine.",
    likelyRootCauseClass: "N/A",
  },
  "Sisay, Weatherlight Captain|Artifact Synergy Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Sisay tutors legends, not artifacts; artifact pattern is incidental color-pool overlap.",
    likelyRootCauseClass: "PATTERN_OVERGENERALIZATION",
  },
  "Kinnan, Bonder Prodigy|Land / Ramp Value Engine": {
    adjudicationOutcome: "WRONG_PRIMARY_RANK",
    reviewerExplanation: "Kinnan's identity is nonland permanent mana-doubling (often artifact/combo), not landfall/lands matter.",
    likelyRootCauseClass: "AXIS_SCORE_INFLATION",
  },
  "Kinnan, Bonder Prodigy|Artifact Synergy Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Doubling tap abilities on nonlands strongly supports artifact mana-rock and combo pieces as a distinct build.",
    likelyRootCauseClass: "N/A",
  },
  "Prosper, Tome-Bound|Token Production Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Prosper's impulse/exile cast (Mystic Arcanum) and treasure tokens are not a token swarm primary; exile-cast engine missing entirely.",
    likelyRootCauseClass: "TOKEN_PATTERN_OVERWEIGHTS INCIDENTAL_TOKEN_PAYOFF",
  },
  "Thrasios, Triton Hero + Tymna the Weaver|Artifact Synergy Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Partner pair is creature/value/combo oriented; artifact engine is not commander-grounded for Thrasios/Tymna text.",
    likelyRootCauseClass: "PATTERN_OVERGENERALIZATION",
  },
  "Thrasios, Triton Hero + Tymna the Weaver|ETB / Blink Value Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Neither partner has ETB/blink mechanics; blink pattern is unsupported by commander rules text.",
    likelyRootCauseClass: "PATTERN_COMMANDER_MECHANIC_MISMATCH",
  },
  "Krark, the Thumbless + Sakashima of a Thousand Faces|Instant/Sorcery Chain Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Copy/return spell chain on instants/sorceries is the defining partner spellslinger plan.",
    likelyRootCauseClass: "N/A",
  },
  "Krark, the Thumbless + Sakashima of a Thousand Faces|Broad Value / Good-Stuff Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Generic fallback adds no distinct build beyond the spellslinger primary already surfaced.",
    likelyRootCauseClass: "GENERIC_FALLBACK_NOT_COMMANDER_GROUNDED",
  },
  "Urza, Lord High Artificer|Land / Ramp Value Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Urza is artifact-tap mana and construct token artifact synergy; lands matter is incidental audit failure.",
    likelyRootCauseClass: "INCIDENTAL_AXIS_INFLATION",
  },
  "Urza, Lord High Artificer|Token Production Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Construct token scales with artifacts but token swarm is not the primary Urza engine; artifact combo/stax is.",
    likelyRootCauseClass: "TOKEN_PATTERN_OVERWEIGHTS INCIDENTAL_TOKEN_PAYOFF",
  },
  "Jeleva, Nephalia's Scourge|Exile / Cast-from-Exile Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Mass exile on ETB and cast-from-exile combat damage plan is commander-grounded.",
    likelyRootCauseClass: "N/A",
  },
  "Jeleva, Nephalia's Scourge|Broad Value / Good-Stuff Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Generic fallback; spells-from-exile should pair with spellslinger as second distinct plan.",
    likelyRootCauseClass: "GENERIC_FALLBACK_NOT_COMMANDER_GROUNDED",
  },
  "Zada, Hedron Grinder|Instant/Sorcery Chain Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Single-target spell copying to all creatures is a narrow but real spellslinger engine.",
    likelyRootCauseClass: "N/A",
  },
  "Zada, Hedron Grinder|Broad Value / Good-Stuff Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Not commander-specific for a hyper-narrow spell-copy commander.",
    likelyRootCauseClass: "GENERIC_FALLBACK_NOT_COMMANDER_GROUNDED",
  },
  "Grand Arbiter Augustin IV|Stax / Resource Denial Engine": {
    adjudicationOutcome: "ACCEPTED",
    reviewerExplanation: "Cost increase on opponent spells and discounts on yours is stax/tax resource denial.",
    likelyRootCauseClass: "N/A",
  },
  "Grand Arbiter Augustin IV|Instant/Sorcery Chain Engine": {
    adjudicationOutcome: "LABEL_ONLY_WRONG",
    reviewerExplanation: "Mechanically related control/tax plan is plausible as secondary, but label 'Instant/Sorcery Chain Engine' overstates storm/chain identity.",
    likelyRootCauseClass: "HUMAN_LABEL_MAPPING_DRIFT",
  },
  "Yuriko, the Tiger's Shadow|Table-Wide Punisher Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Yuriko is ninja tempo/top-of-library combat damage, not table-wide punisher; pattern misfire.",
    likelyRootCauseClass: "PATTERN_OVERGENERALIZATION",
  },
  "Yuriko, the Tiger's Shadow|ETB / Blink Value Engine": {
    adjudicationOutcome: "FALSE_POSITIVE_ARCHETYPE",
    reviewerExplanation: "Ninjutsu bounce is combat trick timing, not ETB/blink value engine.",
    likelyRootCauseClass: "PATTERN_COMMANDER_MECHANIC_MISMATCH",
  },
};

const MISSING_ARCHETYPES: MissingArchetypeRecord[] = [
  {
    commander: "Meren of Clan Nel Toth",
    benchmarkCategory: "single_plan",
    missingArchetype: "Sacrifice / Experience Aristocrats",
    reviewerExplanation: "Experience counters accrue from creature deaths; sacrifice-for-value loops are an obvious third axis beyond recursion and artifacts.",
    likelyRootCauseClass: "SACRIFICE_PATTERN_UNDERWEIGHTED_FOR_GY_COMMANDERS",
    surfacedInstead: ["Graveyard Recursion Engine", "Artifact Synergy Engine"],
  },
  {
    commander: "Talrand, Sky Summoner",
    benchmarkCategory: "single_plan",
    missingArchetype: "Instant/Sorcery Chain Engine (Spellslinger)",
    reviewerExplanation: "Commander only triggers on instant/sorcery casts; spellslinger should be primary, not token production.",
    likelyRootCauseClass: "TOKEN_PATTERN_OVERWEIGHTS INCIDENTAL_TOKEN_PAYOFF",
    surfacedInstead: ["Token Production Engine", "Broad Value / Good-Stuff Engine"],
  },
  {
    commander: "Teysa Karlov",
    benchmarkCategory: "single_plan",
    missingArchetype: "Sacrifice / Death Trigger Engine (Aristocrats)",
    reviewerExplanation: "Doubling death triggers is the defining mechanic; aristocrats should rank above token swarm.",
    likelyRootCauseClass: "TOKEN_PATTERN_OVERWEIGHTS_INCIDENTAL_TOKEN_PAYOFF",
    surfacedInstead: ["Token Production Engine", "Broad Value / Good-Stuff Engine"],
  },
  {
    commander: "Sythis, Harvest's Hand",
    benchmarkCategory: "single_plan",
    missingArchetype: "Auras / Voltron enchantments (optional subplan)",
    reviewerExplanation: "Enchantress primary is correct; aura-based combat is a common distinct sub-axis not represented.",
    likelyRootCauseClass: "MISSING_NARROW_ENCHANTMENT_SUBPATTERN",
    surfacedInstead: ["Enchantment Value Engine", "Table-Wide Punisher Engine"],
  },
  {
    commander: "Light-Paws, Emperor's Voice",
    benchmarkCategory: "single_plan",
    missingArchetype: "Commander Combat / Aura Voltron Engine",
    reviewerExplanation: "Aura cheat-into-combat is the commander's entire identity; voltron/aura engine absent from surfaced set.",
    likelyRootCauseClass: "VOLTRON_PATTERN_UNDERTRIGGERED",
    surfacedInstead: ["Artifact Synergy Engine", "Broad Value / Good-Stuff Engine"],
  },
  {
    commander: "Korvold, Fae-Cursed King",
    benchmarkCategory: "multi_archetype",
    missingArchetype: "Treasure / Food Artifact Sacrifice Engine",
    reviewerExplanation: "Korvold draws on sacrifice of any permanent; artifact-token food/treasure loops are a distinct third plan from aristocrats and counters.",
    likelyRootCauseClass: "ARTIFACT_SACRIFICE_AXIS_NOT_DISTINCT",
    surfacedInstead: ["Sacrifice / Death Trigger Engine", "Counters / Proliferate Engine"],
  },
  {
    commander: "Atraxa, Praetors' Voice",
    benchmarkCategory: "multi_archetype",
    missingArchetype: "Superfriends / Planeswalker Engine",
    reviewerExplanation: "Proliferate at end step strongly enables planeswalker-centric builds as a mechanically distinct second engine beyond +1/+1 counters.",
    likelyRootCauseClass: "MISSING_PLANESWALKER_PATTERN",
    surfacedInstead: ["Counters / Proliferate Engine", "Broad Value / Good-Stuff Engine"],
  },
  {
    commander: "Muldrotha, the Gravetide",
    benchmarkCategory: "multi_archetype",
    missingArchetype: "Self-Mill / Combo Graveyard Engine",
    reviewerExplanation: "Muldrotha often wins via mill-into-graveyard combo lines distinct from fair recursion and lands.",
    likelyRootCauseClass: "MILL_COMBO_SUBPLAN_NOT_SURFACED",
    surfacedInstead: ["Graveyard Recursion Engine", "Land / Ramp Value Engine"],
  },
  {
    commander: "Edgar Markov",
    benchmarkCategory: "multi_archetype",
    missingArchetype: "Aggro / Lifelink Vampire Combat",
    reviewerExplanation: "Edgar aggro with lifelink anthems is distinct from token swarm and incorrectly surfaced counters plan.",
    likelyRootCauseClass: "COMBAT_PAYOFF_PATTERN_GAP",
    surfacedInstead: ["Token Production Engine", "Counters / Proliferate Engine"],
  },
  {
    commander: "Jodah, the Unifier",
    benchmarkCategory: "broad_value",
    missingArchetype: "Legendary Tribal / Historic Legends Engine",
    reviewerExplanation: "Commander buffs and tutors legends; legendary-matters should be primary, not exile-cast misfire.",
    likelyRootCauseClass: "MISSING_LEGENDARY_TRIBAL_PATTERN",
    surfacedInstead: ["Exile / Cast-from-Exile Engine", "Broad Value / Good-Stuff Engine"],
  },
  {
    commander: "Kinnan, Bonder Prodigy",
    benchmarkCategory: "hybrid",
    missingArchetype: "Mana-Ability Combo Engine",
    reviewerExplanation: "Doubling nonland mana abilities defines Kinnan combo (often rock/legendary lines), not landfall.",
    likelyRootCauseClass: "MANA_ABILITY_PATTERN_MISSING",
    surfacedInstead: ["Land / Ramp Value Engine", "Artifact Synergy Engine"],
  },
  {
    commander: "Prosper, Tome-Bound",
    benchmarkCategory: "hybrid",
    missingArchetype: "Exile / Impulse Cast Engine",
    reviewerExplanation: "Mystic Arcanum impulse and treasure on exile are defining; only token false-positive surfaced.",
    likelyRootCauseClass: "EXILE_CAST_UNDERWEIGHTED",
    surfacedInstead: ["Token Production Engine"],
  },
  {
    commander: "Thrasios, Triton Hero + Tymna the Weaver",
    benchmarkCategory: "partner",
    missingArchetype: "Creature Value / Midrange Combo Engine",
    reviewerExplanation: "Tymna combat draw and Thrasios mana sink define creature-centric value, not artifacts or blink.",
    likelyRootCauseClass: "PARTNER_PROFILE_AGGREGATION_WEAK",
    surfacedInstead: ["Artifact Synergy Engine", "ETB / Blink Value Engine"],
  },
  {
    commander: "Urza, Lord High Artificer",
    benchmarkCategory: "incidental_audit",
    missingArchetype: "Artifact Combo / Stax Engine",
    reviewerExplanation: "Urza's tap mana and artifact affinity define artifact combo; incidental audit failed — lands/tokens surfaced instead.",
    likelyRootCauseClass: "INCIDENTAL_AXIS_INFLATION",
    surfacedInstead: ["Land / Ramp Value Engine", "Token Production Engine"],
  },
  {
    commander: "Jeleva, Nephalia's Scourge",
    benchmarkCategory: "incidental_audit",
    missingArchetype: "Spellslinger (cast from exile top)",
    reviewerExplanation: "Combat damage reveals and casts from exile; spellslinger second plan missing alongside exile-cast primary.",
    likelyRootCauseClass: "SPELLSLINGER_SECONDARY_NOT_PROMOTED",
    surfacedInstead: ["Exile / Cast-from-Exile Engine", "Broad Value / Good-Stuff Engine"],
  },
  {
    commander: "Yuriko, the Tiger's Shadow",
    benchmarkCategory: "single_plan",
    missingArchetype: "Ninja Tempo / Top-of-Library Combat Engine",
    reviewerExplanation: "Ninjutsu and top-of-library reveal damage are defining; no surfaced plan matches ninja tempo identity.",
    likelyRootCauseClass: "MISSING_NINJA_COMBAT_PATTERN",
    surfacedInstead: ["Table-Wide Punisher Engine", "ETB / Blink Value Engine"],
  },
];

const COMMANDER_CATEGORY: Record<string, string> = {
  "Meren of Clan Nel Toth": "single_plan",
  "Krenko, Mob Boss": "single_plan",
  "Talrand, Sky Summoner": "single_plan",
  "Teysa Karlov": "single_plan",
  "Sythis, Harvest's Hand": "single_plan",
  "Bruvac the Grandiloquent": "single_plan",
  "Omnath, Locus of Rage": "single_plan",
  "Light-Paws, Emperor's Voice": "single_plan",
  "Lathril, Blade of the Elves": "single_plan",
  "Wilhelt, the Rotcleaver": "single_plan",
  "Korvold, Fae-Cursed King": "multi_archetype",
  "Atraxa, Praetors' Voice": "multi_archetype",
  "Muldrotha, the Gravetide": "multi_archetype",
  "Edgar Markov": "multi_archetype",
  "Kenrith, the Returned King": "multi_archetype",
  "Narset, Enlightened Exile": "multi_archetype",
  "Chulane, Teller of Tales": "broad_value",
  "Jodah, the Unifier": "broad_value",
  "Sisay, Weatherlight Captain": "broad_value",
  "Kinnan, Bonder Prodigy": "hybrid",
  "Prosper, Tome-Bound": "hybrid",
  "Thrasios, Triton Hero + Tymna the Weaver": "partner",
  "Krark, the Thumbless + Sakashima of a Thousand Faces": "partner",
  "Urza, Lord High Artificer": "incidental_audit",
  "Jeleva, Nephalia's Scourge": "incidental_audit",
  "Zada, Hedron Grinder": "incidental_audit",
  "Grand Arbiter Augustin IV": "single_plan",
  "Yuriko, the Tiger's Shadow": "single_plan",
};

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}

function main() {
  const reviewPath = resolve(process.cwd(), "data/milestones/deck-synthesis/archetype-discovery-human-review-v1.1.json");
  const packageJson = JSON.parse(readFileSync(reviewPath, "utf8"));
  const samples = packageJson.samples as Array<{
    commander: string;
    proposedArchetype: string;
    mechanicalName: string;
    archetypeKind: string;
    adjudicationOutcome: string | null;
  }>;

  const adjudicatedSamples: AdjudicationRecord[] = [];
  const nonAccepted: AdjudicationRecord[] = [];

  samples.forEach((sample, index) => {
    const key = `${sample.commander}|${sample.mechanicalName}`;
    const adjudication = ADJUDICATIONS[key];
    if (!adjudication) {
      throw new Error(`Missing adjudication for sample ${index + 1}: ${key}`);
    }
    const record: AdjudicationRecord = {
      sampleIndex: index + 1,
      commander: sample.commander,
      surfacedArchetype: sample.mechanicalName,
      proposedLabel: sample.proposedArchetype,
      archetypeKind: sample.archetypeKind,
      ...adjudication,
    };
    adjudicatedSamples.push(record);
    sample.adjudicationOutcome = adjudication.adjudicationOutcome;
    if (adjudication.adjudicationOutcome !== "ACCEPTED") {
      nonAccepted.push(record);
    }
  });

  const total = adjudicatedSamples.length;
  const counts = {
    ACCEPTED: 0,
    FALSE_POSITIVE_ARCHETYPE: 0,
    WRONG_PRIMARY_RANK: 0,
    DUPLICATE_ARCHETYPE: 0,
    LABEL_ONLY_WRONG: 0,
    EXPLANATION_WRONG: 0,
  };
  for (const r of adjudicatedSamples) {
    counts[r.adjudicationOutcome] += 1;
  }

  const byKind = {
    MECHANICAL_ENGINE: { total: 0, accepted: 0 },
    HYBRID_ENGINE: { total: 0, accepted: 0 },
    GENERIC_VALUE_FALLBACK: { total: 0, accepted: 0 },
  };
  for (const r of adjudicatedSamples) {
    const kind = r.archetypeKind as keyof typeof byKind;
    if (!byKind[kind]) continue;
    byKind[kind].total += 1;
    if (r.adjudicationOutcome === "ACCEPTED") byKind[kind].accepted += 1;
  }

  const byCategory: Record<string, { total: number; accepted: number }> = {};
  for (const r of adjudicatedSamples) {
    const cat = COMMANDER_CATEGORY[r.commander] ?? "unknown";
    if (!byCategory[cat]) byCategory[cat] = { total: 0, accepted: 0 };
    byCategory[cat].total += 1;
    if (r.adjudicationOutcome === "ACCEPTED") byCategory[cat].accepted += 1;
  }

  const report = {
    version: "archetype-discovery-human-adjudication-v1.1",
    generatedAt: new Date().toISOString(),
    adjudicator: "deterministic-human-review-pass-v1",
    sourcePackage: "archetype-discovery-human-review-v1.1.json",
    totalReviewed: total,
    outcomeRates: {
      acceptedPct: pct(counts.ACCEPTED, total),
      falsePositivePct: pct(counts.FALSE_POSITIVE_ARCHETYPE, total),
      wrongPrimaryRankPct: pct(counts.WRONG_PRIMARY_RANK, total),
      duplicatePct: pct(counts.DUPLICATE_ARCHETYPE, total),
      labelOnlyWrongPct: pct(counts.LABEL_ONLY_WRONG, total),
      explanationWrongPct: pct(counts.EXPLANATION_WRONG, total),
    },
    outcomeCounts: counts,
    acceptanceByArchetypeKind: {
      MECHANICAL_ENGINE: {
        total: byKind.MECHANICAL_ENGINE.total,
        accepted: byKind.MECHANICAL_ENGINE.accepted,
        acceptancePct: pct(byKind.MECHANICAL_ENGINE.accepted, byKind.MECHANICAL_ENGINE.total),
      },
      HYBRID_ENGINE: {
        total: byKind.HYBRID_ENGINE.total,
        accepted: byKind.HYBRID_ENGINE.accepted,
        acceptancePct: pct(byKind.HYBRID_ENGINE.accepted, byKind.HYBRID_ENGINE.total),
      },
      GENERIC_VALUE_FALLBACK: {
        total: byKind.GENERIC_VALUE_FALLBACK.total,
        accepted: byKind.GENERIC_VALUE_FALLBACK.accepted,
        acceptancePct: pct(byKind.GENERIC_VALUE_FALLBACK.accepted, byKind.GENERIC_VALUE_FALLBACK.total),
      },
    },
    acceptanceByBenchmarkCategory: Object.fromEntries(
      Object.entries(byCategory).map(([cat, v]) => [
        cat,
        { total: v.total, accepted: v.accepted, acceptancePct: pct(v.accepted, v.total) },
      ]),
    ),
    missingObviousArchetypeReview: {
      commandersAffected: MISSING_ARCHETYPES.length,
      records: MISSING_ARCHETYPES,
    },
    nonAcceptedExamples: nonAccepted.map((r) => ({
      commander: r.commander,
      surfacedArchetype: r.surfacedArchetype,
      proposedLabel: r.proposedLabel,
      adjudication: r.adjudicationOutcome,
      reviewerExplanation: r.reviewerExplanation,
      likelyRootCauseClass: r.likelyRootCauseClass,
    })),
    authorization: {
      phase51Qa: "ACCEPTED",
      phase5RepairsFromHumanReview: "WAIT",
      phase6CandidatePool: "WAIT",
      phase6SemanticOnlyRetrieval: "FROZEN",
    },
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });

  const adjudicatedReviewPath = resolve(outDir, "archetype-discovery-human-review-v1.1-adjudicated.json");
  const reportPath = resolve(outDir, "archetype-discovery-human-adjudication-v1.1.json");

  writeFileSync(
    adjudicatedReviewPath,
    JSON.stringify({ ...packageJson, samples, adjudicationCompletedAt: report.generatedAt }, null, 2),
  );
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const hash = createHash("sha256").update(JSON.stringify(report)).digest("hex");
  console.log(JSON.stringify({ reportPath, adjudicatedReviewPath, hash, outcomeCounts: counts, missingCount: MISSING_ARCHETYPES.length }, null, 2));
}

main();
