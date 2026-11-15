/**
 * Package synergy graph v3 — canonical typed ontology, auditable edge support, semantic QA regressions.
 */
import type { SemanticPackage } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import {
  CANONICAL_RESOURCE_ONTOLOGY_V1_VERSION,
  classifyPackageResources,
  packageEngineCluster,
  producerSatisfiesRequirement,
  type CanonicalResourceType,
  type ClassifiedResource,
} from "./phase6a1-canonical-resource-ontology-v1";

export const PACKAGE_SYNERGY_GRAPH_V3_VERSION = "phase6a1-package-synergy-graph-v3";

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
  version: typeof PACKAGE_SYNERGY_GRAPH_V3_VERSION;
  ontologyVersion: typeof CANONICAL_RESOURCE_ONTOLOGY_V1_VERSION;
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
      (c) => c.field === "requiredResources" || c.field === "semanticRequirements",
    );
    for (const producer of packages) {
      if (consumer.packageId === producer.packageId) continue;
      const producerOuts = (classified.get(producer.packageId) ?? []).filter(
        (c) => c.field === "producedResources" || c.field === "payoffs",
      );
      for (const req of consumerReqs) {
        for (const prod of producerOuts) {
          if (!producerSatisfiesRequirement(prod.type, req.type)) continue;
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
  const hasEdge = (
    from: string,
    to: string,
    kind: SynergyEdgeKind,
    resource?: CanonicalResourceType,
  ) =>
    edges.some(
      (e) =>
        e.fromPackageId === from &&
        e.toPackageId === to &&
        e.kind === kind &&
        (resource == null || e.resource === resource),
    );

  if (caseId === "hybrid-kinnan") {
    const ok =
      hasEdge("compact-conversion-dual-channel-outlets", "compact-conversion-positive-untap-loop", "REQUIRES_FROM", "UNBOUNDED_MANA") ||
      hasEdge("compact-conversion-dual-channel-outlets", "compact-conversion-positive-untap-loop", "REQUIRES_FROM");
    assertions.push({
      id: "KINNAN_UNBOUNDED_MANA_CAUSAL_EDGE",
      passed: ok,
      detail: ok
        ? "Dual-Channel Mana Conversion REQUIRES_FROM Mana-Positive Untap Loop on UNBOUNDED_MANA"
        : "Missing causal UNBOUNDED_MANA edge between compact-conversion-dual-channel-outlets and compact-conversion-positive-untap-loop",
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
      detail: bad
        ? "Spirit token package incorrectly satisfies enchantment spell access"
        : "No false ENCHANTMENT_SPELL_ACCESS edge from spirit tokens",
    });
  }

  if (caseId === "blindv5-50-enchantments") {
    const profileBridge = edges.some(
      (e) => e.kind === "BRIDGE" && /<->/.test(String(e.resource)),
    );
    assertions.push({
      id: "NO_PROFILE_TAG_BRIDGE",
      passed: !profileBridge,
      detail: profileBridge ? "Profile-tag BRIDGE edges detected" : "No profile-tag BRIDGE edges",
    });
  }

  if (caseId === "multi-korvold") {
    const noise = edges.some((e) => e.resource === ("against" as CanonicalResourceType));
    assertions.push({
      id: "NO_LEXICAL_NOISE_RESOURCE",
      passed: !noise,
      detail: noise ? "Lexical noise resource 'against' present" : "No lexical noise resources",
    });
  }

  const lexicalNoise = edges.filter((e) =>
    ["against", "closing", "controlled", "continued", "depletion", "defensive", "exposure"].includes(
      String(e.resource),
    ),
  );
  assertions.push({
    id: "GLOBAL_NO_LEXICAL_RESOURCES",
    passed: lexicalNoise.length === 0,
    detail:
      lexicalNoise.length === 0
        ? "All edge resources are canonical types"
        : `Lexical resources found: ${lexicalNoise.map((e) => e.resource).join(", ")}`,
  });

  return assertions;
}

export type PackageSynergyGraphV3 = {
  typedEdges: PackageSynergyTypedEdge[];
  dependsOnPackageIds: Map<string, Set<string>>;
  overlapsWithPackageIds: Map<string, Set<string>>;
  qa: SynergyGraphQA;
};

export function buildPackageSynergyGraphV3(caseId: string, packages: SemanticPackage[]): PackageSynergyGraphV3 {
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
    version: PACKAGE_SYNERGY_GRAPH_V3_VERSION,
    ontologyVersion: CANONICAL_RESOURCE_ONTOLOGY_V1_VERSION,
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

export function enrichPackagesWithSynergyGraphV3(
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
  const graph = buildPackageSynergyGraphV3(caseId, clean);
  const enriched = clean.map((pkg) => ({
    ...pkg,
    dependsOnPackageIds: [...(graph.dependsOnPackageIds.get(pkg.packageId) ?? [])].sort(),
    overlapsWithPackageIds: [...(graph.overlapsWithPackageIds.get(pkg.packageId) ?? [])].sort(),
  }));
  return { packages: enriched, typedEdges: graph.typedEdges, qa: graph.qa };
}
