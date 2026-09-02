/**
 * Build path types v3 — derived from frozen independent truth (facts + strategy).
 * PathCandidateIntent authority flows: adjudicated path meaning → retrieval representation.
 */
import type {
  BuildPathClass,
  BuildPathProposal,
  CausalRole,
  CommandZoneBuildPathBundle,
  PathCandidateIntent,
} from "./build-path-types-v1";
import type { CommanderPathRole, PathThesis } from "./build-path-types-v2";
import type { RetrievalBucketId } from "./semantic-candidate-retrieval-v1";

export const BUILD_PATH_TYPES_V3_VERSION = "build-path-types-v3";

export type RoutingCompatibility =
  | "EXACT_COMPATIBLE"
  | "COMPATIBLE_WITH_CONSTRAINT"
  | "NO_EXISTING_TOKEN"
  | "ROUTING_MISMATCH";

export type UnresolvedPathStatus =
  | "RESOLVED"
  | "PARTIAL_PENDING_THE_ANIMUS_ORACLE"
  | "TENTATIVE_NEEDS_FEASIBILITY_CHECK";

export type IntentProvenance = {
  sourceTruth: "phase6a1-independent-commander-mechanism-truth-v1" | "phase6a1-independent-strategy-adjudication-v1";
  sourceStrategyChain: string[];
  sourceMechanicLabel: string;
  sourceMechanicKind: "coreMechanic" | "bridgeMechanic";
  supportingMechanismFactIds: string[];
  commanderZoneMembersSupported: string[];
  unresolvedStatus: UnresolvedPathStatus;
  routingCompatibility: RoutingCompatibility;
  routingNote: string | null;
};

export type PathCandidateIntentV3 = PathCandidateIntent & {
  derivedFromFrozenTruth: true;
  provenance: IntentProvenance;
  commanderEngineRole: "INPUT_FEED" | "OUTPUT_EXPLOIT" | "ACTIVATION_SUPPORT" | "NONE" | "BRIDGE";
  independentEngineRole: "ENABLER" | "PAYOFF" | "NONE" | "BRIDGE";
  bridgeRole: string | null;
  causalChainPosition: string;
  pathExclusiveReason: string | null;
};

export type PathThesisV3 = PathThesis & {
  sourceStrategyChain: string[];
  sourceCoreMechanics: string[];
  sourceBridgeMechanics: string[];
  unresolvedStatus: UnresolvedPathStatus;
  harmonyValid: boolean | string;
  strategyNote: string | null;
};

export type BuildPathProposalV3 = Omit<BuildPathProposal, "requiredCandidateIntents" | "secondaryCandidateIntents"> & {
  pathThesis: PathThesisV3;
  requiredCandidateIntents: PathCandidateIntentV3[];
  secondaryCandidateIntents: PathCandidateIntentV3[];
  derivationSource: {
    mechanismFactsVersion: "phase6a1-commander-mechanism-facts-v4-implemented";
    strategyAdjudicationVersion: "phase6a1-strategy-adjudication-v1-implemented";
  };
};

export type CommandZoneBuildPathBundleV3 = Omit<CommandZoneBuildPathBundle, "buildPaths"> & {
  buildPaths: [BuildPathProposalV3, BuildPathProposalV3, BuildPathProposalV3];
  commanderMechanismFactIds: string[];
  derivationSource: BuildPathProposalV3["derivationSource"];
};

export type PathCausalIdentityAudit = {
  dependentHasCommanderDependentIdentity: boolean;
  independentHasCommanderFreeIdentity: boolean;
  harmonyHasDualRoleBridge: boolean;
  unresolvedStatus: UnresolvedPathStatus;
};
