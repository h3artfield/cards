/**
 * Strategy mechanic → retrieval representation (v3).
 * Authority: adjudicated path meaning first; spec fields are representation only.
 */
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type { RoutingCompatibility } from "../../src/lib/deck-synthesis/build-path-types-v3";

export const STRATEGY_RETRIEVAL_REPRESENTATION_V3_VERSION = "phase6a1-strategy-retrieval-representation-v3";

export type RetrievalRepresentation = {
  targetMechanic: string;
  retrievalToken: string;
  retrievalBucket: RetrievalBucketId;
  linkedSpecField: string;
  routingCompatibility: RoutingCompatibility;
  routingNote: string | null;
};

type PatternRule = {
  pattern: RegExp;
  token: string | null;
  bucket: RetrievalBucketId;
  specField: string;
  compatibility: RoutingCompatibility;
  note?: string;
  rejectTokens?: string[];
};

const RULES: PatternRule[] = [
  { pattern: /self-?mill|mill yourself|graveyard population/i, token: "mill", bucket: "STRUCTURAL_SUPPORT", specField: "desiredFunctions:mill", compatibility: "EXACT_COMPATIBLE" },
  { pattern: /mill target|target-?player mill|repeatable.*mill|opponent mill/i, token: "mill_target_player", bucket: "STRUCTURAL_SUPPORT", specField: "requiredFunctions:mill_target_player", compatibility: "EXACT_COMPATIBLE" },
  { pattern: /standalone creature recursion|creature recursion|reanimation|recursion target/i, token: "reanimation", bucket: "RECURSION", specField: "requiredFunctions:reanimation", compatibility: "EXACT_COMPATIBLE" },
  { pattern: /creature-?death|death enabler|sacrifice|death trigger|aristocrat/i, token: "creature_dies_controller_controls", bucket: "STATE_BUILDERS", specField: "requiredInputs:creature_dies_controller_controls", compatibility: "COMPATIBLE_WITH_CONSTRAINT", note: "Death-density representation" },
  { pattern: /goblin density|goblin token|goblin lord|goblin-swarm|independent goblin/i, token: "goblins_controlled", bucket: "ENGINE_PIECES", specField: "requiredInputs:goblins_controlled", compatibility: "EXACT_COMPATIBLE" },
  { pattern: /untap krenko|untap support|untap.*commander|reuse.*tap/i, token: "untap_support", bucket: "ENABLERS", specField: "desiredFunctions:untap_support", compatibility: "EXACT_COMPATIBLE" },
  { pattern: /nonland mana permanent|mana creature|mana rock|nonland ramp|ramp|mana acceleration/i, token: "ramp", bucket: "MANA_SUPPORT", specField: "requiredFunctions:ramp", compatibility: "EXACT_COMPATIBLE" },
  { pattern: /big-?mana|big mana|mana sink|high-impact non-human|high-cost threat|x spell|mana doubl/i, token: null, bucket: "MANA_SUPPORT", specField: "requiredFunctions:mana_sink", compatibility: "NO_EXISTING_TOKEN", rejectTokens: ["combat_payoff"] },
  { pattern: /evasive creature|cheap.*evasive|combat connect|combat damage|combat-damage payoff/i, token: "combat_damage_to_opponents", bucket: "PAYOFFS", specField: "requiredInputs:combat_damage_to_opponents", compatibility: "EXACT_COMPATIBLE" },
  { pattern: /card draw|card advantage|draw engine/i, token: "card_draw", bucket: "CARD_ADVANTAGE", specField: "requiredFunctions:card_draw", compatibility: "EXACT_COMPATIBLE" },
  { pattern: /life buffer|lifelink|life gain/i, token: "life_gain", bucket: "STRUCTURAL_SUPPORT", specField: "desiredFunctions:life_gain", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
  { pattern: /spell cost|tax|opponent spell|cost reduction/i, token: "opponent_spell_tax", bucket: "INTERACTION", specField: "requiredFunctions:opponent_spell_tax", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
  { pattern: /exile|play from exile|impulse|treasure/i, token: "spell_cast_from_exile", bucket: "CARD_ADVANTAGE", specField: "requiredInputs:spell_cast_from_exile", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
  { pattern: /artifact|treasure token|clue|sacrifice artifact/i, token: "artifacts", bucket: "RESOURCE_CONSUMERS", specField: "resourcesToConsume:artifacts", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
  { pattern: /enchantment|constellation|saga|enchantress/i, token: "enchantment_recursion", bucket: "RECURSION", specField: "requiredFunctions:enchantment_recursion", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
  { pattern: /graveyard value|graveyard setup|artifact graveyard|self-mill.*graveyard/i, token: "graveyard_setup", bucket: "STATE_BUILDERS", specField: "requiredFunctions:graveyard_setup", compatibility: "EXACT_COMPATIBLE" },
  { pattern: /unearth|artifact recursion/i, token: "unearth", bucket: "RECURSION", specField: "requiredFunctions:unearth", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
  { pattern: /top.?of.?library|surveil|scry|impulse draw/i, token: "top_of_library", bucket: "CARD_ADVANTAGE", specField: "requiredInputs:top_of_library", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
  { pattern: /counter|\+1\/\+1/i, token: "counter_placement", bucket: "ENGINE_PIECES", specField: "requiredFunctions:counter_placement", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
  { pattern: /ninja|ninjutsu|unblockable|evasion/i, token: "combat_payoff", bucket: "PAYOFFS", specField: "requiredFunctions:combat_payoff", compatibility: "COMPATIBLE_WITH_CONSTRAINT", note: "Combat evasion context" },
  { pattern: /animus|shaun.*rebecca|graveyard payoffs from self-mill/i, token: null, bucket: "STATE_BUILDERS", specField: "requiredFunctions:graveyard_setup", compatibility: "NO_EXISTING_TOKEN", note: "Animus-specific branch pending Oracle" },
  { pattern: /dragon spell|dragon cost|horror token|creature-dense mill/i, token: "token_generation", bucket: "ENGINE_PIECES", specField: "requiredFunctions:token_generation", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
  { pattern: /targeting spell|cantrip|copy target|orvar/i, token: "targeted_spells", bucket: "ENABLERS", specField: "desiredFunctions:targeted_spells", compatibility: "NO_EXISTING_TOKEN" },
  { pattern: /connive|discard.*draw|resource conversion/i, token: "discard_draw", bucket: "CARD_ADVANTAGE", specField: "desiredFunctions:discard_draw", compatibility: "NO_EXISTING_TOKEN" },
  { pattern: /tutor|toolbox|wish/i, token: "tutor", bucket: "ENABLERS", specField: "requiredFunctions:tutor", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
  { pattern: /protection|hexproof|indestructible|ward/i, token: "protection", bucket: "PROTECTION", specField: "requiredFunctions:protection", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
  { pattern: /removal|destroy|exile target/i, token: "removal", bucket: "INTERACTION", specField: "requiredFunctions:removal", compatibility: "COMPATIBLE_WITH_CONSTRAINT" },
];

function slugToken(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

function wouldMismatch(label: string, rejectTokens: string[]): boolean {
  const lower = label.toLowerCase();
  for (const t of rejectTokens) {
    if (t === "combat_payoff" && /mana|sink|x spell|high-cost|non-human creature/i.test(lower)) return true;
    if (t === "card_draw" && /combat damage payoff/i.test(lower) && !/draw/i.test(lower)) return true;
  }
  return false;
}

export function deriveRetrievalRepresentation(
  mechanicLabel: string,
  opts?: { routingCorrection?: string },
): RetrievalRepresentation {
  const targetMechanic = mechanicLabel.trim();

  if (opts?.routingCorrection) {
    const correction = opts.routingCorrection.toLowerCase();
    if (correction.includes("big_mana") && /big-?mana|mana sink|high-impact/i.test(mechanicLabel)) {
      return {
        targetMechanic,
        retrievalToken: slugToken("big_mana_sink"),
        retrievalBucket: "MANA_SUPPORT",
        linkedSpecField: "requiredFunctions:mana_sink",
        routingCompatibility: "NO_EXISTING_TOKEN",
        routingNote: opts.routingCorrection,
      };
    }
  }

  for (const rule of RULES) {
    if (!rule.pattern.test(mechanicLabel)) continue;
    if (rule.rejectTokens && wouldMismatch(mechanicLabel, rule.rejectTokens)) {
      return {
        targetMechanic,
        retrievalToken: slugToken(mechanicLabel),
        retrievalBucket: rule.bucket,
        linkedSpecField: rule.specField,
        routingCompatibility: "NO_EXISTING_TOKEN",
        routingNote: `Avoided ${rule.rejectTokens.join(", ")} mapping; use adjudicated mechanic semantics`,
      };
    }
    if (rule.token === null) {
      return {
        targetMechanic,
        retrievalToken: slugToken(mechanicLabel),
        retrievalBucket: rule.bucket,
        linkedSpecField: rule.specField,
        routingCompatibility: rule.compatibility,
        routingNote: rule.note ?? null,
      };
    }
    return {
      targetMechanic,
      retrievalToken: rule.token,
      retrievalBucket: rule.bucket,
      linkedSpecField: rule.specField,
      routingCompatibility: rule.compatibility,
      routingNote: rule.note ?? null,
    };
  }

  return {
    targetMechanic,
    retrievalToken: slugToken(mechanicLabel),
    retrievalBucket: "STRUCTURAL_SUPPORT",
    linkedSpecField: `strategyMechanic:${slugToken(mechanicLabel)}`,
    routingCompatibility: "NO_EXISTING_TOKEN",
    routingNote: "No catalog token — provisional slug from adjudicated mechanic",
  };
}

export function validateRoutingCompatibility(rep: RetrievalRepresentation): RoutingCompatibility {
  if (rep.routingCompatibility === "ROUTING_MISMATCH") return "ROUTING_MISMATCH";
  if (rep.routingCompatibility === "NO_EXISTING_TOKEN") return "NO_EXISTING_TOKEN";
  if (rep.routingNote) return "COMPATIBLE_WITH_CONSTRAINT";
  return rep.routingCompatibility;
}
