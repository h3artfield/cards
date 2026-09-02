/**
 * Professor v4.17 — authoritative structured brew blueprint (single strategic state).
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { selectedNonlandsFromCanonicalTruthV1 } from "./professor-canonical-deck-partition-v1";

export const PROFESSOR_BREW_BLUEPRINT_V4_17_V1_VERSION = "professor-brew-blueprint-v4-17-v1";

export type BlueprintRequirementStatusV417 = "OPEN" | "PARTIAL" | "SATISFIED" | "REVISE";
export type PackageBlueprintStatusV417 = "OPEN" | "PARTIAL" | "SATISFIED" | "REVISE" | "ABANDONED";
export type WinArchitectureStatusV417 = "HYPOTHESIZED" | "PARTIAL" | "VERIFIED";
export type RequirementFunctionV417 =
  | "RETURN_FROM_GRAVEYARD"
  | "GRAVEYARD_ENABLER"
  | "INTERACTION"
  | "ACCELERATION"
  | "CARD_VELOCITY"
  | "PROTECTION"
  | "WIN_SUPPORT"
  | "WIN_COMPONENT"
  | "ENGINE"
  | "ENGINE_ENABLER"
  | "ENGINE_PAYOFF"
  | "RESOURCE_PRODUCTION"
  | "RESOURCE_CONSUMER"
  | "ACCESS"
  | "RECOVERY"
  | "FLEX";

export type RequirementFamilyV417 =
  | "ACCELERATION"
  | "CARD_VELOCITY"
  | "INTERACTION"
  | "PROTECTION"
  | "ENGINE_ENABLER"
  | "ENGINE_PAYOFF"
  | "RESOURCE_PRODUCTION"
  | "RESOURCE_CONSUMER"
  | "ACCESS"
  | "RECOVERY"
  | "WIN_COMPONENT"
  | "RETURN_FROM_GRAVEYARD"
  | "GRAVEYARD_ENABLER"
  | "PACKAGE_DENSITY"
  | "FUNCTIONAL_DENSITY"
  | "FLEX";

export type SemanticConceptStatusV417 = "VERIFIED" | "SUPPORTED" | "NEEDS_RESEARCH" | "UNSUPPORTED" | "STRATEGICALLY_SUPPORTED";

export type SemanticConceptKindV417 = "MECHANICAL_SEMANTIC" | "STRATEGIC_ABSTRACTION" | "TRUE_SEMANTIC_GAP";

export type NormalizedSemanticConceptV417 = {
  concept: string;
  status: SemanticConceptStatusV417;
  conceptKind: SemanticConceptKindV417;
  mappedFunctions: RequirementFunctionV417[];
  evidence: string[];
  composedFrom?: RequirementFunctionV417[];
};

export type RequirementHardConstraintV417 = {
  constraintId: string;
  description: string;
  semanticToken?: string;
};

export type RequirementPreferredQualityV417 = {
  qualityId: string;
  description: string;
  weight: number;
};

export type RequirementBracketContractV417 = {
  family: RequirementFamilyV417;
  requestedBracket: number;
  dimensions: Record<string, "low" | "medium" | "high">;
};

export type PackageRequirementGroupV417 = {
  groupId: string;
  name: string;
  mandatory: boolean;
  relatedRequirementIds: string[];
  minimumPhysicalSlots: number;
  preferredPhysicalSlots: number;
};

export type RequirementCoverageModeV417 =
  | "FUNCTIONAL_COVERAGE"
  | "PACKAGE_PHYSICAL_DENSITY"
  | "DISTINCT_PHYSICAL_CARD";

export type RequirementSharePolicyV417 =
  | "GLOBAL_SHAREABLE"
  | "PACKAGE_SHAREABLE"
  | "PACKAGE_LOCAL_DISTINCT"
  | "GLOBALLY_DISTINCT";

export type PhysicalFeasibilityTraceV417 = {
  sourceId: string;
  sourceType: "PACKAGE_FLOOR" | "GROUP_FLOOR" | "REQUIREMENT_MIN" | "DISTINCT_REQUIREMENT" | "INFLATION_REMOVED";
  packageId?: string;
  requirementId?: string;
  minimumCharged: number;
  reason: string;
  sharePolicy: RequirementSharePolicyV417 | "N/A";
};

export type BlueprintPhysicalLowerBoundV417 = {
  packageFloors: number;
  distinctCardRequirements: number;
  correctedLowerBound: number;
  naiveSum: number;
  inflationRemoved: number;
};

export type BlueprintSlotFeasibilityV417 = {
  remainingPhysicalSlots: number;
  minimumPhysicalStillRequired: number;
  naiveMinimumPhysicalStillRequired: number;
  physicalLowerBound: BlueprintPhysicalLowerBoundV417;
  feasibilityTrace: PhysicalFeasibilityTraceV417[];
  feasible: boolean;
  status: "FEASIBLE" | "BLUEPRINT_OVERCONSTRAINED";
  violations: string[];
};

export type BlueprintConsistencyStatusV417 = "PASS" | "NEEDS_RESEARCH" | "REVISE" | "INVALID";

export type BlueprintConsistencyAuditV417 = {
  status: BlueprintConsistencyStatusV417;
  commanderSupportsStrategy: boolean;
  strategySupportsPackages: boolean;
  packagesMapToRequirements: boolean;
  winPlanFitsStrategy: boolean;
  bracketRequirementsFeasible: boolean;
  physicalSlotAllocationFeasible: boolean;
  unsupportedConcepts: string[];
  violations: string[];
};

export type CommanderBlueprintV417 = {
  oracleId: string;
  name: string;
  colorIdentity: string[];
  manaValue: number | null;
  oracleText: string;
  semanticFunctions: string[];
  mechanics: string[];
  resourcesProduced: string[];
  resourcesConsumed: string[];
  triggeredEvents: string[];
  zoneRelationships: string[];
  exploitOpportunities: string[];
  provenance: string[];
};

export type UserIntentBlueprintV417 = {
  format: "Commander";
  bracket: number;
  playStyle: string;
  commanderDependence: string;
  comboPolicy: string;
  archetype?: string;
  relationship?: string;
  winPreference?: string;
};

export type BracketQualityContractV417 = {
  requestedBracket: number;
  minimumManaEfficiency: "low" | "medium" | "high";
  minimumFlexibility: "low" | "medium" | "high";
  maximumTempoLoss: "low" | "medium" | "high";
};

export type BracketContractBlueprintV417 = {
  requestedBracket: number;
  accelerationExpectation: string;
  interactionExpectation: string;
  cardQualityExpectation: string;
  tutorExpectation: string;
  protectionExpectation: string;
  redundancyExpectation: string;
  threatSpeedExpectation: string;
  recoveryExpectation: string;
  winCompactnessExpectation: string;
  comboPolicy: string;
  commanderDependenceTarget: string;
  qualityContract: BracketQualityContractV417;
};

export type StrategyBlueprintV417 = {
  primaryStrategy: string;
  secondaryStrategy: string;
  commanderExploit: string;
  independentEngine: string;
  expectedPlayPattern: string;
  strategicThesis: string;
  strengths: string[];
  weaknesses: string[];
  dependencies: string[];
  protectionNeeds: string[];
  accessNeeds: string[];
  researchSeeds?: string[];
};

export type WinArchitectureTypeV417 =
  | "DETERMINISTIC_LINE"
  | "COMBAT_CLOCK"
  | "RESOURCE_CONVERSION"
  | "ATTRITION_ENGINE"
  | "ALTERNATE_WIN"
  | "FINITE_BURST";

export type WinArchitectureBlueprintV417 = {
  planId: string;
  plan: string;
  status: WinArchitectureStatusV417;
  mechanicallyVerified: boolean;
  requiredFunctions: string[];
  requiredCardsOrEquivalents: string[];
};

export type PackageBlueprintV417 = {
  packageId: string;
  name: string;
  purpose: string;
  core: boolean;
  minimumPhysicalSlots: number;
  preferredPhysicalSlots: number;
  maximumPhysicalSlots: number;
  minimumPhysicalContribution: number;
  preferredPhysicalContribution: number;
  requirementGroups: PackageRequirementGroupV417[];
  requiredFunctions: RequirementFunctionV417[];
  preferredFunctions: RequirementFunctionV417[];
  relatedRequirementIds: string[];
  status: PackageBlueprintStatusV417;
  selectedCardIds: string[];
};

export type FunctionalBudgetV417 = {
  category: RequirementFunctionV417 | string;
  /** Sol human label when category is GENERAL or absent. */
  function?: string;
  minimum: number;
  maximum: number;
  /** Functional satisfaction credit — distinct contributors toward this budget. */
  functionalCoverageSelected: number;
  /** ACCESS closure semantics when category is tutorsAndAccess. */
  obligation?: "REQUIRED_MINIMUM" | "PREFERRED_TARGET" | "OPTIONAL";
};

export type FunctionalDensityScopeV417 = "GLOBAL" | "PACKAGE";

export type FunctionalDensityStatusV417 =
  | "BELOW_MINIMUM"
  | "MINIMUM_SATISFIED"
  | "PREFERRED_SATISFIED"
  | "SATURATED"
  | "UNRESOLVED";

export type FunctionalDensityStateV417 = {
  budgetId: string;
  category: string;
  scope: FunctionalDensityScopeV417;
  minimum: number;
  preferred: number;
  maximum: number;
  currentDistinctContributors: number;
  contributingCardIds: string[];
  remainingMinimumDeficit: number;
  remainingPreferredDeficit: number;
  normalizedFunctions: RequirementFunctionV417[];
  underrepresentedSubroles: string[];
  status: FunctionalDensityStatusV417;
  unresolvedReason?: string;
};

export type FunctionalDensityContributionV417 = {
  budgetId: string;
  category: string;
  contributedFunctions: RequirementFunctionV417[];
  semanticEvidence: string[];
  contributionStrength: number;
  countsTowardFunctionalDensity: boolean;
};

export type MarginalBlueprintUtilityV417 = {
  preferredCoverageDelta: number;
  bracketQualityDelta: number;
  interactionBreadthDelta: number;
  resilienceDelta: number;
  recoveryDelta: number;
  accessDelta: number;
  winReliabilityDelta: number;
  packageRedundancyDelta: number;
  roleCompressionDelta: number;
  curveEfficiencyDelta: number;
  saturationPenalty: number;
  total: number;
};

export type FlexCandidateEvaluationV417 = {
  oracleId: string;
  cardName: string;
  retrieved: boolean;
  semanticallyEligible: boolean;
  qualityPassed: boolean;
  marginalUtility: number;
  rejectionReason?: string;
};

export type FlexEntryTelemetryV417 = {
  selectedNonlandsAtFlexEntry: number;
  remainingNonlandsAtFlexEntry: number;
  mandatoryMinimaSatisfied: boolean;
  preferredCoverageRemaining: number;
  underconstrained: boolean;
  functionalDensityMinimumsOpen: number;
  functionalDensityPreferredOpen: number;
  mandatoryBinaryRequirementsOpen: number;
  packageFloorsOpen: number;
  flexPrimaryAllowed: boolean;
  topFlexCandidateEvaluations?: FlexCandidateEvaluationV417[];
};

export type PhysicalSlotBudgetV417 = {
  expectedNonlands: number;
  selectedNonlands: number;
  remainingNonlandSlots: number;
  expectedLands: number;
  selectedLands: number;
  remainingLandSlots: number;
};

export type SemanticRoleAssertionV417 = {
  function: RequirementFunctionV417;
  actor: "SELF" | "CONTROLLER" | "OPPONENT" | "ANY";
  affectedObject: "SELF_PERMANENT" | "TARGET_PERMANENT" | "TARGET_CREATURE" | "COMMANDER" | "ENGINE_PERMANENT" | "ANY";
  targetClass: string;
  direction: "GRANTS" | "HAS" | "REMOVES" | "PREVENTS";
  condition?: string;
  scope: "BATTLEFIELD" | "STACK" | "ANY";
  evidence: string[];
};

export type RoleMatchPrecisionV417 = "TRUE_ROLE_MATCH" | "PARTIAL_ROLE_MATCH" | "FALSE_POSITIVE";

export type ResearchRequirementEvidenceV417 = {
  requirementId: string;
  candidateCount: number;
  topCandidatePrecision: RoleMatchPrecisionV417 | null;
  minimumQualityCount: number;
  representativeCandidates: Array<{
    name: string;
    precision: RoleMatchPrecisionV417;
    score: number;
  }>;
  falsePositiveRateSample: number;
  requirementCoveragePotential: number;
};

export type BrewRequirementV417 = {
  requirementId: string;
  blueprintRevisionId: number;
  family: RequirementFamilyV417;
  purpose: string;
  priority: number;
  coverageMode: RequirementCoverageModeV417;
  sharePolicy: RequirementSharePolicyV417;
  physicalSlotsNeeded: { min: number; preferred: number; max: number };
  requiredFunctions: RequirementFunctionV417[];
  requiredMechanics: string[];
  hardRequirements: RequirementHardConstraintV417[];
  preferredRequirements: RequirementPreferredQualityV417[];
  acceptableFunctionalAlternatives: RequirementFunctionV417[];
  hardConstraints: string[];
  softPreferences: string[];
  packageIds: string[];
  packageGroupId?: string;
  bracketQualityContract: BracketQualityContractV417;
  requirementBracketContract: RequirementBracketContractV417;
  accessTargetClass?: string;
  currentCoverage: number;
  targetCoverage: number;
  selectedCardIds: string[];
  status: BlueprintRequirementStatusV417;
};

export type PackageDensityStatusV417 = "BELOW_MINIMUM" | "MINIMUM_SATISFIED" | "PREFERRED_SATISFIED";

export type PackageDensityStateV417 = {
  packageId: string;
  minimumPhysicalContribution: number;
  preferredPhysicalContribution: number;
  currentPhysicalContribution: number;
  contributingCardIds: string[];
  remainingMinimumDeficit: number;
  remainingPreferredDeficit: number;
  underrepresentedRequirementGroups: string[];
  status: PackageDensityStatusV417;
};

export type PackageContributionV417 = {
  packageId: string;
  requirementIds: string[];
  contributedFunctions: RequirementFunctionV417[];
  semanticEvidence: string[];
  contributionStrength: number;
  countsTowardPhysicalDensity: boolean;
};

export type BlueprintSelectedCardV417 = {
  oracleId: string;
  name: string;
  physicalSlotsConsumed: 1;
  primaryRequirementId: string;
  secondaryRequirementIds: string[];
  primaryFunction: RequirementFunctionV417;
  secondaryFunctions: RequirementFunctionV417[];
  tertiaryFunctions: RequirementFunctionV417[];
  satisfiedFunctions: RequirementFunctionV417[];
  packageIds: string[];
  packageContributions: PackageContributionV417[];
  functionalDensityContributions: FunctionalDensityContributionV417[];
  semanticEvidence: string[];
  bracketContribution: string[];
  canonicalVerified: boolean;
};

export type ManaPlanBlueprintV417 = {
  landTarget: number;
  colorRequirements: Record<string, number>;
  utilityLands: string[];
  selectedLands: string[];
};

export type BlueprintValidationV417 = {
  allSelectedCardsHavePrimaryRequirement: boolean;
  allSelectedCardsConsumeOnePhysicalSlot: boolean;
  openRequirementCount: number;
  satisfiedRequirementCount: number;
  corePackagesSatisfied: boolean;
  winArchitectureVerified: boolean;
  structurallyReadyForMana: boolean;
  violations: string[];
};

export type BlueprintRevisionV417 = {
  revision: number;
  summary: string;
  changedRequirementIds: string[];
  changedPackageIds: string[];
  selectedOracleId?: string;
};

export type BrewBlueprintV417 = {
  version: typeof PROFESSOR_BREW_BLUEPRINT_V4_17_V1_VERSION;
  commander: CommanderBlueprintV417;
  userIntent: UserIntentBlueprintV417;
  bracketContract: BracketContractBlueprintV417;
  strategy: StrategyBlueprintV417;
  normalizedConcepts: NormalizedSemanticConceptV417[];
  winArchitecture: WinArchitectureBlueprintV417[];
  packages: PackageBlueprintV417[];
  functionalBudgets: FunctionalBudgetV417[];
  openRequirements: BrewRequirementV417[];
  selectedCards: BlueprintSelectedCardV417[];
  packageDensityStates: PackageDensityStateV417[];
  functionalDensityStates: FunctionalDensityStateV417[];
  flexEntryTelemetry: FlexEntryTelemetryV417 | null;
  physicalSlotBudget: PhysicalSlotBudgetV417;
  manaPlan: ManaPlanBlueprintV417;
  slotFeasibility: BlueprintSlotFeasibilityV417;
  consistencyAudit: BlueprintConsistencyAuditV417;
  validation: BlueprintValidationV417;
  revisionHistory: BlueprintRevisionV417[];
};

export function bracketQualityContractV417(requestedBracket: number): BracketQualityContractV417 {
  if (requestedBracket >= 4) {
    return {
      requestedBracket,
      minimumManaEfficiency: "high",
      minimumFlexibility: "high",
      maximumTempoLoss: "low",
    };
  }
  if (requestedBracket >= 3) {
    return {
      requestedBracket,
      minimumManaEfficiency: "medium",
      minimumFlexibility: "medium",
      maximumTempoLoss: "medium",
    };
  }
  return {
    requestedBracket,
    minimumManaEfficiency: "low",
    minimumFlexibility: "low",
    maximumTempoLoss: "high",
  };
}

export function recomputeBlueprintValidationV417(blueprint: BrewBlueprintV417): BlueprintValidationV417 {
  const violations: string[] = [];
  for (const card of blueprint.selectedCards) {
    if (!card.primaryRequirementId) violations.push(`ORPHAN_CARD:${card.oracleId}`);
    if (card.physicalSlotsConsumed !== 1) violations.push(`INVALID_PHYSICAL_SLOTS:${card.oracleId}`);
  }
  const openRequirementCount = blueprint.openRequirements.filter((r) => r.status === "OPEN" || r.status === "PARTIAL").length;
  const satisfiedRequirementCount = blueprint.openRequirements.filter((r) => r.status === "SATISFIED").length;
  const corePackagesSatisfied = blueprint.packages.filter((p) => p.core).every((p) => p.status === "SATISFIED");
  const winArchitectureVerified = blueprint.winArchitecture.some((w) => w.status === "VERIFIED" && w.mechanicallyVerified);
  const structurallyReadyForMana =
    blueprint.physicalSlotBudget.remainingNonlandSlots === 0 &&
    openRequirementCount === 0 &&
    corePackagesSatisfied &&
    winArchitectureVerified;
  return {
    allSelectedCardsHavePrimaryRequirement: blueprint.selectedCards.every((c) => Boolean(c.primaryRequirementId)),
    allSelectedCardsConsumeOnePhysicalSlot: blueprint.selectedCards.every((c) => c.physicalSlotsConsumed === 1),
    openRequirementCount,
    satisfiedRequirementCount,
    corePackagesSatisfied,
    winArchitectureVerified,
    structurallyReadyForMana,
    violations,
  };
}

export function recomputePhysicalSlotBudgetV417(
  blueprint: Pick<BrewBlueprintV417, "selectedCards" | "physicalSlotBudget" | "manaPlan">,
  catalog?: DeckResolutionCatalog | null,
): PhysicalSlotBudgetV417 {
  const selectedNonlands = selectedNonlandsFromCanonicalTruthV1({
    blueprint,
    catalog,
    fallbackCount: blueprint.selectedCards.length,
  });
  const selectedLands = blueprint.manaPlan.selectedLands.length;
  const expectedNonlands = blueprint.physicalSlotBudget.expectedNonlands;
  const expectedLands = blueprint.physicalSlotBudget.expectedLands;
  return {
    expectedNonlands,
    selectedNonlands,
    remainingNonlandSlots: Math.max(0, expectedNonlands - selectedNonlands),
    expectedLands,
    selectedLands,
    remainingLandSlots: Math.max(0, expectedLands - selectedLands),
  };
}

export function assertBlueprintInvariantsV417(blueprint: BrewBlueprintV417): void {
  for (const card of blueprint.selectedCards) {
    if (!card.primaryRequirementId) throw new Error(`ORPHAN_SELECTED_CARD:${card.name}`);
    if (card.physicalSlotsConsumed !== 1) throw new Error(`INVALID_PHYSICAL_SLOT_COUNT:${card.name}`);
  }
  if (blueprint.version !== PROFESSOR_BREW_BLUEPRINT_V4_17_V1_VERSION) {
    throw new Error("BLUEPRINT_VERSION_MISMATCH");
  }
}

export function roundTripBlueprintV417(blueprint: BrewBlueprintV417): BrewBlueprintV417 {
  return JSON.parse(JSON.stringify(blueprint)) as BrewBlueprintV417;
}
