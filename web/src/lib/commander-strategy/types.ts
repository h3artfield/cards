/**
 * Commander Strategy + Matchup Intelligence — derived layer only.
 * NEVER write these artifacts into catalogOracleCards or RC8 canonical semantics.
 */

export const COMMANDER_STRATEGY_LAYER_VERSION = "commander-strategy-v1";
export const CARD_INTERACTION_PROFILE_VERSION = "card-interaction-profile-v1";
export const DECK_SEMANTIC_PROFILE_VERSION = "deck-semantic-profile-v1";
export const STRATEGY_TAXONOMY_VERSION = "strategy-taxonomy-v1";
export const TOPDECK_IMPORTER_VERSION = "topdeck-import-edh-v1";
export const SEMANTIC_SYNERGY_EDGES_VERSION = "semantic-synergy-edges-v1";
export const TOPDECK_QA_REPORT_VERSION = "topdeck-ingestion-qa-v2";
export const TOPDECK_COMBINED_QA_REPORT_VERSION = "topdeck-combined-training-corpus-qa-v3";
export const TOPDECK_12MONTH_QA_REPORT_VERSION = "topdeck-12month-training-corpus-qa-v1";
export const TOPDECK_NORMALIZATION_VERSION = "topdeck-normalization-v3";
export const DECK_RESOLVER_VERSION = "deck-resolver-v3.3-om1-printed-alias";

/** Similarity ≠ beats. Keep concepts separate in all downstream code. */
export type InteractionConcept = "similarity" | "mechanical_pressure" | "observed_matchup";

export type StrategyAssignmentSource = "semantic_rules" | "human" | "learned_cluster";

export type StrategyTaxonomyEntry = {
  strategyId: string;
  kind: "archetype" | "theme";
  canonicalName: string;
  synonyms: string[];
  definition: string;
  source: string;
  sourceDate: string;
  taxonomyVersion: typeof STRATEGY_TAXONOMY_VERSION;
};

export type InteractionDimensionEvidence = {
  oracleId: string;
  primitive?: string;
  sourceZone?: string;
  destinationZone?: string;
  targetClass?: string;
  abilityType?: string;
  note?: string;
};

export type ScoredInteractionDimension = {
  dimension: string;
  score: number;
  evidence: InteractionDimensionEvidence[];
};

export type MechanicalPressureRelation =
  | "canAnswer"
  | "canDisrupt"
  | "canExploit"
  | "canProtectAgainst"
  | "attacksDependency"
  | "bypassesDefense";

export type CardAttackVector = Record<string, number>;
export type CardVulnerabilityVector = Record<string, number>;

export type CardInteractionProfile = {
  oracleId: string;
  profileVersion: typeof CARD_INTERACTION_PROFILE_VERSION;
  semanticVersion: string;
  parserVersion: string;
  parserBlobClosure: string;
  paperPopulationHash: string;
  generatedAt: string;
  threatCapabilities: ScoredInteractionDimension[];
  answerCapabilities: ScoredInteractionDimension[];
  resourceGeneration: ScoredInteractionDimension[];
  dependencies: ScoredInteractionDimension[];
  vulnerabilities: ScoredInteractionDimension[];
  zonesUsed: Record<string, number>;
  objectsAffected: Record<string, number>;
  timingProfile: Record<string, number>;
  targetPredicates: Record<string, number>;
  /** Mechanical pressure hints — NOT "beats". */
  mechanicalRelations: Partial<Record<MechanicalPressureRelation, string[]>>;
};

export type SemanticSynergyEdge = {
  sourceOracleId: string;
  destinationOracleId: string;
  mechanism: string;
  direction: "producer_to_payoff" | "enabler_to_payoff" | "setup_to_payoff";
  evidence: InteractionDimensionEvidence[];
  semanticStrength: number;
  semanticVersion: string;
  edgeVersion: typeof SEMANTIC_SYNERGY_EDGES_VERSION;
};

export type ResolvedDeckCard = {
  sourceName: string;
  quantity: number;
  normalizedName: string;
  oracleId?: string;
  canonicalOracleName?: string;
  resolutionMethod?: string;
  rawCatalogIdentity: boolean;
  paperEligible: boolean;
  /** Commander legality at import/resolution time — not historical tournament legality. */
  currentlyCommanderLegal: boolean;
  appearedInHistoricalDeck: true;
  paperPopulationFrame: "PAPER" | "DIGITAL_ONLY" | "NON_CARD" | "MALFORMED" | "UNKNOWN";
  resolutionStatus: "resolved" | "unresolved";
};

export type ResolvedCommander = {
  sourceName: string;
  normalizedName: string;
  oracleId?: string;
  canonicalOracleName?: string;
  resolutionMethod?: string;
  rawCatalogIdentity: boolean;
  paperEligible: boolean;
  currentlyCommanderLegal: boolean;
  appearedInHistoricalDeck: true;
  paperPopulationFrame: "PAPER" | "DIGITAL_ONLY" | "NON_CARD" | "MALFORMED" | "UNKNOWN";
  resolutionStatus: "resolved" | "unresolved";
  commanderSource: "deckObj" | "parsed_text" | "unknown";
};

export type NormalizedDeckInstance = {
  deckInstanceId: string;
  deckHash: string;
  tid: string;
  tournamentDate: string;
  /** Analytic month bucket: month(tournamentDate). */
  canonicalMonth?: string;
  sourceFormat: string;
  sourcePopulation: "topdeck_edh_tournaments";
  playerIdHash: string;
  commanders: ResolvedCommander[];
  commanderOracleIds: string[];
  commanderConfigurationId?: string;
  commanderResolutionStatus: "resolved" | "partial" | "unresolved";
  mainboard: ResolvedDeckCard[];
  cardResolutionRate: number;
  unresolvedCards: string[];
  deckObjAvailable: boolean;
  decklistAvailable: boolean;
  structuredCommanderAvailable: boolean;
  parsedTextCommanderAvailable: boolean;
  digitalOnlyCardCount: number;
  nonPaperCardCount: number;
};

export type TopdeckPodParticipant = {
  playerIdHash: string;
  deckInstanceId: string;
  deckHash: string;
  commanderOracleIds: string[];
  commanderConfigurationId?: string;
  winner: boolean;
};

export type TopdeckPodGame = {
  podId: string;
  tid: string;
  tournamentDate: string;
  /** Analytic month bucket: month(tournamentDate), independent of import fetch window. */
  canonicalMonth?: string;
  round: number | string;
  table: number | string;
  podSize: number;
  status: string;
  participants: TopdeckPodParticipant[];
  winnerPlayerIdHash?: string;
  draw: boolean;
  sourceFormat: string;
  sourcePopulation: "topdeck_edh_tournaments";
  /** Import fetch window label when observation arrived outside requested month. */
  requestedFetchWindow?: string;
};

export type TopdeckNormalizationManifest = {
  normalizationVersion: typeof TOPDECK_NORMALIZATION_VERSION;
  resolverVersion: typeof DECK_RESOLVER_VERSION;
  commanderConfigurationSchemaVersion: string;
  paperPopulationHash: string;
  sourceRunId: string;
  sourceRawDigest: string;
  generatedAt: string;
  normalizedDatasetHash: string;
  supersedes: "normalized-decks.json" | "normalized-decks-v2.json" | null;
  tournamentCount: number;
  podCount: number;
  deckCount: number;
};

export type TopdeckImportRun = {
  runId: string;
  source: "TopDeck";
  apiVersion: "v2";
  game: "Magic: The Gathering";
  format: "EDH";
  rangeStart: string;
  rangeEnd: string;
  /** Primary requested fetch window label(s) for this run. */
  requestedFetchWindows?: string[];
  /** Pods/tournaments whose tournamentDate month differs from the requesting fetch window. */
  outOfRequestedWindowRecordCount?: number;
  fetchedAt: string;
  tournamentCount: number;
  rawDigest: string;
  importerVersion: typeof TOPDECK_IMPORTER_VERSION;
  checkpointPath?: string;
  status: "running" | "completed" | "failed";
  error?: string;
  fetchMetrics?: TopdeckFetchMetrics;
  catalogUniverse?: {
    rawCatalogIdentitiesLoaded: number;
    paperIdentitiesAvailable: number;
    digitalOnlyIdentities: number;
    nonCardIdentities: number;
    paperPopulationHash: string;
  };
};

export type TopdeckFetchRequestLog = {
  windowLabel: string;
  httpStatus?: number;
  attemptCount: number;
  retryDelaysMs: number[];
  splitDepth: number;
  result: "success" | "split" | "failed";
};

export type TopdeckFetchMetrics = {
  failedRequests: number;
  retries: number;
  rateLimit429Count: number;
  windows: string[];
  requestLog: TopdeckFetchRequestLog[];
  splitDepthMax: number;
  duplicateTidRetrievals: number;
};

export type DeckProfileProvenance = {
  parserVersion: string;
  parserBlobClosure: string;
  semanticIndexVersion: string;
  paperPopulationHash: string;
  strategyTaxonomyVersion: string;
  deckProfileVersion: string;
  generatedAt: string;
  status: "PROVISIONAL_DERIVED_PROFILE";
};

export type DeckSemanticProfile = {
  deckHash: string;
  profileVersion: typeof DECK_SEMANTIC_PROFILE_VERSION;
  provenance: DeckProfileProvenance;
  commanderOracleIds: string[];
  commanderVector: {
    attackVector: CardAttackVector;
    vulnerabilityVector: CardVulnerabilityVector;
    actionDensity: Record<string, number>;
    derivedRoles: Record<string, number>;
  };
  deckAggregateVector: {
    actionDensity: Record<string, number>;
    zoneProfile: Record<string, number>;
    abilityProfile: Record<string, number>;
    attackVector: CardAttackVector;
    vulnerabilityVector: CardVulnerabilityVector;
    dependencies: CardVulnerabilityVector;
    derivedRoles: Record<string, number>;
  };
  deckInteractionStructure: {
    commanderSupport: number;
    commanderDependency: number;
    commanderSynergy: number;
    commanderRedundancy: number;
    internalSynergyEdgeCount: number;
  };
  /** Outcome-blind semantic classification — NOT training truth. */
  strategyAssignment: DeckStrategyAssignment;
};

export type DeckStrategyAssignment = {
  deckHash: string;
  assignmentVersion: "deck-strategy-assignment-v1";
  generatedAt: string;
  assignmentSource: StrategyAssignmentSource;
  archetypeDistribution: Record<string, number>;
  themeDistribution: Record<string, number>;
  classifierConfidence: number;
  evidence: string[];
  contributingCards: string[];
  contributingSemanticFeatures: string[];
};

/** Design hooks only — bracket classifier + within-bracket grade NOT implemented. */
export type DeckCompetitiveAssessment = {
  assessmentVersion: "deck-competitive-assessment-v0-design";
  bracketSystemVersion?: string;
  bracketRulesSnapshotHash?: string;
  assignedBracket?: 1 | 2 | 3 | 4 | 5;
  bracketName?: string;
  bracketConfidence?: number;
  bracketReasons?: string[];
  bracketConstraintEvidence?: string[];
  withinBracketScore?: number;
  withinBracketPercentile?: number;
  withinBracketGrade?: string;
  gradeConfidence?: number;
  gradeModelVersion?: string;
  status: "NOT_IMPLEMENTED";
};

export type PathfindingDataModelRefs = {
  cardSemanticVector: string;
  cardInteractionProfile: string;
  cardSynergyEdges: string;
  deckSemanticProfile: string;
  strategyAssignment: string;
  vulnerabilityProfile: string;
  matchupProfile: string;
};

export type CommanderCoPodObservation = {
  commanderAOracleId: string;
  commanderBOracleId: string;
  sharedPodCount: number;
  aWins: number;
  bWins: number;
  otherWins: number;
  draws: number;
  aObservedWinRate: number;
  bObservedWinRate: number;
  podBaseline: number;
  aWinLift: number;
  bWinLift: number;
  label: "co-pod performance";
};

export type TopdeckIngestionQaReport = {
  reportVersion: typeof TOPDECK_QA_REPORT_VERSION;
  generatedAt: string;
  importRunId?: string;
  sourcePopulation: "topdeck_edh_tournaments";
  topDeckApiKeyDetected: boolean;
  topDeckApiKeySource: "process" | "web/.env.local" | "repo/.env.local" | "none";
  topdeckAttribution: string;
  disclaimer: string;
  connection: {
    authenticated: boolean;
    apiVersion: "v2";
    importStart?: string;
    importEnd?: string;
    fetchWindows: string[];
    failedRequests: number;
    retries: number;
    rateLimit429Count: number;
  };
  catalogUniverse: {
    rawCatalogIdentitiesLoaded: number;
    paperIdentitiesAvailable: number;
    digitalOnlyIdentities: number;
    nonCardIdentities: number;
    paperPopulationHash: string;
  };
  tournaments: {
    tournamentsFetched: number;
    dateRange: { start?: string; end?: string };
    exactDuplicateTids: number;
    participantDistribution: Record<string, number>;
    sourceFormatBreakdown: Record<string, number>;
    tournamentSizeDistribution: Record<string, number>;
    dateDistribution: Record<string, number>;
    geographicSamples: Array<{ tid: string; city?: string; state?: string }>;
    repeatedEventNames: Array<{ name: string; count: number }>;
  };
  pods: {
    roundsObserved: number;
    totalTables: number;
    completedPods: number;
    pendingPods: number;
    activePods: number;
    excludedPods: number;
    podSizeDistribution: Record<string, number>;
    winnerCoveragePct: number;
    drawOrNoWinnerCoveragePct: number;
  };
  decklists: {
    deckAppearances: number;
    decklistAvailablePct: number;
    deckObjAvailablePct: number;
    structuredCommanderAvailablePct: number;
    parsedTextCommanderAvailablePct: number;
  };
  identityResolution: {
    commanderResolvedPct: number;
    commanderUnresolvedPct: number;
    deckCardsResolvedPct: number;
    unresolvedCardCount: number;
    unresolvedUniqueCardNames: string[];
    topUnresolvedCardNames: Array<{ name: string; count: number }>;
    digitalOnlyCardEncounters: number;
    nonPaperCardEncounters: number;
  };
  decks: {
    uniqueCanonicalDeckHashCount: number;
    duplicateDeckAppearances: number;
    uniqueCommanderIdentities: number;
    commanderConfigurationCounts: Record<string, number>;
  };
  deduplication: {
    exactDuplicateTournamentRecords: number;
    duplicateTidRetrievals: number;
    uniquePodIds: number;
    duplicatePodRecords: number;
    unresolvedCommanderCount: number;
  };
  players: {
    uniqueHashedPlayerIds: number;
    repeatPlayerRate: number;
  };
  coPodPerformance: {
    topCommandersByAppearances: Array<{ oracleId: string; name: string; count: number }>;
    topCommandersByUniqueDecks: Array<{ oracleId: string; name: string; count: number }>;
    topCommandersByWins: Array<{ oracleId: string; name: string; wins: number; pods: number }>;
    topCommanderPairsSharingPods: Array<{ a: string; b: string; sharedPods: number }>;
    sampleObservations: CommanderCoPodObservation[];
  };
};

/** @deprecated Use TopdeckIngestionQaReport v2 fields */
export type TopdeckIngestionQaReportV1Compat = {
  connectionSuccessful: boolean;
  tournamentCount: number;
};
