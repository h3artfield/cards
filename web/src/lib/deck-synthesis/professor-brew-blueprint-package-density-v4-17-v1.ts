/**
 * Professor v4.17 Slice 5.1 — package physical density state (separate from functional coverage).
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import {
  bracketQualityContractV417,
  type BrewBlueprintV417,
  type BrewRequirementV417,
  type PackageDensityStateV417,
  type PackageDensityStatusV417,
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
import { refreshPackageStatusesV417 } from "./professor-brew-blueprint-package-v4-17-v1";
import {
  adaptiveRetrieveCandidateInputsV417,
  type AdaptiveRetrievalBuildContextV417,
} from "./professor-requirement-adaptive-retrieval-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_PACKAGE_DENSITY_V4_17_V1_VERSION = "professor-brew-blueprint-package-density-v4-17-v1";

export const PACKAGE_DENSITY_REQUIREMENT_PREFIX = "pkg-density-";

function densityStatus(current: number, minimum: number, preferred: number): PackageDensityStatusV417 {
  if (current >= preferred) return "PREFERRED_SATISFIED";
  if (current >= minimum) return "MINIMUM_SATISFIED";
  return "BELOW_MINIMUM";
}

export function packageContributingCardIds(blueprint: BrewBlueprintV417, packageId: string): string[] {
  const ids = new Set<string>();
  for (const card of blueprint.selectedCards) {
    const contrib = card.packageContributions?.find((c) => c.packageId === packageId && c.countsTowardPhysicalDensity);
    if (contrib) {
      ids.add(card.oracleId);
      continue;
    }
    if ((!card.packageContributions || card.packageContributions.length === 0) && card.packageIds.includes(packageId)) {
      ids.add(card.oracleId);
    }
  }
  return [...ids];
}

function mandatoryGroupsSatisfied(blueprint: BrewBlueprintV417, packageId: string): boolean {
  const pkg = blueprint.packages.find((p) => p.packageId === packageId);
  if (!pkg) return false;
  const mandatoryGroups = pkg.requirementGroups?.filter((g) => g.mandatory) ?? [];
  if (mandatoryGroups.length === 0) {
    return blueprint.openRequirements
      .filter((r) => r.packageIds.includes(packageId) && !r.requirementId.startsWith(PACKAGE_DENSITY_REQUIREMENT_PREFIX))
      .every((r) => r.status === "SATISFIED");
  }
  return mandatoryGroups.every((group) => {
    const related = blueprint.openRequirements.filter((r) => group.relatedRequirementIds.includes(r.requirementId));
    return related.length > 0 && related.every((r) => r.status === "SATISFIED");
  });
}

function underrepresentedGroups(blueprint: BrewBlueprintV417, packageId: string): string[] {
  const pkg = blueprint.packages.find((p) => p.packageId === packageId);
  if (!pkg) return [];
  const groups: string[] = [];
  for (const group of pkg.requirementGroups ?? []) {
    const related = blueprint.openRequirements.filter((r) => group.relatedRequirementIds.includes(r.requirementId));
    const selected = related.reduce((sum, r) => sum + r.selectedCardIds.length, 0);
    if (selected < group.preferredPhysicalSlots) groups.push(group.groupId);
  }
  const roleCounts = new Map<string, number>();
  for (const card of blueprint.selectedCards) {
    for (const contrib of card.packageContributions ?? []) {
      if (contrib.packageId !== packageId) continue;
      for (const fn of contrib.contributedFunctions) {
        roleCounts.set(fn, (roleCounts.get(fn) ?? 0) + 1);
      }
    }
  }
  for (const req of blueprint.openRequirements.filter((r) => r.packageIds.includes(packageId))) {
    const fn = req.requiredFunctions[0];
    if (!fn) continue;
    if ((roleCounts.get(fn) ?? 0) >= 3) continue;
    if (req.status === "SATISFIED" && (roleCounts.get(fn) ?? 0) === 0) groups.push(req.requirementId);
  }
  return [...new Set(groups)];
}

export function computePackageDensityStatesV417(blueprint: BrewBlueprintV417): PackageDensityStateV417[] {
  return blueprint.packages.map((pkg) => {
    const contributingCardIds = packageContributingCardIds(blueprint, pkg.packageId);
    const currentPhysicalContribution = contributingCardIds.length;
    const minimumPhysicalContribution = pkg.minimumPhysicalContribution ?? pkg.minimumPhysicalSlots;
    const preferredPhysicalContribution = pkg.preferredPhysicalContribution ?? pkg.preferredPhysicalSlots;
    return {
      packageId: pkg.packageId,
      minimumPhysicalContribution,
      preferredPhysicalContribution,
      currentPhysicalContribution,
      contributingCardIds,
      remainingMinimumDeficit: Math.max(0, minimumPhysicalContribution - currentPhysicalContribution),
      remainingPreferredDeficit: Math.max(0, preferredPhysicalContribution - currentPhysicalContribution),
      underrepresentedRequirementGroups: underrepresentedGroups(blueprint, pkg.packageId),
      status: densityStatus(currentPhysicalContribution, minimumPhysicalContribution, preferredPhysicalContribution),
    };
  });
}

export function refreshBlueprintPackageDensityV417(blueprint: BrewBlueprintV417): BrewBlueprintV417 {
  const packageDensityStates = computePackageDensityStatesV417(blueprint);
  return {
    ...blueprint,
    packageDensityStates,
    packages: refreshPackageStatusesV417({ ...blueprint, packageDensityStates }),
  };
}

export function packageDensityRequirementId(packageId: string): string {
  return `${PACKAGE_DENSITY_REQUIREMENT_PREFIX}${packageId}`;
}

export function isPackageDensityRequirement(req: BrewRequirementV417): boolean {
  return req.family === "PACKAGE_DENSITY" || req.requirementId.startsWith(PACKAGE_DENSITY_REQUIREMENT_PREFIX);
}

function buildPackageDensityRequirement(blueprint: BrewBlueprintV417, packageId: string, density: PackageDensityStateV417): BrewRequirementV417 {
  const bracket = blueprint.userIntent.bracket;
  const pkg = blueprint.packages.find((p) => p.packageId === packageId)!;
  return {
    requirementId: packageDensityRequirementId(packageId),
    blueprintRevisionId: blueprint.revisionHistory.length ? Math.max(...blueprint.revisionHistory.map((r) => r.revision)) : 0,
    family: "PACKAGE_DENSITY",
    purpose: `Package density for ${pkg.name} (${density.currentPhysicalContribution}/${density.minimumPhysicalContribution} min)`,
    priority: pkg.core ? 92 : 65,
    coverageMode: "PACKAGE_PHYSICAL_DENSITY",
    sharePolicy: "PACKAGE_LOCAL_DISTINCT",
    physicalSlotsNeeded: {
      min: density.remainingMinimumDeficit,
      preferred: Math.max(density.remainingMinimumDeficit, density.remainingPreferredDeficit),
      max: density.remainingPreferredDeficit + 2,
    },
    requiredFunctions: pkg.requiredFunctions.length ? pkg.requiredFunctions : ["ENGINE_ENABLER"],
    requiredMechanics: [],
    hardRequirements: [
      { constraintId: "legal", description: "Legal in commander color identity" },
      { constraintId: "package", description: `Contributes to ${pkg.name} physical density` },
    ],
    preferredRequirements: [{ qualityId: "quality", description: "premium package contributor", weight: 0.85 }],
    acceptableFunctionalAlternatives: pkg.preferredFunctions ?? [],
    hardConstraints: ["legal_in_color_identity"],
    softPreferences: ["underrepresented package role", "role compression", "package independence"],
    packageIds: [packageId],
    bracketQualityContract: bracketQualityContractV417(bracket),
    requirementBracketContract: requirementBracketContractV417("ENGINE_ENABLER", bracket),
    currentCoverage: density.currentPhysicalContribution,
    targetCoverage: density.minimumPhysicalContribution,
    selectedCardIds: [...density.contributingCardIds],
    status: density.remainingMinimumDeficit > 0 ? "OPEN" : density.remainingPreferredDeficit > 0 ? "PARTIAL" : "SATISFIED",
  };
}

export function materializePackageDensityRequirementsV417(blueprint: BrewBlueprintV417): BrewBlueprintV417 {
  const states = computePackageDensityStatesV417(blueprint);
  const withoutDensity = blueprint.openRequirements.filter((r) => !isPackageDensityRequirement(r));
  const densityReqs: BrewRequirementV417[] = [];

  for (const density of states) {
    if (density.status !== "BELOW_MINIMUM") continue;
    const pkg = blueprint.packages.find((p) => p.packageId === density.packageId);
    if (!pkg?.core) continue;
    if (!mandatoryGroupsSatisfied(blueprint, density.packageId)) continue;
    densityReqs.push(buildPackageDensityRequirement(blueprint, density.packageId, density));
  }

  return {
    ...blueprint,
    packageDensityStates: states,
    openRequirements: [...withoutDensity, ...densityReqs],
  };
}

export function packageUnionRequirements(blueprint: BrewBlueprintV417, packageId: string): BrewRequirementV417[] {
  return blueprint.openRequirements.filter(
    (r) => r.packageIds.includes(packageId) && !isPackageDensityRequirement(r) && !r.requirementId.startsWith("flex-"),
  );
}

function roleSaturation(blueprint: BrewBlueprintV417, packageId: string, fn: RequirementFunctionV417): number {
  let count = 0;
  for (const card of blueprint.selectedCards) {
    for (const contrib of card.packageContributions ?? []) {
      if (contrib.packageId === packageId && contrib.contributedFunctions.includes(fn)) count++;
    }
  }
  return count;
}

export type PackageDensityCandidateV417 = RequirementCandidateEvaluationV417 & {
  matchedRequirementIds: string[];
  packageCoverageDelta: number;
  roleSaturation: number;
  redundancyNeed: number;
  densityScore: number;
};

export function retrieveCandidatesForPackageDensityV417(args: {
  catalog: DeckResolutionCatalog;
  blueprint: BrewBlueprintV417;
  requirement: BrewRequirementV417;
  commanderColorIdentity: string[];
  excludeOracleIds?: Set<string>;
  maxScan?: number;
  maxEvaluate?: number;
  buildContext?: AdaptiveRetrievalBuildContextV417;
}): PackageDensityCandidateV417[] {
  const packageId = args.requirement.packageIds[0];
  if (!packageId) return [];
  const unionReqs = packageUnionRequirements(args.blueprint, packageId);
  if (unionReqs.length === 0) return [];

  const exclude = args.excludeOracleIds ?? new Set(args.blueprint.selectedCards.map((c) => c.oracleId));
  const existingContributors = new Set(packageContributingCardIds(args.blueprint, packageId));
  const probeFunctions = [...new Set(unionReqs.flatMap((r) => r.requiredFunctions))] as RequirementFunctionV417[];
  const probeReq: BrewRequirementV417 = {
    ...unionReqs[0]!,
    requirementId: args.requirement.requirementId,
    requiredFunctions: probeFunctions.length ? probeFunctions : unionReqs[0]!.requiredFunctions,
  };
  const compiled = compileRequirementSemanticQueryV417(probeReq);
  const unionTokens = unionReqs.map((r) => compileRequirementSemanticQueryV417(r).functionalMatchToken);

  const { inputs } = adaptiveRetrieveCandidateInputsV417({
    catalog: args.catalog,
    commanderColorIdentity: args.commanderColorIdentity,
    objectiveId: args.requirement.requirementId,
    objectiveType: "PACKAGE_DENSITY",
    functionalMatchToken: compiled.functionalMatchToken,
    functionalMatchTokens: unionTokens,
    probeFunctions,
    researchSeeds: args.blueprint.strategy.researchSeeds,
    excludeOracleIds: exclude,
    alreadyContributingIds: existingContributors,
    boundedScan: args.maxScan,
    boundedEvaluate: args.maxEvaluate,
    buildContext: args.buildContext,
  });

  const results: PackageDensityCandidateV417[] = [];
  for (const candidate of inputs) {
    const matched: string[] = [];
    let bestEval: RequirementCandidateEvaluationV417 | null = null;
    for (const req of unionReqs) {
      const compiled = compileRequirementSemanticQueryV417(req);
      const evaluation = evaluateCandidateAgainstRequirementV417({
        requirement: req,
        compiledQuery: compiled,
        candidate,
        commanderColorIdentity: args.commanderColorIdentity,
        catalog: args.catalog,
      });
      if (evaluation.requirementEligible) {
        matched.push(req.requirementId);
        if (!bestEval || evaluation.finalRequirementScore > bestEval.finalRequirementScore) {
          bestEval = evaluation;
        }
      }
    }
    if (!bestEval || matched.length === 0) continue;
    if (existingContributors.has(candidate.oracleId)) continue;

    const primaryFn = bestEval.satisfiedFunctions[0] ?? "ENGINE_ENABLER";
    const saturation = roleSaturation(args.blueprint, packageId, primaryFn);
    const underrepresented = unionReqs.some((r) => matched.includes(r.requirementId) && r.status === "SATISFIED" && saturation === 0);
    const packageCoverageDelta = 1;
    const redundancyNeed = underrepresented ? 90 : Math.max(10, 70 - saturation * 15);
    const densityScore = Math.round(
      bestEval.finalRequirementScore * 0.45 +
        redundancyNeed * 0.25 +
        bestEval.roleCompression * 0.15 +
        (saturation === 0 ? 20 : saturation >= 3 ? -15 : 0),
    );

    results.push({
      ...bestEval,
      requirementId: args.requirement.requirementId,
      matchedRequirementIds: matched,
      packageCoverageDelta,
      roleSaturation: saturation,
      redundancyNeed,
      densityScore,
    });
  }

  return results.sort(
    (a, b) =>
      b.densityScore - a.densityScore ||
      b.packageCoverageDelta - a.packageCoverageDelta ||
      b.finalRequirementScore - a.finalRequirementScore ||
      a.cardName.localeCompare(b.cardName),
  );
}

export function mandatoryPackageFloorsSatisfiedV417(blueprint: BrewBlueprintV417): boolean {
  return computePackageDensityStatesV417(blueprint)
    .filter((d) => blueprint.packages.find((p) => p.packageId === d.packageId)?.core)
    .every((d) => d.status !== "BELOW_MINIMUM");
}

export function openPackageDensityCountV417(blueprint: BrewBlueprintV417): number {
  return blueprint.openRequirements.filter((r) => isPackageDensityRequirement(r) && (r.status === "OPEN" || r.status === "PARTIAL")).length;
}

export function runtimePhysicalLowerBoundFromDensity(blueprint: BrewBlueprintV417): number {
  return computePackageDensityStatesV417(blueprint).reduce((sum, d) => sum + d.remainingMinimumDeficit, 0);
}
