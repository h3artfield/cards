/**
 * Professor v4.17 Slice 5.2 — functional density (quantitative Sol budget contracts).
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import {
  bracketQualityContractV417,
  type BlueprintSelectedCardV417,
  type BrewBlueprintV417,
  type BrewRequirementV417,
  type FlexEntryTelemetryV417,
  type FunctionalBudgetV417,
  type FunctionalDensityStateV417,
  type FunctionalDensityStatusV417,
  type FunctionalDensityContributionV417,
  type MarginalBlueprintUtilityV417,
  type RequirementFunctionV417,
} from "./professor-brew-blueprint-v4-17-v1";
import { requirementBracketContractV417 } from "./professor-requirement-bracket-v4-17-v1";
import { compileRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";
import {
  evaluateCandidateAgainstRequirementV417,
  type RequirementCandidateEvaluationV417,
  type RequirementCandidateInputV417,
} from "./professor-requirement-candidate-v4-17-v1";
import { evaluateFunctionalMatch } from "./functional-match-v1";
import { mandatoryPackageFloorsSatisfiedV417, computePackageDensityStatesV417 } from "./professor-brew-blueprint-package-density-v4-17-v1";
import { functionalTokenForFamily } from "./professor-requirement-materializer-v4-17-v1";
import {
  adaptiveRetrieveCandidateInputsV417,
  type AdaptiveRetrievalBuildContextV417,
} from "./professor-requirement-adaptive-retrieval-v4-17-v1";
import {
  buildAccessPortfolioStateV417,
  evaluateAccessToolCandidateV417,
  isAccessPortfolioBudgetCategory,
} from "./professor-brew-blueprint-access-v4-17-v1";
import { accessPortfolioClosureSatisfiedV1 } from "./professor-sol-directed-access-contract-v1";

export const PROFESSOR_BREW_BLUEPRINT_FUNCTIONAL_DENSITY_V4_17_V1_VERSION =
  "professor-brew-blueprint-functional-density-v4-17-v1";

export const FUNCTIONAL_DENSITY_REQUIREMENT_PREFIX = "fd-";

const CANONICAL_FUNCTIONS = new Set<RequirementFunctionV417>([
  "RETURN_FROM_GRAVEYARD",
  "GRAVEYARD_ENABLER",
  "INTERACTION",
  "ACCELERATION",
  "CARD_VELOCITY",
  "PROTECTION",
  "WIN_SUPPORT",
  "WIN_COMPONENT",
  "ENGINE",
  "ENGINE_ENABLER",
  "ENGINE_PAYOFF",
  "RESOURCE_PRODUCTION",
  "RESOURCE_CONSUMER",
  "ACCESS",
  "RECOVERY",
  "FLEX",
]);

type BudgetNormalizationV417 = {
  normalizedFunctions: RequirementFunctionV417[];
  scope: "GLOBAL" | "PACKAGE";
  subroles: string[];
  landBudget?: boolean;
  accessPortfolio?: boolean;
  unresolved?: boolean;
};

const SOL_BUDGET_NORMALIZATION: Record<string, BudgetNormalizationV417> = {
  lands: { normalizedFunctions: [], scope: "GLOBAL", subroles: [], landBudget: true },
  manaaccelerationandburst: {
    normalizedFunctions: ["ACCELERATION", "RESOURCE_PRODUCTION"],
    scope: "GLOBAL",
    subroles: ["mana-positive", "ritual"],
  },
  cheapselectionandsetup: {
    normalizedFunctions: ["CARD_VELOCITY", "GRAVEYARD_ENABLER"],
    scope: "GLOBAL",
    subroles: ["setup", "selection"],
  },
  sustainedcardadvantage: { normalizedFunctions: ["CARD_VELOCITY"], scope: "GLOBAL", subroles: ["card-advantage"] },
  tutorsandaccess: { normalizedFunctions: [], scope: "GLOBAL", subroles: ["tutor", "access-portfolio"], accessPortfolio: true },
  stackinteraction: { normalizedFunctions: ["INTERACTION"], scope: "GLOBAL", subroles: ["stack", "instant-speed"] },
  removalandboardcontrol: {
    normalizedFunctions: ["INTERACTION"],
    scope: "GLOBAL",
    subroles: ["creature", "noncreature", "mass", "removal"],
  },
  protectionanddisruption: {
    normalizedFunctions: ["PROTECTION", "INTERACTION"],
    scope: "GLOBAL",
    subroles: ["protection", "disruption"],
  },
  casteventenginesandpayoffs: {
    normalizedFunctions: ["ENGINE_ENABLER", "ENGINE_PAYOFF"],
    scope: "GLOBAL",
    subroles: ["cast-trigger", "payoff"],
  },
  dedicatedwinpieces: { normalizedFunctions: ["WIN_COMPONENT"], scope: "GLOBAL", subroles: ["win"] },
  noncommanderrecursion: {
    normalizedFunctions: ["RETURN_FROM_GRAVEYARD", "GRAVEYARD_ENABLER"],
    scope: "GLOBAL",
    subroles: ["recursion"],
  },
  tokenproduction: { normalizedFunctions: ["RESOURCE_PRODUCTION"], scope: "GLOBAL", subroles: ["tokens"] },
  sacrificeinfrastructure: { normalizedFunctions: ["RESOURCE_CONSUMER"], scope: "GLOBAL", subroles: ["sacrifice"] },
  interaction: { normalizedFunctions: ["INTERACTION"], scope: "GLOBAL", subroles: ["interaction"] },
  protection: { normalizedFunctions: ["PROTECTION"], scope: "GLOBAL", subroles: ["protection"] },
  recovery: { normalizedFunctions: ["RECOVERY"], scope: "GLOBAL", subroles: ["recovery"] },
  cardadvantage: { normalizedFunctions: ["CARD_VELOCITY"], scope: "GLOBAL", subroles: ["card-advantage"] },
  manaacceleration: { normalizedFunctions: ["ACCELERATION"], scope: "GLOBAL", subroles: ["ramp"] },
  graveyardsetupandselection: {
    normalizedFunctions: ["GRAVEYARD_ENABLER", "CARD_VELOCITY"],
    scope: "GLOBAL",
    subroles: ["graveyard-setup"],
  },
  recursionandreanimation: {
    normalizedFunctions: ["RETURN_FROM_GRAVEYARD"],
    scope: "GLOBAL",
    subroles: ["recursion"],
  },
  manadevelopment: { normalizedFunctions: ["ACCELERATION"], scope: "GLOBAL", subroles: ["ramp", "fixing"] },
  tokensources: { normalizedFunctions: ["RESOURCE_PRODUCTION"], scope: "GLOBAL", subroles: ["tokens"] },
  sacrificeoutlets: { normalizedFunctions: ["RESOURCE_CONSUMER"], scope: "GLOBAL", subroles: ["sacrifice"] },
  deathpayoffs: { normalizedFunctions: ["ENGINE_PAYOFF"], scope: "GLOBAL", subroles: ["death-trigger"] },
  cardadvantageandselection: {
    normalizedFunctions: ["CARD_VELOCITY"],
    scope: "GLOBAL",
    subroles: ["setup", "selection", "card-advantage"],
  },
  targetedinteraction: { normalizedFunctions: ["INTERACTION"], scope: "GLOBAL", subroles: ["targeted", "removal"] },
  sweepersandscalablecontrol: {
    normalizedFunctions: ["INTERACTION"],
    scope: "GLOBAL",
    subroles: ["mass", "sweeper", "scalable-control"],
  },
  graveyardinteraction: {
    normalizedFunctions: ["INTERACTION", "GRAVEYARD_ENABLER"],
    scope: "GLOBAL",
    subroles: ["graveyard", "hate"],
  },
  recursionandrecovery: {
    normalizedFunctions: ["RETURN_FROM_GRAVEYARD", "RECOVERY"],
    scope: "GLOBAL",
    subroles: ["recursion", "recovery"],
  },
  combatfinishers: { normalizedFunctions: ["WIN_COMPONENT"], scope: "GLOBAL", subroles: ["combat-finisher"] },
  flexslots: { normalizedFunctions: [], scope: "GLOBAL", subroles: ["flex"], landBudget: true },
  graveyardsetup: {
    normalizedFunctions: ["GRAVEYARD_ENABLER", "CARD_VELOCITY"],
    scope: "GLOBAL",
    subroles: ["graveyard-setup"],
  },
  reanimationtargets: { normalizedFunctions: ["WIN_COMPONENT", "ENGINE_PAYOFF"], scope: "GLOBAL", subroles: ["reanimation-target"] },
  removalanddisruption: {
    normalizedFunctions: ["INTERACTION", "PROTECTION"],
    scope: "GLOBAL",
    subroles: ["removal", "disruption"],
  },
  commanderprotection: { normalizedFunctions: ["PROTECTION"], scope: "GLOBAL", subroles: ["commander-protection"] },
  compactwinpieces: { normalizedFunctions: ["WIN_COMPONENT"], scope: "GLOBAL", subroles: ["win"] },
  manaaccelerationandfixing: { normalizedFunctions: ["ACCELERATION"], scope: "GLOBAL", subroles: ["ramp", "fixing"] },
  targetedorflexibleinteraction: {
    normalizedFunctions: ["INTERACTION"],
    scope: "GLOBAL",
    subroles: ["targeted", "flexible", "removal"],
  },
  boardresetsorbroadbattlefieldcontrol: {
    normalizedFunctions: ["INTERACTION"],
    scope: "GLOBAL",
    subroles: ["mass", "board-reset"],
  },
  voltronenhancements: {
    normalizedFunctions: ["ENGINE_ENABLER", "WIN_SUPPORT"],
    scope: "GLOBAL",
    subroles: ["voltron", "enhancement"],
  },
  protectionandresilience: {
    normalizedFunctions: ["PROTECTION", "RECOVERY"],
    scope: "GLOBAL",
    subroles: ["protection", "resilience"],
  },
  recursionandrebuilding: {
    normalizedFunctions: ["RETURN_FROM_GRAVEYARD", "RECOVERY"],
    scope: "GLOBAL",
    subroles: ["recursion", "rebuilding"],
  },
  independentcreaturesandsecondarythreats: {
    normalizedFunctions: ["WIN_COMPONENT", "ENGINE"],
    scope: "GLOBAL",
    subroles: ["secondary-threat", "creatures"],
  },
  dedicatedcombatclosers: { normalizedFunctions: ["WIN_COMPONENT"], scope: "GLOBAL", subroles: ["combat-closer"] },
};

function normalizeKey(category: string): string {
  return category.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function resolveFunctionalBudgetLabelV417(budget: FunctionalBudgetV417 | Record<string, unknown>): string {
  const category = String(budget.category ?? "GENERAL");
  const fn = budget.function != null ? String(budget.function) : undefined;
  if ((category === "GENERAL" || !category.trim()) && fn) return fn;
  return category;
}

export function resolveFunctionalBudgetBoundsV417(budget: FunctionalBudgetV417 | Record<string, unknown>): {
  minimum: number;
  maximum: number;
} {
  const range = (budget as Record<string, unknown>).range as Record<string, unknown> | undefined;
  const minimum = Number(
    budget.minimum ?? range?.min ?? range?.minimum ?? 0,
  );
  const maximum = Number(
    budget.maximum ?? range?.max ?? range?.maximum ?? minimum,
  );
  return { minimum, maximum };
}

export function normalizeFunctionalBudgetEntryV417(
  budget: FunctionalBudgetV417 | Record<string, unknown>,
): FunctionalBudgetV417 {
  const { minimum, maximum } = resolveFunctionalBudgetBoundsV417(budget);
  const fn = budget.function != null ? String(budget.function) : undefined;
  const label = resolveFunctionalBudgetLabelV417(budget);
  return {
    category: label,
    ...(fn ? { function: fn } : {}),
    minimum,
    maximum,
    functionalCoverageSelected: Number(budget.functionalCoverageSelected ?? 0),
  };
}

export function normalizeFunctionalBudgetCategoryV417(category: string): BudgetNormalizationV417 {
  if (CANONICAL_FUNCTIONS.has(category as RequirementFunctionV417)) {
    return {
      normalizedFunctions: [category as RequirementFunctionV417],
      scope: "GLOBAL",
      subroles: [category.toLowerCase()],
    };
  }
  const mapped = SOL_BUDGET_NORMALIZATION[normalizeKey(category)];
  if (mapped) return mapped;
  return {
    normalizedFunctions: [],
    scope: "GLOBAL",
    subroles: [],
    unresolved: true,
  };
}

export function functionalDensityBudgetId(category: string, index = 0): string {
  return `${FUNCTIONAL_DENSITY_REQUIREMENT_PREFIX}${normalizeKey(category)}-${index}`;
}

export function isFunctionalDensityRequirement(req: BrewRequirementV417): boolean {
  return req.family === "FUNCTIONAL_DENSITY" || req.requirementId.startsWith(FUNCTIONAL_DENSITY_REQUIREMENT_PREFIX);
}

export function isNonlandFunctionalBudget(state: FunctionalDensityStateV417): boolean {
  return !normalizeFunctionalBudgetCategoryV417(state.category).landBudget;
}

function densityStatus(current: number, minimum: number, preferred: number, maximum: number): FunctionalDensityStatusV417 {
  if (current > maximum) return "SATURATED";
  if (current >= preferred) return "PREFERRED_SATISFIED";
  if (current >= minimum) return "MINIMUM_SATISFIED";
  return "BELOW_MINIMUM";
}

export function cardContributesToFunctionalBudgetV417(
  card: BlueprintSelectedCardV417,
  normalizedFunctions: RequirementFunctionV417[],
): RequirementFunctionV417[] {
  if (normalizedFunctions.length === 0) return [];
  return [...new Set(card.satisfiedFunctions.filter((fn) => normalizedFunctions.includes(fn)))];
}

export function functionalBudgetContributingCardIds(
  blueprint: BrewBlueprintV417,
  budgetId: string,
  normalizedFunctions: RequirementFunctionV417[],
): string[] {
  const ids = new Set<string>();
  for (const card of blueprint.selectedCards) {
    const contrib = card.functionalDensityContributions?.find(
      (c) => c.budgetId === budgetId && c.countsTowardFunctionalDensity,
    );
    if (contrib) {
      ids.add(card.oracleId);
      continue;
    }
    if (cardContributesToFunctionalBudgetV417(card, normalizedFunctions).length > 0) {
      ids.add(card.oracleId);
    }
  }
  return [...ids];
}

export function computeFunctionalDensityStatesV417(
  blueprint: BrewBlueprintV417,
  catalog?: DeckResolutionCatalog | null,
): FunctionalDensityStateV417[] {
  return blueprint.functionalBudgets.map((budget, index) => {
    const label = resolveFunctionalBudgetLabelV417(budget);
    const bounds = resolveFunctionalBudgetBoundsV417(budget);
    const norm = normalizeFunctionalBudgetCategoryV417(label);
    const budgetId = functionalDensityBudgetId(label, index);
    if (norm.unresolved || norm.landBudget) {
      return {
        budgetId,
        category: label,
        scope: norm.scope,
        minimum: bounds.minimum,
        preferred: Math.round((bounds.minimum + bounds.maximum) / 2),
        maximum: bounds.maximum,
        currentDistinctContributors: norm.landBudget ? 0 : budget.functionalCoverageSelected,
        contributingCardIds: [],
        remainingMinimumDeficit: norm.landBudget ? 0 : Math.max(0, bounds.minimum - budget.functionalCoverageSelected),
        remainingPreferredDeficit: norm.landBudget
          ? 0
          : Math.max(0, Math.round((bounds.minimum + bounds.maximum) / 2) - budget.functionalCoverageSelected),
        normalizedFunctions: norm.normalizedFunctions,
        underrepresentedSubroles: norm.subroles,
        status: norm.unresolved ? "UNRESOLVED" : norm.landBudget ? "MINIMUM_SATISFIED" : "BELOW_MINIMUM",
        unresolvedReason: norm.unresolved ? "FUNCTIONAL_BUDGET_UNRESOLVED" : norm.landBudget ? "LAND_BUDGET_EXCLUDED" : undefined,
      };
    }

    if (norm.accessPortfolio) {
      const portfolio = buildAccessPortfolioStateV417({ blueprint, catalog: catalog ?? null });
      const contributingCardIds = portfolio.accessTools.map((t) => t.oracleId);
      const currentDistinctContributors = portfolio.distinctAccessTools;
      const preferred = Math.round((bounds.minimum + bounds.maximum) / 2);
      return {
        budgetId,
        category: label,
        scope: norm.scope,
        minimum: bounds.minimum,
        preferred,
        maximum: bounds.maximum,
        currentDistinctContributors,
        contributingCardIds,
        remainingMinimumDeficit: Math.max(0, bounds.minimum - currentDistinctContributors),
        remainingPreferredDeficit: Math.max(0, preferred - currentDistinctContributors),
        normalizedFunctions: [],
        underrepresentedSubroles: norm.subroles,
        status: densityStatus(currentDistinctContributors, bounds.minimum, preferred, bounds.maximum),
      };
    }

    const contributingCardIds = functionalBudgetContributingCardIds(blueprint, budgetId, norm.normalizedFunctions);
    const currentDistinctContributors = contributingCardIds.length;
    const preferred = Math.round((bounds.minimum + bounds.maximum) / 2);
    return {
      budgetId,
      category: label,
      scope: norm.scope,
      minimum: bounds.minimum,
      preferred,
      maximum: bounds.maximum,
      currentDistinctContributors,
      contributingCardIds,
      remainingMinimumDeficit: Math.max(0, bounds.minimum - currentDistinctContributors),
      remainingPreferredDeficit: Math.max(0, preferred - currentDistinctContributors),
      normalizedFunctions: norm.normalizedFunctions,
      underrepresentedSubroles: norm.subroles,
      status: densityStatus(currentDistinctContributors, bounds.minimum, preferred, bounds.maximum),
    };
  });
}

export function buildFunctionalDensityContributionsV417(args: {
  blueprint: BrewBlueprintV417;
  candidateOracleId: string;
  satisfiedFunctions: RequirementFunctionV417[];
  semanticEvidence: string[];
  contributionStrength: number;
}): FunctionalDensityContributionV417[] {
  const states = computeFunctionalDensityStatesV417(args.blueprint);
  const results: FunctionalDensityContributionV417[] = [];

  for (const state of states) {
    if (!isNonlandFunctionalBudget(state) || state.status === "UNRESOLVED") continue;
    const matched = args.satisfiedFunctions.filter((fn) => state.normalizedFunctions.includes(fn));
    if (matched.length === 0) continue;
    const existing = functionalBudgetContributingCardIds(args.blueprint, state.budgetId, state.normalizedFunctions);
    results.push({
      budgetId: state.budgetId,
      category: state.category,
      contributedFunctions: [...new Set(matched)],
      semanticEvidence: args.semanticEvidence,
      contributionStrength: args.contributionStrength,
      countsTowardFunctionalDensity: !existing.includes(args.candidateOracleId),
    });
  }
  return results;
}

export function refreshBlueprintFunctionalDensityV417(blueprint: BrewBlueprintV417): BrewBlueprintV417 {
  const functionalDensityStates = computeFunctionalDensityStatesV417(blueprint);
  const functionalBudgets = blueprint.functionalBudgets.map((b) => {
    const state = functionalDensityStates.find((s) => s.category === String(b.category));
    return { ...b, functionalCoverageSelected: state?.currentDistinctContributors ?? b.functionalCoverageSelected };
  });
  return { ...blueprint, functionalDensityStates, functionalBudgets };
}

export function mandatoryFunctionalDensityMinimumsSatisfiedV417(
  blueprint: BrewBlueprintV417,
  catalog?: DeckResolutionCatalog | null,
): boolean {
  return computeFunctionalDensityStatesV417(blueprint, catalog)
    .filter(isNonlandFunctionalBudget)
    .every((s) => s.status !== "BELOW_MINIMUM" && s.status !== "UNRESOLVED");
}

export function mandatoryFunctionalRequirementsSatisfiedV417(blueprint: BrewBlueprintV417): boolean {
  return blueprint.openRequirements
    .filter((r) => !r.requirementId.startsWith("flex-") && !isFunctionalDensityRequirement(r))
    .filter((r) => r.packageIds.some((pid) => blueprint.packages.find((p) => p.packageId === pid)?.core))
    .every((r) => r.status === "SATISFIED");
}

export function coreWinRequirementsSatisfiedV417(blueprint: BrewBlueprintV417): boolean {
  const winReqs = blueprint.openRequirements.filter(
    (r) => r.requirementId.startsWith("win-") || r.family === "WIN_COMPONENT",
  );
  if (winReqs.length === 0) return blueprint.winArchitecture.every((w) => w.status !== "OPEN");
  return winReqs.every((r) => r.status === "SATISFIED" || r.status === "PARTIAL");
}

export function criticalAccessRequirementsSatisfiedV417(blueprint: BrewBlueprintV417): boolean {
  const access = blueprint.openRequirements.filter((r) => r.requirementId.startsWith("infra-access"));
  if (access.length === 0) return true;
  return access.every((r) => r.status === "SATISFIED" || r.status === "PARTIAL");
}

export function criticalBracketInfrastructureSatisfiedV417(blueprint: BrewBlueprintV417): boolean {
  const bracket = blueprint.userIntent.bracket;
  if (bracket < 3) return true;
  const infra = blueprint.openRequirements.filter(
    (r) =>
      !r.requirementId.startsWith("flex-") &&
      !isFunctionalDensityRequirement(r) &&
      ["ACCELERATION", "INTERACTION", "PROTECTION"].includes(r.family) &&
      r.packageIds.length === 0,
  );
  if (infra.length === 0) return true;
  return infra.every((r) => r.status === "SATISFIED" || r.status === "PARTIAL");
}

export function mandatoryStructureSatisfiedV417(
  blueprint: BrewBlueprintV417,
  catalog?: DeckResolutionCatalog | null,
): boolean {
  return (
    mandatoryFunctionalRequirementsSatisfiedV417(blueprint) &&
    mandatoryFunctionalDensityMinimumsSatisfiedV417(blueprint, catalog) &&
    mandatoryPackageFloorsSatisfiedV417(blueprint) &&
    coreWinRequirementsSatisfiedV417(blueprint) &&
    criticalAccessRequirementsSatisfiedV417(blueprint) &&
    criticalBracketInfrastructureSatisfiedV417(blueprint) &&
    accessPortfolioClosureSatisfiedV1({ blueprint, catalog }).satisfied
  );
}

export function preferredCoverageRemainingV417(blueprint: BrewBlueprintV417): number {
  return computeFunctionalDensityStatesV417(blueprint)
    .filter(isNonlandFunctionalBudget)
    .reduce((sum, s) => sum + s.remainingPreferredDeficit, 0);
}

export function diagnoseFlexEntryV417(
  blueprint: BrewBlueprintV417,
  catalog?: DeckResolutionCatalog | null,
): FlexEntryTelemetryV417 {
  const mandatoryMinimaSatisfied = mandatoryStructureSatisfiedV417(blueprint, catalog);
  const preferredCoverageRemaining = preferredCoverageRemainingV417(blueprint);
  const functionalDensityMinimumsOpen = computeFunctionalDensityStatesV417(blueprint, catalog)
    .filter(isNonlandFunctionalBudget)
    .filter((s) => s.status === "BELOW_MINIMUM" || s.status === "UNRESOLVED").length;
  const functionalDensityPreferredOpen = computeFunctionalDensityStatesV417(blueprint, catalog)
    .filter(isNonlandFunctionalBudget)
    .filter((s) => s.remainingPreferredDeficit > 0).length;
  const mandatoryBinaryRequirementsOpen = blueprint.openRequirements.filter(
    (r) =>
      !r.requirementId.startsWith("flex-") &&
      r.family !== "FUNCTIONAL_DENSITY" &&
      r.family !== "PACKAGE_DENSITY" &&
      !r.requirementId.startsWith("fd-") &&
      !r.requirementId.startsWith("pkg-density-") &&
      (r.status === "OPEN" || r.status === "PARTIAL"),
  ).length;
  const packageFloorsOpen = computePackageDensityStatesV417(blueprint).filter((d) => d.status === "BELOW_MINIMUM").length;
  const flexPrimaryAllowed = mandatoryMinimaSatisfied;
  const underconstrained =
    !mandatoryMinimaSatisfied ||
    (!flexPrimaryAllowed &&
      blueprint.physicalSlotBudget.remainingNonlandSlots > preferredCoverageRemaining + 8 &&
      !mandatoryFunctionalDensityMinimumsSatisfiedV417(blueprint));
  return {
    selectedNonlandsAtFlexEntry: blueprint.physicalSlotBudget.selectedNonlands,
    remainingNonlandsAtFlexEntry: blueprint.physicalSlotBudget.remainingNonlandSlots,
    mandatoryMinimaSatisfied,
    preferredCoverageRemaining,
    underconstrained,
    functionalDensityMinimumsOpen,
    functionalDensityPreferredOpen,
    mandatoryBinaryRequirementsOpen,
    packageFloorsOpen,
    flexPrimaryAllowed,
  };
}

function buildFunctionalDensityRequirement(
  blueprint: BrewBlueprintV417,
  state: FunctionalDensityStateV417,
): BrewRequirementV417 {
  const isAccessPortfolio = isAccessPortfolioBudgetCategory(state.category);
  const primaryFn = isAccessPortfolio ? "ACCESS" : (state.normalizedFunctions[0] ?? "ENGINE_ENABLER");
  const bracket = blueprint.userIntent.bracket;
  return {
    requirementId: state.budgetId,
    blueprintRevisionId: blueprint.revisionHistory.length ? Math.max(...blueprint.revisionHistory.map((r) => r.revision)) : 0,
    family: "FUNCTIONAL_DENSITY",
    purpose: isAccessPortfolio
      ? `Access portfolio for ${state.category} (${state.currentDistinctContributors}/${state.minimum} tools)`
      : `Functional density for ${state.category} (${state.currentDistinctContributors}/${state.minimum} min)`,
    priority: 94,
    coverageMode: "FUNCTIONAL_COVERAGE",
    sharePolicy: "GLOBAL_SHAREABLE",
    physicalSlotsNeeded: {
      min: state.remainingMinimumDeficit,
      preferred: Math.max(state.remainingMinimumDeficit, state.remainingPreferredDeficit),
      max: state.remainingPreferredDeficit + 2,
    },
    requiredFunctions: state.normalizedFunctions.length ? state.normalizedFunctions : [primaryFn],
    requiredMechanics: [],
    hardRequirements: [
      { constraintId: "legal", description: "Legal in commander color identity" },
      {
        constraintId: "function",
        description: isAccessPortfolio
          ? `Verified relational access tool reaching critical target class`
          : `Verified ${state.category} contributor`,
        semanticToken: functionalTokenForFamily(primaryFn as BrewRequirementV417["family"]),
      },
    ],
    preferredRequirements: [{ qualityId: "quality", description: "premium bracket quality", weight: 0.85 }],
    acceptableFunctionalAlternatives: state.normalizedFunctions.slice(1),
    hardConstraints: ["legal_in_color_identity"],
    softPreferences: ["role compression", ...state.underrepresentedSubroles],
    packageIds: [],
    bracketQualityContract: bracketQualityContractV417(bracket),
    requirementBracketContract: requirementBracketContractV417(primaryFn as BrewRequirementV417["family"], bracket),
    currentCoverage: state.currentDistinctContributors,
    targetCoverage: state.minimum,
    selectedCardIds: [...state.contributingCardIds],
    status:
      state.status === "BELOW_MINIMUM"
        ? "OPEN"
        : state.status === "MINIMUM_SATISFIED" && state.remainingPreferredDeficit > 0
          ? "PARTIAL"
          : "SATISFIED",
  };
}

export function materializeFunctionalDensityRequirementsV417(blueprint: BrewBlueprintV417): BrewBlueprintV417 {
  const states = computeFunctionalDensityStatesV417(blueprint);
  const without = blueprint.openRequirements.filter((r) => !isFunctionalDensityRequirement(r));
  const densityReqs: BrewRequirementV417[] = [];

  for (const state of states) {
    if (!isNonlandFunctionalBudget(state)) continue;
    if (state.status === "UNRESOLVED" || state.status === "SATURATED") continue;
    if (state.status === "PREFERRED_SATISFIED") continue;
    densityReqs.push(buildFunctionalDensityRequirement(blueprint, state));
  }

  return refreshBlueprintFunctionalDensityV417({
    ...blueprint,
    openRequirements: [...without, ...densityReqs],
  });
}

export function openFunctionalDensityCountV417(blueprint: BrewBlueprintV417): number {
  return blueprint.openRequirements.filter(
    (r) => isFunctionalDensityRequirement(r) && (r.status === "OPEN" || r.status === "PARTIAL"),
  ).length;
}

export function computeMarginalBlueprintUtilityV417(args: {
  blueprint: BrewBlueprintV417;
  candidate: RequirementCandidateEvaluationV417;
  beforeStates?: FunctionalDensityStateV417[];
}): MarginalBlueprintUtilityV417 {
  const before = args.beforeStates ?? computeFunctionalDensityStatesV417(args.blueprint);
  const simulatedCard: BlueprintSelectedCardV417 = {
    oracleId: args.candidate.oracleId,
    name: args.candidate.cardName,
    physicalSlotsConsumed: 1,
    primaryRequirementId: args.candidate.requirementId,
    secondaryRequirementIds: [],
    primaryFunction: args.candidate.satisfiedFunctions[0] ?? "FLEX",
    secondaryFunctions: args.candidate.satisfiedFunctions.slice(1, 2),
    tertiaryFunctions: args.candidate.satisfiedFunctions.slice(2, 3),
    satisfiedFunctions: args.candidate.satisfiedFunctions,
    packageIds: [],
    packageContributions: [],
    functionalDensityContributions: [],
    semanticEvidence: args.candidate.semanticEvidence,
    bracketContribution: [],
    canonicalVerified: true,
  };
  const afterBlueprint = refreshBlueprintFunctionalDensityV417({
    ...args.blueprint,
    selectedCards: [...args.blueprint.selectedCards, simulatedCard],
  });
  const after = computeFunctionalDensityStatesV417(afterBlueprint);

  let preferredCoverageDelta = 0;
  let saturationPenalty = 0;
  for (const b of before) {
    if (!isNonlandFunctionalBudget(b)) continue;
    const a = after.find((x) => x.budgetId === b.budgetId);
    if (!a) continue;
    preferredCoverageDelta += Math.max(0, b.remainingPreferredDeficit - a.remainingPreferredDeficit);
    if (a.status === "SATURATED" && b.status !== "SATURATED") saturationPenalty += 25;
    if (a.currentDistinctContributors > a.maximum) saturationPenalty += 15;
  }

  const roleCompressionDelta = args.candidate.satisfiedFunctions.length >= 2 ? 12 : 0;
  const bracketQualityDelta = Math.max(0, (args.candidate.bracketQuality - 50) / 10);
  const interactionBreadthDelta = args.candidate.satisfiedFunctions.includes("INTERACTION") ? 8 : 0;
  const resilienceDelta =
    args.candidate.satisfiedFunctions.includes("PROTECTION") || args.candidate.satisfiedFunctions.includes("RECOVERY") ? 8 : 0;
  const recoveryDelta = args.candidate.satisfiedFunctions.includes("RECOVERY") ? 6 : 0;
  const accessDelta = args.candidate.satisfiedFunctions.includes("ACCESS") ? 7 : 0;
  const winReliabilityDelta = args.candidate.satisfiedFunctions.includes("WIN_COMPONENT") ? 6 : 0;
  const packageRedundancyDelta = 0;
  const curveEfficiencyDelta = (args.candidate.manaValue ?? 99) <= 3 ? 4 : 0;

  const total = Math.max(
    0,
    preferredCoverageDelta * 2 +
      bracketQualityDelta +
      interactionBreadthDelta +
      resilienceDelta +
      recoveryDelta +
      accessDelta +
      winReliabilityDelta +
      roleCompressionDelta +
      curveEfficiencyDelta -
      saturationPenalty,
  );

  return {
    preferredCoverageDelta,
    bracketQualityDelta,
    interactionBreadthDelta,
    resilienceDelta,
    recoveryDelta,
    accessDelta,
    winReliabilityDelta,
    packageRedundancyDelta,
    roleCompressionDelta,
    curveEfficiencyDelta,
    saturationPenalty,
    total,
  };
}

export type FunctionalDensityCandidateV417 = RequirementCandidateEvaluationV417 & {
  densityScore: number;
  functionalCoverageDelta: number;
  marginalUtility: MarginalBlueprintUtilityV417;
};

export function retrieveCandidatesForFunctionalDensityV417(args: {
  catalog: DeckResolutionCatalog;
  blueprint: BrewBlueprintV417;
  requirement: BrewRequirementV417;
  commanderColorIdentity: string[];
  excludeOracleIds?: Set<string>;
  maxScan?: number;
  maxEvaluate?: number;
  buildContext?: AdaptiveRetrievalBuildContextV417;
  requireFullCorpus?: boolean;
}): FunctionalDensityCandidateV417[] {
  const state = computeFunctionalDensityStatesV417(args.blueprint, args.catalog).find((s) => s.budgetId === args.requirement.requirementId);
  if (!state || !isNonlandFunctionalBudget(state)) return [];

  const isAccessPortfolio = isAccessPortfolioBudgetCategory(state.category);
  const criticalTargets = isAccessPortfolio
    ? buildAccessPortfolioStateV417({ blueprint: args.blueprint, catalog: args.catalog }).criticalTargets
    : [];

  const evaluateInputs = (requireFullCorpus: boolean): FunctionalDensityCandidateV417[] => {
    const exclude = args.excludeOracleIds ?? new Set(args.blueprint.selectedCards.map((c) => c.oracleId));
    const existing = new Set(functionalBudgetContributingCardIds(args.blueprint, state.budgetId, state.normalizedFunctions));
    const probeReq: BrewRequirementV417 = {
      ...args.requirement,
      family: (state.normalizedFunctions[0] ?? "ENGINE_ENABLER") as BrewRequirementV417["family"],
      requiredFunctions: state.normalizedFunctions.length ? state.normalizedFunctions : args.requirement.requiredFunctions,
    };
    const compiled = compileRequirementSemanticQueryV417(probeReq);
    const { inputs } = adaptiveRetrieveCandidateInputsV417({
      catalog: args.catalog,
      commanderColorIdentity: args.commanderColorIdentity,
      objectiveId: args.requirement.requirementId,
      objectiveType: "FUNCTIONAL_DENSITY",
      functionalMatchToken: compiled.functionalMatchToken,
      probeFunctions: state.normalizedFunctions,
      researchSeeds: args.blueprint.strategy.researchSeeds,
      excludeOracleIds: exclude,
      alreadyContributingIds: existing,
      boundedScan: args.maxScan,
      boundedEvaluate: args.maxEvaluate,
      buildContext: args.buildContext,
      requireFullCorpus: requireFullCorpus || args.requireFullCorpus,
    });

    const results: FunctionalDensityCandidateV417[] = [];
    for (const candidate of inputs) {
      if (existing.has(candidate.oracleId)) continue;

      if (isAccessPortfolio) {
        const accessEval = evaluateAccessToolCandidateV417({
          oracleId: candidate.oracleId,
          name: candidate.name,
          oracleText: candidate.oracleText,
          typeLine: candidate.typeLine,
          commanderColorIdentity: args.commanderColorIdentity,
          catalog: args.catalog,
          criticalTargets,
        });
        if (!accessEval.qualifies || !accessEval.tool) continue;
        const satisfiedFunctions: RequirementFunctionV417[] = ["ACCESS"];
        const evaluation: RequirementCandidateEvaluationV417 = {
          oracleId: candidate.oracleId,
          cardName: candidate.name,
          requirementId: args.requirement.requirementId,
          requirementEligible: true,
          satisfiedFunctions,
          semanticEvidence: accessEval.tool.verifiedRoutes.map((r) => r.verificationEvidence),
          bracketQuality: 55,
          finalRequirementScore: 50 + accessEval.tool.verifiedRoutes.length * 8,
          manaValue: candidate.manaValue,
        };
        const marginalUtility = computeMarginalBlueprintUtilityV417({
          blueprint: args.blueprint,
          candidate: evaluation,
        });
        const functionalCoverageDelta = state.status === "BELOW_MINIMUM" ? 1 : marginalUtility.preferredCoverageDelta > 0 ? 1 : 0;
        if (state.status !== "BELOW_MINIMUM" && marginalUtility.total <= 0) continue;
        const densityScore = Math.round(
          evaluation.finalRequirementScore * 0.4 +
            marginalUtility.total * 0.35 +
            accessEval.tool.verifiedRoutes.length * 5 +
            (state.status === "BELOW_MINIMUM" ? 20 : 0),
        );
        results.push({
          ...evaluation,
          densityScore,
          functionalCoverageDelta,
          marginalUtility,
        });
        continue;
      }

      const evaluation = evaluateCandidateAgainstRequirementV417({
        requirement: probeReq,
        compiledQuery: compiled,
        candidate,
        commanderColorIdentity: args.commanderColorIdentity,
        catalog: args.catalog,
      });
      if (!evaluation.requirementEligible) continue;
      const overlap = evaluation.satisfiedFunctions.filter((fn) => state.normalizedFunctions.includes(fn));
      if (overlap.length === 0) continue;

      const marginalUtility = computeMarginalBlueprintUtilityV417({
        blueprint: args.blueprint,
        candidate: { ...evaluation, requirementId: args.requirement.requirementId },
      });
      const functionalCoverageDelta = state.status === "BELOW_MINIMUM" ? 1 : marginalUtility.preferredCoverageDelta > 0 ? 1 : 0;
      if (state.status !== "BELOW_MINIMUM" && marginalUtility.total <= 0) continue;

      const densityScore = Math.round(
        evaluation.finalRequirementScore * 0.4 +
          marginalUtility.total * 0.35 +
          (state.status === "BELOW_MINIMUM" ? 20 : 0) -
          marginalUtility.saturationPenalty,
      );

      results.push({
        ...evaluation,
        requirementId: args.requirement.requirementId,
        densityScore,
        functionalCoverageDelta,
        marginalUtility,
      });
    }

    return results.sort(
      (a, b) =>
        b.densityScore - a.densityScore ||
        b.functionalCoverageDelta - a.functionalCoverageDelta ||
        b.finalRequirementScore - a.finalRequirementScore ||
        a.cardName.localeCompare(b.cardName),
    );
  };

  const first = evaluateInputs(false);
  if (first.length > 0) return first;
  return evaluateInputs(true);
}

export function computeFunctionalDensityDeltaForSelectionV417(args: {
  blueprint: BrewBlueprintV417;
  requirementId: string;
  satisfiedFunctions: RequirementFunctionV417[];
  candidateOracleId: string;
}): number {
  const before = computeFunctionalDensityStatesV417(args.blueprint);
  const state = before.find((s) => s.budgetId === args.requirementId);
  if (!state) return 0;
  if (existingWouldContribute(args.blueprint, state, args.candidateOracleId, args.satisfiedFunctions)) return 0;
  if (state.status === "BELOW_MINIMUM") return 1;
  if (state.status === "MINIMUM_SATISFIED" && state.remainingPreferredDeficit > 0) return 1;
  return 0;
}

function existingWouldContribute(
  blueprint: BrewBlueprintV417,
  state: FunctionalDensityStateV417,
  oracleId: string,
  satisfiedFunctions: RequirementFunctionV417[],
): boolean {
  if (functionalBudgetContributingCardIds(blueprint, state.budgetId, state.normalizedFunctions).includes(oracleId)) {
    return true;
  }
  return satisfiedFunctions.filter((fn) => state.normalizedFunctions.includes(fn)).length === 0;
}
