/**
 * BuildPathProposal + PathCandidateIntent — three-lens deck synthesis pipeline.
 *
 * Oracle → CommanderMechanism → BuildPathProposal → PathCandidateIntent → Retrieval → DeckBuildGraph
 */
import type { CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";
import type { CommandZoneConfiguration } from "./command-zone-composition-v1";
import type { RetrievalBucketId } from "./semantic-candidate-retrieval-v1";

export const BUILD_PATH_TYPES_V1_VERSION = "build-path-types-v1";

export type BuildPathClass =
  | "DEPENDENT_SYNERGY"
  | "INDEPENDENT_SYNERGY"
  | "HARMONY";

export type DependencyLevel = "HIGH" | "MEDIUM" | "LOW";

export type CausalRole =
  | "ENGINE_ENABLER"
  | "RESOURCE_PROVIDER"
  | "TRIGGER_PROVIDER"
  | "PAYOFF_FOR_COMMANDER_OUTPUT"
  | "REDUNDANCY"
  | "PROTECTION"
  | "CONVERSION_PIECE";

export type PathIntentPriority = "CORE" | "SECONDARY";

export type PathCandidateIntent = {
  intentId: string;
  pathId: string;
  pathClass: BuildPathClass;
  caseId: string;
  pathPriority: PathIntentPriority;
  causalRole: CausalRole;
  semanticSlot: string;
  targetMechanic: string;
  commanderMechanismSupported: string;
  oracleEvidence: string;
  causalDefense: string;
  sourceSemanticFields: string[];
  matchConstraints: string[];
  retrievalBucket: RetrievalBucketId;
  linkedSpecField: string;
  retrievalToken: string;
  supportsCommanderDirectly: boolean;
  worksWithoutCommander: boolean;
  supportsIndependentEngine: boolean;
  bridgeStrength: number;
  derivedFromFoundationIntentId?: string;
};

export type BuildPathProposal = {
  pathId: string;
  pathClass: BuildPathClass;
  caseId: string;
  commandZoneConfiguration: CommandZoneConfiguration;
  commanders: string[];
  bracket: CommanderBracket;
  title: string;
  summary: string;
  pathTagline: string;
  commanderMechanismsUsed: string[];
  commanderZoneMembers: Array<{ name: string; mechanismsUsed: string[] }>;
  dependencyProfile: {
    commanderDependency: DependencyLevel;
    commanderRemovalSensitivity: DependencyLevel;
  };
  deckSideObjectives: string[];
  commanderProvidedOutputs: string[];
  requiredCandidateIntents: PathCandidateIntent[];
  secondaryCandidateIntents: PathCandidateIntent[];
  avoidPatterns: string[];
  semanticEvidence: string[];
  pathSeparationWarnings: string[];
};

export type CommandZoneBuildPathBundle = {
  caseId: string;
  commandZoneConfiguration: CommandZoneConfiguration;
  commanders: string[];
  bracket: CommanderBracket;
  commanderMechanismSummary: string;
  buildPaths: [BuildPathProposal, BuildPathProposal, BuildPathProposal];
};

export const BUILD_PATH_CLASS_META: Record<
  BuildPathClass,
  { title: string; tagline: string; dependency: DependencyLevel; removalSensitivity: DependencyLevel }
> = {
  DEPENDENT_SYNERGY: {
    title: "Dependent Synergy",
    tagline: "Highest commander synergy",
    dependency: "HIGH",
    removalSensitivity: "HIGH",
  },
  INDEPENDENT_SYNERGY: {
    title: "Independent Synergy",
    tagline: "Most resilient without commander",
    dependency: "LOW",
    removalSensitivity: "LOW",
  },
  HARMONY: {
    title: "Harmony",
    tagline: "Most cross-supported / multi-role",
    dependency: "MEDIUM",
    removalSensitivity: "MEDIUM",
  },
};

export function pathIdFor(caseId: string, pathClass: BuildPathClass): string {
  return `${caseId}--${pathClass.toLowerCase().replace(/_/g, "-")}`;
}
