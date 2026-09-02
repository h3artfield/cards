/**
 * Frozen Model D feature specification v1 — pod matchup context on frozen C2 baseline.
 */
import { MODEL_C_VERSION } from "../model-c/types";
import { MODEL_D_FEATURE_SPEC_VERSION } from "./types";
import {
  CARD_INTERACTION_PROFILE_VERSION,
} from "../types";
import {
  PAPER_POPULATION_HASH,
  RC8_PARSER_BLOB_CLOSURE,
  SEMANTIC_INDEX_VERSION,
} from "../semantic-universe-v1";
import { MODEL_C_FEATURE_SPEC_VERSION } from "../model-c/model-c-feature-spec-v1";

export const MODEL_D_FEATURE_SPEC = {
  version: MODEL_D_FEATURE_SPEC_VERSION,
  status: "FROZEN_PENDING_FEATURE_QA",
  datasetHash: "706a5fc9be961d812836a875388af92c513807ec5f4892ffbe4964f4205ad75c",
  frozenIndividualDeckBaseline: {
    model: MODEL_C_VERSION,
    variant: "C2",
    rationale: "Best frozen individual-deck Model C variant; nested unchanged in all D variants.",
  },
  experimentalLadder: {
    C2: {
      label: "Frozen individual-deck baseline (not retrained in Model D feature generation)",
      deckFeatures: "Model C C2 full column set",
    },
    D0: {
      label: "C2 + non-semantic opponent/pod context",
      deckFeatures: "FROZEN_C2 + OPPONENT_CONTEXT",
      ablationQuestion: "Does relative deck construction vs opponents add signal beyond individual decks?",
    },
    D1: {
      label: "D0 + semantic matchup interaction",
      deckFeatures: "FROZEN_C2 + OPPONENT_CONTEXT + SEMANTIC_MATCHUP",
      headlineExperiment: true,
      primaryTest: "D1 vs D0",
      secondaryTest: "D1 vs C2",
    },
  },
  question:
    "Does the mechanical relationship between MY deck and the OTHER decks in the pod predict outcomes beyond knowing the decks individually?",
  outcomeIndependence: {
    allowedInputs: [
      "deck composition",
      "frozen catalog metadata",
      "frozen RC8 semantics",
      "frozen card-interaction-profile-v1 deterministic mappings",
      "official Game Changer snapshot",
    ],
    forbiddenInputs: [
      "historical matchup win rates",
      "card win rates",
      "pairwise outcome statistics",
      "TEST outcomes",
      "Model C TEST coefficient magnitudes",
      "prospective holdout labels",
    ],
    trainOutcomesUsage: "TRAIN pod winners used only when fitting the eventual Model D learner — never during feature generation.",
  },
  opponentPermutationInvariance: {
    rule: "Opponent-relative features aggregate over the multiset of opponent seats using mean/max/min reducers only — never depend on seat index ordering.",
    opponentCountNormalization:
      "Reducers divide by opponent count (2 or 3) so 4-player pods are not automatically assigned larger raw totals than 3-player pods.",
    automatedTests: "generate-model-d-features-v1.ts runs seat-order permutation checks on sampled pods.",
  },
  d0OpponentContext: {
    alias: "OPPONENT_CONTEXT",
    prefix: "oppctx_",
    source: "Non-semantic BASIC + Game Changer deck scalars only (no RC8 semantic aggregates).",
    reducers: ["meanOppDiff", "maxOppDiff", "minOppDiff"],
    relativeStats: [
      "basic_averageManaValue",
      "basic_medianManaValue",
      "basic_creatureFraction",
      "basic_instantFraction",
      "basic_sorceryFraction",
      "basic_artifactFraction",
      "basic_enchantmentFraction",
      "basic_landCountFraction",
      "basic_nonBasicLandFraction",
      "basic_colorIdentityW",
      "basic_colorIdentityU",
      "basic_colorIdentityB",
      "basic_colorIdentityR",
      "basic_colorIdentityG",
      "gc_countTotal",
      "gc_fraction",
    ],
  },
  d1SemanticMatchup: {
    alias: "SEMANTIC_MATCHUP",
    prefix: "match_",
    source:
      "Frozen RC8 deck aggregates + card-interaction-profile-v1 pressure channels selected before Model C TEST review.",
    reducers: ["meanAcrossOpponents", "maxAcrossOpponents", "minAcrossOpponents"],
    channels: "See matchup-interaction-features-v1.ts SEMANTIC_MATCHUP_CHANNELS — fixed mechanical pairings, not tuned on TEST.",
  },
  provenancePins: {
    modelCFeatureSpec: MODEL_C_FEATURE_SPEC_VERSION,
    modelCFeaturesArtifact: "commander-model-c-features-v3",
    rc8ParserBlobClosure: RC8_PARSER_BLOB_CLOSURE,
    semanticIndexVersion: SEMANTIC_INDEX_VERSION,
    cardInteractionProfileVersion: CARD_INTERACTION_PROFILE_VERSION,
    paperPopulationHash: PAPER_POPULATION_HASH,
  },
  authorization: {
    modelC: "ACCEPTED_FROZEN",
    modelDSpec: "AUTHORIZED",
    modelDFeatureGeneration: "AUTHORIZED_AFTER_SPEC_FREEZE",
    modelDTraining: "WAIT",
    rc8: "FROZEN",
    prospectiveHoldout: "SEALED",
  },
} as const;

export { MODEL_D_FEATURE_SPEC_VERSION };
