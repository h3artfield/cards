/**
 * Build path types v2 extensions — path thesis + path-conditioned intent provenance.
 */
import type {
  BuildPathClass,
  BuildPathProposal,
  CausalRole,
  CommandZoneBuildPathBundle,
  PathCandidateIntent,
} from "./build-path-types-v1";

export const BUILD_PATH_TYPES_V2_VERSION = "build-path-types-v2";

export type CommanderPathRole = "REQUIRED_ENGINE" | "SYNERGY_AMPLIFIER" | "BRIDGE_ENGINE";

export type CausalChainLink = {
  stage: "DECK_INPUT" | "COMMANDER" | "COMMANDER_OUTPUT" | "INDEPENDENT_ENABLER" | "INDEPENDENT_PAYOFF" | "BRIDGE";
  label: string;
};

export type IndependentEngineThesis = {
  present: boolean;
  enablers: string[];
  payoffs: string[];
};

export type BridgeMechanismThesis = {
  id: string;
  label: string;
  commanderJob: string;
  independentJob: string;
};

export type PathThesis = {
  pathClass: BuildPathClass;
  commanderRole: CommanderPathRole;
  primaryCausalChain: CausalChainLink[];
  deckProvides: string[];
  commanderProvides: string[];
  independentEngine: IndependentEngineThesis;
  bridgeMechanisms: BridgeMechanismThesis[];
  failureWithoutCommander: string;
  functionWithoutCommander: string;
};

export type PathCandidateIntentV2 = PathCandidateIntent & {
  derivedFromPathThesis: true;
  causalChainPosition: CausalChainLink["stage"];
  requiredForPath: true;
  pathExclusiveReason: string | null;
  independentEngineRole: "ENABLER" | "PAYOFF" | "NONE" | "BRIDGE";
  commanderEngineRole: "INPUT_FEED" | "OUTPUT_EXPLOIT" | "ACTIVATION_SUPPORT" | "NONE" | "BRIDGE";
  bridgeRole: string | null;
};

export type BuildPathProposalV2 = Omit<BuildPathProposal, "requiredCandidateIntents" | "secondaryCandidateIntents"> & {
  pathThesis: PathThesis;
  requiredCandidateIntents: PathCandidateIntentV2[];
  secondaryCandidateIntents: PathCandidateIntentV2[];
  lowPathSeparationReasons: string[];
};

export type CommandZoneBuildPathBundleV2 = Omit<CommandZoneBuildPathBundle, "buildPaths"> & {
  buildPaths: [BuildPathProposalV2, BuildPathProposalV2, BuildPathProposalV2];
};

export type CoreIntentSemanticSignature = {
  causalRole: CausalRole;
  targetMechanic: string;
  commanderMechanismSupported: string;
  matchConstraints: string[];
  independentEngineRole: PathCandidateIntentV2["independentEngineRole"];
  bridgeRole: string | null;
};

export type PathOverlapCell = {
  pair: [BuildPathClass, BuildPathClass];
  exactCoreOverlapCount: number;
  exactCoreOverlapSignatures: CoreIntentSemanticSignature[];
  dependentCoreCount: number;
  otherCoreCount: number;
  exactCoreJaccard: number;
  partialMechanicOverlapCount: number;
  partialSharedMechanics: string[];
};

export type PathOverlapMatrix = {
  cells: PathOverlapCell[];
};

export type PathSeparationAudit = {
  lowPathSeparation: boolean;
  reasons: string[];
};

export function normalizeSignature(intent: PathCandidateIntentV2): CoreIntentSemanticSignature {
  return {
    causalRole: intent.causalRole,
    targetMechanic: intent.targetMechanic.trim().toLowerCase(),
    commanderMechanismSupported: intent.commanderMechanismSupported.trim().toLowerCase(),
    matchConstraints: [...intent.matchConstraints].sort(),
    independentEngineRole: intent.independentEngineRole,
    bridgeRole: intent.bridgeRole,
  };
}

export function signatureKey(sig: CoreIntentSemanticSignature): string {
  return JSON.stringify(sig);
}
