/**
 * Professor v4.17 Slice 5 — close FUNCTIONAL_COVERAGE requirements via role compression.
 */
import type { BrewBlueprintV417, BrewRequirementV417 } from "./professor-brew-blueprint-v4-17-v1";
import { refreshPackageStatusesV417, refreshFunctionalBudgetCoverageV417 } from "./professor-brew-blueprint-package-v4-17-v1";
import { assessBlueprintSlotFeasibilityV417, auditBlueprintConsistencyV417 } from "./professor-blueprint-feasibility-v4-17-v1";
import { recomputeBlueprintValidationV417, recomputePhysicalSlotBudgetV417 } from "./professor-brew-blueprint-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_RECONCILE_V4_17_V1_VERSION = "professor-brew-blueprint-reconcile-v4-17-v1";

function globalFunctionCounts(blueprint: BrewBlueprintV417): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of blueprint.selectedCards) {
    for (const fn of card.satisfiedFunctions) {
      counts.set(fn, (counts.get(fn) ?? 0) + 1);
    }
  }
  return counts;
}

function reconcileRequirement(req: BrewRequirementV417, global: Map<string, number>): BrewRequirementV417 {
  if (req.status === "REVISE") return req;
  if (req.coverageMode !== "FUNCTIONAL_COVERAGE") return req;
  const fn = req.requiredFunctions[0];
  if (!fn) return req;

  const pool = global.get(fn) ?? 0;
  const assigned = req.selectedCardIds.length;
  if (req.status === "OPEN" && assigned === 0 && req.requirementId.startsWith("pkg-") && pool >= Math.max(2, req.physicalSlotsNeeded.preferred + 1)) {
    return {
      ...req,
      status: "SATISFIED",
      currentCoverage: pool,
    };
  }
  if (req.status === "PARTIAL" && assigned + pool >= req.physicalSlotsNeeded.preferred) {
    return { ...req, status: "SATISFIED", currentCoverage: assigned + pool };
  }
  return req;
}

export function reconcileFunctionalRequirementsV417(blueprint: BrewBlueprintV417): BrewBlueprintV417 {
  const global = globalFunctionCounts(blueprint);
  const openRequirements = blueprint.openRequirements.map((req) => reconcileRequirement(req, global));
  const next: BrewBlueprintV417 = {
    ...blueprint,
    openRequirements,
    packages: refreshPackageStatusesV417({ ...blueprint, openRequirements }),
    functionalBudgets: refreshFunctionalBudgetCoverageV417({ ...blueprint, openRequirements }),
  };
  next.physicalSlotBudget = recomputePhysicalSlotBudgetV417(next);
  next.slotFeasibility = assessBlueprintSlotFeasibilityV417(next);
  next.consistencyAudit = auditBlueprintConsistencyV417({ blueprint: next });
  next.validation = recomputeBlueprintValidationV417(next);
  return next;
}
