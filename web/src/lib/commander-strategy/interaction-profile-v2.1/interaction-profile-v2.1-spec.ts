/**
 * Frozen Interaction Profile v2.1 specification.
 */
import { registryMetadata } from "../interaction-profile-v2/rc8-source-registry-v1";
import { IPV2_DEAD_AXIS_DISPOSITIONS } from "./dead-axis-dispositions-v2.1";
import { matchupOntologyMetadata } from "./matchup-ontology-v2.1";
import { allRetainedDeckFeatureKeys, RPS_ONTOLOGY_V2_1 } from "./rps-ontology-v2.1";
import {
  CARD_INTERACTION_PROFILE_V2_1_VERSION,
  DECK_INTERACTION_PROFILE_V2_1_VERSION,
  INTERACTION_PROFILE_V2_1_SPEC_VERSION,
} from "./types";

export const INTERACTION_PROFILE_V2_1_SPEC = {
  version: INTERACTION_PROFILE_V2_1_SPEC_VERSION,
  status: "SANITY_AND_TRAIN_CENSUS_PENDING",
  supersedes: "interaction-profile-v2-spec-v1",
  derivedLayerStack: [
    "Frozen RC8 semantic AST (catalog-shadow-parse-rc8-firestore-v2)",
    "Golden catalog / card structure",
    "Interaction Profile v2.1 (pruned ontology + tightened reliance)",
    "Explicit matchup ontology v2.1",
    "Future D2 (WAIT — not authorized)",
  ],
  rc8Policy: "RC8 FROZEN — no parser changes.",
  profileVersions: {
    card: CARD_INTERACTION_PROFILE_V2_1_VERSION,
    deck: DECK_INTERACTION_PROFILE_V2_1_VERSION,
  },
  vectorKinds: {
    exposure: "Physical deck composition (type line). NOT reliance.",
    reliance: "Contributor-fraction of cards with engine-level dependency (threshold-gated).",
    disruption: "Weighted mean of answer/restriction density.",
    resilience: "OMITTED from v2.1 retained schema — deferred.",
  },
  relianceAggregation: {
    method: "contributor_fraction",
    threshold: 0.2,
    note: "Cards below threshold do not count; avoids 'one Sol Ring = 100% artifact reliance'.",
  },
  rc8SourceRegistry: registryMetadata(),
  ontology: RPS_ONTOLOGY_V2_1,
  prunedDeadAxes: IPV2_DEAD_AXIS_DISPOSITIONS,
  retainedDeckFeatureCount: allRetainedDeckFeatureKeys().length,
  matchupOntology: matchupOntologyMetadata(),
  d2HealthGate: {
    retainedAxesMustHaveVariance: true,
    retainedPairingsMustHaveVariance: true,
    deadAxesExplicitlyPruned: true,
    saturationAuditRequired: true,
    permutationInvariance: true,
    oldTest: "SPENT",
    prospectiveHoldout: "SEALED",
  },
  authorization: {
    interactionProfileV2: "ACCEPTED_AS_DEVELOPMENT_VERSION",
    interactionProfileV2_1: "AUTHORIZED",
    d2Training: "WAIT",
    rc8: "FROZEN",
  },
} as const;
