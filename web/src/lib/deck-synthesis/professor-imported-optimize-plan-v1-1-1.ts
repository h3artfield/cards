/**
 * Observed Architect contract for an imported list — describes the deck, does not invent one.
 */
import type { CanonicalCardFactsV11, RetrievalContractV11, SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";
import { PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION } from "./professor-sol-directed-types-v1-1";
import type { ArchitectRawPlanV11 } from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_IMPORTED_OPTIMIZE_PLAN_V1_1_1_VERSION = "professor-imported-optimize-plan-v1-1-1";

const ROLE_META: Record<string, { primaryRole: string; description: string }> = {
  ramp_and_fixing: { primaryRole: "Ramp and fixing", description: "Mana acceleration and color fixing" },
  card_advantage_and_selection: { primaryRole: "Card advantage", description: "Draw, selection, and access" },
  interaction: { primaryRole: "Interaction", description: "Removal, counters, and answers" },
  protection: { primaryRole: "Protection", description: "Protection and stack defense" },
  recursion: { primaryRole: "Recursion", description: "Graveyard recovery and recursion" },
  repeatable_token_engines: { primaryRole: "Token engines", description: "Repeatable token production" },
  burst_token_production: { primaryRole: "Burst tokens", description: "Burst token production" },
  sacrifice_outlets: { primaryRole: "Sacrifice outlets", description: "Sacrifice outlets" },
  token_and_death_payoffs: { primaryRole: "Death payoffs", description: "Token and death payoffs" },
  combat_finishers: { primaryRole: "Combat finishers", description: "Combat finishers" },
  flex_and_synergy: { primaryRole: "Flex / synergy", description: "Synergy and flex pieces from the imported list" },
};

export function assignImportedCardRequirementV111(facts: CanonicalCardFactsV11): {
  requirementId: string;
  primaryRole: string;
} {
  const fns = new Set(facts.semanticFunctions);
  const text = `${facts.oracleText} ${facts.typeLine}`.toLowerCase();

  if (fns.has("MANA") || /add \{|search your library for a .* land/.test(text)) {
    return { requirementId: "ramp_and_fixing", primaryRole: ROLE_META.ramp_and_fixing!.primaryRole };
  }
  if (fns.has("PROTECTION") || /hexproof|indestructible|protection from/.test(text)) {
    return { requirementId: "protection", primaryRole: ROLE_META.protection!.primaryRole };
  }
  if (fns.has("INTERACTION") || fns.has("REMOVAL") || /destroy target|exile target|counter target/.test(text)) {
    return { requirementId: "interaction", primaryRole: ROLE_META.interaction!.primaryRole };
  }
  if (fns.has("GRAVEYARD_RECURSION")) {
    return { requirementId: "recursion", primaryRole: ROLE_META.recursion!.primaryRole };
  }
  if (fns.has("SACRIFICE") && /sacrifice a creature/.test(text)) {
    return { requirementId: "sacrifice_outlets", primaryRole: ROLE_META.sacrifice_outlets!.primaryRole };
  }
  if (fns.has("TOKEN_GENERATION") && /whenever|at the beginning/.test(text)) {
    return { requirementId: "repeatable_token_engines", primaryRole: ROLE_META.repeatable_token_engines!.primaryRole };
  }
  if (fns.has("TOKEN_GENERATION")) {
    return { requirementId: "burst_token_production", primaryRole: ROLE_META.burst_token_production!.primaryRole };
  }
  if (fns.has("CARD_DRAW") || fns.has("TUTOR")) {
    return {
      requirementId: "card_advantage_and_selection",
      primaryRole: ROLE_META.card_advantage_and_selection!.primaryRole,
    };
  }
  if (fns.has("COMBAT") || /trample|overrun|double strike/.test(text)) {
    return { requirementId: "combat_finishers", primaryRole: ROLE_META.combat_finishers!.primaryRole };
  }
  return { requirementId: "flex_and_synergy", primaryRole: ROLE_META.flex_and_synergy!.primaryRole };
}

export function buildImportedOptimizePlanV111(args: {
  deck: SolDirectedConstructedDeckV11;
  playstyle: string;
  deckTheme?: string;
  winPreference?: string;
  commanderStyle: string;
  bracket: number;
}): { architectRawPlan: ArchitectRawPlanV11; retrievalContract: RetrievalContractV11 } {
  const counts = new Map<string, number>();
  for (const card of args.deck.nonlands) {
    const id = card.primaryArchitectRequirement || "flex_and_synergy";
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const cardRequirements = [...counts.entries()].map(([requirementId, requestedCount]) => {
    const meta = ROLE_META[requirementId] ?? ROLE_META.flex_and_synergy!;
    const examples = args.deck.nonlands
      .filter((card) => card.primaryArchitectRequirement === requirementId)
      .slice(0, 8)
      .map((card) => card.name);
    return {
      id: requirementId,
      requirementId,
      count: requestedCount,
      requestedCount,
      primaryRole: meta.primaryRole,
      requirements: [meta.description],
      preferredExamples: examples,
    };
  });

  const landSlots = args.deck.landCount;
  const nonlandSlots = args.deck.nonlands.length;
  const theme = args.deckTheme?.trim() || "the imported list's existing strategy";
  const thesis = [
    `Customer-imported ${args.deck.commander.name} list aimed at Bracket ${args.bracket}.`,
    `Preserve this deck's identity and upgrade weak or off-bracket cards.`,
    `Playstyle: ${args.playstyle}.`,
    `Theme: ${theme}.`,
    args.winPreference?.trim() ? `Win preference: ${args.winPreference.trim()}.` : "",
    `Commander style: ${args.commanderStyle}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const architectRawPlan: ArchitectRawPlanV11 = {
    strategicThesis: thesis,
    deckThesis: thesis,
    gamePlan: {
      earlyGame: ["Keep the imported early-game suite; replace only obvious holes."],
      midGame: ["Advance the existing strategy without pivoting to a new archetype."],
      lateGame: ["Close with the imported win conditions unless a clearly better in-pool finisher exists."],
    },
    winLines: args.deck.primaryWinPaths,
    constructionBudget: {
      nonlandSlots,
      landSlots,
    },
    landPlan: {
      target: landSlots,
      minimum: landSlots,
      maximum: landSlots,
    },
    cardRequirements,
    comboAndPowerGuardrails: {
      source: "imported_optimize",
      honorBracket: args.bracket,
    },
    retrievalRules: [
      "Imported cards are already in the list and must remain legal swap-outs.",
      "Prefer upgrades that keep the imported strategy recognizable.",
    ],
  };

  const retrievalContract: RetrievalContractV11 = {
    version: PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION,
    strategicThesis: thesis,
    earlyGamePlan: ["Keep the imported early-game suite; replace only obvious holes."],
    midGamePlan: ["Advance the existing strategy without pivoting to a new archetype."],
    lateGamePlan: ["Close with the imported win conditions unless a clearly better in-pool finisher exists."],
    winLines: args.deck.primaryWinPaths,
    failureRecoveryPlan: [],
    nonlandSlotsRequired: nonlandSlots,
    landSlotsRequired: landSlots,
    cardRequirements: cardRequirements.map((row) => ({
      requirementId: row.requirementId,
      requestedCount: row.requestedCount,
      primaryRole: row.primaryRole,
      naturalLanguageRequirements: row.requirements,
      preferredExamples: row.preferredExamples,
    })),
    landPlan: architectRawPlan.landPlan as Record<string, unknown>,
    comboAndPowerGuardrails: architectRawPlan.comboAndPowerGuardrails as Record<string, unknown>,
    retrievalRules: architectRawPlan.retrievalRules as string[],
    tutorPolicy: null,
    manaValueTargets: null,
    preservedTopLevelFields: Object.keys(architectRawPlan),
  };

  return { architectRawPlan, retrievalContract };
}
