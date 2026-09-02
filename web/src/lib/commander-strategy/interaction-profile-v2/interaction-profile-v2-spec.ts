/**
 * Frozen Interaction Profile v2 specification artifact.
 */
import {
  CARD_INTERACTION_PROFILE_V2_VERSION,
  DECK_INTERACTION_PROFILE_V2_VERSION,
  INTERACTION_PROFILE_V2_SPEC_VERSION,
} from "./types";
import { registryMetadata } from "./rc8-source-registry-v1";
import { RPS_ONTOLOGY_V2, allDeckFeatureKeys, proposedD2TermKeys } from "./rps-ontology-v2";

export const INTERACTION_PROFILE_V2_SPEC = {
  version: INTERACTION_PROFILE_V2_SPEC_VERSION,
  status: "SANITY_PASS_TRAIN_CENSUS_COMPLETE_D2_BLOCKED_ZERO_VARIANCE",
  derivedLayerStack: [
    "Frozen RC8 semantic AST (catalog-shadow-parse-rc8-firestore-v2)",
    "Golden catalog / card structure",
    "Interaction Profile v2 (this layer)",
    "Deck matchup vectors",
    "Future D2 (WAIT — not authorized)",
  ],
  rc8Policy: "RC8 FROZEN — no parser changes. All repairs in interpretation/mapping layer.",
  profileVersions: {
    card: CARD_INTERACTION_PROFILE_V2_VERSION,
    deck: DECK_INTERACTION_PROFILE_V2_VERSION,
  },
  vectorKinds: {
    exposure: "What resources/permanents the deck physically contains (catalog + zone signals). NOT reliance.",
    reliance: "What zones/mechanics the deck's plan repeatedly uses (L2 actions + L1 ability structure).",
    disruption: "What opposing resources/plans this deck can attack (classified answers + restrictions).",
    resilience: "Recovery/resistance to disruption — explicitly NOT a mirror of dependency.",
  },
  rc8SourceRegistry: registryMetadata(),
  ontology: RPS_ONTOLOGY_V2,
  deckFeatureCount: allDeckFeatureKeys().length,
  proposedD2TermCount: proposedD2TermKeys().length,
  d2HealthGate: {
    zeroVarianceDimensions: "near zero — not 90%+",
    sanitySuite: "all core cases PASS before TRAIN census",
    deadColumns: "removed or flagged — never carried silently into D2",
    oldTest: "SPENT — do not score D2 on existing TEST",
    prospectiveHoldout: "SEALED",
  },
  authorization: {
    d1: "ACCEPTED_FROZEN_NEGATIVE",
    interactionProfileV2: "AUTHORIZED",
    d2Training: "WAIT",
    rc8: "FROZEN",
  },
} as const;

export { INTERACTION_PROFILE_V2_SPEC_VERSION };
