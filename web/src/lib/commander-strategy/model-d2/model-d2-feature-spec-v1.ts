/**
 * Model D2 feature spec — matched marginal-control ladder on frozen C2.
 */
import { MATCHUP_PAIRINGS_V2_1, matchupOntologyMetadata } from "../interaction-profile-v2.1/matchup-ontology-v2.1";
import { allRetainedDeckFeatureKeys, RPS_ONTOLOGY_V2_1 } from "../interaction-profile-v2.1/rps-ontology-v2.1";
import { INTERACTION_PROFILE_V2_1_SPEC_VERSION } from "../interaction-profile-v2.1/types";
import { OPPONENT_REDUCERS, VARIANCE_CONVENTION } from "./opponent-reducers-v1";
import {
  interactionFeatureNames,
  opponentMarginalFeatureNames,
  opponentMarginalSourceKeys,
  selfProfileFeatureNames,
} from "./pod-ipv2-features-v1";
import { MODEL_D2_FEATURE_SPEC_VERSION } from "./types";

export const MODEL_D2_FEATURE_SPEC = {
  version: MODEL_D2_FEATURE_SPEC_VERSION,
  interactionProfileSpec: INTERACTION_PROFILE_V2_1_SPEC_VERSION,
  matchUpOntology: matchupOntologyMetadata(),
  frozenBaseline: {
    model: "C2",
    artifact: "commander-model-c-features-v3",
    policy: "C2 coefficients and seat utility are frozen — fit only new P0/P1/D2 blocks.",
  },
  ladder: {
    C2: "Frozen best Model C baseline (116 dense + supported sparse card_id).",
    P0: "C2 + my 48 IPV2.1 self deck-profile features.",
    P1: "P0 + opponent marginal IPV2.1 features (deduplicated source variables × 4 reducers).",
    D2: "P1 + 16 explicit RPS interaction pairings × 4 reducers.",
  },
  primaryRpsTest: "D2 vs P1",
  secondaryTests: [
    { comparison: "P0 vs C2", question: "Does IPV2.1 self-profile add individual-deck information?" },
    { comparison: "P1 vs P0", question: "Do opponent mechanical marginals help?" },
    { comparison: "D2 vs P1", question: "PRIMARY — Do explicit interactions help beyond main effects?" },
    { comparison: "D2 vs C2", question: "Overall matchup-system improvement." },
  ],
  selfProfile: {
    count: selfProfileFeatureNames().length,
    columns: selfProfileFeatureNames(),
    ontology: RPS_ONTOLOGY_V2_1,
  },
  opponentMarginal: {
    sourceKeys: opponentMarginalSourceKeys(),
    reducers: OPPONENT_REDUCERS,
    varianceConvention: VARIANCE_CONVENTION,
    count: opponentMarginalFeatureNames().length,
    columns: opponentMarginalFeatureNames(),
    policy: "Same source variables underlying D2 interactions — no extra opponent information.",
  },
  interaction: {
    pairings: MATCHUP_PAIRINGS_V2_1,
    reducers: OPPONENT_REDUCERS,
    varianceConvention: VARIANCE_CONVENTION,
    count: interactionFeatureNames().length,
    columns: interactionFeatureNames(),
  },
  regularizationBlocks: [
    "IPV2_1_SELF",
    "IPV2_1_OPP_MARGINAL",
    "IPV2_1_RPS_INTERACTION",
  ],
  authorization: {
    interactionProfileV2_1: "ACCEPTED_FROZEN_FOR_D2_EXPERIMENT",
    matchupOntology: "ACCEPTED_FROZEN",
    trainFeatureGeneration: "AUTHORIZED",
    validationFeatureGeneration: "AUTHORIZED",
    d2Training: "WAIT",
    oldTest: "SPENT_PROHIBITED",
    prospectiveHoldout: "SEALED",
    rc8: "FROZEN",
  },
} as const;

export { MODEL_D2_FEATURE_SPEC_VERSION };
