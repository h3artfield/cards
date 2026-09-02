/**
 * Frozen Model C feature specification v3 — BASIC nestedness + official Game Changer block.
 */
export const MODEL_C_FEATURE_SPEC_VERSION = "commander-model-c-feature-spec-v3";

export const MODEL_C_FEATURE_SPEC = {
  version: MODEL_C_FEATURE_SPEC_VERSION,
  supersedes: "commander-model-c-feature-spec-v2",
  status: "FROZEN_PENDING_TRAINING_AUTHORIZATION",
  datasetHash: "706a5fc9be961d812836a875388af92c513807ec5f4892ffbe4964f4205ad75c",
  evaluationMetricsVersion: "commander-model-metrics-v1",
  frozenBaselines: {
    U: "Uniform seat probability within pod",
    F: "TRAIN-only shrunk historical CommanderConfiguration win-strength (mandatory baseline)",
    A: "commander-model-a-v1 (frozen predictions; not retrained)",
    B: "commander-model-b-v1 (frozen commander + player utilities; deck blocks added on top)",
  },
  experimentalLadder: {
    nestedDesign:
      "Every C-variant includes frozen B utilities. BASIC STRUCTURE is frozen identically across C0/G/C1/ID/C2 (byte-for-byte column subset). G adds official Game Changer features. RC8 semantics and card identity nest incrementally.",
    variants: {
      B: {
        label: "Frozen Model B",
        utility: "commanderUtility + playerUtility",
        deckFeatures: "none",
      },
      C0: {
        label: "B + BASIC STRUCTURE",
        utility: "commanderUtility + playerUtility + basicStructureUtility",
        deckFeatures: "BASIC_STRUCTURE only",
      },
      G: {
        label: "C0 + OFFICIAL GAME CHANGER FEATURES",
        utility: "commanderUtility + playerUtility + basicStructureUtility + gameChangerUtility",
        deckFeatures: "BASIC_STRUCTURE + GAME_CHANGER",
        auxiliaryBaseline: true,
      },
      C1: {
        label: "G + RC8 SEMANTICS",
        utility:
          "commanderUtility + playerUtility + basicStructureUtility + gameChangerUtility + semanticUtility",
        deckFeatures: "BASIC_STRUCTURE + GAME_CHANGER + RC8_SEMANTIC_AGGREGATE",
        headlineExperiment: true,
      },
      ID: {
        label: "G + SPARSE CARD IDENTITY (auxiliary)",
        utility:
          "commanderUtility + playerUtility + basicStructureUtility + gameChangerUtility + cardIdentityUtility",
        deckFeatures: "BASIC_STRUCTURE + GAME_CHANGER + SPARSE_CARD_ID_BAG",
        auxiliaryBaseline: true,
      },
      C2: {
        label: "C1 + SPARSE CARD IDENTITY",
        utility:
          "commanderUtility + playerUtility + basicStructureUtility + gameChangerUtility + semanticUtility + cardIdentityUtility",
        deckFeatures: "BASIC_STRUCTURE + GAME_CHANGER + RC8_SEMANTIC_AGGREGATE + SPARSE_CARD_ID_BAG",
      },
    },
    ablationQuestions: {
      "C0 vs B": "Does merely looking at the actual deck's ordinary construction statistics help?",
      "G vs C0": "How much information is contained in the official Game Changer signal?",
      "C1 vs G": "Do RC8 semantics add information BEYOND Game Changers? (PRIMARY SEMANTIC INCREMENT)",
      "ID vs G": "Do exact card identities add information beyond structure + Game Changers?",
      "C1 vs ID": "Is semantic understanding competitive with memorizing exact cards?",
      "C2 vs C1": "Does exact card identity still help after the model already knows what the deck mechanically does?",
      "C2 vs ID": "Does semantic understanding still add information after exact card identities are known?",
    },
    basicNestednessInvariant:
      "BASIC(C0) = BASIC(G) = BASIC(C1) = BASIC(ID) = BASIC(C2) — same feature names, order, and values per deck.",
  },
  purpose:
    "Test whether actual decklist information—and specifically RC8-derived semantic understanding of what cards do—predicts pod outcomes beyond commander and player history, especially on unseen deckHashes.",
  formulation: {
    withinPod: "P(seat wins) = exp(U_seat) / Σ exp(U_j) over pod seats",
    frozenB:
      "Commander and player coefficient maps remain frozen from Model B. C-variants add linear deck feature blocks with TRAIN-only standardization.",
    deckHashUsage: "Evaluation cohorts only — never a predictive feature",
    modelDBoundary:
      "Model C describes what MY deck contains/does. Model D (later) models cross-deck opponent interactions in the pod. No opponent-context features in Model C.",
  },
  basicStructure: {
    alias: "BASIC_STRUCTURE",
    source: "Golden catalog card metadata + resolved mainboard quantities (no RC8 parser, no tournament outcomes)",
    commanderZoneExcluded: true,
    features: [
      "landCountFraction",
      "nonLandCountFraction",
      "averageManaValue",
      "medianManaValue",
      "mvHistogramBuckets",
      "colorIdentityWUBRGFractions",
      "colorIdentityColorlessFraction",
      "colorIdentityMulticolorCardFraction",
      "creatureFraction",
      "instantFraction",
      "sorceryFraction",
      "artifactFraction",
      "enchantmentFraction",
      "planeswalkerFraction",
      "battleFraction",
      "basicLandFraction",
      "nonBasicLandFraction",
    ],
    normalization:
      "Use fractions and normalized densities only. Do not include raw deck length as a standalone predictive feature.",
    usedIn: ["C0", "G", "C1", "ID", "C2"],
  },
  gameChangerFeatures: {
    alias: "GAME_CHANGER",
    source: "Official Wizards Commander Game Changers list via frozen Scryfall is:gamechanger snapshot at observation cutoff",
    snapshotVersion: "commander-game-changers-snapshot-2026-08-11-v1",
    observationCutoff: "2026-08-11",
    commanderZoneIncludedInTotal: true,
    noInferredBracketLabel: true,
    features: [
      "gc_countTotal",
      "gc_countMainboard",
      "gc_countCommandZone",
      "gc_hasGameChanger",
      "gc_fraction",
      "gc_band_0",
      "gc_band_1",
      "gc_band_2",
      "gc_band_3",
      "gc_band_4plus",
      "gc_exceedsBracket3GameChangerLimit",
    ],
    usedIn: ["G", "C1", "ID", "C2"],
  },
  rc8SemanticAggregate: {
    alias: "RC8_SEMANTIC_AGGREGATE",
    usedIn: ["C1", "C2"],
    sourcePipeline: [
      "catalog-shadow-parse-rc8-firestore-v2 shadow index (frozen)",
      "buildCardFeatureBundle (feature-vector-v1 + derived-features-v1)",
      "buildCardInteractionProfile (card-interaction-profile-v1)",
      "buildDeckSemanticProfile deckAggregateVector (mainboard only, commander-zone excluded)",
    ],
    includedBlocks: {
      actionDensity: "Aggregated primitive action signals per card",
      zoneProfile: "zonesUsed from interaction profiles",
      abilityProfile: "timingProfile / ability structure",
      attackVector: "answerCapabilities + threatCapabilities keyed dimensions",
      vulnerabilityVector: "dependencies + vulnerabilities keyed dimensions",
      dependencies: "dependency dimensions",
      derivedRoles: "Rule-derived roles from computeDerivedFeatureVector",
    },
    excludedFromC1Features: [
      "strategyAssignment (archetype/theme classifier output — not part of C1 feature vector)",
      "deckInteractionStructure (commander synergy metrics — reserved for reporting only)",
      "commanderVector (commander identity already in B; not duplicated in deck aggregate)",
      "UMAP/XYZ visualization coordinates",
      "Any TopDeck/tournament frequency or win-rate field",
    ],
    densityFeatures: [
      "drawDensity",
      "removalDensity",
      "destroyDensity",
      "exileDensity",
      "counterDensity",
      "tutorDensity",
      "recursionDensity",
      "reanimationDensity",
      "sacrificeDensity",
      "tokenCreationDensity",
      "manaGenerationDensity",
      "millDensity",
      "graveyardInteractionDensity",
      "castFromExileDensity",
      "blinkFlickerDensity",
      "copyEffectDensity",
      "protectionDensity",
      "triggeredActionDensity",
      "activatedActionDensity",
      "replacementEffectDensity",
    ],
    normalization:
      "Per-card fractions and intensity-normalized keyed vectors. TRAIN-only feature standardization before logit. No raw mainboard count as standalone predictor.",
  },
  sparseCardIdentity: {
    alias: "SPARSE_CARD_ID_BAG",
    usedIn: ["ID", "C2"],
    auxiliaryBaseline: "ID",
    formulation:
      "Sparse 0/1 oracleId presence over mainboard excluding commander-zone cards",
    trainOnlyLearning: "Support cutoff + L2 regularization fit on TRAIN; cutoff selected on VALIDATION",
    unseenCards: "OracleIds absent from TRAIN support map → zero contribution (explicit, not imputed from TEST)",
    neverUse: "TEST/VALIDATION outcome statistics for feature selection",
  },
  semanticProvenance: {
    frozen: true,
    noRegeneration: "Do not rebuild RC8 shadow index or semantic profiles with a later parser for this experiment",
    pins: {
      rc8ParserVersion: "oracle-action-v1.44-rc8-ownership-grant-family",
      rc8ParserBlobClosure: "d3af8eca52a6bce6582d7f8a62e8aa2a89b4baefa9f36bff036adc9b2a6ce560",
      semanticIndexVersion: "catalog-shadow-parse-rc8-firestore-v2",
      semanticIndexManifest:
        "web/data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2-manifest.json",
      featureVectorVersion: "semantic-feature-vector-v1",
      derivedRoleVersion: "derived-features-v1 (DERIVED_ROLE_NAMES constant)",
      cardInteractionProfileVersion: "card-interaction-profile-v1",
      deckSemanticProfileVersion: "deck-semantic-profile-v1",
      paperPopulationHash: "2fe9397218077c11dce3aa11b876e74cc91c4b1063e8e1234ded1fc034b11fd1",
      resolutionSupplementBulkContentHash:
        "96afc0456c50280d3e0a0f146f84415f75adbab19067d5621b71f5861d08226f",
    },
  },
  semanticProvenanceCertification: {
    certifiedAt: "2026-08-12",
    conclusion: "APPROVED_FOR_C1 — all C1 semantic features are outcome-independent",
    allowedInputs: [
      "Golden catalog oracle card records (types, colors, MV, layout, etc.)",
      "Frozen RC8 parser semantic actions/abilities per oracleId",
      "Deterministic rules in feature-vector-v1, derived-features-v1, card-interaction-profile-v1",
      "Deck composition (which oracleIds appear in mainboard, excluding commander zone)",
    ],
    forbiddenInputs: [
      "Tournament wins/losses/draws",
      "Pod outcomes or winner labels during feature construction",
      "TopDeck frequencies or popularity",
      "Historical win rates of commanders/cards/players",
      "VALIDATION/TEST/prospective-holdout statistics",
      "Learned embeddings trained on outcome labels",
    ],
    codeAudit: [
      {
        module: "feature-vector-v1.ts / feature-spec-v1.ts",
        derivesFrom: "SemanticAction, SemanticAbility, GoldenCatalogOracleCard metadata",
        outcomeIndependent: true,
      },
      {
        module: "derived-features-v1.ts",
        derivesFrom: "Rule-based role assignment from actions/abilities/card types",
        outcomeIndependent: true,
      },
      {
        module: "card-interaction-profile-v1.ts",
        derivesFrom: "Rule mapping from RC8 actions to attack/vulnerability/answer dimensions",
        outcomeIndependent: true,
        note: "attackVector/vulnerabilityVector are deterministic mechanical labels, not learned from match results",
      },
      {
        module: "deck-semantic-profile-v1.ts",
        derivesFrom: "Aggregation of per-card bundles/profiles over mainboard",
        outcomeIndependent: true,
        excludedFromModelC: ["strategyAssignment", "deckInteractionStructure"],
      },
      {
        module: "deck-strategy-classifier-v1.ts",
        status: "NOT USED in C1 feature vector",
        note: "Explicit comment: MUST NOT use tournament wins, standings, winRate, or TopDeck popularity",
      },
    ],
    postCertificationRule:
      "If any future feature is found to use outcome-derived weights, remove it from C1 and defer to a later model generation.",
  },
  semanticMissingness: {
    policy: {
      parserUnavailable: "≠ semantic zero; count as unavailableSemanticCards",
      needsReview: "≠ semantic zero; count as needsReviewSemanticCards",
      structurallyInvalid: "≠ semantic zero; count as structurallyInvalidSemanticCards",
    },
    perDeckReporting: [
      "resolvedMainboardCardsExcludingCommandZone",
      "cardsRepresentedSemantically",
      "cardsMissingSemantics",
      "semanticCoverageFraction",
      "needsReviewFraction",
      "unavailableFraction",
    ],
    splitCoverageReporting: ["TRAIN", "VALIDATION", "TEST distribution summaries"],
    modelingUse:
      "Missingness counters/fractions may be included as explicit features; do not impute missing semantics as zero capability",
  },
  trainOnlyFitting: [
    "BASIC_STRUCTURE standardization",
    "RC8 semantic block standardization",
    "sparse card-ID support cutoff",
    "L2 penalties for deck blocks",
    "any PCA/SVD if used",
  ],
  validationOnlySelection: [
    "lambdaBasicStructure",
    "lambdaSemantic",
    "lambdaCardIdentity",
    "cardSupportCutoff",
    "variant hyperparameters",
  ],
  testPolicy: "Hyperparameters frozen after VALIDATION selection; TEST scored once",
  evaluationPopulation: {
    allTestPrimaryPods: 17736,
    unseenDeckHashPods: 17687,
    note: "unseen deckHash ≠ unseen cards — report card-level novelty separately",
  },
  mandatoryCohorts: [
    "all TEST primary (17736)",
    "deckHashNeverSeenInTrain (17687)",
    "deckHashSeenInTrain",
    "commanderSeenInTrain / unseen",
    "playerSeenInTrain / unseen",
    "podSize3 / podSize4",
    "cardNovelty: fraction of mainboard oracleIds unseen in TRAIN",
    "cardNovelty: decks with >=1 TRAIN-unseen card",
    "cardNovelty: decks with >=5 TRAIN-unseen cards (if sample size permits)",
  ],
  mandatoryComparisons: {
    primaryMetric: "log loss (pod-level)",
    secondaryMetrics: ["multiclass_seat_brier_v1", "seat_level_ece_v1", "pod_argmax_accuracy (secondary only)"],
    uncertainty: {
      method: "paired_tournament_cluster_bootstrap_percentile_ci",
      seed: 20260811,
      replicates: 1000,
      clusterUnit: "tournamentId",
      acceptedClusterCount: 934,
    },
    comparisons: [
      { comparison: "C0 vs B", cohorts: ["all", "deckHashNeverSeenInTrain"], priority: "required" },
      { comparison: "C1 vs C0", cohorts: ["all", "deckHashNeverSeenInTrain"], priority: "PRIMARY_SEMANTIC_INCREMENT" },
      { comparison: "C1 vs B", cohorts: ["all", "deckHashNeverSeenInTrain"], priority: "required" },
      { comparison: "C1 vs F", cohorts: ["all", "deckHashNeverSeenInTrain"], priority: "required" },
      { comparison: "ID vs C0", cohorts: ["all", "deckHashNeverSeenInTrain"], priority: "required" },
      { comparison: "ID vs B", cohorts: ["all", "deckHashNeverSeenInTrain"], priority: "required" },
      { comparison: "C1 vs ID", cohorts: ["all", "deckHashNeverSeenInTrain"], priority: "SEMANTICS_VS_IDENTITY" },
      { comparison: "C2 vs C1", cohorts: ["all", "deckHashNeverSeenInTrain"], priority: "IDENTITY_AFTER_SEMANTICS" },
      { comparison: "C2 vs ID", cohorts: ["all", "deckHashNeverSeenInTrain"], priority: "SEMANTICS_AFTER_IDENTITY" },
    ],
  },
  authorization: {
    brierReconciliation: "ACCEPTED_FROZEN",
    modelA: "FROZEN",
    modelB: "FROZEN",
    modelCLadder: "REPAIRED_v2",
    semanticProvenanceCertification: "COMPLETE",
    featureGeneration: "WAIT",
    modelCTraining: "WAIT",
    testScoring: "WAIT",
    modelD: "WAIT",
    prospectiveHoldout: "SEALED",
    rc8: "FROZEN",
  },
} as const;

export function modelCFeatureSpecArtifactPath(): string {
  return `${process.cwd()}/data/milestones/topdeck/training-snapshots/commander-semantic-training-12m-v1/commander-model-c-feature-spec-v3.json`;
}
