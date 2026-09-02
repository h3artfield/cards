/**
 * Archetype Discovery v1 — types (Phase 5).
 * Discovery/ranking only — no deck construction or optimization.
 */
import type { CommanderBracket } from "../bracket-policy/bracket-policy-v1";
import type { DerivedRoleName } from "@/lib/semantic-visualization/derived-features-v1";

export const ARCHETYPE_DISCOVERY_V1_VERSION = "archetype-discovery-v1.6.0";

export type ArchetypeKind = "MECHANICAL_ENGINE" | "HYBRID_ENGINE" | "GENERIC_VALUE_FALLBACK";

export type ChainStage = "INPUT" | "ENABLER" | "ENGINE" | "PAYOFF" | "WIN";

export type ArchetypeMechanicEdge = {
  edgeId: string;
  sourceStage: ChainStage | "COMMANDER";
  targetStage: ChainStage;
  sourceMechanic: string;
  targetMechanic: string;
  relationship: "enables" | "feeds" | "converts" | "reinforces" | "protects";
  evidenceRefs: Array<{ oracleId: string; rule: string; note?: string }>;
};

export type CommanderSupportBreakdown = {
  roleScores: Record<string, number>;
  axisScores: Record<string, number>;
  centralityScore: number;
  repeatabilityScore: number;
  commandZoneAccessibility: number;
  definingMechanicScore: number;
  incidentalPenalty: number;
  /** Causal-role support — driver vs payoff discrimination (Phase 5.2). */
  driverSupport: number;
  payoffSupport: number;
  feedbackSupport: number;
  incidentalSupport: number;
  /** Internal ranking signal — NOT user-facing quality/power. */
  discoverySupport: number;
  evidenceRefs: Array<{ oracleId: string; rule: string; note?: string }>;
};

export type CatalogSupportCensus = {
  enablers: number;
  enginePieces: number;
  payoffs: number;
  redundancy: number;
  resourceSupport: number;
  interactionProtection: number;
  finishers: number;
  /** Internal feasibility signal — NOT user-facing quality/power. */
  feasibilitySupport: number;
  roleDetail: Record<string, number>;
};

export type BracketFeasibilityAssessment = {
  bracket: CommanderBracket;
  hardFeasibility: boolean;
  hardIncompatibilityReasons: string[];
  intentFitAssessment: "HIGH" | "MEDIUM" | "LOW" | "INCOMPATIBLE";
  limitingBarometers: string[];
  note: "HEURISTIC — not official bracket determination";
};

export type ArchetypeSignature = {
  archetypeId: string;
  primaryAxes: string[];
  secondaryAxes: string[];
  commanderActions: string[];
  commanderRoles: string[];
  commanderReliance: string[];
  requiredFunctions: string[];
  supportingFunctions: string[];
  enginePattern: string;
  payoffPattern: string;
  resourcePattern: string;
  interactionPattern: string;
  winPlanSignals: string[];
  commanderEvidenceRefs: Array<{ oracleId: string; rule: string; note?: string }>;
  /** Stage B — populated after catalog scan. */
  catalogFeasibility: CatalogSupportCensus | null;
  /** Bracket-dependent — commander support stored separately. */
  bracketFeasibility: BracketFeasibilityAssessment | null;
  mechanicalVector: number[];
  humanLabel: string | null;
  humanLabelConfidence: number;
  humanLabelSource: "taxonomy" | "generated" | null;
};

export type WhyNotSurfacedReason =
  | "INCIDENTAL_COMMANDER_SUPPORT"
  | "INSUFFICIENT_LEGAL_CATALOG_SUPPORT"
  | "DUPLICATE_MECHANICAL_SIGNATURE"
  | "BRACKET_HARD_INCOMPATIBLE"
  | "WEAK_ENGINE_PAYOFF_CHAIN";

export type RejectedArchetypeHypothesis = {
  archetypeId: string;
  mechanicalName: string;
  reasons: WhyNotSurfacedReason[];
  detail: string;
  discoverySupport: number;
  feasibilitySupport: number | null;
};

export type DiscoveredArchetype = {
  rank: number;
  archetypeId: string;
  archetypeKind: ArchetypeKind;
  mechanicalName: string;
  humanLabel: string;
  humanLabelConfidence: number;
  humanLabelSource: "taxonomy" | "generated";
  archetypeSignature: ArchetypeSignature;
  commanderArchetypeSupport: CommanderSupportBreakdown;
  catalogFeasibilityEvidence: CatalogSupportCensus;
  primaryEngineChain: ArchetypeMechanicEdge[];
  secondaryMechanics: string[];
  hybridWith: string | null;
  hybridReason: string | null;
  /** Optional hierarchy — primary with sub-archetype hints for UI (Phase 5.2). */
  primaryArchetypeId: string;
  subArchetypeIds: string[];
  likelyStructuralDemands: string[];
  bracket: BracketFeasibilityAssessment;
  nearestCompetingArchetypes: Array<{ archetypeId: string; mechanicalName: string; archetypeDistance: number }>;
  /** Preview metadata for future DeckBuildRouteOverlay — references semantic map, no duplicate nodes. */
  routeOverlayPreview: {
    commanderNodeId: string;
    routeColorId: string;
    engineStageIds: string[];
    packageHubIds: string[];
    reasonGroupHints: string[];
  };
};

export type HypothesisLifecycleAccounting = {
  generated: number;
  mergedAbsorbed: number;
  evaluatedUnique: number;
  surfaced: number;
  rejectedPrimary: number;
  mergedDuplicate: number;
  hybridDerived: number;
  invariant: {
    generatedEqualsMergedPlusAbsorbed: boolean;
    evaluatedEqualsSurfacedPlusRejectedPrimary: boolean;
    formula: "generated = evaluatedUnique + mergedAbsorbed; evaluatedUnique = surfaced + rejectedPrimary";
  };
};

export type HumanReviewAdjudicationOutcome =
  | "FALSE_POSITIVE_ARCHETYPE"
  | "WRONG_PRIMARY_RANK"
  | "DUPLICATE_ARCHETYPE"
  | "MISSING_OBVIOUS_ARCHETYPE"
  | "LABEL_ONLY_WRONG"
  | "EXPLANATION_WRONG"
  | "ACCEPTED";

export type DiscoverArchetypesInput = {
  commanderOracleIds: string[];
  bracket: CommanderBracket;
  constraints?: Record<string, unknown>;
};

export type CausalChainStatus =
  | "COMPLETE"
  | "PARTIAL_UPSTREAM_MISSING"
  | "PARTIAL_DOWNSTREAM_MISSING"
  | "NO_DRIVER_EVIDENCE";

export type DriverProvenanceEntry = {
  motifId: string;
  source: "DRIVER_POSITION" | "ENGINE_SEED" | "PROPAGATED" | "ANCHOR_DERIVED";
  evidence: string[];
};

/** Structural anchor kind — orthogonal to mechanical motif. */
export type DirectionAnchorKind =
  | "EVENT_TRIGGER"
  | "ACTIVATED_ACTION"
  | "ACTIVATED_COST"
  | "STATIC_CONSTRAINT"
  | "STATIC_INCENTIVE"
  | "STATE_DEPENDENCY"
  | "RESOURCE_SCALER"
  | "COST_DEPENDENCY"
  | "TARGET_DEPENDENCY"
  | "ZONE_DEPENDENCY"
  | "TYPE_DEPENDENCY"
  | "TRANSFORM_THRESHOLD"
  | "COMMAND_ZONE_DEPENDENCY"
  | "PERMISSION";

export type DirectionAnchor = {
  anchorId: string;
  anchorKind: DirectionAnchorKind;
  /** Mechanical motif — separate from anchorKind. */
  mechanism: string;
  subject: string;
  requirement: string;
  scalingBasis?: string;
  sourceAbilityRef: string;
  evidenceRefs: string[];
};

export type DirectionValidity = "ANCHORED" | "UNANCHORED_SIGNAL" | "VAGUE" | "ABSENT";

export type EvaluationContextStatus =
  | "COMPLETE"
  | "OPTIONAL_COMMAND_ZONE_CONTEXT"
  | "COMMAND_ZONE_CONTEXT_REQUIRED"
  | "INSUFFICIENT_CONTEXT";

export type CompositeCrossSupportEdge = {
  fromAnchorId: string;
  toAnchorId: string;
  relationship: "enables" | "feeds" | "converts" | "reinforces" | "protects";
  note: string;
};

export type CompositeDirectionComposition = {
  componentAnchors: DirectionAnchor[];
  sharedRequirements: string[];
  complementaryRequirements: string[];
  sharedOutputs: string[];
  crossSupportEdges: CompositeCrossSupportEdge[];
  combinedRetrievalSpecification: RetrievalSpecification;
};

export type BuildDirectionKind = "SINGLE" | "COMPOSITE";

export type SelfPenaltyConditionSpec = {
  trigger: string;
  actor: string;
  penalty: string;
  constructionImplication: string[];
};

export type RetrievalSpecification = {
  requiredFunctions: string[];
  desiredFunctions: string[];
  requiredInputs: string[];
  outputsToExploit: string[];
  resourcesToProduce: string[];
  resourcesToConsume: string[];
  statesToMaintain: string[];
  statesToIncrease: string[];
  relevantCardTypes: string[];
  relevantZones: string[];
  protectionNeeds: string[];
  redundancyNeeds: string[];
  structuralNeeds: string[];
  avoidFunctions: string[];
  avoidCardClasses: string[];
  selfPenaltyConditions: SelfPenaltyConditionSpec[];
  constructionConstraints: string[];
};

/**
 * CommanderBuildDirection — compositional mechanical plan BEFORE human archetype naming.
 */
export type CommanderBuildDirection = {
  rank: number;
  directionId: string;
  directionKind: BuildDirectionKind;
  /** Phase 5.4 — structural anchors backing this direction. */
  directionAnchors: DirectionAnchor[];
  /** Phase 5.4.1 — populated when directionKind is COMPOSITE. */
  compositeComposition: CompositeDirectionComposition | null;
  drivers: string[];
  conditions: string[];
  resourcesConsumed: string[];
  resourcesProduced: string[];
  engineActions: string[];
  payoffs: string[];
  feedbackLoops: string[];
  requiredSupportFunctions: string[];
  optionalSupportFunctions: string[];
  commandZoneEvidence: string[];
  mechanicalVector: number[];
  supportStrength: number;
  repeatability: number;
  centrality: number;
  mappedArchetypeId: string | null;
  mappedArchetypeLabel: string | null;
  labelConfidence: number | null;
  /** Mechanical prose when no taxonomy label applies. */
  mechanicalDescription: string;
  subDirectionIds: string[];
  status: "MECHANICAL_DIRECTION_ONLY" | "NAMED_ARCHETYPE_MATCHED" | "NO_MECHANICAL_BUILD_DIRECTION";
  catalogFeasibility: CatalogSupportCensus | null;
  /** Phase 5.3.2 — causal completeness for conservative Phase 6 retrieval. */
  causalChainStatus: CausalChainStatus;
  driverCoverage: number;
  conditionCoverage: number;
  engineCoverage: number;
  outputCoverage: number;
  payoffCoverage: number;
  evidenceCoverage: number;
  driverProvenance: DriverProvenanceEntry[];
  /** Set when payoff exists but DRIVER-position evidence was not propagated. */
  driverPropagationFailure?: boolean;
  /** Phase 5.4 — validity separate from retrieval readiness. */
  directionValidity: DirectionValidity;
  retrievalSpecification: RetrievalSpecification;
  retrievalSpecificationCompleteness: number;
  /** True when direction has at least one defensible anchor (Phase 6 gate). */
  phase6RetrievalReady: boolean;
};

export type ArchetypeDiscoveryReport = {
  version: typeof ARCHETYPE_DISCOVERY_V1_VERSION;
  generatedAt: string;
  input: DiscoverArchetypesInput;
  commanderOracleIds: string[];
  commanderNames: string[];
  colorIdentity: string[];
  bracket: CommanderBracket;
  stageA: {
    hypothesesGenerated: number;
    hypothesisIds: string[];
  };
  stageB: {
    catalogPoolSize: number;
    feasibilityScanned: number;
  };
  hypothesisLifecycle: HypothesisLifecycleAccounting;
  /** Phase 5.3 — compositional build directions (primary discovery layer). */
  buildDirections: CommanderBuildDirection[];
  hasValidBuildDirection: boolean;
  /** Phase 5.4 — command-zone evaluation context. */
  evaluationContextStatus: EvaluationContextStatus;
  contextRequirements: string[];
  /** Phase 5.5 — populated when command zone has multiple members. */
  commandZoneComposition?: import("./command-zone-composition-v1").CommandZoneComposition | null;
  surfacedArchetypes: DiscoveredArchetype[];
  rejectedHypotheses: RejectedArchetypeHypothesis[];
  whyNotSurfacedDistribution: Record<WhyNotSurfacedReason, number>;
  diversityMatrix: Array<{ a: string; b: string; archetypeDistance: number }>;
  provenance: {
    shadowParserVersion: string;
    shadowSemanticVersion: string;
    bracketPolicyVersion: string;
    catalogLoadedCount: number;
    discoveryEngineVersion: typeof ARCHETYPE_DISCOVERY_V1_VERSION;
  };
};

export type EnginePatternDef = {
  patternId: string;
  mechanicalName: string;
  archetypeKind: ArchetypeKind;
  primaryAxes: string[];
  secondaryAxes: string[];
  chain: Array<{ stage: ChainStage; mechanic: string }>;
  mechanicEdges: Array<Omit<ArchetypeMechanicEdge, "edgeId" | "evidenceRefs">>;
  commanderRoleWeights: Partial<Record<DerivedRoleName, number>>;
  commanderAxisKeys: string[];
  commanderAxisWeights: number[];
  requiredFunctions: string[];
  supportingFunctions: string[];
  catalogRoleBuckets: Record<keyof Omit<CatalogSupportCensus, "feasibilitySupport" | "roleDetail">, DerivedRoleName[]>;
  minCommanderDiscoverySupport: number;
  minCatalogCounts: Partial<Record<keyof Omit<CatalogSupportCensus, "feasibilitySupport" | "roleDetail">, number>>;
  winPlanSignals: string[];
  structuralDemands: string[];
  /** Roles that alone are insufficient unless above incidental threshold. */
  incidentalRoles: DerivedRoleName[];
  incidentalMaxScore: number;
  bracketIntentSignals: {
    comboDensity: number;
    extraTurnDensity: number;
    mldDensity: number;
  };
};

export type CommanderEnchantmentSignals = {
  castEnchantmentTrigger: number;
  enchantmentEtBTrigger: number;
  enchantmentPayoff: number;
  enchantmentRecursion: number;
  enchantmentPresenceEngine: number;
  /** Aggregate enchantment-specific score — generic draw/recursion alone cannot exceed 0.12. */
  enchantmentSpecificSupport: number;
};

export type CommanderMechanicalProfile = {
  commanderOracleIds: string[];
  commanderNames: string[];
  colorIdentity: string[];
  derivedRoles: Record<string, number>;
  actionDensity: Record<string, number>;
  topActions: string[];
  commandZoneIpv2_1: Record<string, number>;
  enchantmentSignals: CommanderEnchantmentSignals;
  causalRoles: import("./commander-causal-roles-v1").CommanderCausalRoleProfile;
  causalInferenceVersion: string;
  evidenceRefs: Array<{ oracleId: string; rule: string; note?: string }>;
};
