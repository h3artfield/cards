/**
 * DeckBuildGraph — canonical 2D deckbuilding artifact for /inventory/deckbuild.
 * Supersedes DeckBuildRouteOverlay as the primary deckbuilding visualization contract.
 */
import type { BuildPathClass, BuildPathProposal, PathCandidateIntent } from "./build-path-types-v1";
import type { CommandZoneConfiguration } from "./command-zone-composition-v1";

export const DECK_BUILD_GRAPH_V1_VERSION = "deck-build-graph-v1";

export type DeckBuildGraphNodeType =
  | "COMMAND_ZONE_MEMBER"
  | "BUILD_PATH"
  | "CANDIDATE_INTENT"
  | "CARD"
  | "PACKAGE";

export type DeckBuildGraphEdgeType =
  | "PROVIDES_INPUT"
  | "TRIGGERS"
  | "ENABLES"
  | "CONSUMES_RESOURCE"
  | "PRODUCES_RESOURCE"
  | "EXPLOITS_OUTPUT"
  | "CONVERTS"
  | "REDUNDANT_ENGINE"
  | "PROTECTS"
  | "BRIDGES_ENGINES";

export type DeckBuildGraphNode = {
  nodeId: string;
  nodeType: DeckBuildGraphNodeType;
  label: string;
  subtitle?: string;
  x: number;
  y: number;
  pathClass?: BuildPathClass;
  intentId?: string;
  oracleId?: string;
  meta?: Record<string, string | number | boolean>;
};

export type DeckBuildGraphEdge = {
  edgeId: string;
  edgeType: DeckBuildGraphEdgeType;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  provenance: string;
  pathClass?: BuildPathClass;
  bridge?: boolean;
};

export type DeckBuildConsideringCard = {
  oracleId: string;
  name: string;
  manaCost?: string;
  intentIds: string[];
  whyThisCard: string;
  worksWithoutCommander: boolean;
};

export type DeckBuildSelectedCard = {
  oracleId: string;
  name: string;
  manaCost?: string;
  slot: "commander" | "main";
};

export type DeckBuildGraph = {
  version: typeof DECK_BUILD_GRAPH_V1_VERSION;
  deckTitle: string;
  commandZone: {
    configuration: CommandZoneConfiguration;
    members: Array<{ name: string; oracleId?: string }>;
    combinedColorIdentity: string[];
    bracket: number;
  };
  selectedPathId: string;
  selectedPathClass: BuildPathClass;
  buildPaths: BuildPathProposal[];
  nodes: DeckBuildGraphNode[];
  edges: DeckBuildGraphEdge[];
  considering: DeckBuildConsideringCard[];
  selectedDeckCards: DeckBuildSelectedCard[];
  stats: {
    deckCount: number;
    maxDeckSize: number;
    averageManaValue: number | null;
  };
  provenance: {
    source: string;
    fixture?: boolean;
    generatedAt: string;
  };
};

export type DeckBuildGraphSelection = {
  selectedNodeId: string | null;
  node: DeckBuildGraphNode | null;
  connectedEdges: DeckBuildGraphEdge[];
  intent?: PathCandidateIntent;
};
