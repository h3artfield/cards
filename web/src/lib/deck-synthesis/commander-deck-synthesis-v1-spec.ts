/**
 * Commander Deck Synthesis & Archetype Explorer v1 — specification (ACCEPTED WITH ADDITIONS).
 *
 * Evaluates vs builds: Deck Evaluation Engine evaluates; this subsystem builds.
 * Autonomous deck optimization lives HERE — NOT in Deck Evaluation Engine v1.
 */
import {
  DECK_BUILD_ROUTE_OVERLAY_V1,
  DECK_SYNTHESIS_USER_INPUT_CONTRACT_V1,
  SEMANTIC_3D_MAP_CONTRACT_V1,
} from "./deck-build-route-overlay-v1";
import { SEMANTIC_DECKBUILDING_COPILOT_BOUNDARY } from "./semantic-deckbuilding-copilot-v1-spec";

export const COMMANDER_DECK_SYNTHESIS_V1_SPEC_VERSION = "commander-deck-synthesis-v1-spec";

/** Layer stack — synthesis depends on evaluation, not vice versa. */
export const COMMANDER_DECK_SYNTHESIS_LAYER_STACK = [
  "Golden Catalog",
  "RC8 (FROZEN)",
  "Interaction Profile v2.1 (ACCEPTED_FROZEN)",
  "Deck Evaluation Engine v1",
  "Commander Bracket Policy Snapshot",
  "Commander Deck Synthesis Engine",
  "Multiple optimized archetype builds",
  "DeckBuildRouteOverlay on canonical Semantic 3D Map",
] as const;

/** Module boundary — do not mix responsibilities. */
export const COMMANDER_DECK_SYNTHESIS_MODULE_BOUNDARY = {
  deckEvaluationEngine: {
    owns: ["evaluateDeck()", "evaluateSwap()"],
    doesNotOwn: [
      "discoverArchetypes",
      "generateCandidateDeck",
      "optimizeDeck",
      "generateDiverseBuilds",
      "autonomous deck rewriting",
    ],
  },
  commanderDeckSynthesisEngine: {
    owns: [
      "discoverArchetypes()",
      "generateCandidateDeck()",
      "optimizeDeck()",
      "generateDiverseBuilds()",
      "explainBuildGraph()",
    ],
    consumes: ["evaluateDeck()", "evaluateSwap()"],
    doesNotOwn: ["heuristic sub-score rubrics (DEE evaluative layer)", "matchup modeling"],
  },
  commanderBracketPolicyEngine: {
    owns: ["getBracketPolicy()", "validateBracket()", "explainBracketFit()"],
    doesNotOwn: ["deck optimization", "archetype discovery"],
  },
  archetypeBuildGraph: {
    owns: ["explainBuildGraph()", "graph schema", "visualization data model"],
    doesNotOwn: ["optimization search", "deck evaluation rubrics"],
  },
} as const;

/** Frozen development order — do not skip prerequisites. */
export const COMMANDER_DECK_SYNTHESIS_DEVELOPMENT_PHASES_V1 = {
  version: "commander-deck-synthesis-development-phases-v1",
  phases: [
    { phase: 1, name: "Deck Evaluation descriptive evaluateDeck()", status: "QA_COMPLETE" },
    { phase: 2, name: "Contribution/evidence traces", status: "QA_COMPLETE" },
    { phase: 3, name: "evaluateSwap()", status: "QA_COMPLETE" },
    { phase: 4, name: "Bracket Policy Engine", status: "QA_COMPLETE" },
    { phase: 5, name: "Archetype discovery prototype", status: "QA_COMPLETE — Phase 5.1 overlay contract + signature repairs" },
    { phase: 6, name: "Candidate-pool generation", status: "WAIT — requires SEMANTIC_ONLY retrieval + meta-independence audit" },
    { phase: 7, name: "Package representation (CardPackage)", status: "WAIT" },
    { phase: 8, name: "Optimizer prototype", status: "WAIT — requires phases 1–7 deterministic QA" },
    { phase: 9, name: "Diversity generation (ArchetypeSignature enforcement)", status: "WAIT" },
    { phase: 10, name: "DeckBuildRouteOverlay integration on Semantic 3D Map", status: "WAIT — separate graph renderer DO NOT BUILD" },
  ],
  optimizerGate:
    "Do NOT begin optimizer until evaluateDeck(), evaluateSwap(), bracket validation, archetype discovery, and candidate retrieval have deterministic QA.",
} as const;

/** Primary user workflow. */
export const COMMANDER_DECK_SYNTHESIS_USER_WORKFLOW_V1 = {
  version: "commander-deck-synthesis-workflow-v1",
  primaryFlow: [
    "SELECT_COMMANDER",
    "SELECT_COMMANDER_BRACKET",
    "OPTIONAL_CONSTRAINTS",
    "DISCOVER_ARCHETYPES",
    "GENERATE_MULTIPLE_DISTINCT_DECKS",
    "COMPARE_COMPONENT_PROFILES",
    "EXPLORE_VISUAL_SYNERGY_GRAPH",
  ],
  initialUiDisplay: {
    show: [
      "commander integration",
      "plan identity",
      "structural coherence",
      "resource engine",
      "interaction breadth",
      "bracket fit (heuristic)",
      "archetypeFit (when applicable)",
    ],
    hideUntilCalibrated: ["qualityWithinBracket composite"],
  },
  optionalConstraintsV1Deferred: [
    "budget",
    "owned/inventory cards only",
    "cards that must be included",
    "cards that must be excluded",
    "preferred strategy",
    "preferred colors where relevant",
    "desired interaction level",
    "desired complexity",
  ],
  v1MinimumInputs: DECK_SYNTHESIS_USER_INPUT_CONTRACT_V1.minimumRequired,
  archetypeSelection: DECK_SYNTHESIS_USER_INPUT_CONTRACT_V1.archetypeSelection,
} as const;

/**
 * ArchetypeSignature — frozen per build; HARD diversity requirement.
 * Two builds are distinct archetypes only if signatures exceed minimum semantic-diversity threshold.
 * Card overlap alone is NOT sufficient.
 */
export const ARCHETYPE_SIGNATURE_V1 = {
  version: "archetype-signature-v1",
  status: "FROZEN_FOR_SPEC",
  requiredFields: [
    "primaryRelianceAxes",
    "secondaryRelianceAxes",
    "primarySemanticRoles",
    "winPlanPackage",
    "commanderMechanicsUsed",
    "interactionPhilosophy",
  ],
  diversityPolicy: {
    type: "HARD_GENERATION_REQUIREMENT",
    rule: "Multiple generated decks MUST represent genuinely different strategies — not 92–95 identical cards with different labels.",
    distinctnessTest: "semantic_signature_distance(A, B) >= MIN_SEMANTIC_DIVERSITY_THRESHOLD",
    cardOverlapAlone: "INSUFFICIENT",
    minSemanticDiversityThreshold: "TBD at implementation — threshold definition frozen as requirement",
  },
  perBuildFreeze: "Every generated build freezes its ArchetypeSignature at acceptance time.",
} as const;

/**
 * Two-stage archetype discovery — commander semantics first, catalog feasibility second.
 */
export const COMMANDER_ARCHETYPE_DISCOVERY_V1 = {
  version: "commander-archetype-discovery-v1",
  principle: "Discover mechanically plausible strategies from commander semantics — do not require pre-existing hand-authored label.",
  stages: {
    stageA: {
      id: "COMMANDER_SUPPORT",
      question: "What strategies does the commander's own mechanics suggest?",
      inputs: [
        "commander RC8 actions + abilities",
        "derived semantic roles (RC8 feature bundle)",
        "IPV2.1 command-zone reliance profile",
        "IPV2.1 command-zone capabilities (disruption/exposure)",
        "commander/mainboard semantic synergy system (deck-semantic-profile pattern)",
        "card interaction profile v1/v2.1",
      ],
      output: "Hypothesis clusters ranked by commander semantic support strength",
    },
    stageB: {
      id: "CATALOG_FEASIBILITY",
      question: "Does the legal card pool contain enough support to construct a coherent deck around that hypothesis?",
      requirement:
        "An archetype MUST NOT be surfaced simply because the commander contains one relevant semantic action.",
      supportEvidenceRequired: [
        "enabling cards",
        "payoff cards",
        "engine pieces",
        "interaction/support",
        "redundancy",
      ],
      filtersFrom: ["commander color identity", "legality", "bracket policy", "RC8 mechanics", "IPV2.1 axes"],
      antiPatternExample:
        "Commander mentions tokens once → therefore 'Token Deck' when pool lacks mechanical support",
    },
  },
  process: [
    "Stage A: Build commander-only semantic profile (CMD zone IPV2.1 + RC8 + interaction profile)",
    "Stage A: Score mechanical axis activation per reliance/disruption/role cluster",
    "Stage A: Cluster axes into candidate win-plan / engine signatures",
    "Stage B: Retrieve legal pool candidates per hypothesis",
    "Stage B: Score catalog support evidence (enabling/payoff/engine/interaction/redundancy)",
    "Stage B: Reject hypotheses below support threshold",
    "Map surviving clusters to human-readable names AFTER mechanical discovery (strategy-taxonomy-v1 optional label mapping)",
  ],
  output: {
    candidateArchetypes: {
      fields: [
        "archetypeId",
        "mechanicalSignature",
        "archetypeSignature",
        "supportScore",
        "catalogFeasibilityEvidence",
        "primaryAxes",
        "secondaryAxes",
        "displayName",
        "displayNameSource",
        "evidenceRefs",
      ],
    },
    displayNamePolicy:
      "Human-readable names (sacrifice engine, token engine, graveyard recursion, etc.) are mapped post-hoc from mechanical cluster — not search prerequisites.",
  },
  taxonomyMapping: {
    source: "strategy-taxonomy-v1.json",
    role: "Optional display label mapping — discovery does not depend on taxonomy completeness",
  },
} as const;

/**
 * Archetype candidate pool — built BEFORE optimization.
 * Default retrieval MUST be semantic-first / meta-independent (FROZEN for Phase 6).
 */
export const CANDIDATE_RETRIEVAL_MODE_V1 = {
  version: "candidate-retrieval-mode-v1",
  status: "FROZEN — Phase 6 authorization prerequisite",
  defaultMode: "SEMANTIC_ONLY",
  modes: {
    SEMANTIC_ONLY: {
      description: "Meta-independent candidate discovery — popularity priors fully OFF",
      requiredSources: [
        "legal catalog",
        "color identity",
        "bracket hard rules",
        "RC8 mechanics",
        "IPV2.1",
        "archetype signature",
        "functional role",
        "commander synergy",
        "semantic-map relationships",
      ],
      prohibitedRequiredInputs: [
        "EDHREC inclusion rate",
        "TopDeck frequency",
        "commander co-occurrence",
        "tournament card prevalence",
        "community popularity",
      ],
      selectionProvenanceAllowed: [
        "commander_semantic_fit",
        "archetype_fit",
        "role_fit",
        "structural_fit",
        "semantic_neighbor_support",
      ],
      selectionProvenanceProhibited: ["popularity", "edhrec_rate", "meta_frequency", "co_occurrence_rate"],
    },
    SEMANTIC_PLUS_META_PRIOR: {
      description: "Future optional mode — explicit labeled meta prior layered on semantic pool",
      status: "FUTURE — not v1 default",
      requirement: "Meta prior MUST be toggleable OFF without changing semantic retrieval path",
    },
  },
  v1Policy: "Phase 6 candidate generation uses SEMANTIC_ONLY unless explicitly authorized otherwise",
} as const;

export const ARCHETYPE_CANDIDATE_POOL_V1 = {
  version: "archetype-candidate-pool-v1",
  principle: "Derive structured candidate pool per archetype before whole-deck optimization begins.",
  candidateRetrievalMode: CANDIDATE_RETRIEVAL_MODE_V1,
  perArchetypeBuckets: [
    "coreCards",
    "strongSupport",
    "roleFillers",
    "structuralCards",
    "interaction",
    "mana",
    "optionalPackages",
  ],
  retrievalSources: [
    "commander color identity",
    "legality",
    "bracket policy",
    "RC8 mechanics",
    "IPV2.1 axes",
    "synergy edges",
    "semantic-neighbor retrieval",
  ],
  optionalPrior: {
    popularityData: "EDHREC-style — optional labeled prior ONLY in SEMANTIC_PLUS_META_PRIOR mode",
    rationale: "System must propose mechanically valid cards popularity systems may overlook",
    defaultOff: true,
  },
  phase6QaAcceptanceCriteria: {
    metaIndependenceAudit: {
      status: "FROZEN — required when Phase 6 authorized",
      reportFields: [
        "candidateCount",
        "roleCoverage",
        "semanticSupportDistribution",
        "candidatesAbsentOrRareInCommonCommanderLists",
        "candidatesOverlappingCommonCommanderStaples",
        "selectionProvenanceBreakdown",
      ],
      selectionProvenanceRequired: [
        "commander_semantic_fit",
        "archetype_fit",
        "role_fit",
        "structural_fit",
      ],
      selectionProvenanceProhibitedInSemanticOnly: ["popularity", "edhrec_rate", "meta_frequency", "co_occurrence_rate"],
      goal: "Distinguish independently rediscovered meta card from copied meta card via selection mechanism, not final overlap alone",
    },
  },
  output: {
    candidatePoolHash: "Deterministic hash of pool contents + retrieval version — stored in optimization provenance",
  },
} as const;

/** Role budgets — versioned ranges, not universal folklore counts. */
export const ROLE_BUDGET_MODEL_V1 = {
  version: "role-budget-model-v1",
  principle: "Prevent high-synergy piles from forgetting basic deck construction.",
  roleIds: [
    "manaSources",
    "acceleration",
    "cardAdvantage",
    "interaction",
    "protection",
    "winConditions",
    "archetypeEngine",
    "recursion",
    "utilityFlex",
  ],
  constraintType: "acceptable_ranges — NOT rigid exact counts",
  variationPolicy: "Ranges vary by commander / archetype / bracket — versioned heuristics, labeled as such",
  antiPattern: "Do NOT hard-code generic Commander folklore counts as universal truths without labeling as heuristics",
} as const;

/** CardPackage — first-class optimization unit. */
export const CARD_PACKAGE_V1 = {
  version: "card-package-v1",
  artifactType: "CardPackage",
  principle: "Many synergies are package-level (3-card engine, sacrifice package, tutor package) — not card-to-card only.",
  fields: [
    "packageId",
    "cards[]",
    "mechanicalPurpose",
    "requiredPieces",
    "optionalPieces",
    "semanticAxes",
    "archetypeContribution",
    "evidence",
    "bracketImpact",
  ],
  optimizerUsage: "Add/remove/evaluate packages as well as individual cards during search",
} as const;

/**
 * Separate ARCHETYPE QUALITY from GENERAL DECK QUALITY.
 * Optimize: strongest defensible version of THIS strategy within THIS bracket.
 */
export const DECK_QUALITY_DECOMPOSITION_V1 = {
  version: "deck-quality-decomposition-v1",
  generalDeckQuality: {
    components: [
      "structuralCoherence",
      "commanderIntegration",
      "interactionToolbox",
      "resourceEngine",
      "planIdentity",
      "bracketFit",
    ],
    question: "How structurally sound is this deck overall?",
  },
  archetypeFit: {
    question: "How well does this deck realize the selected archetype strategy?",
    rule: "A deck with higher generalDeckQuality but lower archetypeFit MUST NOT replace a better archetype realization merely on generic score.",
  },
  qualityWithinBracket: {
    status: "INTERNAL_ONLY — UNCALIBRATED / NOT USER-FACING until DEE heuristic scoring frozen",
    uiPolicy: "Show component profile initially; composite deferred",
  },
} as const;

/**
 * Pareto-style multiobjective optimization — do NOT collapse dimensions into one weighted score during search.
 */
export const PARETO_OPTIMIZATION_V1 = {
  version: "pareto-optimization-v1",
  principle: "Preserve objective vector during search; collapse only at tie-break via declared goal profile.",
  objectiveVector: [
    "commanderIntegration",
    "structuralCoherence",
    "resourceEngine",
    "interaction",
    "archetypeSupport",
    "bracketFit",
    "planIdentity",
    "archetypeFit",
  ],
  dominance: {
    definition:
      "Candidate A is dominated if another legal candidate is at least as good on every required dimension AND better on at least one.",
    usage: "Rank/filter population by Pareto frontier before goal-profile tie-break",
  },
  tieBreak: "Declared goal profile selects among non-dominated candidates — NOT arbitrary global weights during search",
  antiPattern: "Single weighted sum causing all archetypes to converge toward identical generic staple pile",
} as const;

/** Multi-solution generation — local optima, not single global optimum. */
export const COMMANDER_MULTI_SOLUTION_GENERATION_V1 = {
  version: "commander-multi-solution-generation-v1",
  principle: "Return several high-scoring local optima representing mechanically distinct strategies — NOT 'the optimal deck'.",
  objective: {
    maximize: "archetypeFit + generalDeckQuality components within bracket + user constraints",
    not: "globally strongest technically-compliant deck mislabeled by bracket",
  },
  outputPerBuild: {
    fields: [
      "buildId",
      "archetypeId",
      "archetypeSignature",
      "displayName",
      "generalDeckQuality",
      "archetypeFit",
      "qualityWithinBracket",
      "bracketRulesSatisfied",
      "bracketIntentFit",
      "mainboard",
      "evaluationReport",
      "buildRouteOverlay",
      "optimizationProvenance",
      "cardSelectionProvenance",
    ],
    qualityWithinBracketPolicy: "INTERNAL — UNCALIBRATED / NOT USER-FACING until heuristic scoring frozen",
  },
  v1BuildCountPolicy: "Generate one optimized build per discovered archetype candidate above support AND diversity thresholds",
} as const;

/**
 * Diversity mechanism — ArchetypeSignature semantic threshold (HARD requirement).
 */
export const COMMANDER_BUILD_DIVERSITY_METRIC_V1 = {
  version: "commander-build-diversity-v1",
  status: "FROZEN_FOR_SPEC",
  principle:
    "Build A and Build B must represent genuinely different mechanical approaches — not 94 identical cards with different labels.",
  hardRequirement: "ArchetypeSignature semantic-diversity threshold — see ARCHETYPE_SIGNATURE_V1",
  acceptableOverlap: "Staples shared for structural reasons (mana base, color fixing) are acceptable",
  notRequired: "Exact minimum card-count difference between builds",
  pairwiseDiversityScore: {
    definition: "diversity(A,B) ∈ [0,1] — higher = more distinct",
    primarySignal: "ArchetypeSignature semantic distance",
    secondaryComponents: [
      "card_set_overlap",
      "semantic_profile_similarity",
      "archetype_axis_similarity",
      "win_plan_similarity",
    ],
    cardOverlapAlone: "INSUFFICIENT for distinctness",
  },
  optimizationConstraint: {
    type: "HARD_CONSTRAINT",
    rule: "Reject or regenerate build if semantic signature distance below threshold vs existing accepted builds",
  },
} as const;

/** Optimization provenance — reproducible builds. */
export const OPTIMIZATION_PROVENANCE_V1 = {
  version: "optimization-provenance-v1",
  requiredFields: [
    "buildId",
    "commander",
    "bracketPolicyVersion",
    "archetypeSignature",
    "candidatePoolHash",
    "optimizerVersion",
    "evaluationVersion",
    "startingSeed",
    "iterations",
    "acceptedSwaps",
    "rejectedSwaps",
    "finalEvaluation",
    "constraints",
  ],
  reproducibility:
    "Same commander + bracket + archetype + constraints + seed MUST reproduce same build (deterministic engine)",
} as const;

/** Bracket Policy Engine — separately versioned snapshot; continuous validation during optimization. */
export const COMMANDER_BRACKET_POLICY_SNAPSHOT_V1 = {
  version: "commander-bracket-policy-snapshot-v1",
  artifactType: "CommanderBracketPolicySnapshot",
  sourcePolicy: "Official Wizards Commander bracket policy — versioned snapshot, not inferred at runtime",
  continuousValidation: {
    rule: "Validate at every candidate insertion — invalid candidates MUST NOT enter optimization population",
    pipeline: ["candidate insertion", "legality check", "bracket hard-policy check", "evaluate"],
  },
  bracketIntentFitPolicy: "Evaluative/heuristic — MUST NOT masquerade as official bracket determination",
  validationOutputs: {
    bracketRulesSatisfied: {
      definition: "Hard constraints pass — legality, GC limits, banned list, explicit barometer thresholds",
      type: "boolean + violation list",
    },
    bracketIntentFit: {
      definition: "Qualitative alignment with bracket philosophy — NOT reducible to GC count",
      type: "score 0–100 + explainable reasons",
      label: "HEURISTIC — not official bracket determination",
      separateFrom: "bracketRulesSatisfied",
    },
  },
  api: {
    getBracketPolicy: "getBracketPolicy(bracket: 1|2|3|4|5): CommanderBracketPolicySnapshot",
    validateBracket: "validateBracket(deck, bracket): BracketValidationReport",
    explainBracketFit: "explainBracketFit(deck, bracket): BracketFitExplanation",
    validateCandidateForOptimization: "validateCandidateForOptimization(deck, bracket): BracketValidationReport",
  },
  bracketNames: {
    1: "Exhibition",
    2: "Core",
    3: "Upgraded",
    4: "Optimized",
    5: "cEDH",
  },
} as const;

/** Whole-deck optimization architecture — NOT greedy card chaining. */
export const COMMANDER_WHOLE_DECK_OPTIMIZER_V1 = {
  version: "commander-whole-deck-optimizer-v1",
  status: "WAIT",
  forbidden: "next card = highest synergy with previous card (greedy chain)",
  required: "Evaluate entire deck state at each candidate step",
  prerequisites: [
    "evaluateDeck() QA_COMPLETE",
    "evaluateSwap() QA_COMPLETE",
    "bracket validation QA_COMPLETE",
    "archetype discovery deterministic QA",
    "candidate pool retrieval deterministic QA",
    "CardPackage representation",
  ],
  searchArchitecture: {
    phases: [
      "commander_seed",
      "archetype_candidate_pool",
      "initial_complete_build",
      "evaluateDeck()",
      "identify_deficits",
      "candidate_substitutions_and_packages",
      "evaluateSwap()",
      "pareto_frontier_update",
      "iterative_improvement",
      "convergence",
    ],
    objectiveModel: "PARETO_OPTIMIZATION_V1 — not single weighted score during search",
    allowedAlgorithms: [
      "beam_search",
      "local_search",
      "multiobjective_search",
      "simulated_annealing (deterministic seed)",
    ],
  },
  roleBudgetEnforcement: "ROLE_BUDGET_MODEL_V1 ranges checked each candidate state",
  packageOperations: "Add/remove/evaluate CardPackage units alongside individual cards",
} as const;

/** Card selection provenance — every chosen card explainable. */
export const COMMANDER_CARD_SELECTION_PROVENANCE_V1 = {
  version: "commander-card-selection-provenance-v1",
  requiredField: "whySelected[]",
  reasonCodes: [
    "directCommanderSynergy",
    "supportsPrimaryArchetype",
    "supportsExistingPackage",
    "fillsInteractionGap",
    "fillsResourceGap",
    "improvesManaStructure",
    "providesRedundancy",
    "enablesCombo",
    "protectsWinPlan",
    "bracketAppropriate",
    "satisfiesRoleBudget",
  ] as const,
  traceRequirement: "Every reason code MUST link to deterministic semantic evidence (RC8 action, IPV2.1 rule, synergy edge, bracket policy clause)",
} as const;

/** Commander relationship / build philosophy — separate from single synergy score. */
export const COMMANDER_BUILD_PHILOSOPHY_V1 = {
  version: "commander-build-philosophy-v1",
  measurements: {
    commanderSynergy: "Semantic + mechanical alignment between commander and mainboard plan.",
    commanderDependence: "Functional collapse when command-zone mechanical contributions are removed (ablation delta).",
    commanderReciprocity: "Bidirectional MB↔CMD input/output flow (CMD output feeds MB input and vice versa).",
    functionalRedundancy: "Mainboard independently executes core engine/payoff without commander online.",
    feedbackLoopStrength: "Multi-step mechanically supported feedback loops between commander and 99.",
  },
  ablationAnalysis: {
    method: "evaluateDeck(full) vs evaluateDeck(same 99, command-zone mechanical contributions removed)",
    deltaDimensions: [
      "engineCoverage",
      "relianceAxes",
      "resourceGeneration",
      "cardAdvantage",
      "payoffCoverage",
      "archetypeSupport",
      "functionalRoleCoverage",
    ],
    policy: "Deterministic RC8 + IPV2.1 recomputation — no popularity features.",
  },
  constructionClasses: {
    DEPENDENT_SYNERGY: "High commander integration; deck materially collapses without commander mechanics.",
    NONDEPENDENT_SYNERGY: "Commander improves plan but 99 contains engines/payoffs to execute independently.",
    HARMONY: "Bidirectional reinforcement + feedback loops while retaining functional redundancy.",
  },
  userSelection: {
    buildPhilosophy: ["AUTO", "COMMANDER_CENTRIC", "RESILIENT", "HARMONY"] as const,
    overlayIntegration: "Dimension on DeckBuildRouteOverlay — not a separate graph.",
  },
  rule: "Do NOT classify from commander/mainboard semantic similarity alone; preserve raw measurements separately from user-facing label.",
} as const;

/** DeckBuildRouteOverlay — highlighted subgraph over canonical Semantic 3D Map. */
export const DECK_BUILD_ROUTE_OVERLAY_SPEC_V1 = {
  semanticMap: SEMANTIC_3D_MAP_CONTRACT_V1,
  overlay: DECK_BUILD_ROUTE_OVERLAY_V1,
  userInput: DECK_SYNTHESIS_USER_INPUT_CONTRACT_V1,
  separateGraphRenderer: "DO NOT BUILD — integrate with existing 3D semantic map",
} as const;

/** Side-by-side deck comparison across generated builds. */
export const COMMANDER_BUILD_COMPARISON_V1 = {
  version: "commander-build-comparison-v1",
  format: "matrix — builds as columns, dimensions/sub-scores as rows",
  exampleRows: [
    "commanderIntegration",
    "planIdentity",
    "structuralCoherence",
    "resourceEngine",
    "interactionBreadth",
    "bracketFit",
    "archetypeFit",
    "graveyardReliance",
    "artifactReliance",
    "tokenReliance",
  ],
  excludedUntilCalibrated: ["qualityWithinBracket composite"],
  diffExplanation: {
    trigger: "WHY ARE THESE DECKS DIFFERENT?",
    output: "ArchetypeSignature delta + semantic dimensions with largest pairwise deltas + top contributing cards per build",
  },
  dataSource: "evaluateDeck() descriptive layer per build; evaluative when authorized",
} as const;

/** Public synthesis API — specification only. */
export const COMMANDER_DECK_SYNTHESIS_API_V1 = {
  version: "commander-deck-synthesis-api-v1",
  functions: {
    discoverArchetypes: {
      signature: "discoverArchetypes(input: DiscoverArchetypesInput): ArchetypeDiscoveryReport",
      stages: ["COMMANDER_SUPPORT", "CATALOG_FEASIBILITY"],
      status: "QA_COMPLETE — Phase 5.1",
    },
    generateCandidateDeck: {
      signature: "generateCandidateDeck(input: GenerateCandidateDeckInput): CandidateDeck",
      requires: "ARCHETYPE_CANDIDATE_POOL_V1",
      status: "WAIT",
    },
    optimizeDeck: {
      signature: "optimizeDeck(input: OptimizeDeckInput): OptimizedDeck",
      consumes: ["evaluateDeck()", "evaluateSwap()", "validateCandidateForOptimization()"],
      objective: "PARETO_OPTIMIZATION_V1",
      status: "WAIT",
    },
    generateDiverseBuilds: {
      signature: "generateDiverseBuilds(input: GenerateDiverseBuildsInput): DiverseBuildSet",
      applies: ["ARCHETYPE_SIGNATURE_V1 hard diversity", "COMMANDER_BUILD_DIVERSITY_METRIC_V1"],
      status: "WAIT",
    },
    explainBuildRouteOverlay: {
      signature: "explainBuildRouteOverlay(input: ExplainBuildRouteOverlayInput): DeckBuildRouteOverlay",
      status: "WAIT — overlay integration on Semantic 3D Map",
    },
  },
} as const;

export const COMMANDER_DECK_SYNTHESIS_V1_AUTHORIZATION = {
  specification: "ACCEPTED_WITH_ADDITIONS",
  implementation: "WAIT",
  archetypeDiscoveryPrototype: "QA_COMPLETE — Phase 5.1",
  phase5QaArtifact: "data/milestones/deck-synthesis/archetype-discovery-v1-phase5.1-qa.json",
  humanReviewArtifact: "data/milestones/deck-synthesis/archetype-discovery-human-review-v1.1.json",
  semantic3dMap: "CANONICAL_CARD_GRAPH",
  deckBuildRouteOverlay: "AUTHORIZED — integrate with existing map; DO NOT build separate renderer",
  phase6CandidatePool: "WAIT — semantic-only retrieval FROZEN",
  candidateRetrievalMode: "SEMANTIC_ONLY (default, FROZEN)",
  packageConstruction: "WAIT",
  optimizer: "WAIT",
  graphRenderer: "DO NOT BUILD — overlay integration REQUIRED",
  qualityWithinBracketUserFacing: "WAIT — UNCALIBRATED / NOT USER-FACING",
  deckEvaluationEngineDependency: "DEE v1 foundation QA_COMPLETE",
  foundationQaArtifact: "data/milestones/deck-evaluation/deck-evaluation-engine-v1-foundation-qa.json",
  rc8Changes: "PROHIBITED",
  prospectiveHoldout: "SEALED",
  matchupResearch: "PAUSED",
  llmAsNumericOptimizer: "PROHIBITED",
} as const;

export const COMMANDER_DECK_SYNTHESIS_V1_SPEC = {
  version: COMMANDER_DECK_SYNTHESIS_V1_SPEC_VERSION,
  status: "ACCEPTED_WITH_ADDITIONS",
  purpose:
    "Discover commander-supported archetypes, generate multiple diverse optimized builds within bracket constraints, and produce explainable synergy graphs.",
  layerStack: COMMANDER_DECK_SYNTHESIS_LAYER_STACK,
  moduleBoundary: COMMANDER_DECK_SYNTHESIS_MODULE_BOUNDARY,
  developmentPhases: COMMANDER_DECK_SYNTHESIS_DEVELOPMENT_PHASES_V1,
  userWorkflow: COMMANDER_DECK_SYNTHESIS_USER_WORKFLOW_V1,
  archetypeSignature: ARCHETYPE_SIGNATURE_V1,
  archetypeDiscovery: COMMANDER_ARCHETYPE_DISCOVERY_V1,
  candidatePool: ARCHETYPE_CANDIDATE_POOL_V1,
  roleBudgetModel: ROLE_BUDGET_MODEL_V1,
  cardPackage: CARD_PACKAGE_V1,
  deckQualityDecomposition: DECK_QUALITY_DECOMPOSITION_V1,
  paretoOptimization: PARETO_OPTIMIZATION_V1,
  multiSolutionGeneration: COMMANDER_MULTI_SOLUTION_GENERATION_V1,
  diversityMetric: COMMANDER_BUILD_DIVERSITY_METRIC_V1,
  optimizationProvenance: OPTIMIZATION_PROVENANCE_V1,
  bracketPolicy: COMMANDER_BRACKET_POLICY_SNAPSHOT_V1,
  wholeDeckOptimizer: COMMANDER_WHOLE_DECK_OPTIMIZER_V1,
  cardSelectionProvenance: COMMANDER_CARD_SELECTION_PROVENANCE_V1,
  buildRouteOverlay: DECK_BUILD_ROUTE_OVERLAY_SPEC_V1,
  buildPhilosophy: COMMANDER_BUILD_PHILOSOPHY_V1,
  buildComparison: COMMANDER_BUILD_COMPARISON_V1,
  semanticDeckbuildingCopilot: SEMANTIC_DECKBUILDING_COPILOT_BOUNDARY,
  api: COMMANDER_DECK_SYNTHESIS_API_V1,
  authorization: COMMANDER_DECK_SYNTHESIS_V1_AUTHORIZATION,
  frozenDependencies: {
    goldenCatalog: "catalogOracleCards + paper eligibility",
    rc8: "FROZEN — catalog-shadow-parse-rc8-firestore-v2",
    ipv2_1: "ACCEPTED_FROZEN",
    deckEvaluationEngine: "commander-deck-evaluation-engine-v1-spec — foundation QA_COMPLETE",
    strategyTaxonomy: "strategy-taxonomy-v1 — label mapping only",
    gameChangerSnapshot: "commander-game-changers-snapshot-2026-08-11-v1",
  },
  v1ScopeExclusions: [
    "Optional user constraints (budget, inventory, must-include/exclude) — deferred",
    "Exact diversity penalty weights / MIN_SEMANTIC_DIVERSITY_THRESHOLD numeric freeze",
    "Pareto goal-profile tie-break weights",
    "Matchup/opponent modeling",
    "Prospective holdout calibration",
    "LLM numeric optimization",
    "qualityWithinBracket user-facing display",
    "Interactive graph deck-building UI",
  ],
  implementationAnchors: {
    deckEvaluationEngine: "src/lib/deck-evaluation/",
    bracketPolicyEngine: "src/lib/bracket-policy/",
    ipv2_1DeckProfile: "src/lib/commander-strategy/interaction-profile-v2.1/deck-interaction-profile-v2.1.ts",
    deckSemanticProfile: "src/lib/commander-strategy/deck-semantic-profile-v1.ts",
    semanticSynergyEdges: "src/lib/commander-strategy/semantic-synergy-edges-v1.ts",
    strategyTaxonomy: "src/lib/commander-strategy/taxonomy/strategy-taxonomy-v1.json",
    gameChangerSnapshot: "src/lib/commander-strategy/model-c/game-changer-snapshot-v1.ts",
  },
} as const;
