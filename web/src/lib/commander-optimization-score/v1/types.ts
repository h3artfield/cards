import type { COS_V1_SCORE_VERSION } from "./constants";

export type CosV1ProfileAxisId =
  | "win_architecture"
  | "access_consistency"
  | "mana_efficiency"
  | "redundancy"
  | "interaction"
  | "protection"
  | "resilience"
  | "card_advantage"
  | "role_compression"
  | "coherence";

export type CosV1ProfileAxis = {
  id: CosV1ProfileAxisId;
  label: string;
  role: "load_bearing" | "descriptive_only";
  percentile: number;
  mapping: "within_commander" | "global" | "blended";
};

export type CosV1FailureCode =
  | "HASH_MISMATCH"
  | "MISSING_EXTRACTION"
  | "UNRESOLVED_CARDS"
  | "INCOMPLETE_FEATURE_VECTOR"
  | "INCOMPLETE_DECKLIST";

export type CosV1ReferenceDepth = "STRONG" | "MODERATE" | "LIMITED" | "NEW_COMMANDER";

export type CosV1CommanderBaselineStatus =
  | "CALIBRATED"
  | "COMMANDER_BASELINE_UNCALIBRATED"
  | "UNSCORED";

export type CosV1PlayerReportBand = "Strength drivers" | "Deck characteristics";

export type CosV1PlayerReportAxis = {
  id: CosV1ProfileAxisId;
  label: string;
  band: CosV1PlayerReportBand;
  percentile: number;
  mapping: "within_commander" | "global" | "blended";
  explanation: string;
};

export type CosV1KnownCombo = {
  pieces: string[];
  cardCount: number;
  commanderInvolved: boolean;
  kind: "terminal" | "resource" | "other";
  buckets: string[];
};

export type CosV1WinCondition = {
  rank: "Primary" | "Secondary" | "Backup";
  title: string;
  detail: string;
};

/** Display companion. Does not enter the frozen CS/BO math. */
export type CosV1PlayerReport = {
  competitiveStrengthBlurb: string;
  buildOptimizationBlurb: string;
  profile: CosV1PlayerReportAxis[];
  howThisDeckWorks: string;
  keySynergies: string[];
  knownCombos: CosV1KnownCombo[];
  knownComboCount: number;
  winConditions: CosV1WinCondition[];
  whyTheScore: string[];
  optimizationHeadroom: string[];
};

export type CosV1Score = {
  scoreVersion: typeof COS_V1_SCORE_VERSION;
  formulaSha: string;
  schemaSha: string;
  modelSha: string;
  referenceSha: string;
  spellbookFingerprintVersion: string;
  featureExtractionVersion: string;
  competitiveStrength: number | null;
  buildOptimization: number | null;
  buildOptimizationStatus: "ok" | "insufficient_reference" | "unknown_commander" | "unscored";
  buildOptimizationReferenceDepth: CosV1ReferenceDepth | null;
  commanderReferenceCount: number;
  coverageLineage: "COS_V1_UNIVERSAL_COVERAGE_V1";
  commanderKnown: boolean;
  commanderIdentity: string | null;
  unknownCommander: boolean;
  /**
   * Unknown commanders still map U = 0 + R onto the global CS grid.
   * That number is partly extrapolative — not equally grounded calibration.
   */
  commanderBaselineStatus: CosV1CommanderBaselineStatus;
  profile: CosV1ProfileAxis[];
  utility: number | null;
  residual: number | null;
  zeroCombo: boolean;
  failure: { code: CosV1FailureCode; message: string; unresolvedNames?: string[] } | null;
  legacyScore: number | null;
  playerReport?: CosV1PlayerReport;
  COS_V1_MATH_CHANGED: false;
  COLOR_USED: false;
  OPPONENT_FEATURES_USED: false;
  PROFILE_AVERAGED_INTO_HEADLINE: false;
};

export type CosV1Model = {
  nIdent: number;
  commanderIdentities: string[];
  featureNames: string[];
  mu: number[];
  sd: number[];
  S: number[];
  beta: number[];
};

export type CosV1CommanderRef = {
  name: string;
  nUnique: number;
  eligibleBuildOptimization: boolean;
  residualQuantiles: number[] | null;
  profileQuantiles: Record<string, number[] | null>;
};

export type CosV1Reference = {
  nUniqueLists: number;
  minCommanderUnique: number;
  globalUtilityQuantiles: number[];
  globalProfileQuantiles: Record<string, number[]>;
  commanders: Record<string, CosV1CommanderRef>;
};

export type CosV1ArchitectureFingerprint = {
  nNormalizedCombos: number;
  nNativeVariants: number;
  minComboCardCount: number | null;
  nTwoCard: number;
  nThreeCard: number;
  nFourPlusCard: number;
  nCommanderInvolved: number;
  fractionCommanderInvolved: number;
  commanderDependence: "NONE" | "COMMANDER_INDEPENDENT" | "MIXED" | "COMMANDER_DEPENDENT";
  terminalBuckets: string[];
  enablingBuckets: string[];
  nTerminalRoutes: number;
  nResourceOnlyLoops: number;
  nCardsInMultipleComboSets: number;
  sharedPieceConcentration: number;
  nCombosWithPrereqOrTemplate: number;
  nCombosWithManaNeeded: number;
  zoneProfile: Record<string, number>;
  hasTerminal: boolean;
};

export type CosV1AccessFeatures = {
  meanMvNonland: number;
  fracMvLe2: number;
  landFrac: number;
  instantSorceryFrac: number;
  tutorFrac: number;
  drawFrac: number;
  rampFrac: number;
  interactFrac: number;
  protectFrac: number;
  recurFrac: number;
  roleCompressFrac: number;
  clusterEntropy: number;
  sharedConc: number;
};
