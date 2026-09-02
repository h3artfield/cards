/**
 * Fixture DeckBuildGraph — Kenrith demo with materially different graph topologies per path.
 */
import type { BuildPathClass } from "./build-path-types-v1";
import type { DeckBuildGraph, DeckBuildGraphEdge, DeckBuildGraphNode } from "./deck-build-graph-v1";
import { DECK_BUILD_GRAPH_V1_VERSION } from "./deck-build-graph-v1";

type PathLayout = {
  intents: Array<{ id: string; label: string; x: number; y: number; bridge?: boolean }>;
  cards: Array<{ oracleId: string; name: string; manaCost: string; intentId: string; shared?: boolean }>;
  edges: Array<{ from: string; to: string; type: DeckBuildGraphEdge["edgeType"]; bridge?: boolean; provenance: string }>;
};

const SHARED_CARD = { oracleId: "f6", name: "Cultivate", manaCost: "{2}{G}", intentId: "shared", shared: true };

const LAYOUTS: Record<BuildPathClass, PathLayout> = {
  DEPENDENT_SYNERGY: {
    intents: [
      { id: "intent-mana", label: "Mana for Kenrith activations", x: 200, y: 180 },
      { id: "intent-gy", label: "Graveyard fodder → {4}{B}", x: 600, y: 180 },
      { id: "intent-toolbox", label: "Exploit toolbox outputs", x: 400, y: 280 },
    ],
    cards: [
      { oracleId: "f1", name: "Sol Ring", manaCost: "{1}", intentId: "intent-mana" },
      { oracleId: "f2", name: "Arcane Signet", manaCost: "{2}", intentId: "intent-mana" },
      { oracleId: "f3", name: "Buried Alive", manaCost: "{2}{B}", intentId: "intent-gy" },
      { oracleId: "f8", name: "Phyrexian Arena", manaCost: "{1}{B}{B}", intentId: "intent-toolbox" },
    ],
    edges: [
      { from: "cz-kenrith", to: "intent-mana", type: "PROVIDES_INPUT", provenance: "Kenrith activations require mana each turn" },
      { from: "cz-kenrith", to: "intent-gy", type: "PROVIDES_INPUT", provenance: "Reanimation branch needs graveyard targets" },
      { from: "intent-mana", to: "intent-toolbox", type: "ENABLES", provenance: "Mana fuels repeated toolbox lines" },
      { from: "intent-gy", to: "intent-toolbox", type: "EXPLOITS_OUTPUT", provenance: "Recursion exploits filled graveyard" },
    ],
  },

  INDEPENDENT_SYNERGY: {
    intents: [
      { id: "intent-counters", label: "+1/+1 counter shell", x: 250, y: 200 },
      { id: "intent-recursion", label: "Standalone reanimation", x: 550, y: 200 },
    ],
    cards: [
      { oracleId: "f4", name: "Hardened Scales", manaCost: "{1}{G}", intentId: "intent-counters" },
      { oracleId: "f5", name: "Meren of Clan Nel Toth", manaCost: "{2}{B}{G}", intentId: "intent-recursion" },
      { oracleId: "f9", name: "Doubling Season", manaCost: "{4}{G}", intentId: "intent-counters" },
      SHARED_CARD,
    ],
    edges: [
      { from: "intent-counters", to: "intent-recursion", type: "REDUNDANT_ENGINE", provenance: "Independent enabler → payoff without Kenrith" },
      { from: "cz-kenrith", to: "intent-counters", type: "ENABLES", provenance: "Kenrith amplifies but is not required", bridge: true },
    ],
  },

  HARMONY: {
    intents: [
      { id: "intent-bridge", label: "Mana + creature-value hub", x: 400, y: 180, bridge: true },
      { id: "intent-cmd", label: "Commander branch", x: 220, y: 300 },
      { id: "intent-ind", label: "Independent shell", x: 580, y: 300 },
    ],
    cards: [
      SHARED_CARD,
      { oracleId: "f7", name: "Fertilid", manaCost: "{2}{G}", intentId: "intent-bridge" },
      { oracleId: "f10", name: "Solemn Simulacrum", manaCost: "{3}", intentId: "intent-bridge" },
      { oracleId: "f11", name: "Wood Elves", manaCost: "{2}{G}", intentId: "intent-bridge" },
    ],
    edges: [
      { from: "intent-bridge", to: "intent-cmd", type: "BRIDGES_ENGINES", bridge: true, provenance: "Ramps Kenrith activations and reanimation" },
      { from: "intent-bridge", to: "intent-ind", type: "BRIDGES_ENGINES", bridge: true, provenance: "Supports counter/recursion shell alone" },
      { from: "cz-kenrith", to: "intent-bridge", type: "CONVERTS", bridge: true, provenance: "Hub converts shared resources both ways" },
      { from: "intent-cmd", to: "cz-kenrith", type: "PROVIDES_INPUT", provenance: "Commander cluster fed by bridge" },
    ],
  },
};

function buildLayout(pathClass: BuildPathClass): { nodes: DeckBuildGraphNode[]; edges: DeckBuildGraphEdge[] } {
  const layout = LAYOUTS[pathClass];
  const nodes: DeckBuildGraphNode[] = [
    {
      nodeId: "cz-kenrith",
      nodeType: "COMMAND_ZONE_MEMBER",
      label: "Kenrith, the Returned King",
      subtitle: "Commander",
      x: 400,
      y: 50,
      pathClass,
    },
  ];
  const edges: DeckBuildGraphEdge[] = [];

  for (const intent of layout.intents) {
    nodes.push({
      nodeId: intent.id,
      nodeType: "CANDIDATE_INTENT",
      label: intent.label,
      x: intent.x,
      y: intent.y,
      pathClass,
      intentId: intent.id,
      meta: intent.bridge ? { bridge: true } : undefined,
    });
  }

  let cardY = 420;
  for (const card of layout.cards) {
    const intent = layout.intents.find((i) => i.id === card.intentId) ?? layout.intents[0]!;
    nodes.push({
      nodeId: `card-${card.oracleId}`,
      nodeType: "CARD",
      label: card.name,
      subtitle: card.manaCost,
      x: intent.x + (card.shared ? 0 : 40),
      y: cardY,
      pathClass,
      oracleId: card.oracleId,
      meta: { sharedAcrossPaths: card.shared ?? false, bridge: intent.bridge ?? false },
    });
    cardY += 55;
  }

  for (const e of layout.edges) {
    edges.push({
      edgeId: `e-${e.from}-${e.to}`,
      edgeType: e.type,
      sourceNodeId: e.from,
      targetNodeId: e.to,
      provenance: e.provenance,
      pathClass,
      bridge: e.bridge,
    });
  }

  for (const card of layout.cards) {
    const intent = layout.intents.find((i) => i.id === card.intentId);
    if (!intent) continue;
    edges.push({
      edgeId: `e-${intent.id}-card-${card.oracleId}`,
      edgeType: pathClass === "HARMONY" && intent.bridge ? "BRIDGES_ENGINES" : "ENABLES",
      sourceNodeId: intent.id,
      targetNodeId: `card-${card.oracleId}`,
      provenance: `Supports ${intent.label}`,
      pathClass,
      bridge: intent.bridge,
    });
  }

  return { nodes, edges };
}

export function buildKenrithDeckBuildGraphFixture(selectedPathClass: BuildPathClass = "HARMONY"): DeckBuildGraph {
  const { nodes, edges } = buildLayout(selectedPathClass);
  const layout = LAYOUTS[selectedPathClass];

  return {
    version: DECK_BUILD_GRAPH_V1_VERSION,
    deckTitle: "Kenrith Value Engine",
    commandZone: {
      configuration: "single_commander",
      members: [{ name: "Kenrith, the Returned King" }],
      combinedColorIdentity: ["W", "U", "B", "R", "G"],
      bracket: 4,
    },
    selectedPathId: `multi-kenrith--${selectedPathClass.toLowerCase().replace(/_/g, "-")}`,
    selectedPathClass,
    buildPaths: [],
    nodes,
    edges,
    considering: layout.cards.slice(0, 2).map((c) => ({
      oracleId: c.oracleId,
      name: c.name,
      manaCost: c.manaCost,
      intentIds: [c.intentId],
      whyThisCard:
        selectedPathClass === "DEPENDENT_SYNERGY"
          ? "Feeds Kenrith-dependent causal chain"
          : selectedPathClass === "INDEPENDENT_SYNERGY"
            ? "Part of standalone engine — Kenrith optional"
            : "Bridges commander and independent clusters",
      worksWithoutCommander: selectedPathClass !== "DEPENDENT_SYNERGY",
    })),
    selectedDeckCards: [
      { oracleId: "kenrith", name: "Kenrith, the Returned King", slot: "commander" },
      ...layout.cards.map((c) => ({
        oracleId: c.oracleId,
        name: c.name,
        manaCost: c.manaCost,
        slot: "main" as const,
      })),
    ],
    stats: { deckCount: layout.cards.length + 1, maxDeckSize: 100, averageManaValue: 2.6 },
    provenance: {
      source: "phase6a1-deck-build-graph-fixture-v2",
      fixture: true,
      generatedAt: new Date().toISOString(),
    },
  };
}

export const DECK_BUILD_PATH_EXPLANATIONS: Record<
  BuildPathClass,
  { title: string; tagline: string; description: string }
> = {
  DEPENDENT_SYNERGY: {
    title: "Dependent Synergy",
    tagline: "Highest commander synergy",
    description:
      "Mana and graveyard fodder feed Kenrith's activated toolbox. Without Kenrith, this plan loses its primary engine.",
  },
  INDEPENDENT_SYNERGY: {
    title: "Independent Synergy",
    tagline: "Most resilient without commander",
    description:
      "Counter shell into standalone reanimation — Kenrith adds options but the deck still operates if removed repeatedly.",
  },
  HARMONY: {
    title: "Harmony",
    tagline: "Most cross-supported / multi-role",
    description:
      "Flexible mana/creature-value cards bridge Kenrith activations and an independent midrange shell — not a 50/50 blend.",
  },
};
