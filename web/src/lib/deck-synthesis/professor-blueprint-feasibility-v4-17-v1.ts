/**
 * Professor v4.17 — blueprint slot feasibility + consistency audit.
 */
import type {
  BlueprintConsistencyAuditV417,
  BlueprintPhysicalLowerBoundV417,
  BlueprintSlotFeasibilityV417,
  BrewBlueprintV417,
  PhysicalFeasibilityTraceV417,
  RequirementCoverageModeV417,
} from "./professor-brew-blueprint-v4-17-v1";
import type { SolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import { packageContributingCardIds } from "./professor-brew-blueprint-package-density-v4-17-v1";
import { trueSemanticGapLabels, unsupportedConceptLabels } from "./professor-semantic-concept-normalizer-v4-17-v1";

export const PROFESSOR_BLUEPRINT_FEASIBILITY_V4_17_V1_VERSION = "professor-blueprint-feasibility-v4-17-v1";

function coverageMode(req: BrewBlueprintV417["openRequirements"][number]): RequirementCoverageModeV417 {
  return req.coverageMode ?? "FUNCTIONAL_COVERAGE";
}

function computeNaiveMinimum(
  blueprint: Pick<BrewBlueprintV417, "packages" | "openRequirements" | "selectedCards">,
): number {
  let total = 0;
  for (const pkg of blueprint.packages) {
    if (!pkg.core) continue;
    const selectedInPkg = packageContributingCardIds(blueprint as BrewBlueprintV417, pkg.packageId).length;
    const minContrib = pkg.minimumPhysicalContribution ?? pkg.minimumPhysicalSlots;
    if (selectedInPkg < minContrib) total += minContrib - selectedInPkg;
    for (const group of pkg.requirementGroups ?? []) {
      if (!group.mandatory) continue;
      const groupSelected = blueprint.openRequirements
        .filter((r) => group.relatedRequirementIds.includes(r.requirementId))
        .reduce((sum, r) => sum + r.selectedCardIds.length, 0);
      if (groupSelected < group.minimumPhysicalSlots) {
        total += group.minimumPhysicalSlots - groupSelected;
      }
    }
  }
  for (const req of blueprint.openRequirements) {
    if (req.status === "SATISFIED") continue;
    total += Math.max(0, req.physicalSlotsNeeded.min - req.selectedCardIds.length);
  }
  return total;
}

export function computeBlueprintPhysicalLowerBoundV417(
  blueprint: Pick<BrewBlueprintV417, "physicalSlotBudget" | "packages" | "openRequirements" | "selectedCards">,
): { lowerBound: BlueprintPhysicalLowerBoundV417; trace: PhysicalFeasibilityTraceV417[] } {
  const trace: PhysicalFeasibilityTraceV417[] = [];
  let packageFloors = 0;
  let distinctCardRequirements = 0;
  const naiveSum = computeNaiveMinimum(blueprint);

  for (const pkg of blueprint.packages) {
    if (!pkg.core) continue;
    const selectedInPkg = packageContributingCardIds(blueprint as BrewBlueprintV417, pkg.packageId).length;
    const minContrib = pkg.minimumPhysicalContribution ?? pkg.minimumPhysicalSlots;
    const charge = Math.max(0, minContrib - selectedInPkg);
    if (charge > 0) {
      packageFloors += charge;
      trace.push({
        sourceId: pkg.packageId,
        sourceType: "PACKAGE_FLOOR",
        packageId: pkg.packageId,
        minimumCharged: charge,
        reason: `Core package physical floor (${minContrib} cards, ${selectedInPkg} selected)`,
        sharePolicy: "PACKAGE_SHAREABLE",
      });
    }
    for (const group of pkg.requirementGroups ?? []) {
      if (!group.mandatory) continue;
      const groupSelected = blueprint.openRequirements
        .filter((r) => group.relatedRequirementIds.includes(r.requirementId))
        .reduce((sum, r) => sum + r.selectedCardIds.length, 0);
      const wouldCharge = Math.max(0, group.minimumPhysicalSlots - groupSelected);
      if (wouldCharge > 0) {
        trace.push({
          sourceId: group.groupId,
          sourceType: "INFLATION_REMOVED",
          packageId: pkg.packageId,
          minimumCharged: 0,
          reason: `Group "${group.name}" min ${group.minimumPhysicalSlots} absorbed by package floor — functional coverage within density`,
          sharePolicy: "PACKAGE_SHAREABLE",
        });
      }
    }
  }

  for (const req of blueprint.openRequirements) {
    if (req.status === "SATISFIED") continue;
    const mode = coverageMode(req);
    const wouldCharge = Math.max(0, req.physicalSlotsNeeded.min - req.selectedCardIds.length);
    if (mode === "DISTINCT_PHYSICAL_CARD" && wouldCharge > 0) {
      distinctCardRequirements += wouldCharge;
      trace.push({
        sourceId: req.requirementId,
        sourceType: "DISTINCT_REQUIREMENT",
        requirementId: req.requirementId,
        packageId: req.packageIds[0],
        minimumCharged: wouldCharge,
        reason: `Distinct physical card requirement (${req.purpose})`,
        sharePolicy: req.sharePolicy ?? "GLOBALLY_DISTINCT",
      });
    } else if (mode === "FUNCTIONAL_COVERAGE" && wouldCharge > 0) {
      trace.push({
        sourceId: req.requirementId,
        sourceType: "INFLATION_REMOVED",
        requirementId: req.requirementId,
        packageId: req.packageIds[0],
        minimumCharged: 0,
        reason: `Functional coverage "${req.purpose}" — does not independently consume physical slot (sharePolicy=${req.sharePolicy ?? "GLOBAL_SHAREABLE"})`,
        sharePolicy: req.sharePolicy ?? "GLOBAL_SHAREABLE",
      });
    } else if (mode === "PACKAGE_PHYSICAL_DENSITY") {
      trace.push({
        sourceId: req.requirementId,
        sourceType: "INFLATION_REMOVED",
        requirementId: req.requirementId,
        packageId: req.packageIds[0],
        minimumCharged: 0,
        reason: "Package density constraint — counted via package floor only",
        sharePolicy: req.sharePolicy ?? "PACKAGE_SHAREABLE",
      });
    }
  }

  const correctedLowerBound = packageFloors + distinctCardRequirements;
  return {
    lowerBound: {
      packageFloors,
      distinctCardRequirements,
      correctedLowerBound,
      naiveSum,
      inflationRemoved: Math.max(0, naiveSum - correctedLowerBound),
    },
    trace,
  };
}

export function assessBlueprintSlotFeasibilityV417(
  blueprint: Pick<BrewBlueprintV417, "physicalSlotBudget" | "packages" | "openRequirements" | "selectedCards">,
): BlueprintSlotFeasibilityV417 {
  const remaining = blueprint.physicalSlotBudget.remainingNonlandSlots;
  const { lowerBound, trace } = computeBlueprintPhysicalLowerBoundV417(blueprint);
  const minimumPhysicalStillRequired = lowerBound.correctedLowerBound;
  const feasible = minimumPhysicalStillRequired <= remaining;
  const violations: string[] = [];
  if (!feasible) {
    violations.push(
      `BLUEPRINT_OVERCONSTRAINED: corrected lower bound ${minimumPhysicalStillRequired} slots (naive ${lowerBound.naiveSum}), ${remaining} remaining`,
    );
  }

  return {
    remainingPhysicalSlots: remaining,
    minimumPhysicalStillRequired,
    naiveMinimumPhysicalStillRequired: lowerBound.naiveSum,
    physicalLowerBound: lowerBound,
    feasibilityTrace: trace,
    feasible,
    status: feasible ? "FEASIBLE" : "BLUEPRINT_OVERCONSTRAINED",
    violations,
  };
}

export function auditBlueprintConsistencyV417(args: {
  blueprint: BrewBlueprintV417;
  proposal?: SolBlueprintProposalV417;
}): BlueprintConsistencyAuditV417 {
  const violations: string[] = [];
  const unsupported = unsupportedConceptLabels(args.blueprint.normalizedConcepts ?? []);
  const trueGaps = trueSemanticGapLabels(args.blueprint.normalizedConcepts ?? []);

  const commanderSupportsStrategy =
    args.blueprint.commander.semanticFunctions.length > 0 ||
    args.blueprint.commander.exploitOpportunities.some((e) =>
      args.blueprint.strategy.primaryStrategy.toLowerCase().includes(e.split("_")[0] ?? ""),
    ) ||
    args.blueprint.strategy.primaryStrategy.length > 0;

  if (!commanderSupportsStrategy) violations.push("COMMANDER_STRATEGY_MISMATCH");

  const strategySupportsPackages =
    args.blueprint.packages.length > 0 &&
    args.blueprint.packages.every((p) => p.purpose.length > 0 && p.requiredFunctions.length > 0);
  if (!strategySupportsPackages) violations.push("STRATEGY_PACKAGE_MISMATCH");

  const packagesMapToRequirements =
    args.blueprint.packages.every((p) =>
      p.relatedRequirementIds.length > 0 ||
      (p.requirementGroups?.length ?? 0) > 0 ||
      args.blueprint.openRequirements.some((r) => r.packageIds.includes(p.packageId)),
    );
  if (!packagesMapToRequirements) violations.push("PACKAGE_REQUIREMENT_GAP");

  const winPlanFitsStrategy =
    args.blueprint.winArchitecture.length > 0 &&
    args.blueprint.winArchitecture.every((w) => w.status !== "VERIFIED" || w.mechanicallyVerified);
  if (!winPlanFitsStrategy) violations.push("WIN_VERIFIED_WITHOUT_MECHANICAL");

  const feasibility = assessBlueprintSlotFeasibilityV417(args.blueprint);
  const bracketRequirementsFeasible = args.blueprint.userIntent.bracket <= 5;
  const physicalSlotAllocationFeasible = feasibility.feasible;
  if (!physicalSlotAllocationFeasible) violations.push(...feasibility.violations);

  let status: BlueprintConsistencyAuditV417["status"] = "PASS";
  if (violations.some((v) => v.startsWith("BLUEPRINT_OVERCONSTRAINED"))) status = "INVALID";
  else if (trueGaps.length > 0 || unsupported.length > 0) status = "NEEDS_RESEARCH";
  else if (violations.length > 0) status = "REVISE";

  return {
    status,
    commanderSupportsStrategy,
    strategySupportsPackages,
    packagesMapToRequirements,
    winPlanFitsStrategy,
    bracketRequirementsFeasible,
    physicalSlotAllocationFeasible,
    unsupportedConcepts: [...unsupported, ...trueGaps],
    violations,
  };
}

export function defaultSlotFeasibilityV417(): BlueprintSlotFeasibilityV417 {
  return {
    remainingPhysicalSlots: 64,
    minimumPhysicalStillRequired: 0,
    naiveMinimumPhysicalStillRequired: 0,
    physicalLowerBound: {
      packageFloors: 0,
      distinctCardRequirements: 0,
      correctedLowerBound: 0,
      naiveSum: 0,
      inflationRemoved: 0,
    },
    feasibilityTrace: [],
    feasible: true,
    status: "FEASIBLE",
    violations: [],
  };
}

export function defaultConsistencyAuditV417(): BlueprintConsistencyAuditV417 {
  return {
    status: "NEEDS_RESEARCH",
    commanderSupportsStrategy: true,
    strategySupportsPackages: true,
    packagesMapToRequirements: true,
    winPlanFitsStrategy: true,
    bracketRequirementsFeasible: true,
    physicalSlotAllocationFeasible: true,
    unsupportedConcepts: [],
    violations: [],
  };
}
