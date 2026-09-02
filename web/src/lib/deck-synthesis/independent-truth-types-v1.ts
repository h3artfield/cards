/**
 * Independent semantic truth types v1 — frozen adjudicated CommanderMechanism + Strategy.
 * Do not reinterpret adjudicated semantics in implementation code.
 */
import type { CommandZoneConfiguration } from "./command-zone-composition-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";

export const INDEPENDENT_TRUTH_TYPES_V1_VERSION = "independent-truth-types-v1";

export type IndependentMechanismType =
  | "TRIGGERED_ABILITY"
  | "ACTIVATED_ABILITY"
  | "TRIGGERED_MANA_ABILITY"
  | "STATIC_TRIGGER_MODIFIER"
  | "STATIC_ABILITY"
  | "GRANTED_STATIC_ABILITY"
  | "REPLACEMENT_EFFECT"
  | "KEYWORD"
  | "DELAYED_TRIGGER"
  | "COPY_EFFECT"
  | "PLAY_PERMISSION";

export type IndependentMechanismFact = {
  mechanismId: string;
  mechanismType: IndependentMechanismType | string;
  evidenceSpan: string;
  commander?: string;
  trigger?: string;
  cost?: string[];
  target?: string;
  subject?: string;
  condition?: string;
  keyword?: string;
  actions?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type IndependentCommanderMechanismTruthCase = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: CommandZoneConfiguration;
  combinedColorIdentity: string[];
  bracket: CommanderBracket;
  commanderOracleTexts: Array<{ sourceOracleId: string; name: string; oracleText: string }>;
  crossMemberRelationshipsAsSupplied: Array<Record<string, unknown>>;
  independentMechanismFacts: IndependentMechanismFact[];
  factStatus: "INDEPENDENTLY_ADJUDICATED";
};

export type IndependentCommanderMechanismTruth = {
  version: string;
  reviewer: string;
  reviewMethod: string;
  sourceArtifacts: Record<string, string>;
  population: Record<string, number>;
  policy: Record<string, unknown>;
  cases: IndependentCommanderMechanismTruthCase[];
};

export type ThreePathStrategyLens = {
  chain: string[];
  coreMechanics: string[];
  note?: string;
  worksWithoutCommander?: boolean;
  bridgeMechanics?: string[];
  valid?: boolean | string;
};

export type CorrectedThreePathStrategy = {
  DEPENDENT_SYNERGY: ThreePathStrategyLens;
  INDEPENDENT_SYNERGY: ThreePathStrategyLens;
  HARMONY: ThreePathStrategyLens;
};

export type IndependentStrategyAdjudicationCase = {
  caseId: string;
  commanders: string[];
  originalHypothesisIds: {
    independentEngines: string[];
    bridges: string[];
  };
  existingIndependentEngineVerdict: string;
  existingBridgeVerdict: string;
  correctedThreePathStrategy: CorrectedThreePathStrategy;
  adjudicationStatus: "INDEPENDENTLY_ADJUDICATED";
};

export type IndependentStrategyAdjudicationTruth = {
  version: string;
  reviewer: string;
  reviewMethod: string;
  sourceArtifacts: Record<string, string>;
  population: Record<string, number>;
  labels: Record<string, string>;
  cases: IndependentStrategyAdjudicationCase[];
};

export type SemanticCorrectionLedgerEntry = {
  caseId: string;
  commanderName: string;
  sourceFactId: string;
  evidenceSpan: string;
  verdict: string;
  issues: string[];
};

export type IndependentSemanticCorrectionLedger = {
  version: string;
  reviewer: string;
  sourceFactsSha256: string;
  population: Record<string, number>;
  summary: Record<string, number>;
  entries: SemanticCorrectionLedgerEntry[];
};
