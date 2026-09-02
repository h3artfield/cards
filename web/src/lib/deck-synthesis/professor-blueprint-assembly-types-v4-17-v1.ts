/**
 * Professor v4.17 Slice 5 — assembly trace types.
 */
import type {
  BrewBlueprintV417,
  BrewRequirementV417,
  PackageBlueprintStatusV417,
  RequirementFunctionV417,
  WinArchitectureStatusV417,
} from "./professor-brew-blueprint-v4-17-v1";
import type {
  CandidateSupplyTraceV417,
  TailObjectiveExhaustionV417,
} from "./professor-requirement-adaptive-retrieval-v4-17-v1";

export const PROFESSOR_BLUEPRINT_ASSEMBLY_TYPES_V4_17_V1_VERSION = "professor-blueprint-assembly-types-v4-17-v1";

export type AssemblyFailureStateV417 =
  | "NO_ELIGIBLE_CANDIDATES"
  | "QUALITY_FLOOR_UNSATISFIED"
  | "BLUEPRINT_OVERCONSTRAINED"
  | "WIN_ARCHITECTURE_UNRESOLVED"
  | "ACCESS_ARCHITECTURE_UNRESOLVED"
  | "ACCESS_PORTFOLIO_UNSATISFIED"
  | "TRUE_SEMANTIC_SUPPLY_GAP"
  | "NO_POSITIVE_NONLAND_UTILITY"
  | "MANA_FRONTIER_REACHED"
  | "TAIL_REPAIR_AVAILABLE"
  | "TAIL_REPAIR_EXHAUSTED"
  | "PHYSICAL_BUDGET_EXHAUSTED"
  | "RETRIEVAL_EXHAUSTED"
  | "CREATIVE_REVISION_REQUIRED"
  | "BLUEPRINT_CLOSURE_UNDERCONSTRAINED"
  | "BLUEPRINT_DENSITY_CHALLENGE"
  | "TAIL_NO_SEMANTIC_MATCH"
  | "TAIL_NO_LEGAL_MATCH"
  | "TAIL_QUALITY_FLOOR"
  | "TAIL_NO_POSITIVE_MARGINAL_UTILITY"
  | "TAIL_ALL_MATCHES_ALREADY_SELECTED"
  | "TAIL_TRUE_SEARCH_SPACE_EXHAUSTION"
  | "CHEAP_ACCEPTANCE";

export type BlueprintCoverageSnapshotV417 = {
  requirementStatuses: Record<string, BrewRequirementV417["status"]>;
  packageStatuses: Record<string, PackageBlueprintStatusV417>;
  functionalCoverage: Record<string, number>;
  winStatuses: Record<string, WinArchitectureStatusV417>;
  selectedNonlands: number;
  remainingNonlandSlots: number;
};

export type BlueprintSelectionDecisionV417 = {
  version: typeof PROFESSOR_BLUEPRINT_ASSEMBLY_TYPES_V4_17_V1_VERSION;
  iteration: number;
  requirementId: string;
  beforeCoverage: BlueprintCoverageSnapshotV417;
  candidatesConsidered: number;
  selectedOracleId: string;
  selectedCardName: string;
  primaryRequirementDelta: number;
  secondaryCoverageDeltas: Array<{ requirementId: string; delta: number }>;
  packageDeltas: Array<{ packageId: string; before: PackageBlueprintStatusV417; after: PackageBlueprintStatusV417 }>;
  winArchitectureDelta: string | null;
  bracketDeltas: string[];
  physicalSlotsBefore: number;
  physicalSlotsAfter: number;
  coverageDeltaPerPhysicalSlot: number;
  usefulBlueprintDelta: number;
  rationale: string;
};

export type BlueprintNextRequirementV417 = {
  requirement: BrewRequirementV417;
  priorityScore: number;
  rationale: string;
  category:
    | "MANDATORY_PACKAGE"
    | "WIN_ARCHITECTURE"
    | "ENGINE"
    | "BRACKET_INFRA"
    | "ACCESS"
    | "PROTECTION"
    | "INTERACTION"
    | "RECOVERY"
    | "REDUNDANCY"
    | "ROLE_COMPRESSION"
    | "PACKAGE_DENSITY"
    | "FUNCTIONAL_DENSITY"
    | "FLEX";
};

export type ConvergenceTelemetryV417 = {
  physicalNonlands: number;
  mandatoryFunctionalOpen: number;
  functionalDensityBelowMinimum: number;
  functionalDensityPreferredOpen: number;
  packageFloorsOpen: number;
  flexObjectivesOpen: number;
  packages: Array<{
    packageId: string;
    current: number;
    minimum: number;
    preferred: number;
    status: string;
  }>;
  functionalDensities: Array<{
    budgetId: string;
    category: string;
    current: number;
    minimum: number;
    preferred: number;
    status: string;
    contributingCardIds: string[];
  }>;
  roleCompressionCredit: number;
  flexEntry: import("./professor-brew-blueprint-v4-17-v1").FlexEntryTelemetryV417 | null;
};

export type AssemblyCheckpointV417 = {
  nonlandCount: number;
  snapshot: BlueprintCoverageSnapshotV417;
  openRequirementCount: number;
  corePackagesSatisfied: boolean;
  convergence: ConvergenceTelemetryV417;
};

export type PreCriticDeckV417 = {
  commanderOracleId: string;
  nonlandOracleIds: string[];
  landOracleIds: string[];
  libraryOracleIds: string[];
};

export type ConstructionRescueClassificationV417 = "CONSTRUCTION_DOMINANT" | "MIXED" | "RESCUE_DOMINANT";

export type { CandidateSupplyTraceV417, TailObjectiveExhaustionV417 };

export function mapTailExhaustionToFailureV417(
  exhaustion: TailObjectiveExhaustionV417 | null | undefined,
): AssemblyFailureStateV417 {
  if (!exhaustion) return "NO_ELIGIBLE_CANDIDATES";
  if (exhaustion.densityChallenge) return "BLUEPRINT_DENSITY_CHALLENGE";
  switch (exhaustion.terminalReason) {
    case "NO_SEMANTIC_MATCH":
      return "TAIL_NO_SEMANTIC_MATCH";
    case "NO_LEGAL_MATCH":
      return "TAIL_NO_LEGAL_MATCH";
    case "QUALITY_FLOOR":
      return "TAIL_QUALITY_FLOOR";
    case "NO_POSITIVE_MARGINAL_UTILITY":
      return "TAIL_NO_POSITIVE_MARGINAL_UTILITY";
    case "ALL_MATCHES_ALREADY_SELECTED":
      return "TAIL_ALL_MATCHES_ALREADY_SELECTED";
    case "TRUE_SEARCH_SPACE_EXHAUSTION":
      return "TAIL_TRUE_SEARCH_SPACE_EXHAUSTION";
    default:
      return "NO_ELIGIBLE_CANDIDATES";
  }
}

export function snapshotBlueprintCoverageV417(blueprint: BrewBlueprintV417): BlueprintCoverageSnapshotV417 {
  return {
    requirementStatuses: Object.fromEntries(blueprint.openRequirements.map((r) => [r.requirementId, r.status])),
    packageStatuses: Object.fromEntries(blueprint.packages.map((p) => [p.packageId, p.status])),
    functionalCoverage: Object.fromEntries(blueprint.functionalBudgets.map((b) => [String(b.category), b.functionalCoverageSelected])),
    winStatuses: Object.fromEntries(blueprint.winArchitecture.map((w) => [w.planId, w.status])),
    selectedNonlands: blueprint.physicalSlotBudget.selectedNonlands,
    remainingNonlandSlots: blueprint.physicalSlotBudget.remainingNonlandSlots,
  };
}

export function computeCoverageDeltaPerPhysicalSlot(args: {
  primaryRequirementDelta: number;
  secondaryCoverageDeltas: Array<{ requirementId: string; delta: number }>;
  satisfiedFunctions: RequirementFunctionV417[];
}): number {
  const secondary = args.secondaryCoverageDeltas.reduce((s, d) => s + d.delta, 0);
  const roleBonus = Math.max(0, args.satisfiedFunctions.length - 1);
  return args.primaryRequirementDelta + secondary + roleBonus * 0.5;
}
