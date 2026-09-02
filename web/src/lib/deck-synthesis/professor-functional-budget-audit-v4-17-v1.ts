/**
 * Professor v4.17 — functional budget sanity audit.
 */
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";

export const PROFESSOR_FUNCTIONAL_BUDGET_AUDIT_V4_17_V1_VERSION = "professor-functional-budget-audit-v4-17-v1";

export type FunctionalBudgetAuditV417 = {
  sane: boolean;
  violations: string[];
  minimumUniquePhysicalRequired: number;
  remainingPhysicalSlots: number;
  sumFunctionalMinimums: number;
};

export function assessFunctionalBudgetSanityV417(blueprint: BrewBlueprintV417): FunctionalBudgetAuditV417 {
  const violations: string[] = [];
  let minimumUniquePhysicalRequired = 0;
  for (const pkg of blueprint.packages) {
    if (!pkg.core) continue;
    minimumUniquePhysicalRequired += pkg.minimumPhysicalContribution ?? pkg.minimumPhysicalSlots;
  }
  const sumFunctionalMinimums = blueprint.functionalBudgets.reduce((s, b) => s + b.minimum, 0);
  const remaining = blueprint.physicalSlotBudget.remainingNonlandSlots;

  if (minimumUniquePhysicalRequired > remaining + blueprint.physicalSlotBudget.selectedNonlands) {
    violations.push(
      `PHYSICAL_MINIMUM_EXCEEDS_SLOTS:${minimumUniquePhysicalRequired}>${blueprint.physicalSlotBudget.expectedNonlands}`,
    );
  }
  if (sumFunctionalMinimums > blueprint.physicalSlotBudget.expectedNonlands * 2) {
    violations.push(`FUNCTIONAL_MINIMUMS_IMPLAUSIBLE:${sumFunctionalMinimums}`);
  }
  for (const b of blueprint.functionalBudgets) {
    if (b.minimum > b.maximum) violations.push(`BUDGET_MIN_EXCEEDS_MAX:${b.category}`);
    if (b.minimum < 0) violations.push(`BUDGET_NEGATIVE:${b.category}`);
  }

  return {
    sane: violations.length === 0,
    violations,
    minimumUniquePhysicalRequired,
    remainingPhysicalSlots: remaining,
    sumFunctionalMinimums,
  };
}
