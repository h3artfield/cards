/**
 * Professor v4.17 — package status derived from requirement groups + satisfaction.
 */
import type { BrewBlueprintV417, PackageBlueprintV417, PackageBlueprintStatusV417 } from "./professor-brew-blueprint-v4-17-v1";
import { computeFunctionalDensityStatesV417, resolveFunctionalBudgetLabelV417 } from "./professor-brew-blueprint-functional-density-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_PACKAGE_V4_17_V1_VERSION = "professor-brew-blueprint-package-v4-17-v1";

function groupSatisfied(
  blueprint: Pick<BrewBlueprintV417, "openRequirements" | "selectedCards">,
  group: PackageBlueprintV417["requirementGroups"][number],
): boolean {
  const relatedReqs = blueprint.openRequirements.filter((r) => group.relatedRequirementIds.includes(r.requirementId));
  if (relatedReqs.length === 0) return false;
  const selectedCount = relatedReqs.reduce((sum, r) => sum + r.selectedCardIds.length, 0);
  return relatedReqs.every((r) => r.status === "SATISFIED") && selectedCount >= group.minimumPhysicalSlots;
}

export function derivePackageStatusV417(
  pkg: PackageBlueprintV417,
  blueprint: Pick<BrewBlueprintV417, "openRequirements" | "selectedCards">,
): PackageBlueprintStatusV417 {
  if (pkg.status === "ABANDONED" || pkg.status === "REVISE") return pkg.status;

  const selectedInPkg = blueprint.selectedCards.filter((c) => c.packageIds.includes(pkg.packageId)).length;
  const minContrib = pkg.minimumPhysicalContribution ?? pkg.minimumPhysicalSlots;

  const mandatoryGroups = pkg.requirementGroups?.filter((g) => g.mandatory) ?? [];
  const mandatorySatisfied =
    mandatoryGroups.length === 0 || mandatoryGroups.every((g) => groupSatisfied(blueprint, g));

  const related = blueprint.openRequirements.filter((r) => pkg.relatedRequirementIds.includes(r.requirementId));
  const allRelatedSatisfied = related.length > 0 && related.every((r) => r.status === "SATISFIED");
  const anyProgress =
    selectedInPkg > 0 || related.some((r) => r.status === "SATISFIED" || r.status === "PARTIAL");

  if (mandatorySatisfied && selectedInPkg >= minContrib && (allRelatedSatisfied || mandatoryGroups.length > 0)) {
    return "SATISFIED";
  }
  if (anyProgress) return "PARTIAL";
  return "OPEN";
}

export function refreshPackageStatusesV417(blueprint: BrewBlueprintV417): PackageBlueprintV417[] {
  return blueprint.packages.map((pkg) => ({
    ...pkg,
    status: derivePackageStatusV417(pkg, blueprint),
    selectedCardIds: blueprint.selectedCards.filter((c) => c.packageIds.includes(pkg.packageId)).map((c) => c.oracleId),
  }));
}

export function refreshFunctionalBudgetCoverageV417(blueprint: BrewBlueprintV417) {
  const states = computeFunctionalDensityStatesV417(blueprint);
  return blueprint.functionalBudgets.map((b) => {
    const label = resolveFunctionalBudgetLabelV417(b);
    const state = states.find((s) => s.category === label);
    return {
      ...b,
      functionalCoverageSelected: state?.currentDistinctContributors ?? 0,
    };
  });
}
