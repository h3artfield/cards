/**
 * Semantic Deckbuilding Professor — Phase 5.5 boundary specification (SPEC ONLY).
 * Reasoning layer above deterministic synthesis; NOT the optimization authority.
 */
export const SEMANTIC_DECKBUILDING_PROFESSOR_V1_SPEC_VERSION = "semantic-deckbuilding-professor-v1-spec";

export const SEMANTIC_DECKBUILDING_PROFESSOR_PRODUCT = {
  productName: "Semantic Deckbuilding Professor",
  implementationModel: "GPT-5.6 Sol",
  reasoningEffort: "xhigh",
  status: "SPEC_ONLY — implementation WAIT until Phase 5/6 interfaces stabilize",
  modelConfigurable: true,
  note: "Use strongest available frontier model for complex deckbuilding reasoning; model slug remains configurable.",
} as const;

export const SEMANTIC_DECKBUILDING_PROFESSOR_BOUNDARY = {
  role: "reasoning_advisor",
  mayConsume: [
    "commander / command-zone configuration",
    "bracket",
    "user-selected cards",
    "CommanderBuildDirection[]",
    "DirectionAnchor[]",
    "RetrievalSpecification",
    "CommandZoneComposition",
    "evaluateDeck() output",
    "contribution traces",
    "role coverage",
    "DeckBuildRouteOverlay selection state",
    "semantic-neighbor candidates",
    "RAG context",
  ],
  mayDo: [
    "infer what the user appears to be building",
    "explain the emerging strategy",
    "identify mechanical gaps and disconnected packages",
    "propose functions/cards/packages to investigate via tools",
    "ask the user to resolve ambiguous strategy choices",
    "critique generated decks with deterministic evidence",
    "explain card relationships",
    "request retrieval when deterministic layer abstains",
  ],
  mayNot: [
    "override Oracle identity",
    "override legality",
    "override color identity",
    "override bracket hard rules",
    "override deterministic card semantics",
    "override evaluateDeck/evaluateSwap results",
    "directly mutate the deck without validation",
    "fabricate card recommendations from memory without tool lookup",
  ],
  hardRule: "Professor proposes. Deterministic system disposes.",
  suggestionGate: [
    "Golden Catalog resolution",
    "legality",
    "color identity",
    "bracket validation",
    "semantic evidence",
    "evaluateSwap()",
    "evaluateDeck()",
  ],
} as const;

export const SEMANTIC_DECKBUILDING_PROFESSOR_TOOLS_V1 = [
  "searchMtgRag(query)",
  "getCard(oracleId)",
  "explainCardSemantics(oracleId)",
  "inspectCurrentDeck()",
  "getBuildDirections()",
  "findSemanticCandidates(requirements)",
  "getSemanticNeighbors(oracleId)",
  "evaluateDeck(deck)",
  "evaluateSwap(remove, add)",
  "validateCommanderLegality(deck)",
  "validateBracket(deck, bracket)",
  "inspectRoleCoverage(deck)",
] as const;

export type ProfessorStrategyHypothesis = {
  label: string;
  confidence: number;
  supportingCardGroups: string[];
  conflictingCardGroups: string[];
};

export type ProfessorAssessment = {
  inferredStrategyHypotheses: ProfessorStrategyHypothesis[];
  confidence: number;
  whatDeckAppearsToBeDoing: string;
  strongestMechanicalLoops: string[];
  weakOrDisconnectedPackages: string[];
  missingFunctions: string[];
  overrepresentedFunctions: string[];
  commanderDependencyAssessment: string;
  ambiguityQuestions: string[];
  recommendedRetrievalRequests: string[];
  proposedCardInvestigations: string[];
  explanation: string;
};

export const SEMANTIC_DECKBUILDING_PROFESSOR_ESCALATION_TRIGGERS = [
  "retrieval_abstention",
  "low_direction_confidence",
  "multiple_nearly_equal_build_directions",
  "user_manual_selection_conflicts_with_profile",
  "optimizer_local_plateau",
  "disconnected_semantic_packages_in_deck",
  "user_asks_what_am_i_building",
  "user_asks_for_advice_or_explanation",
] as const;

export const SEMANTIC_DECKBUILDING_PROFESSOR_RAG_POLICY = {
  sources: [
    "comprehensive_rules",
    "official_rulings_policy",
    "terminology_slang",
    "color_faction_knowledge",
    "commander_primers",
    "deckbuilding_articles",
    "curated_transcript_corpus",
    "strategy_taxonomy_material",
  ],
  canonicalMechanicsSource: "Golden Catalog + RC8",
  distinction: "Rules facts are canonical; deckbuilding opinion is advisory only.",
} as const;

export const SEMANTIC_DECKBUILDING_PROFESSOR_ORCHESTRATION = {
  v1Recommendation: "Single GPT-5.6 Sol Professor with deterministic tool loop via Responses API",
  multiAgentDeferred: true,
  note: "Do not introduce multi-agent orchestration until single-Professor eval fails a specialization test.",
} as const;

/** Legacy alias — Copilot spec renamed to Professor; keep export for transitional imports. */
export const SEMANTIC_DECKBUILDING_COPILOT_V1_SPEC_VERSION = SEMANTIC_DECKBUILDING_PROFESSOR_V1_SPEC_VERSION;
