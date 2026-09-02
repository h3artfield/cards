import type { DerivedRoleName } from "@/lib/semantic-visualization/derived-features-v1";
import type { DeckStrategyAssignment, StrategyAssignmentSource } from "./types";

export type DeckStrategyClassification = Omit<
  DeckStrategyAssignment,
  "deckHash" | "assignmentVersion" | "generatedAt"
>;

type ClassifierInput = {
  derivedRoles: Record<string, number>;
  attackVector: Record<string, number>;
  vulnerabilityVector: Record<string, number>;
  commanderAttack: Record<string, number>;
};

function scoreFromRoles(roles: Record<string, number>, mapping: Record<string, number>): number {
  let score = 0;
  for (const [role, weight] of Object.entries(mapping)) {
    score += (roles[role] ?? 0) * weight;
  }
  return Math.min(1, score);
}

function softmaxNormalize(scores: Record<string, number>): Record<string, number> {
  const entries = Object.entries(scores).filter(([, v]) => v > 0.05);
  if (entries.length === 0) return {};
  const max = Math.max(...entries.map(([, v]) => v));
  const exp = entries.map(([k, v]) => [k, Math.exp((v - max) * 3)] as const);
  const sum = exp.reduce((a, [, v]) => a + v, 0);
  const out: Record<string, number> = {};
  for (const [k, v] of exp) out[k] = sum > 0 ? v / sum : 0;
  return out;
}

/**
 * Outcome-blind semantic strategy assignment.
 * MUST NOT use tournament wins, standings, winRate, or TopDeck popularity.
 */
export function classifyDeckStrategy(input: ClassifierInput): DeckStrategyClassification {
  const { derivedRoles, attackVector, vulnerabilityVector, commanderAttack } = input;
  const evidence: string[] = [];
  const contributingSemanticFeatures: string[] = [];

  const archetypeRaw: Record<string, number> = {
    "archetype-aggro": scoreFromRoles(derivedRoles, {
      combat_payoff: 1,
      combat_manipulation: 0.5,
      token_generation: 0.4,
    }),
    "archetype-combo": scoreFromRoles(derivedRoles, {
      tutor: 0.6,
      spell_copying: 0.5,
      cost_reduction: 0.4,
    }),
    "archetype-control": scoreFromRoles(derivedRoles, {
      countermagic: 1,
      board_wipe: 0.7,
      removal: 0.5,
      card_draw: 0.4,
    }),
    "archetype-stax": scoreFromRoles(derivedRoles, {
      countermagic: 0.4,
      removal: 0.3,
    }) + ((attackVector.resource_denial ?? 0) > 0.2 ? 0.5 : 0),
    "archetype-good-stuff": scoreFromRoles(derivedRoles, {
      removal: 0.4,
      card_draw: 0.4,
      ramp: 0.3,
      board_wipe: 0.2,
    }),
    "archetype-group-hug": scoreFromRoles(derivedRoles, { card_draw: 0.3, ramp: 0.3, life_gain: 0.2 }),
    "archetype-group-slug": scoreFromRoles(derivedRoles, { life_loss: 0.6, sacrifice_payoff: 0.3 }),
    "archetype-chaos": 0.05,
    "archetype-weird": 0.03,
  };

  const themeRaw: Record<string, number> = {
    "theme-reanimator": scoreFromRoles(derivedRoles, { reanimation: 1, graveyard_setup: 0.6 }),
    "theme-aristocrats": scoreFromRoles(derivedRoles, { sacrifice_outlet: 0.8, sacrifice_payoff: 1 }),
    "theme-tokens": scoreFromRoles(derivedRoles, { token_generation: 1, combat_payoff: 0.4 }),
    "theme-voltron": scoreFromRoles(derivedRoles, { combat_payoff: 0.7, protection: 0.5 }),
    "theme-spellslinger": scoreFromRoles(derivedRoles, { spell_copying: 0.7, copy_effects: 0.5 }),
    "theme-ramp": scoreFromRoles(derivedRoles, { ramp: 1, mana_generation: 0.8 }),
    "theme-card-draw": scoreFromRoles(derivedRoles, { card_draw: 1, card_advantage: 0.8 }),
    "theme-mill": scoreFromRoles(derivedRoles, { mill: 1 }),
    "theme-self-mill": scoreFromRoles(derivedRoles, { graveyard_setup: 0.8, mill: 0.5 }),
    "theme-toolbox": scoreFromRoles(derivedRoles, { tutor: 1 }),
    "theme-blink": scoreFromRoles(derivedRoles, { blink_flicker: 1 }),
    "theme-burn": scoreFromRoles(derivedRoles, { life_loss: 0.8 }),
    "theme-taxes": (attackVector.resource_denial ?? 0) > 0.15 ? 0.5 : 0,
    "theme-cheat-cast": scoreFromRoles(derivedRoles, { cast_from_exile: 0.9, cost_reduction: 0.4 }),
    "theme-storm": scoreFromRoles(derivedRoles, { spell_copying: 0.5, cost_reduction: 0.4 }),
    "theme-life-drain": scoreFromRoles(derivedRoles, { life_loss: 0.6 }),
    "theme-life-gain": scoreFromRoles(derivedRoles, { life_gain: 0.8 }),
    "theme-overrun": scoreFromRoles(derivedRoles, { token_generation: 0.6, combat_payoff: 0.5 }),
    "theme-enchantress": (vulnerabilityVector.enchantment_dependent ?? 0) > 0.2 ? 0.6 : 0,
    "theme-artifacts": (vulnerabilityVector.artifact_dependent ?? 0) > 0.2 ? 0.6 : 0,
  };

  const topRoles = Object.entries(derivedRoles)
    .filter(([, v]) => v > 0.15)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5) as Array<[DerivedRoleName, number]>;
  for (const [role, v] of topRoles) {
    contributingSemanticFeatures.push(`${role}:${v.toFixed(2)}`);
  }

  if ((derivedRoles.reanimation ?? 0) > 0.2) evidence.push("graveyard recursion density in main-deck semantics");
  if ((derivedRoles.countermagic ?? 0) > 0.15) evidence.push("stack interaction density in main-deck semantics");
  if ((commanderAttack.creature_removal ?? 0) > 0.2) {
    evidence.push("commander carries removal/interaction primitives");
  }

  const archetypeDistribution = softmaxNormalize(archetypeRaw);
  const themeDistribution = softmaxNormalize(themeRaw);
  const topArchetype = Object.values(archetypeDistribution).sort((a, b) => b - a)[0] ?? 0;
  const topTheme = Object.values(themeDistribution).sort((a, b) => b - a)[0] ?? 0;

  const assignmentSource: StrategyAssignmentSource = "semantic_rules";

  return {
    assignmentSource,
    archetypeDistribution,
    themeDistribution,
    classifierConfidence: Math.min(1, (topArchetype + topTheme) / 2),
    evidence,
    contributingCards: [],
    contributingSemanticFeatures,
  };
}
