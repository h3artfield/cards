/**
 * Deck Evaluation Engine v1 — specification (ACCEPTED).
 *
 * Evaluates decks — does NOT build or optimize them.
 * Autonomous deck optimization: EXCLUDED — lives in Commander Deck Synthesis v1.
 *
 * Implementation authorization:
 *   - descriptive evaluateDeck + contribution trace: QA_COMPLETE
 *   - deterministic evaluateSwap foundation: QA_COMPLETE
 *   - heuristic evaluative sub-scores: WAIT
 */
export const DECK_EVALUATION_ENGINE_V1_SPEC_VERSION = "deck-evaluation-engine-v1-spec";

/** Frozen upstream dependencies — do not mutate. */
export const DECK_EVALUATION_ENGINE_V1_FROZEN_DEPENDENCIES = {
  goldenCatalog: "catalogOracleCards + paper-eligibility resolution",
  rc8Semantics: {
    parserVersion: "oracle-action-v1.44-rc8-ownership-grant-family",
    shadowIndex: "catalog-shadow-parse-rc8-firestore-v2",
    policy: "RC8 FROZEN — no parser changes",
  },
  modelCFeatures: {
    artifact: "commander-model-c-features-v3",
    variant: "C2",
    role: "Structural + RC8 aggregate reference — not outcome score",
  },
  interactionProfileV2_1: {
    spec: "interaction-profile-v2.1-spec-v1",
    status: "ACCEPTED_FROZEN",
    role: "Primary mechanical profile ontology",
  },
  commanderZoneProfile: {
    source: "IPV2.1 commandZone block + RC8 commander card semantics",
    policy: "Separate from mainboard — never merged silently",
  },
  researchModels: {
    modelC2: "successful / frozen",
    p0: "positive development signal — optional evaluative calibration only",
    p1: "negligible — not used in v1",
    d2: "development negative — not used",
    prospectiveHoldout: "SEALED",
    matchupResearch: "PAUSED",
  },
} as const;

export type DeckEvaluationLayer = "DESCRIPTIVE" | "EVALUATIVE" | "RECOMMENDATION";

/**
 * Three layers MUST remain separable in API responses and UI.
 * No layer may collapse into an opaque composite without trace.
 */
export const DECK_EVALUATION_LAYER_CONTRACT = {
  DESCRIPTIVE: {
    question: "What does this deck mechanically contain and do?",
    inputs: ["golden catalog", "RC8 per-card semantics", "IPV2.1 aggregation"],
    outputs: ["mechanical profile", "dimension values", "contributing cards", "oracle evidence"],
    forbidden: ["tournament outcome labels", "pod win probability", "LLM subjective scoring"],
  },
  EVALUATIVE: {
    question: "Where does this deck appear strong or weak for a stated goal?",
    inputs: ["descriptive profile", "heuristic rubrics", "optional P0-calibrated priors (labeled)"],
    outputs: ["sub-scores", "strength/weakness summaries", "trace to descriptive dimensions"],
    forbidden: [
      "treating learned outcome coefficients as universal card goodness",
      "single opaque 0–100 without sub-score decomposition",
      "matchup/opponent context",
    ],
  },
  RECOMMENDATION: {
    question: "What card changes would improve a stated goal?",
    inputs: ["evaluateDeck baseline", "evaluateSwap delta", "user goal / constraint"],
    outputs: [
      "before/after profiles",
      "changed dimensions",
      "cohesion delta",
      "strengths gained / weaknesses introduced",
      "explanation chain",
    ],
    forbidden: [
      "autonomous deck rewriting (see Commander Deck Synthesis v1)",
      "hidden LLM score",
      "holdout-calibrated swap ranking",
    ],
  },
} as const;

/** Related subsystem — synthesis builds decks; evaluation does not. */
export const DECK_EVALUATION_SYNTHESIS_BOUNDARY = {
  deckEvaluationEngine: "evaluateDeck(), evaluateSwap() — analysis only",
  commanderDeckSynthesis: "discoverArchetypes(), optimizeDeck(), generateDiverseBuilds() — builds decks",
  spec: "src/lib/deck-synthesis/commander-deck-synthesis-v1-spec.ts",
} as const;

/** v1 mechanical profile — maps user-facing dimensions to frozen sources. */
export const DECK_MECHANICAL_PROFILE_ONTOLOGY_V1 = {
  version: "deck-mechanical-profile-v1",
  zones: ["mainboard", "commandZone"] as const,
  vectorKinds: ["exposure", "reliance", "disruption"] as const,

  /** Interaction / answer coverage (what the deck can do to the board/game). */
  interactionDimensions: [
    {
      id: "mana_acceleration",
      label: "Mana acceleration",
      ipv2Families: ["mana_acceleration"],
      vectors: ["reliance"],
      rc8Roles: ["mana_acceleration", "add_mana"],
      rc8Densities: ["rc8_density_manaGenerationDensity"],
    },
    {
      id: "card_advantage",
      label: "Card advantage",
      ipv2Families: ["hand_resources"],
      vectors: ["reliance", "disruption"],
      rc8Roles: ["card_draw", "card_advantage"],
      rc8Densities: ["rc8_density_drawDensity"],
    },
    {
      id: "tutoring_search",
      label: "Tutoring / search",
      ipv2Families: ["library_search"],
      vectors: ["reliance", "disruption"],
      zones: ["mainboard"],
      rc8Roles: ["tutor"],
      rc8Densities: ["rc8_density_tutorDensity"],
    },
    {
      id: "creature_interaction",
      label: "Creature interaction",
      ipv2Families: ["creatures"],
      vectors: ["disruption"],
      rc8ActionFamilies: ["destroy_creature", "exile_creature", "damage_creature"],
    },
    {
      id: "artifact_interaction",
      label: "Artifact interaction",
      ipv2Families: ["artifacts"],
      vectors: ["disruption"],
    },
    {
      id: "enchantment_interaction",
      label: "Enchantment interaction",
      ipv2Families: ["enchantments"],
      vectors: ["disruption"],
    },
    {
      id: "graveyard_interaction",
      label: "Graveyard interaction",
      ipv2Families: ["graveyard"],
      vectors: ["disruption", "reliance"],
      note: "Disruption = gy hate; reliance = gy as resource",
    },
    {
      id: "stack_interaction",
      label: "Stack interaction",
      ipv2Families: ["spells_stack"],
      vectors: ["disruption", "reliance"],
    },
    {
      id: "board_reset",
      label: "Board reset",
      ipv2Families: ["creatures", "tokens", "artifacts", "enchantments"],
      vectors: ["disruption"],
      rc8Tags: ["mass_removal", "board_wipe"],
      aggregationNote: "Mass-removal density from RC8 + IPV2 disruption on board-wide axes",
    },
    {
      id: "recursion",
      label: "Recursion",
      ipv2Families: ["recursion", "graveyard"],
      vectors: ["reliance"],
      rc8Roles: ["recursion", "reanimation"],
      rc8Densities: ["rc8_density_recursionDensity"],
    },
  ] as const,

  /** Plan reliance — how much the deck's engine depends on each zone/mechanic. */
  relianceDimensions: [
    { id: "creature_reliance", ipv2Key: "{zone}_creatures_reliance" },
    { id: "artifact_reliance", ipv2Key: "{zone}_artifacts_reliance" },
    { id: "graveyard_reliance", ipv2Key: "{zone}_graveyard_reliance" },
    { id: "token_reliance", ipv2Key: "{zone}_tokens_reliance" },
    { id: "tutor_reliance", ipv2Key: "mainboard_library_search_reliance", zones: ["mainboard"] },
    { id: "spell_stack_reliance", ipv2Key: "{zone}_spells_stack_reliance" },
    { id: "activated_ability_reliance", ipv2Key: "{zone}_activated_abilities_reliance" },
  ] as const,

  /** Zone-split profiles — always reported separately. */
  zoneProfiles: {
    mainboardRelianceProfile: "All ipv2_1_mb_* reliance + exposure + disruption keys",
    commandZoneRelianceProfile: "All ipv2_1_cmd_* reliance + exposure + disruption keys",
    commanderCohesion: "Synergy edges + shared axis activation between CMD and MB (from deck-semantic-profile-v1 pattern)",
  },

  /** Model C structural supplements (descriptive only). */
  structuralSupplements: {
    basicStructure: "land count, MV curve, color identity, type fractions",
    gameChanger: "official GC presence — labeled as format-context, not universal merit",
    rc8SemanticAggregate: "27 action densities, role densities, attack/vuln/dep vectors (mainboard)",
    sparseCardIdentity: "NOT exposed in consumer v1 — internal identity only",
  },
} as const;

/**
 * Scoring ontology — sub-scores BEFORE any composite.
 * v1 does NOT ship a single "Deck Score / 100" without explicit composite semantics.
 */
export const DECK_EVALUATION_SCORING_ONTOLOGY_V1 = {
  version: "deck-evaluation-scoring-v1",
  compositePolicy: {
    v1Default: "SUB_SCORES_ONLY",
    optionalComposite: {
      enabled: false,
      reason:
        "Deck Score / 100 conflates structural quality, competitive strength, and tournament performance. v1 requires explicit sub-score semantics first.",
    },
  },

  subScores: [
    {
      id: "structural_coherence",
      label: "Structural coherence",
      intendedMeaning:
        "Internal consistency of mana base, curve, color access, and type composition relative to commander identity.",
      layer: "EVALUATIVE",
      primaryInputs: ["basic_structure", "commander color identity", "MV histogram"],
      notMeaning: "Not tournament win rate; not 'power level' alone.",
      scale: "0–100 rubric from deterministic thresholds",
    },
    {
      id: "resource_engine",
      label: "Resource engine",
      intendedMeaning:
        "Strength and redundancy of mana, card advantage, and tutoring packages as mechanically measured.",
      layer: "EVALUATIVE",
      primaryInputs: [
        "mana_acceleration reliance",
        "card_advantage reliance",
        "tutoring_search reliance",
        "RC8 draw/tutor/ramp densities",
      ],
      notMeaning: "High score ≠ always better — storm decks and battlecruiser decks differ by design.",
    },
    {
      id: "interaction_toolbox",
      label: "Interaction toolbox",
      intendedMeaning:
        "Breadth and density of answers/interaction across creature, artifact, enchantment, stack, graveyard, and board-reset axes.",
      layer: "EVALUATIVE",
      primaryInputs: ["interactionDimensions disruption vectors", "RC8 answer densities"],
      notMeaning: "Not 'more interaction is always better' — depends on stated goal (see goalProfiles).",
    },
    {
      id: "commander_integration",
      label: "Commander integration",
      intendedMeaning:
        "How strongly the 99 supports the command zone mechanically (shared reliance axes, synergy edges, cohesion).",
      layer: "EVALUATIVE",
      primaryInputs: ["commandZoneRelianceProfile", "mainboardRelianceProfile overlap", "commanderCohesion"],
      notMeaning: "Distinct from commander power — measures deck–commander fit.",
    },
    {
      id: "plan_identity",
      label: "Plan identity clarity",
      intendedMeaning:
        "Whether reliance axes form a recognizable primary plan vs unfocused mid-range spread.",
      layer: "EVALUATIVE",
      primaryInputs: ["reliance dimension entropy", "dominant axis concentration", "strategy taxonomy assignment (descriptive input)"],
      notMeaning: "Not archetype judgment — clarity of mechanical center of mass.",
    },
    {
      id: "resilience_recovery",
      label: "Resilience & recovery",
      intendedMeaning:
        "Graveyard/recursion reliance, redundancy signals, and partial protection/recursion coverage.",
      layer: "EVALUATIVE",
      primaryInputs: ["recursion reliance", "graveyard reliance", "RC8 recursion density"],
      v1Gap: "IPV2.1 resilience vector omitted — v1 uses RC8 roles + recursion/graveyard reliance proxy.",
    },
  ] as const,

  /** Optional future composite — only if product explicitly chooses semantics. */
  futureCompositeCandidates: [
    {
      id: "construction_quality",
      definition: "Weighted blend of structural_coherence + plan_identity + commander_integration",
      excludes: ["outcome-calibrated signals", "interaction_toolbox (goal-dependent)"],
    },
    {
      id: "competitive_readiness_prior",
      definition: "May later incorporate P0-calibrated deck representation — MUST be labeled outcome-calibrated",
      requires: "Explicit user opt-in + holdout-validated calibration before production use",
    },
  ],

  goalProfiles: {
    note: "Evaluative sub-scores are interpreted relative to a stated goal — same deck, different goals.",
    examples: ["casual_battlecruiser", "focused_synergy", "high_interaction", "combo_resilience"],
    v1Minimum: "Default goal = balanced_commander — documented weight overrides per sub-score",
  },

  outcomeCalibrationBoundary: {
    p0Role:
      "P0 IPV2.1 self-profile coefficients MAY inform an optional 'outcome-calibrated prior' sub-layer — never merged into descriptive values.",
    rule: "Positive outcome coefficient ≠ universally good card/mechanic.",
    v1Status: "Descriptive engine ships without outcome calibration; evaluative rubrics are heuristic-only in v1.",
  },
} as const;

/** Explainability invariant — every displayed value must decompose. */
export const DECK_EVALUATION_EXPLAINABILITY_V1 = {
  version: "deck-evaluation-explainability-v1",
  invariant: "score → feature dimensions → contributing cards → oracle semantic evidence",
  traceLevels: [
    {
      level: 0,
      name: "displayed_score_or_value",
      example: "interaction_toolbox = 72",
    },
    {
      level: 1,
      name: "dimension_contributions",
      example: "creature_interaction disruption = 0.041 (+18 pts), stack_interaction = 0.029 (+11 pts)",
    },
    {
      level: 2,
      name: "contributing_cards",
      example: "Toxic Deluge → board_reset disruption bump (rule: mass_removal)",
    },
    {
      level: 3,
      name: "oracle_semantic_evidence",
      example: "RC8 action destroy_all_creatures, provenance span in oracle text",
    },
  ],
  evidenceSources: {
    ipv2_1: "ScoredAxisValue.evidence[] — { oracleId, rule, note? }",
    rc8: "SemanticAction.provenance + actionType + arguments",
    rc8Roles: "derived role assignment with primitive mapping",
    synergy: "semantic-synergy-edges-v1 producer/payoff evidence",
    strategy: "deck-strategy-classifier-v1 evidence strings (supplementary, not primary)",
  },
  forbidden: [
    "LLM-generated numeric scores without semantic trace",
    "opaque embedding similarity as user-facing score",
    "outcome model coefficient shown without 'calibrated prior' label",
  ],
  coverageReporting: {
    required: true,
    fields: ["cardsParsed", "cardsMissingSemantics", "needsReviewActions", "structuralInvalid"],
    policy: "Lower confidence badge when semantic coverage incomplete — never hide gaps",
  },
} as const;

/** Public analysis API — specification only. */
export const DECK_EVALUATION_API_V1 = {
  version: "deck-evaluation-api-v1",
  functions: {
    evaluateDeck: {
      signature: "evaluateDeck(input: EvaluateDeckInput): DeckEvaluationReport",
      input: {
        deck: "NormalizedDeckInstance or { commanderOracleIds, mainboard: { oracleId, qty }[] }",
        catalog: "DeckResolutionCatalog + golden catalog index",
        shadowIndex: "ShadowSemanticIndex (RC8)",
        options: {
          goalProfile: "optional — default balanced_commander",
          includeEvaluative: "boolean — default true",
          includeRecommendation: "boolean — default false (no swap in base call)",
          paperEligibleOnly: "boolean — default true",
        },
      },
      output: {
        meta: "engine version, dependency pins, coverage census, timestamp",
        descriptive: "DeckMechanicalProfile + cardContributions + evidence index",
        evaluative: "SubScoreReport[] + strengths + weaknesses + goalProfile used",
        recommendation: "null in base evaluateDeck",
      },
    },
    evaluateSwap: {
      signature: "evaluateSwap(input: EvaluateSwapInput): SwapEvaluationReport",
      input: {
        deck: "baseline deck",
        removeCard: "oracleId",
        addCard: "oracleId",
        goalProfile: "optional",
        sameOptionsAsEvaluateDeck: true,
      },
      output: {
        before: "descriptive + evaluative snapshot",
        after: "descriptive + evaluative snapshot",
        delta: {
          mechanicalProfile: "per-dimension before/after/delta",
          subScores: "per sub-score delta with trace",
          commanderCohesion: "synergy edge changes, shared-axis overlap delta",
          structuralChanges: "MV curve, color, land count, GC flag changes",
        },
        strengthsGained: "dimensions/sub-scores improved for stated goal",
        weaknessesIntroduced: "dimensions/sub-scores worsened for stated goal",
        explanation: "ordered trace[] following explainability invariant",
      },
      deterministicRequirement:
        "Profile delta computable from RC8 + IPV2.1 recomputation — no tournament data required.",
    },
  },
} as const;

/** Card contribution model — every dimension lists source cards. */
export const DECK_CARD_CONTRIBUTION_MODEL_V1 = {
  version: "deck-card-contribution-v1",
  aggregationMethods: {
    exposure: "weighted_mean_by_card_count",
    reliance: "contributor_fraction_threshold_0.2_per_IPV2.1_spec",
    disruption: "weighted_mean_of_card_disruption_scores",
    rc8Density: "normalized_action_or_role_count_per_mainboard_card",
  },
  contributionRecord: {
    fields: [
      "oracleId",
      "cardName",
      "zone",
      "quantity",
      "dimensionId",
      "vectorKind",
      "contributionValue",
      "contributionShare",
      "rulesTriggered",
      "evidenceRefs",
    ],
  },
  rollupPolicy:
    "Deck dimension value = aggregate(card contributions); UI may show top-N contributors per dimension.",
} as const;

/** Commander relationship / build philosophy — evaluation + synthesis shared model. */
export const DECK_COMMANDER_BUILD_PHILOSOPHY_V1 = {
  version: "deck-commander-build-philosophy-v1",
  measurements: {
    commanderSynergy: { range: "0-1", source: "IPV2.1 cmd↔MB alignment + RC8 evidence" },
    commanderDependence: { range: "0-1", source: "Commander ablation delta on engine/payoff coverage" },
    commanderReciprocity: { range: "0-1", source: "Detected MB→CMD input + CMD→MB input edges" },
    functionalRedundancy: { range: "0-1", source: "Mainboard standalone engine/payoff coverage under ablation" },
    feedbackLoopStrength: { range: "0-1", source: "Multi-step CMD↔MB feedback loop detection" },
  },
  ablationSpec: {
    fullDeck: "evaluateDeck(deck) — descriptive layer",
    ablatedDeck: "evaluateDeck(deck with command-zone mechanical contributions zeroed)",
    requiredDeltas: [
      "engineCoverage",
      "relianceAxes",
      "resourceGeneration",
      "cardAdvantage",
      "payoffCoverage",
      "archetypeSupport",
      "functionalRoleCoverage",
    ],
  },
  constructionClasses: ["DEPENDENT_SYNERGY", "NONDEPENDENT_SYNERGY", "HARMONY"] as const,
  synthesisInput: {
    buildPhilosophy: ["AUTO", "COMMANDER_CENTRIC", "RESILIENT", "HARMONY"] as const,
  },
  status: "SPEC_ACCEPTED — implementation WAIT",
} as const;

export const DECK_EVALUATION_ENGINE_V1_AUTHORIZATION = {
  specification: "ACCEPTED",
  descriptiveImplementation: "QA_COMPLETE",
  contributionTraceImplementation: "QA_COMPLETE",
  evaluateSwapDeterministicFoundation: "QA_COMPLETE",
  foundationQaArtifact: "data/milestones/deck-evaluation/deck-evaluation-engine-v1-foundation-qa.json",
  heuristicScoreImplementation: "WAIT",
  qualityWithinBracketUserFacing: "WAIT — UNCALIBRATED / NOT USER-FACING until heuristic scoring frozen",
  rc8Changes: "PROHIBITED",
  prospectiveHoldout: "SEALED",
  matchupResearch: "PAUSED",
  d2Redesign: "NOT_AUTHORIZED",
  p0HoldoutValidation: "NOT_AUTHORIZED_UNLESS_P0_BECOMES_PRODUCTION_TARGET",
  autonomousDeckOptimization: "EXCLUDED — Commander Deck Synthesis v1",
} as const;

export const DECK_EVALUATION_ENGINE_V1_SPEC = {
  version: DECK_EVALUATION_ENGINE_V1_SPEC_VERSION,
  status: "ACCEPTED",
  purpose:
    "Mechanically grounded, explainable individual Commander deck evaluation — NOT winner prediction.",
  layerContract: DECK_EVALUATION_LAYER_CONTRACT,
  synthesisBoundary: DECK_EVALUATION_SYNTHESIS_BOUNDARY,
  frozenDependencies: DECK_EVALUATION_ENGINE_V1_FROZEN_DEPENDENCIES,
  mechanicalProfileOntology: DECK_MECHANICAL_PROFILE_ONTOLOGY_V1,
  scoringOntology: DECK_EVALUATION_SCORING_ONTOLOGY_V1,
  explainability: DECK_EVALUATION_EXPLAINABILITY_V1,
  api: DECK_EVALUATION_API_V1,
  cardContributionModel: DECK_CARD_CONTRIBUTION_MODEL_V1,
  commanderBuildPhilosophy: DECK_COMMANDER_BUILD_PHILOSOPHY_V1,
  authorization: DECK_EVALUATION_ENGINE_V1_AUTHORIZATION,
  v1ScopeExclusions: [
    "Pod/opponent/matchup modeling",
    "Prospective holdout calibration",
    "LLM subjective scoring",
    "Single opaque Deck Score / 100 without sub-score semantics",
    "Autonomous deck optimization (Commander Deck Synthesis v1)",
    "Sparse card-id identity as consumer feature",
  ],
  implementationAnchors: {
    buildDeckInteractionProfileV2_1: "src/lib/commander-strategy/interaction-profile-v2.1/deck-interaction-profile-v2.1.ts",
    buildDeckFeatureBundle: "src/lib/commander-strategy/model-c/deck-features-v1.ts",
    buildDeckSemanticProfile: "src/lib/commander-strategy/deck-semantic-profile-v1.ts",
    shadowSemanticIndex: "src/lib/commander-strategy/shadow-semantic-index.ts",
    competitiveAssessmentHooks: "src/lib/commander-strategy/competitive-assessment-hooks-v1.ts",
  },
} as const;
