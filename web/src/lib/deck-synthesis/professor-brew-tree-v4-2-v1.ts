/**
 * Professor v4.2 brew tree — projection of WorkingDeckTheoryV4 for RPG skill-tree UI.
 * The tree is a view; WorkingDeckTheory remains source of truth.
 */
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import { independencePercentFromDependence, packageEngineGradeV4, scoreToLetter } from "./professor-deck-grade-v4-v1";
import type { ScoredDiscoveryV4 } from "./professor-discovery-score-v4";
import type { IdeaBoardLaneV4 } from "./professor-idea-board-v4";

export const PROFESSOR_BREW_TREE_V4_2_V1_VERSION = "professor-brew-tree-v4-2-v1";

export type BrewTreeNodeKindV42 =
  | "COMMANDER"
  | "MECHANIC"
  | "ENGINE"
  | "PACKAGE"
  | "CARD"
  | "DISCOVERY";

export type CardProgressionStatusV42 = "CANDIDATE" | "VERIFIED" | "CORE";

export type BrewTreeEdgeStyleV42 = "SOLID" | "DASHED" | "GLOWING" | "QUESTION" | "REJECTED";

export type BrewTreeNodeV42 = {
  nodeId: string;
  kind: BrewTreeNodeKindV42;
  label: string;
  subtitle?: string;
  x: number;
  y: number;
  imageUrl?: string;
  packageId?: string;
  cardName?: string;
  cardStatus?: CardProgressionStatusV42;
  roles?: string[];
  commanderDependence?: string;
  provenanceNote?: string;
  discoveryScore?: number;
  ideaLane?: IdeaBoardLaneV4;
  meta?: Record<string, string | number | boolean>;
};

export type BrewTreeEdgeV42 = {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  style: BrewTreeEdgeStyleV42;
  provenance?: string;
};

export type BrewTreeGraphV42 = {
  version: typeof PROFESSOR_BREW_TREE_V4_2_V1_VERSION;
  nodes: BrewTreeNodeV42[];
  edges: BrewTreeEdgeV42[];
  revealStep: number;
  maxRevealStep: number;
};

const MEREN_ENGINE_LABELS = ["Creature Deaths", "Experience", "Graveyard Recursion"];
export const MEREN_PACKAGE_CARDS: Record<string, { name: string; roles: string[] }[]> = {
  "auto-sacrifice-fuel": [
    { name: "Sakura-Tribe Elder", roles: ["Ramp", "Self-Sacrifice", "Graveyard Setup"] },
    { name: "Spore Frog", roles: ["Combat Protection", "Self-Sacrifice", "Recursion Target"] },
    { name: "Viscera Seer", roles: ["Sacrifice Outlet", "Scry"] },
  ],
  "auto-meren-converter": [
    { name: "Fleshbag Marauder", roles: ["Removal", "Death Trigger", "Experience"] },
  ],
  "auto-utility-toolbox": [
    { name: "Reclamation Sage", roles: ["Artifact/Enchantment Removal", "Recursion Target"] },
    { name: "Eternal Witness", roles: ["Card Advantage", "Recursion Target"] },
  ],
};

const CHATTERFANG_DISCOVERY_NODE = {
  label: "Cross-Resource Discovery",
  subtitle: "One token event → two resource classes",
};

function engineLabelsFromTheory(theory: WorkingDeckTheoryV4): string[] {
  const chain = theory.thesis.mechanicChain;
  if (chain.length >= 3) {
    return [
      chain[0]?.slice(0, 48) ?? "Core Mechanic",
      "Experience / Value",
      "Recursion / Payoff",
    ];
  }
  const unique = [...new Set(theory.packages.map((p) => p.name))].slice(0, 3);
  return unique.length >= 2 ? unique : MEREN_ENGINE_LABELS;
}

function cardStatusForRoles(roles: string[], verified: boolean): CardProgressionStatusV42 {
  if (roles.length >= 4) return "CORE";
  if (verified) return "VERIFIED";
  return "CANDIDATE";
}

export function projectBrewTreeV42(args: {
  theory: WorkingDeckTheoryV4;
  revealStep: number;
  verifiedPackageIds?: Set<string>;
  discoveryPattern?: string | null;
  cardOverrides?: Record<string, CardProgressionStatusV42>;
  cardImageUrls?: Record<string, string>;
}): BrewTreeGraphV42 {
  const nodes: BrewTreeNodeV42[] = [];
  const edges: BrewTreeEdgeV42[] = [];
  const verified = args.verifiedPackageIds ?? new Set<string>();
  const maxRevealStep = 6;
  const theory = args.theory;

  const rootX = 400;
  let y = 40;

  nodes.push({
    nodeId: "commander",
    kind: "COMMANDER",
    label: theory.commander,
    imageUrl: args.cardImageUrls?.[theory.commander],
    x: rootX,
    y,
  });
  if (args.revealStep < 1) {
    return { version: PROFESSOR_BREW_TREE_V4_2_V1_VERSION, nodes, edges, revealStep: args.revealStep, maxRevealStep };
  }

  y += 100;
  const mechanicLabel = theory.thesis.deckIdentity.slice(0, 60) || "Commander Mechanic";
  nodes.push({ nodeId: "mechanic-root", kind: "MECHANIC", label: mechanicLabel, x: rootX, y });
  edges.push({ edgeId: "e-cmd-mech", sourceNodeId: "commander", targetNodeId: "mechanic-root", style: "SOLID", provenance: "Creative thesis" });

  if (args.revealStep < 2) {
    return { version: PROFESSOR_BREW_TREE_V4_2_V1_VERSION, nodes, edges, revealStep: args.revealStep, maxRevealStep };
  }

  y += 90;
  const packages = theory.packages.slice(0, 3);
  const engines = engineLabelsFromTheory(theory);
  const engineSpacing = 220;
  const engineStartX = rootX - engineSpacing;
  engines.slice(0, 3).forEach((label, i) => {
    const nodeId = `engine-${i}`;
    const pkg = packages[i];
    const engineGrade = pkg ? packageEngineGradeV4(pkg) : null;
    const independent = theory.independentEngines?.[i];
    const independencePct = independent
      ? independencePercentFromDependence(independent.worksWithoutCommander)
      : null;
    nodes.push({
      nodeId,
      kind: "ENGINE",
      label: independent?.description.slice(0, 36) ?? label,
      subtitle: engineGrade
        ? independent
          ? `${scoreToLetter(independencePct ?? engineGrade.score)} · Works without ${theory.commander.split(",")[0]?.trim()}: ${independencePct}%`
          : `Engine strength: ${engineGrade.letter}`
        : undefined,
      x: engineStartX + i * engineSpacing,
      y,
      meta: engineGrade
        ? {
            engineStrength: engineGrade.letter,
            engineScore: engineGrade.score,
            multiRoleCount: engineGrade.multiRoleCount,
            ...(independencePct != null ? { independencePercent: independencePct } : {}),
          }
        : undefined,
    });
    edges.push({
      edgeId: `e-mech-${nodeId}`,
      sourceNodeId: "mechanic-root",
      targetNodeId: nodeId,
      style: "SOLID",
      provenance: "Mechanic chain",
    });
  });

  if (args.revealStep < 3) {
    return { version: PROFESSOR_BREW_TREE_V4_2_V1_VERSION, nodes, edges, revealStep: args.revealStep, maxRevealStep };
  }

  y += 100;
  packages.forEach((pkg, i) => {
    const nodeId = `pkg-${pkg.packageId}`;
    const engineId = `engine-${Math.min(i, 2)}`;
    const pkgGrade = packageEngineGradeV4(pkg);
    const cardCount = (MEREN_PACKAGE_CARDS[pkg.packageId] ?? pkg.candidateCards).length;
    nodes.push({
      nodeId,
      kind: "PACKAGE",
      label: pkg.name.slice(0, 40),
      subtitle: `Engine ${pkgGrade.letter} · ${cardCount} cards · ${pkgGrade.multiRoleCount} multi-role`,
      packageId: pkg.packageId,
      x: engineStartX + i * engineSpacing,
      y,
      commanderDependence: pkg.commanderDependence,
      meta: {
        engineStrength: pkgGrade.letter,
        engineScore: pkgGrade.score,
        cardCount,
        multiRoleCount: pkgGrade.multiRoleCount,
      },
    });
    edges.push({
      edgeId: `e-eng-${nodeId}`,
      sourceNodeId: engineId,
      targetNodeId: nodeId,
      style: verified.has(pkg.packageId) ? "SOLID" : "DASHED",
      provenance: pkg.notes[0]?.slice(0, 60),
    });
  });

  if (args.revealStep < 4) {
    return { version: PROFESSOR_BREW_TREE_V4_2_V1_VERSION, nodes, edges, revealStep: args.revealStep, maxRevealStep };
  }

  y += 110;
  packages.forEach((pkg, i) => {
    const cards = MEREN_PACKAGE_CARDS[pkg.packageId] ?? pkg.candidateCards.slice(0, 2).map((c) => ({ name: c, roles: pkg.roles.slice(0, 2) }));
    cards.slice(0, 3).forEach((card, j) => {
      const nodeId = `card-${pkg.packageId}-${j}`;
      const roles = card.roles.length ? card.roles : ["Role TBD"];
      const status =
        args.cardOverrides?.[nodeId] ??
        cardStatusForRoles(roles, verified.has(pkg.packageId));
      nodes.push({
        nodeId,
        kind: "CARD",
        label: card.name,
        cardName: card.name,
        imageUrl: args.cardImageUrls?.[card.name],
        cardStatus: status,
        roles,
        packageId: pkg.packageId,
        x: engineStartX + i * engineSpacing - 40 + j * 80,
        y: y + j * 55,
        commanderDependence: pkg.commanderDependence,
        provenanceNote: pkg.purpose.slice(0, 100),
      });
      edges.push({
        edgeId: `e-pkg-${nodeId}`,
        sourceNodeId: `pkg-${pkg.packageId}`,
        targetNodeId: nodeId,
        style: status === "CORE" ? "GLOWING" : verified.has(pkg.packageId) ? "SOLID" : "QUESTION",
        label: roles.slice(0, 2).join(" · "),
      });
    });
  });

  if (args.revealStep >= 5 && args.discoveryPattern?.includes("CROSS_RESOURCE")) {
    const discY = y - 180;
    const discX = rootX + 320;
    nodes.push({
      nodeId: "discovery-cross",
      kind: "DISCOVERY",
      label: CHATTERFANG_DISCOVERY_NODE.label,
      subtitle: CHATTERFANG_DISCOVERY_NODE.subtitle,
      x: discX,
      y: discY,
      discoveryScore: 0.85,
    });
    nodes.push({
      nodeId: "disc-engine-artifact",
      kind: "ENGINE",
      label: "Artifact / Value Engine",
      x: discX - 80,
      y: discY + 90,
    });
    nodes.push({
      nodeId: "disc-engine-sacrifice",
      kind: "ENGINE",
      label: "Sacrifice / Death Engine",
      x: discX + 80,
      y: discY + 90,
    });
    edges.push({
      edgeId: "e-disc-artifact",
      sourceNodeId: "discovery-cross",
      targetNodeId: "disc-engine-artifact",
      style: "GLOWING",
      label: "original token resource",
    });
    edges.push({
      edgeId: "e-disc-sacrifice",
      sourceNodeId: "discovery-cross",
      targetNodeId: "disc-engine-sacrifice",
      style: "GLOWING",
      label: "creature token resource",
    });
    const tokenPkg = packages[0];
    if (tokenPkg) {
      edges.push({
        edgeId: "e-bridge-token",
        sourceNodeId: `pkg-${tokenPkg.packageId}`,
        targetNodeId: "discovery-cross",
        style: "GLOWING",
        provenance: "Research cross-branch",
      });
    }
  }

  if (args.revealStep >= 6) {
    const sakura = nodes.find((n) => n.cardName === "Sakura-Tribe Elder");
    const experience = nodes.find((n) => n.kind === "ENGINE" && n.label.includes("Experience"));
    if (sakura && experience) {
      edges.push({
        edgeId: "e-bridge-sakura-exp",
        sourceNodeId: sakura.nodeId,
        targetNodeId: experience.nodeId,
        style: "GLOWING",
        label: "role compression",
        provenance: "Engineer: card serves multiple jobs",
      });
    }
  }

  return { version: PROFESSOR_BREW_TREE_V4_2_V1_VERSION, nodes, edges, revealStep: args.revealStep, maxRevealStep };
}

export function collectBrewTreeCardNamesV42(theory: WorkingDeckTheoryV4): string[] {
  const names = [theory.commander];
  for (const pkg of theory.packages.slice(0, 3)) {
    const cards =
      MEREN_PACKAGE_CARDS[pkg.packageId] ??
      pkg.candidateCards.slice(0, 2).map((c) => ({ name: c, roles: pkg.roles.slice(0, 2) }));
    for (const card of cards.slice(0, 3)) {
      names.push(card.name);
    }
  }
  return [...new Set(names)];
}

export function findBrewTreeNode(graph: BrewTreeGraphV42, nodeId: string): BrewTreeNodeV42 | undefined {
  return graph.nodes.find((n) => n.nodeId === nodeId);
}
