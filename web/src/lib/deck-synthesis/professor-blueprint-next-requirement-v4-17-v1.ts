/**
 * Professor v4.17 Slice 5 — strategic next-requirement selection.
 */
import type { BrewBlueprintV417, BrewRequirementV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { BlueprintNextRequirementV417 } from "./professor-blueprint-assembly-types-v4-17-v1";
import { isPackageDensityRequirement } from "./professor-brew-blueprint-package-density-v4-17-v1";
import { isFunctionalDensityRequirement } from "./professor-brew-blueprint-functional-density-v4-17-v1";

export const PROFESSOR_BLUEPRINT_NEXT_REQUIREMENT_V4_17_V1_VERSION = "professor-blueprint-next-requirement-v4-17-v1";

const CHECKPOINT_FILL = [0.25, 0.5, 0.75, 0.9] as const;

function corePackageDeficit(blueprint: BrewBlueprintV417): number {
  return blueprint.packages.filter((p) => p.core && p.status !== "SATISFIED").length;
}

function requirementNeedsWork(blueprint: BrewBlueprintV417, req: BrewRequirementV417): boolean {
  if (req.status === "REVISE") return true;
  if (isPackageDensityRequirement(req)) return req.status === "OPEN" || req.status === "PARTIAL";
  if (isFunctionalDensityRequirement(req)) return req.status === "OPEN" || req.status === "PARTIAL";
  if (req.status === "SATISFIED") return false;
  if (req.status === "OPEN" || req.status === "PARTIAL") return true;
  return false;
}

function winDependencyScore(blueprint: BrewBlueprintV417, req: BrewRequirementV417): number {
  const winFns = new Set(blueprint.winArchitecture.flatMap((w) => w.requiredFunctions));
  if (req.family === "WIN_COMPONENT" || req.requiredFunctions.some((f) => winFns.has(f))) return 95;
  if (req.requiredFunctions.includes("WIN_SUPPORT")) return 90;
  return 0;
}

function engineScore(req: BrewRequirementV417): number {
  if (["ENGINE_ENABLER", "ENGINE_PAYOFF", "RESOURCE_PRODUCTION", "RESOURCE_CONSUMER"].includes(req.family)) return 88;
  if (req.requiredFunctions.some((f) => ["ENGINE", "ENGINE_ENABLER", "ENGINE_PAYOFF"].includes(f))) return 85;
  return 0;
}

function bracketInfraScore(blueprint: BrewBlueprintV417, req: BrewRequirementV417): number {
  const bracket = blueprint.userIntent.bracket;
  if (req.family === "ACCELERATION" && bracket >= 3) return 82;
  if (req.family === "INTERACTION" && bracket >= 3) return 80;
  if (req.family === "CARD_VELOCITY" && bracket >= 4) return 78;
  return 0;
}

function accessProtectionRecoveryScore(req: BrewRequirementV417): number {
  if (req.family === "ACCESS") return 76;
  if (req.family === "PROTECTION") return 74;
  if (req.family === "RECOVERY") return 72;
  if (req.family === "INTERACTION") return 70;
  return 0;
}

function redundancyScore(req: BrewRequirementV417): number {
  if (req.status === "PARTIAL" && req.selectedCardIds.length >= req.physicalSlotsNeeded.min) {
    const gap = req.physicalSlotsNeeded.preferred - req.selectedCardIds.length;
    if (gap > 0) return 55 + Math.min(10, gap * 3);
  }
  return 0;
}

function roleCompressionOpportunity(blueprint: BrewBlueprintV417, req: BrewRequirementV417): number {
  const openSameFn = blueprint.openRequirements.filter(
    (r) =>
      r.requirementId !== req.requirementId &&
      (r.status === "OPEN" || r.status === "PARTIAL") &&
      r.requiredFunctions.some((f) => req.requiredFunctions.includes(f)),
  );
  if (openSameFn.length >= 2) return 68;
  if (openSameFn.length === 1) return 58;
  return 0;
}

function physicalSlotPressureMultiplier(blueprint: BrewBlueprintV417): number {
  const expected = blueprint.physicalSlotBudget.expectedNonlands;
  const selected = blueprint.physicalSlotBudget.selectedNonlands;
  const fill = expected > 0 ? selected / expected : 0;
  let multiplier = 1;
  for (const checkpoint of CHECKPOINT_FILL) {
    if (fill >= checkpoint) multiplier += 0.08;
  }
  const mandatoryRemaining = blueprint.slotFeasibility.minimumPhysicalStillRequired;
  const slotsLeft = blueprint.physicalSlotBudget.remainingNonlandSlots;
  if (slotsLeft > 0 && mandatoryRemaining > slotsLeft) multiplier += 0.35;
  return multiplier;
}

function scoreRequirement(blueprint: BrewBlueprintV417, req: BrewRequirementV417): BlueprintNextRequirementV417 | null {
  if (!requirementNeedsWork(blueprint, req)) return null;

  if (isFunctionalDensityRequirement(req)) {
    const pressure = physicalSlotPressureMultiplier(blueprint);
    const belowMinimum = req.status === "OPEN";
    return {
      requirement: req,
      priorityScore: Math.round((belowMinimum ? 115 : 72) * pressure),
      rationale: `functional density deficit; status=${req.status}; current=${req.currentCoverage}/${req.targetCoverage}`,
      category: "FUNCTIONAL_DENSITY",
    };
  }

  if (isPackageDensityRequirement(req)) {
    const pressure = physicalSlotPressureMultiplier(blueprint);
    return {
      requirement: req,
      priorityScore: Math.round(108 * pressure),
      rationale: `package density deficit; status=${req.status}; current=${req.currentCoverage}/${req.targetCoverage}`,
      category: "PACKAGE_DENSITY",
    };
  }

  const coreDeficit = corePackageDeficit(blueprint);
  const inCorePackage = req.packageIds.some((pid) => blueprint.packages.find((p) => p.packageId === pid)?.core);
  let packageScore = inCorePackage && coreDeficit > 0 ? 100 + req.priority * 0.05 : req.priority;
  if (req.requirementId.startsWith("req-")) packageScore += 12;
  else if (req.requirementId.startsWith("pkg-")) packageScore -= 8;

  const scores: Array<{ score: number; category: BlueprintNextRequirementV417["category"]; note: string }> = [
    { score: packageScore, category: "MANDATORY_PACKAGE", note: inCorePackage ? "core package deficit" : "package priority" },
    { score: winDependencyScore(blueprint, req), category: "WIN_ARCHITECTURE", note: "win architecture dependency" },
    { score: engineScore(req), category: "ENGINE", note: "engine dependency" },
    { score: bracketInfraScore(blueprint, req), category: "BRACKET_INFRA", note: "bracket infrastructure" },
    { score: accessProtectionRecoveryScore(req), category: req.family as BlueprintNextRequirementV417["category"], note: req.family.toLowerCase() },
    { score: redundancyScore(req), category: "REDUNDANCY", note: "preferred-range redundancy" },
    { score: roleCompressionOpportunity(blueprint, req), category: "ROLE_COMPRESSION", note: "role-compression opportunity" },
  ];

  const best = scores.reduce((a, b) => (b.score > a.score ? b : a), { score: 0, category: "FLEX" as const, note: "baseline" });
  if (best.score <= 0 && req.status !== "OPEN" && req.status !== "PARTIAL") return null;

  const pressure = physicalSlotPressureMultiplier(blueprint);
  const priorityScore = Math.round((best.score || req.priority) * pressure);

  return {
    requirement: req,
    priorityScore,
    rationale: `${best.note}; status=${req.status}; priority=${req.priority}; pressure=${pressure.toFixed(2)}`,
    category: req.family === "FLEX" ? "FLEX" : best.category,
  };
}

export function chooseNextRequirementV417(blueprint: BrewBlueprintV417): BlueprintNextRequirementV417 | null {
  return chooseNextRequirementsV417(blueprint)[0] ?? null;
}

export function chooseNextRequirementsV417(blueprint: BrewBlueprintV417, limit = 8): BlueprintNextRequirementV417[] {
  return blueprint.openRequirements
    .map((req) => scoreRequirement(blueprint, req))
    .filter((c): c is BlueprintNextRequirementV417 => c !== null)
    .sort(
      (a, b) =>
        b.priorityScore - a.priorityScore ||
        b.requirement.priority - a.requirement.priority ||
        a.requirement.requirementId.localeCompare(b.requirement.requirementId),
    )
    .slice(0, limit);
}

export function physicalSlotPressureCheckpointV417(blueprint: BrewBlueprintV417): {
  fillRatio: number;
  checkpoint: number | null;
  overconstrained: boolean;
} {
  const expected = blueprint.physicalSlotBudget.expectedNonlands;
  const selected = blueprint.physicalSlotBudget.selectedNonlands;
  const fillRatio = expected > 0 ? selected / expected : 0;
  const checkpoint = CHECKPOINT_FILL.filter((c) => fillRatio >= c).pop() ?? null;
  const slotsLeft = blueprint.physicalSlotBudget.remainingNonlandSlots;
  const mandatoryRemaining = blueprint.slotFeasibility.minimumPhysicalStillRequired;
  return {
    fillRatio,
    checkpoint,
    overconstrained: slotsLeft > 0 && mandatoryRemaining > slotsLeft,
  };
}
