/**
 * Phase 6A Human Calibration v2 — shared types.
 * Separates functional recall, exact-card sentinels, and independent top-K review.
 */
import type { CommanderBracket } from "../../src/lib/bracket-policy/bracket-policy-v1";
import type {
  CommanderBuildDirection,
  RetrievalSpecification,
} from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";

export type SentinelQualityClass =
  | "MUST_SURFACE"
  | "STRONG_EXPECTED"
  | "VALID_EXAMPLE"
  | "CONDITIONAL_PACKAGE"
  | "META_OR_STAPLE_BIASED"
  | "INVALID_GOLD";

export type GoldPreflightFailure =
  | "GOLD_RESOLUTION_FAILURE"
  | "COLOR_IDENTITY"
  | "COMMANDER_FORMAT_ILLEGAL"
  | "BRACKET_HARD_RULE"
  | "MUST_EXCLUDE"
  | "UNSTATED_PACKAGE_STATE"
  | "RETRIEVAL_SPEC_UNLINKED"
  | "INVALID_GOLD_CLASS";

export type ConstraintSeverity =
  | "HARD_EXCLUDE"
  | "SOFT_AVOID"
  | "PREFER_SUBSTITUTE"
  | "SELF_PENALTY"
  | "DENSITY_TARGET";

export type UpstreamSpecClassification =
  | "CONSISTENT"
  | "HUMAN_REVIEW_REQUIRED_SPEC_CONFLICT"
  | "AMBIGUOUS";

export type IndependentCandidateLabel =
  | "STRONG_FIT"
  | "VALID_ALTERNATIVE"
  | "WEAK_BUT_DEFENSIBLE"
  | "IRRELEVANT"
  | "MECHANICALLY_WRONG";

export type FunctionalSemanticRequirement = {
  requirementId: string;
  description: string;
  linkedSpecFields: string[];
  minViableAlternatives: number;
};

export type SentinelGoldEntry = {
  cardName: string;
  qualityClass: SentinelQualityClass;
  mechanicalDefense: string;
  linkedSpecFields: string[];
  requiredState?: string;
  notes?: string;
};

export type CaseCalibrationGold = {
  caseId: string;
  functionalSemanticRequirements: FunctionalSemanticRequirement[];
  sentinels: SentinelGoldEntry[];
};

export type PreflightSentinelResult = {
  cardName: string;
  inputQualityClass: SentinelQualityClass;
  effectiveQualityClass: SentinelQualityClass;
  oracleId: string | null;
  canonicalName: string | null;
  preflightPass: boolean;
  preflightFailures: GoldPreflightFailure[];
  mechanicalDefense: string;
  linkedSpecFields: string[];
  requiredState?: string;
};

export type BlindedReviewPacket = {
  packetId: string;
  caseId: string;
  requirementId: string;
  candidateOracleId: string;
  reviewContext: {
    commandZoneConfiguration: string;
    commandZoneMemberOracleTexts: Array<{ name: string; oracleText: string }>;
    combinedColorIdentity: string[];
    bracket: CommanderBracket;
    frozenMechanicalDirection: string;
    requirement: {
      requirementId: string;
      description: string;
      linkedSpecFields: string[];
    };
    candidate: {
      canonicalName: string;
      manaCost: string | null;
      manaValue: number | null;
      typeLine: string;
      oracleText: string;
      power: string | null;
      toughness: string | null;
      colorIdentity: string[];
    };
  };
  independentReviewLabel: IndependentCandidateLabel | null;
  independentReviewNotes: string | null;
  reviewStatus: "PENDING_INDEPENDENT_REVIEW";
};

export type PostHocScoreRecord = {
  packetId: string;
  caseId: string;
  requirementId: string;
  candidateOracleId: string;
  compositeScore: number;
  rankOverall: number;
  commanderSemanticFit: number;
  directionFit: number;
  functionalRoleFit: number;
  structuralFit: number;
  automatedProxyLabel: string | null;
  sampleTier: "TOP" | "MIDDLE" | "TAIL";
  note: "Post-hoc analysis only — not visible to independent reviewer.";
};

/** @deprecated Use BlindedReviewPacket + PostHocScoreRecord split artifacts. */
export type IndependentReviewPacket = BlindedReviewPacket & {
  sampleTier?: never;
};

export type PrimaryBuildDirection = CommanderBuildDirection;
