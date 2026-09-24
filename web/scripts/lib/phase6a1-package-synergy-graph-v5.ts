/**
 * Package synergy graph v5 — semantic-role compatibility, requiredResources-only causal edges.
 */
import type { SemanticPackage } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import {
  CANONICAL_RESOURCE_ONTOLOGY_V3_VERSION,
  classifyPackageResources,
  packageEngineCluster,
  producerSatisfiesRequirement,
  type CanonicalResourceType,
  type ClassifiedResource,
} from "./phase6a1-canonical-resource-ontology-v3";

export const PACKAGE_SYNERGY_GRAPH_V5_VERSION = "phase6a1-package-synergy-graph-v5";

export type SynergyEdgeKind =
  | "REQUIRES_FROM"
  | "PRODUCES_FOR"
  | "SHARED_ENABLER"
  | "SHARED_PAYOFF"
  | "BRIDGE"
  | "REDUNDANT_WITH";

export type EdgeSupportPointer = {
  producerField: ClassifiedResource["field"];
  producerIndex: number;
  producerText: string;
  consumerField: ClassifiedResource["field"];
  consumerIndex: number;
  consumerText: string;
};

export type PackageSynergyTypedEdge = {
  fromPackageId: string;
  toPackageId: string;
  kind: SynergyEdgeKind;
  reason: string;
  resource: CanonicalResourceType;
  directed: boolean;
  support: EdgeSupportPointer;
};

export type SemanticRegressionAssertion = {
  id: string;
  passed: boolean;
  detail: string;
};

export type SynergyGraphQA = {
  version: typeof PACKAGE_SYNERGY_GRAPH_V5_VERSION;
  ontologyVersion: typeof CANONICAL_RESOURCE_ONTOLOGY_V3_VERSION;
  passed: boolean;
  packageCount: number;
  possibleDirectedNonSelfEdges: number;
  dependsOnDirectedEdges: number;
  dependsOnDensity: number;
  dependsOnReciprocalEdgeRate: number;
  overlapsDirectedEdges: number;
  overlapsDensity: number;
  completeOverlapGraph: boolean;
  nearCompleteDependencyGraph: boolean;
  blockingReasons: string[];
  semanticRegressions: SemanticRegressionAssertion[];
};

function edgeKey(edge: PackageSynergyTypedEdge): string {
  return [
    edge.fromPackageId,
    edge.toPackageId,
    edge.kind,
    edge.resource,
    edge.support.producerField,
    edge.support.producerIndex,
    edge.support.consumerField,
    edge.support.consumerIndex,
  ].join("|");
}

function dedupeEdges(edges: PackageSynergyTypedEdge[]): PackageSynergyTypedEdge[] {
  const seen = new Set<string>();
  const out: PackageSynergyTypedEdge[] = [];
  for (const edge of edges) {
    const key = edgeKey(edge);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}

function addDirected(map: Map<string, Set<string>>, from: string, to: string): void {
  if (from === to) return;
  if (!map.has(from)) map.set(from, new Set());
  map.get(from)!.add(to);
}

function addSymmetric(map: Map<string, Set<string>>, a: string, b: string): void {
  addDirected(map, a, b);
  addDirected(map, b, a);
}

function findCausalEdges(packages: SemanticPackage[]): PackageSynergyTypedEdge[] {
  const edges: PackageSynergyTypedEdge[] = [];
  const classified = new Map(packages.map((p) => [p.packageId, classifyPackageResources(p)]));

  for (const consumer of packages) {
    const consumerReqs = (classified.get(consumer.packageId) ?? []).filter(
      (c) => c.field === "requiredResources" && c.causalEligible,
    );
    for (const producer of packages) {
      if (consumer.packageId === producer.packageId) continue;
      const producerOuts = (classified.get(producer.packageId) ?? []).filter(
        (c) => c.field === "producedResources",
      );
      for (const req of consumerReqs) {
        for (const prod of producerOuts) {
          if (!producerSatisfiesRequirement(prod, req)) continue;
          const support: EdgeSupportPointer = {
            producerField: prod.field,
            producerIndex: prod.index,
            producerText: prod.text,
            consumerField: req.field,
            consumerIndex: req.index,
            consumerText: req.text,
          };
          edges.push({
            fromPackageId: consumer.packageId,
            toPackageId: producer.packageId,
            kind: "REQUIRES_FROM",
            reason: `${producer.packageId} produces ${prod.type} required by ${consumer.packageId}`,
            resource: req.type,
            directed: true,
            support,
          });
          edges.push({
            fromPackageId: producer.packageId,
            toPackageId: consumer.packageId,
            kind: "PRODUCES_FOR",
            reason: `${producer.packageId} produces ${prod.type} required by ${consumer.packageId}`,
            resource: prod.type,
            directed: true,
            support,
          });
        }
      }
    }
  }
  return dedupeEdges(edges);
}

function findSharedEnablerEdges(packages: SemanticPackage[]): PackageSynergyTypedEdge[] {
  const edges: PackageSynergyTypedEdge[] = [];
  const classified = new Map(packages.map((p) => [p.packageId, classifyPackageResources(p)]));

  for (let i = 0; i < packages.length; i++) {
    for (let j = i + 1; j < packages.length; j++) {
      const a = packages[i];
      const b = packages[j];
      const aReqs = (classified.get(a.packageId) ?? []).filter((c) => c.field === "requiredResources");
      const bReqs = (classified.get(b.packageId) ?? []).filter((c) => c.field === "requiredResources");
      for (const ra of aReqs) {
        for (const rb of bReqs) {
          if (ra.type !== rb.type) continue;
          const support: EdgeSupportPointer = {
            producerField: ra.field,
            producerIndex: ra.index,
            producerText: ra.text,
            consumerField: rb.field,
            consumerIndex: rb.index,
            consumerText: rb.text,
          };
          edges.push({
            fromPackageId: a.packageId,
            toPackageId: b.packageId,
            kind: "SHARED_ENABLER",
            reason: `Both require ${ra.type}`,
            resource: ra.type,
            directed: false,
            support,
          });
        }
      }
    }
  }
  return dedupeEdges(edges);
}

function findSharedPayoffEdges(packages: SemanticPackage[]): PackageSynergyTypedEdge[] {
  const edges: PackageSynergyTypedEdge[] = [];
  const classified = new Map(packages.map((p) => [p.packageId, classifyPackageResources(p)]));

  for (let i = 0; i < packages.length; i++) {
    for (let j = i + 1; j < packages.length; j++) {
      const a = packages[i];
      const b = packages[j];
      const aPay = (classified.get(a.packageId) ?? []).filter((c) => c.field === "payoffs");
      const bPay = (classified.get(b.packageId) ?? []).filter((c) => c.field === "payoffs");
      for (const pa of aPay) {
        for (const pb of bPay) {
          if (pa.type !== pb.type) continue;
          const support: EdgeSupportPointer = {
            producerField: pa.field,
            producerIndex: pa.index,
            producerText: pa.text,
            consumerField: pb.field,
            consumerIndex: pb.index,
            consumerText: pb.text,
          };
          edges.push({
            fromPackageId: a.packageId,
            toPackageId: b.packageId,
            kind: "SHARED_PAYOFF",
            reason: `Shared payoff mechanism ${pa.type}`,
            resource: pa.type,
            directed: false,
            support,
          });
        }
      }
    }
  }
  return dedupeEdges(edges);
}

function findRedundantEdges(packages: SemanticPackage[]): PackageSynergyTypedEdge[] {
  const edges: PackageSynergyTypedEdge[] = [];
  const classified = new Map(packages.map((p) => [p.packageId, classifyPackageResources(p)]));

  for (let i = 0; i < packages.length; i++) {
    for (let j = i + 1; j < packages.length; j++) {
      const a = packages[i];
      const b = packages[j];
      const aOut = (classified.get(a.packageId) ?? []).filter((c) => c.field === "producedResources");
      const bOut = (classified.get(b.packageId) ?? []).filter((c) => c.field === "producedResources");
      const sharedTypes = new Map<CanonicalResourceType, { a: ClassifiedResource; b: ClassifiedResource }>();
      for (const oa of aOut) {
        for (const ob of bOut) {
          if (oa.type !== ob.type) continue;
          sharedTypes.set(oa.type, { a: oa, b: ob });
        }
      }
      if (sharedTypes.size < 2) continue;
      const [firstType, refs] = [...sharedTypes.entries()][0];
      edges.push({
        fromPackageId: a.packageId,
        toPackageId: b.packageId,
        kind: "REDUNDANT_WITH",
        reason: `Shared produced outputs: ${[...sharedTypes.keys()].join(", ")}`,
        resource: firstType,
        directed: false,
        support: {
          producerField: refs.a.field,
          producerIndex: refs.a.index,
          producerText: refs.a.text,
          consumerField: refs.b.field,
          consumerIndex: refs.b.index,
          consumerText: refs.b.text,
        },
      });
    }
  }
  return dedupeEdges(edges);
}

function findBridgeEdges(
  packages: SemanticPackage[],
  causalEdges: PackageSynergyTypedEdge[],
): PackageSynergyTypedEdge[] {
  const edges: PackageSynergyTypedEdge[] = [];
  const clusters = new Map(packages.map((p) => [p.packageId, packageEngineCluster(p)]));

  for (const pkg of packages) {
    const pkgCluster = clusters.get(pkg.packageId)!;
    const requiresFrom = causalEdges.filter(
      (e) => e.kind === "REQUIRES_FROM" && e.fromPackageId === pkg.packageId,
    );
    const producesFor = causalEdges.filter(
      (e) => e.kind === "PRODUCES_FOR" && e.fromPackageId === pkg.packageId,
    );
    const connectedClusters = new Set<string>();
    for (const e of [...requiresFrom, ...producesFor]) {
      const other =
        e.kind === "REQUIRES_FROM" ? e.toPackageId : e.toPackageId;
      connectedClusters.add(clusters.get(other)!);
    }
    connectedClusters.add(pkgCluster);
    if (connectedClusters.size < 2) continue;

    for (const e of requiresFrom) {
      const otherCluster = clusters.get(e.toPackageId)!;
      if (otherCluster === pkgCluster) continue;
      edges.push({
        fromPackageId: pkg.packageId,
        toPackageId: e.toPackageId,
        kind: "BRIDGE",
        reason: `${pkg.packageId} connects ${pkgCluster} to ${otherCluster} via ${e.resource}`,
        resource: e.resource,
        directed: false,
        support: e.support,
      });
    }
  }

  for (let i = 0; i < packages.length; i++) {
    for (let j = i + 1; j < packages.length; j++) {
      const a = packages[i];
      const b = packages[j];
      if (clusters.get(a.packageId) === clusters.get(b.packageId)) continue;
      const aToB = causalEdges.find(
        (e) => e.kind === "REQUIRES_FROM" && e.fromPackageId === a.packageId && e.toPackageId === b.packageId,
      );
      const bToA = causalEdges.find(
        (e) => e.kind === "REQUIRES_FROM" && e.fromPackageId === b.packageId && e.toPackageId === a.packageId,
      );
      if (!aToB || !bToA) continue;
      edges.push({
        fromPackageId: a.packageId,
        toPackageId: b.packageId,
        kind: "BRIDGE",
        reason: `Mutual cross-cluster typed exchange ${aToB.resource}<->${bToA.resource}`,
        resource: aToB.resource,
        directed: false,
        support: aToB.support,
      });
    }
  }

  return dedupeEdges(edges);
}

function runSemanticRegressions(
  caseId: string,
  packages: SemanticPackage[],
  edges: PackageSynergyTypedEdge[],
): SemanticRegressionAssertion[] {
  const assertions: SemanticRegressionAssertion[] = [];
  const causal = edges.filter((e) => e.kind === "REQUIRES_FROM" || e.kind === "PRODUCES_FOR");

  const hasEdge = (from: string, to: string, kind: SynergyEdgeKind, resource?: CanonicalResourceType) =>
    edges.some(
      (e) =>
        e.fromPackageId === from &&
        e.toPackageId === to &&
        e.kind === kind &&
        (resource == null || e.resource === resource),
    );

  assertions.push({
    id: "GLOBAL_NO_SEMANTIC_REQUIREMENT_CAUSAL",
    passed: !causal.some((e) => e.support.consumerField === "semanticRequirements"),
    detail: causal.some((e) => e.support.consumerField === "semanticRequirements")
      ? "Causal edge uses semanticRequirements as consumer"
      : "No semanticRequirements causal consumers",
  });

  assertions.push({
    id: "GLOBAL_NO_PAYOFF_CAUSAL_PRODUCER",
    passed: !causal.some((e) => e.support.producerField === "payoffs"),
    detail: causal.some((e) => e.support.producerField === "payoffs")
      ? "Causal edge uses payoffs as producer supply"
      : "No payoff-field causal producers",
  });

  assertions.push({
    id: "GLOBAL_TOKEN_NOT_POWER_FOUR_WITHOUT_QUALIFIER",
    passed: !causal.some(
      (e) =>
        e.resource === "POWER_FOUR_PLUS_ATTACKER" &&
        !/power-4|power 4|4\/4|threshold-compatible|power-4-plus/.test(e.support.producerText),
    ),
    detail: "Generic outputs must not satisfy POWER_FOUR_PLUS_ATTACKER without explicit power qualification",
  });

  if (caseId === "hybrid-kinnan") {
    const ok = hasEdge(
      "compact-conversion-dual-channel-outlets",
      "compact-conversion-positive-untap-loop",
      "REQUIRES_FROM",
      "UNBOUNDED_MANA",
    );
    assertions.push({
      id: "KINNAN_UNBOUNDED_MANA_CAUSAL_EDGE",
      passed: ok,
      detail: ok
        ? "Dual-Channel Mana Conversion REQUIRES_FROM Mana-Positive Untap Loop on UNBOUNDED_MANA"
        : "Missing causal UNBOUNDED_MANA edge",
    });
    const badBounded = causal.some(
      (e) =>
        /repeatable nonland mana|flexible mana availability/i.test(e.support.producerText) &&
        /unbounded mana|large or unbounded mana/i.test(e.support.consumerText),
    );
    assertions.push({
      id: "KINNAN_BOUNDED_NOT_UNBOUNDED",
      passed: !badBounded,
      detail: badBounded ? "BOUNDED_MANA incorrectly satisfies UNBOUNDED_MANA requirement" : "Bounded/unbounded coercion absent",
    });
    assertions.push({
      id: "KINNAN_MANA_NOT_MANA_PERMANENT",
      passed: !causal.some(
        (e) =>
          /repeatable nonland mana|flexible mana availability|additional commander-amplified mana|unbounded mana of usable types/i.test(
            e.support.producerText,
          ) && /repeatable nonland mana permanent|a repeatable nonland mana permanent/i.test(e.support.consumerText),
      ),
      detail: "MANA_OUTPUT must not satisfy NONLAND_MANA_PERMANENT SOURCE_OBJECT requirement",
    });
    const badUnboundedOutlet = causal.some(
      (e) =>
        /unbounded mana of usable types/i.test(e.support.producerText) &&
        /scalable outlet|noncommander scalable outlet|prefer an outlet that can be used as soon as large or unbounded/i.test(
          e.support.consumerText,
        ),
    );
    assertions.push({
      id: "KINNAN_UNBOUNDED_NOT_SCALABLE_OUTLET",
      passed: !badUnboundedOutlet,
      detail: badUnboundedOutlet
        ? "UNBOUNDED_MANA incorrectly satisfies SCALABLE_MANA_OUTLET requirement"
        : "Unbounded/outlet role conflation absent",
    });
  }

  if (caseId === "single-aristocrats-teysa") {
    const bad = causal.some(
      (e) =>
        /creature tokens/i.test(e.support.producerText) &&
        /method for sacrificing|sacrificing creature tokens/i.test(e.support.consumerText),
    );
    assertions.push({
      id: "TEYSA_TOKEN_NOT_SACRIFICE_METHOD",
      passed: !bad,
      detail: bad ? "Creature tokens incorrectly satisfy sacrifice method/outlet" : "Token/sacrifice-method conflation absent",
    });
  }

  if (caseId === "multi-kenrith") {
    const bad = causal.some(
      (e) =>
        /prepared reanimation targets/i.test(e.support.producerText) &&
        /at least five mana per reanimation|plus red mana/i.test(e.support.consumerText),
    );
    assertions.push({
      id: "KENRITH_TARGET_NOT_MANA",
      passed: !bad,
      detail: bad ? "Prepared reanimation targets incorrectly satisfy mana requirement" : "Reanimation target/mana conflation absent",
    });
  }

  if (caseId === "single-graveyard-meren") {
    const bad = causal.some(
      (e) =>
        /creature cards in the graveyard/i.test(e.support.producerText) &&
        /mana appropriate to replay recovered creatures/i.test(e.support.consumerText),
    );
    assertions.push({
      id: "MEREN_GRAVEYARD_NOT_MANA",
      passed: !bad,
      detail: bad ? "Graveyard creature cards incorrectly satisfy replay mana requirement" : "Graveyard/mana conflation absent",
    });
  }

  if (caseId === "blindv5-29-static-restriction") {
    const badZone = causal.some(
      (e) =>
        /recovered creature card in hand or on the battlefield/i.test(e.support.producerText) &&
        /creature cards in the graveyard|multiple creature cards in the graveyard/i.test(e.support.consumerText),
    );
    assertions.push({
      id: "HUA_TUO_ZONE_NOT_GRAVEYARD",
      passed: !badZone,
      detail: badZone ? "Recovered creature incorrectly satisfies graveyard-zone requirement" : "Zone/state inversion absent",
    });
    const badMana = causal.some(
      (e) =>
        /recovered creatures|multiple recovered creatures ordered/i.test(e.support.producerText) &&
        /mana development sufficient to activate/i.test(e.support.consumerText),
    );
    assertions.push({
      id: "HUA_TUO_RECOVERED_NOT_MANA_DEVELOPMENT",
      passed: !badMana,
      detail: badMana ? "Recovered creature incorrectly satisfies mana development requirement" : "Recovered/mana conflation absent",
    });
    const badDestination = causal.some(
      (e) =>
        /additional topdeck-recursion activations|topdeck-recursion activations/i.test(e.support.producerText) &&
        /mix of recovery destinations|especially hand or battlefield/i.test(e.support.consumerText),
    );
    assertions.push({
      id: "HUA_TUO_TOPDECK_RECURSION_NOT_DESTINATION",
      passed: !badDestination,
      detail: badDestination
        ? "Topdeck recursion incorrectly satisfies alternative recovery destination"
        : "Topdeck/destination conflation absent",
    });
    const badWindow = causal.some(
      (e) =>
        /reliable recursion activation window|activation window/i.test(e.support.producerText) &&
        /creature-recovery effects that do not require|independent creature-recovery/i.test(e.support.consumerText),
    );
    assertions.push({
      id: "HUA_TUO_WINDOW_NOT_RECOVERY_EFFECT",
      passed: !badWindow,
      detail: badWindow ? "Activation window incorrectly satisfies independent recovery effect" : "Window/recovery conflation absent",
    });
  }

  if (caseId === "blindv5-59-tutor-toolbox") {
    const payoffCausal = causal.filter((e) => e.support.producerField === "payoffs");
    assertions.push({
      id: "TOOLBOX_NO_PAYOFF_CAUSAL",
      passed: payoffCausal.length === 0,
      detail:
        payoffCausal.length === 0
          ? "No payoff-field causal producers in blindv5-59"
          : `${payoffCausal.length} payoff causal edge(s) remain`,
    });
    const badCombat = causal.some(
      (e) =>
        /successful attacks/i.test(e.support.producerText) &&
        /combat step|legal attacks|profitable combat opportunity|available combat step/i.test(e.support.consumerText),
    );
    assertions.push({
      id: "TOOLBOX_SUCCESSFUL_ATTACKS_NOT_COMBAT_OPPORTUNITY",
      passed: !badCombat,
      detail: badCombat ? "Successful attacks incorrectly satisfy combat opportunity/access" : "Outcome/access conflation absent",
    });
  }

  if (caseId === "blindv5-19-narrow-single-engine") {
    const bad = causal.some(
      (e) =>
        /cards or card selection|card selection/i.test(e.support.producerText) &&
        /elves with repeatable activated tap abilities|elf.*tap abilities that generate cards/i.test(e.support.consumerText),
    );
    assertions.push({
      id: "DIONUS_CARD_SELECTION_NOT_ELF_TAP_SOURCE",
      passed: !bad,
      detail: bad ? "Card selection incorrectly satisfies Elf tap-ability source requirement" : "Selection/source conflation absent",
    });
  }

  if (caseId === "blindv5-42-resource-conversion") {
    const bad = causal.some(
      (e) =>
        /card selection/i.test(e.support.producerText) &&
        /flexible ways to turn increased hand size|hand-to-board conversion/i.test(e.support.consumerText),
    );
    assertions.push({
      id: "CYCLONUS_CARD_SELECTION_NOT_HAND_TO_BOARD_OUTLET",
      passed: !bad,
      detail: bad ? "Card selection incorrectly satisfies hand-to-board conversion outlet" : "Selection/outlet conflation absent",
    });
  }

  if (caseId === "blindv5-25-activated-engine") {
    const bad = hasEdge(
      "package-low-curve-enchantment-throughput",
      "package-experience-scaled-spirit-pressure",
      "REQUIRES_FROM",
    );
    assertions.push({
      id: "DAXOS_NO_SPELL_ACCESS_FROM_TOKEN",
      passed: !bad,
      detail: bad ? "Spirit token package incorrectly satisfies enchantment spell access" : "No false spell-access edge",
    });
  }

  if (caseId === "blindv5-50-enchantments") {
    const profileBridge = edges.some((e) => e.kind === "BRIDGE" && /<->/.test(String(e.resource)));
    assertions.push({
      id: "NO_PROFILE_TAG_BRIDGE",
      passed: !profileBridge,
      detail: profileBridge ? "Profile-tag BRIDGE edges detected" : "No profile-tag BRIDGE edges",
    });
  }

  return assertions;
}

export type PackageSynergyGraphV5 = {
  typedEdges: PackageSynergyTypedEdge[];
  dependsOnPackageIds: Map<string, Set<string>>;
  overlapsWithPackageIds: Map<string, Set<string>>;
  qa: SynergyGraphQA;
};

export function buildPackageSynergyGraphV5(caseId: string, packages: SemanticPackage[]): PackageSynergyGraphV5 {
  const dependsOnPackageIds = new Map<string, Set<string>>();
  const overlapsWithPackageIds = new Map<string, Set<string>>();
  for (const pkg of packages) {
    dependsOnPackageIds.set(pkg.packageId, new Set());
    overlapsWithPackageIds.set(pkg.packageId, new Set());
  }

  const causal = findCausalEdges(packages);
  const sharedEnablers = findSharedEnablerEdges(packages);
  const sharedPayoffs = findSharedPayoffEdges(packages);
  const redundant = findRedundantEdges(packages);
  const bridges = findBridgeEdges(packages, causal);

  const typedEdges = dedupeEdges([...causal, ...sharedEnablers, ...sharedPayoffs, ...redundant, ...bridges]);

  for (const edge of typedEdges) {
    if (edge.kind === "REQUIRES_FROM") {
      addDirected(dependsOnPackageIds, edge.fromPackageId, edge.toPackageId);
    }
    if (edge.kind === "SHARED_ENABLER" || edge.kind === "SHARED_PAYOFF" || edge.kind === "BRIDGE" || edge.kind === "REDUNDANT_WITH") {
      addSymmetric(overlapsWithPackageIds, edge.fromPackageId, edge.toPackageId);
    }
  }

  const n = packages.length;
  const possible = n <= 1 ? 0 : n * (n - 1);
  let dependsCount = 0;
  let reciprocal = 0;
  for (const [, deps] of dependsOnPackageIds) dependsCount += deps.size;
  for (const pkg of packages) {
    for (const bId of dependsOnPackageIds.get(pkg.packageId) ?? []) {
      if (dependsOnPackageIds.get(bId)?.has(pkg.packageId)) reciprocal++;
    }
  }
  reciprocal = possible > 0 ? reciprocal / 2 : 0;

  let overlapCount = 0;
  for (const [, ovs] of overlapsWithPackageIds) overlapCount += ovs.size;

  const dependsDensity = possible > 0 ? dependsCount / possible : 0;
  const overlapDensity = possible > 0 ? overlapCount / possible : 0;
  const reciprocalRate = dependsCount > 0 ? reciprocal / dependsCount : 0;

  const completeOverlapGraph = n > 1 && overlapDensity >= 0.999;
  const nearCompleteDependencyGraph =
    n > 1 && (dependsDensity >= 0.65 || (dependsDensity >= 0.45 && reciprocalRate >= 0.85));

  const semanticRegressions = runSemanticRegressions(caseId, packages, typedEdges);
  const blockingReasons: string[] = [];
  if (completeOverlapGraph) {
    blockingReasons.push("Complete overlap graph — every package overlaps every other package.");
  }
  if (nearCompleteDependencyGraph) {
    blockingReasons.push(
      `Near-complete dependency graph (density=${dependsDensity.toFixed(3)}, reciprocalRate=${reciprocalRate.toFixed(3)}).`,
    );
  }
  for (const reg of semanticRegressions) {
    if (!reg.passed) blockingReasons.push(`${reg.id}: ${reg.detail}`);
  }

  const qa: SynergyGraphQA = {
    version: PACKAGE_SYNERGY_GRAPH_V5_VERSION,
    ontologyVersion: CANONICAL_RESOURCE_ONTOLOGY_V3_VERSION,
    passed: blockingReasons.length === 0,
    packageCount: n,
    possibleDirectedNonSelfEdges: possible,
    dependsOnDirectedEdges: dependsCount,
    dependsOnDensity: dependsDensity,
    dependsOnReciprocalEdgeRate: reciprocalRate,
    overlapsDirectedEdges: overlapCount,
    overlapsDensity: overlapDensity,
    completeOverlapGraph,
    nearCompleteDependencyGraph,
    blockingReasons,
    semanticRegressions,
  };

  return { typedEdges, dependsOnPackageIds, overlapsWithPackageIds, qa };
}

export function enrichPackagesWithSynergyGraphV5(
  caseId: string,
  packages: SemanticPackage[],
): {
  packages: SemanticPackage[];
  typedEdges: PackageSynergyTypedEdge[];
  qa: SynergyGraphQA;
} {
  const clean = packages.map((p) => ({
    ...p,
    dependsOnPackageIds: [],
    overlapsWithPackageIds: [],
  }));
  const graph = buildPackageSynergyGraphV5(caseId, clean);
  const enriched = clean.map((pkg) => ({
    ...pkg,
    dependsOnPackageIds: [...(graph.dependsOnPackageIds.get(pkg.packageId) ?? [])].sort(),
    overlapsWithPackageIds: [...(graph.overlapsWithPackageIds.get(pkg.packageId) ?? [])].sort(),
  }));
  return { packages: enriched, typedEdges: graph.typedEdges, qa: graph.qa };
}
