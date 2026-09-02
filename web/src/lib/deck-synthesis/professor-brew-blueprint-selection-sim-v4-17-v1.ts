/**
 * Professor v4.17 Slice 5.2 — selection simulation, usefulBlueprintDelta, marginal utility.
 */
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { RequirementCandidateEvaluationV417 } from "./professor-requirement-candidate-v4-17-v1";
import { applyRequirementSelectionV417 } from "./professor-brew-blueprint-mutation-v4-17-v1";
import {
  computeCoverageDeltaPerPhysicalSlot,
  snapshotBlueprintCoverageV417,
  type BlueprintCoverageSnapshotV417,
} from "./professor-blueprint-assembly-types-v4-17-v1";
import type { RankedAssemblyCandidateV417 } from "./professor-blueprint-candidate-ranking-v4-17-v1";
import { computePackageDensityStatesV417, isPackageDensityRequirement } from "./professor-brew-blueprint-package-density-v4-17-v1";
import {
  computeFunctionalDensityDeltaForSelectionV417,
  computeFunctionalDensityStatesV417,
  computeMarginalBlueprintUtilityV417,
  isFunctionalDensityRequirement,
  mandatoryStructureSatisfiedV417,
  type MarginalBlueprintUtilityV417,
} from "./professor-brew-blueprint-functional-density-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_SELECTION_SIM_V4_17_V1_VERSION = "professor-brew-blueprint-selection-sim-v4-17-v1";

export type SelectionSimulationV417 = {
  beforeCoverage: BlueprintCoverageSnapshotV417;
  afterCoverage: BlueprintCoverageSnapshotV417;
  primaryRequirementDelta: number;
  secondaryCoverageDeltas: Array<{ requirementId: string; delta: number }>;
  packageDeltas: Array<{ packageId: string; before: BrewBlueprintV417["packages"][number]["status"]; after: BrewBlueprintV417["packages"][number]["status"] }>;
  winArchitectureDelta: string | null;
  coverageDeltaPerPhysicalSlot: number;
  usefulBlueprintDelta: number;
  marginalUtility: MarginalBlueprintUtilityV417 | null;
  simulatedBlueprint: BrewBlueprintV417;
};

function requirementProgress(before: BlueprintCoverageSnapshotV417, after: BlueprintCoverageSnapshotV417, requirementId: string): number {
  const statusRank = (s: string | undefined) => (s === "SATISFIED" ? 2 : s === "PARTIAL" ? 1 : 0);
  return statusRank(after.requirementStatuses[requirementId]) - statusRank(before.requirementStatuses[requirementId]);
}

export function simulateRequirementSelectionV417(args: {
  blueprint: BrewBlueprintV417;
  requirementId: string;
  candidate: RankedAssemblyCandidateV417;
  candidateOracleText: string;
  candidateTypeLine: string;
  packageDensityDelta?: number;
  functionalDensityDelta?: number;
  marginalUtility?: MarginalBlueprintUtilityV417;
  catalog?: import("../../../scripts/lib/load-deck-resolution-catalog").DeckResolutionCatalog | null;
}): SelectionSimulationV417 {
  const beforeCoverage = snapshotBlueprintCoverageV417(args.blueprint);
  const beforePackageDensity = computePackageDensityStatesV417(args.blueprint);
  const beforeFunctionalDensity = computeFunctionalDensityStatesV417(args.blueprint);
  const req = args.blueprint.openRequirements.find((r) => r.requirementId === args.requirementId);
  const targetPackageId = req?.packageIds[0];
  const mandatoryBefore = mandatoryStructureSatisfiedV417(args.blueprint);

  const simulatedBlueprint = applyRequirementSelectionV417({
    blueprint: args.blueprint,
    requirementId: args.requirementId,
    topEvaluation: args.candidate,
    candidateOracleText: args.candidateOracleText,
    candidateTypeLine: args.candidateTypeLine,
    secondaryRequirementIds: args.candidate.secondaryRequirementIds,
    catalog: args.catalog,
  });
  const afterCoverage = snapshotBlueprintCoverageV417(simulatedBlueprint);
  const afterPackageDensity = computePackageDensityStatesV417(simulatedBlueprint);
  const mandatoryAfter = mandatoryStructureSatisfiedV417(simulatedBlueprint);

  const primaryRequirementDelta = requirementProgress(beforeCoverage, afterCoverage, args.requirementId);
  const secondaryCoverageDeltas = args.candidate.secondaryRequirementIds.map((requirementId) => ({
    requirementId,
    delta: requirementProgress(beforeCoverage, afterCoverage, requirementId),
  }));

  const packageDeltas = args.blueprint.packages.map((pkg) => ({
    packageId: pkg.packageId,
    before: beforeCoverage.packageStatuses[pkg.packageId] ?? pkg.status,
    after: afterCoverage.packageStatuses[pkg.packageId] ?? pkg.status,
  }));

  const winBefore = Object.values(beforeCoverage.winStatuses).join(",");
  const winAfter = Object.values(afterCoverage.winStatuses).join(",");
  const winArchitectureDelta = winBefore !== winAfter ? `${winBefore}→${winAfter}` : null;

  const coverageDeltaPerPhysicalSlot = computeCoverageDeltaPerPhysicalSlot({
    primaryRequirementDelta,
    secondaryCoverageDeltas,
    satisfiedFunctions: args.candidate.satisfiedFunctions,
  });

  const functionalDelta = Object.keys(afterCoverage.functionalCoverage).reduce((sum, key) => {
    const beforeVal = beforeCoverage.functionalCoverage[key] ?? 0;
    const afterVal = afterCoverage.functionalCoverage[key] ?? 0;
    return sum + Math.max(0, afterVal - beforeVal);
  }, 0);

  const functionalDensityDelta =
    args.functionalDensityDelta ??
    computeFunctionalDensityDeltaForSelectionV417({
      blueprint: args.blueprint,
      requirementId: args.requirementId,
      satisfiedFunctions: args.candidate.satisfiedFunctions,
      candidateOracleId: args.candidate.oracleId,
    });

  const packageProgress = packageDeltas.filter((d) => d.before !== d.after && d.after === "SATISFIED").length;
  const distinctSlot =
    args.blueprint.openRequirements.find((r) => r.requirementId === args.requirementId)?.coverageMode === "DISTINCT_PHYSICAL_CARD";

  const packagePhysicalDelta =
    targetPackageId != null
      ? (afterPackageDensity.find((d) => d.packageId === targetPackageId)?.currentPhysicalContribution ?? 0) -
        (beforePackageDensity.find((d) => d.packageId === targetPackageId)?.currentPhysicalContribution ?? 0)
      : 0;

  const marginalUtility =
    args.marginalUtility ??
    (!mandatoryBefore || req?.requirementId.startsWith("flex-")
      ? computeMarginalBlueprintUtilityV417({
          blueprint: args.blueprint,
          candidate: args.candidate,
          beforeStates: beforeFunctionalDensity,
        })
      : null);

  const deficitClosureDelta = Math.max(
    primaryRequirementDelta +
      secondaryCoverageDeltas.reduce((s, d) => s + d.delta, 0) +
      functionalDelta * 0.25 +
      packageProgress,
    args.packageDensityDelta ?? 0,
    packagePhysicalDelta,
    functionalDensityDelta,
    req && isPackageDensityRequirement(req) ? 1 : 0,
    req && isFunctionalDensityRequirement(req) ? functionalDensityDelta : 0,
    distinctSlot ? 1 : 0,
  );

  const optimizationDelta = mandatoryBefore && !mandatoryAfter ? 0 : marginalUtility?.total ?? 0;
  const usefulBlueprintDelta = mandatoryBefore ? Math.max(deficitClosureDelta, optimizationDelta) : deficitClosureDelta;

  return {
    beforeCoverage,
    afterCoverage,
    primaryRequirementDelta,
    secondaryCoverageDeltas,
    packageDeltas,
    winArchitectureDelta,
    coverageDeltaPerPhysicalSlot,
    usefulBlueprintDelta,
    marginalUtility,
    simulatedBlueprint,
  };
}

export function passesUsefulDeltaGateV417(simulation: SelectionSimulationV417): boolean {
  return simulation.usefulBlueprintDelta > 0;
}

export function evaluationToCandidate(args: {
  evaluation: RequirementCandidateEvaluationV417;
  secondaryRequirementIds?: string[];
}): RankedAssemblyCandidateV417 {
  return {
    ...args.evaluation,
    requirementFit: args.evaluation.missionFit,
    packageContribution: 50,
    coverageDeltaPerPhysicalSlot: args.evaluation.satisfiedFunctions.length,
    deckLevelScore: args.evaluation.finalRequirementScore,
    secondaryRequirementIds: args.secondaryRequirementIds ?? [],
    verifiedSecondaryCount: args.secondaryRequirementIds?.length ?? 0,
  };
}
