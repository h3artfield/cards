/**
 * DeckBuildRouteOverlay — synthesis visualization contract (Phase 5.1).
 *
 * Superseded as the PRIMARY deckbuilding artifact by DeckBuildGraph (deck-build-graph-v1)
 * and the dedicated /inventory/deckbuild 2D workspace. The semantic 3D map remains
 * useful infrastructure; overlay references may still apply for map highlighting.
 */
export const DECK_BUILD_ROUTE_OVERLAY_V1_VERSION = "deck-build-route-overlay-v1";

/** Canonical global card universe — existing semantic map. */
export const SEMANTIC_3D_MAP_CONTRACT_V1 = {
  version: "semantic-3d-map-v1",
  role: "CANONICAL_CARD_GRAPH",
  owns: ["all eligible card node IDs", "semantic coordinates", "global node universe"],
  synthesisMustNot: [
    "duplicate card nodes for selected builds",
    "reposition cards because they were selected",
    "create independent card graph geometry",
  ],
  nodeReference: "semanticMapNodeId — existing map node / oracleId reference",
} as const;

/** Highlighted connected subgraph over the semantic universe for one generated build. */
export const DECK_BUILD_ROUTE_OVERLAY_V1 = {
  version: DECK_BUILD_ROUTE_OVERLAY_V1_VERSION,
  status: "SPECIFIED — integration with existing 3D map REQUIRED",
  replaces: "ArchetypeBuildGraph as card-graph concept — use overlay references instead",
  artifactType: "DeckBuildRouteOverlay",
  requiredFields: [
    "buildId",
    "commanderNodeId",
    "bracket",
    "archetypeId",
    "routeColorId",
    "selectedNodeIds",
    "groups",
    "relationships",
    "paths",
  ],
  /** References existing semantic map nodes — never duplicate geometry. */
  selectedNodeIds: {
    type: "string[]",
    note: "Oracle IDs / semantic map node IDs of the ~100 selected mainboard cards (+ commander reference)",
  },
  routeColorId: {
    type: "string",
    note: "Distinct color per generated build/archetype route — NOT MTG color identity",
  },
  topologyPolicy: {
    notATree: true,
    supportsFanOut: true,
    supportsReconvergence: true,
    note: "Explanatory topology — NOT optimizer search path. Commander → many nodes → engine package → fan-out → payoff convergence allowed.",
  },
  groups: {
    description: "Reason-group / selection-layer metadata — cards groupable without moving 3D position",
    examples: [
      "mana_base",
      "ramp",
      "draw_resource_engine",
      "removal",
      "stack_interaction",
      "primary_archetype_engine",
      "enablers",
      "payoffs",
      "protection",
      "recursion",
      "win_condition",
      "utility",
    ],
    multiMembership: true,
    fields: ["groupId", "label", "memberNodeIds[]", "structuralRole", "optionalPackageId"],
  },
  relationships: {
    description: "Explicit semantic reasons — NOT inferred from spatial adjacency in 3D map",
    note: "3D position = semantic similarity. Overlay edge = why these cards belong together in THIS deck.",
    fields: [
      "relationshipId",
      "sourceNodeId",
      "targetNodeId",
      "relationshipClass",
      "primaryEdge",
      "secondaryEdges",
      "evidenceRefs",
    ],
    relationshipClasses: [
      "commander_synergy",
      "same_engine",
      "enables",
      "payoff_for",
      "protects",
      "redundantly_provides",
      "fills_structural_role",
      "mana_support",
      "package_member",
      "convergence_hub",
    ],
  },
  paths: {
    description: "Named route segments for fan-out / reconvergence visualization",
    fields: ["pathId", "label", "nodeIds[]", "hubNodeIds[]", "stage"],
    stages: ["INPUT", "ENABLER", "ENGINE", "PAYOFF", "WIN", "STRUCTURAL"],
  },
  uiBehavior: {
    onRouteSelect: [
      "isolate/highlight selected ~100 cards",
      "dim unrelated global nodes",
      "display decklist",
      "display reason groups",
      "display relationships with semantic explanations",
    ],
    sharedCardsAcrossRoutes: "Same map node may appear in multiple colored overlays",
    nodeFill: "MTG color identity (unchanged from semantic map)",
    routeEdgeColor: "routeColorId — identifies generated build",
  },
} as const;

/** Minimum user input contract for deck generation workflow. */
export const DECK_SYNTHESIS_USER_INPUT_CONTRACT_V1 = {
  version: "deck-synthesis-user-input-v1",
  minimumRequired: ["commanderOracleIds", "bracket"],
  archetypeSelection: {
    optional: true,
    modes: ["AUTO", "SELECTED_ARCHETYPE_ID", "USER_STRATEGY_DESCRIPTION"],
    note: "Commander + Bracket alone MUST suffice to discover and generate multiple distinct builds",
  },
  buildPhilosophy: {
    optional: true,
    modes: ["AUTO", "COMMANDER_CENTRIC", "RESILIENT", "HARMONY"] as const,
    note: "Same commander + bracket + archetype may produce mechanically different builds when philosophy differs.",
  },
  deferredOptionalConstraints: [
    "budget",
    "inventory_only",
    "must_include",
    "must_exclude",
    "preferred_cards",
  ],
} as const;
