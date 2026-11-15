/**
 * Discriminative package synergy graph v2 — typed, auditable edges with fail-closed QA.
 */
import type { SemanticPackage } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";

export const PACKAGE_SYNERGY_GRAPH_V2_VERSION = "phase6a1-package-synergy-graph-v2";

export type SynergyEdgeKind =
  | "REQUIRES_FROM"
  | "PRODUCES_FOR"
  | "SHARED_ENABLER"
  | "SHARED_PAYOFF"
  | "BRIDGE"
  | "REDUNDANT_WITH";

export type PackageSynergyTypedEdge = {
  fromPackageId: string;
  toPackageId: string;
  kind: SynergyEdgeKind;
  reason: string;
  resource: string;
  directed: boolean;
};

export type SynergyGraphQA = {
  version: typeof PACKAGE_SYNERGY_GRAPH_V2_VERSION;
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
  explicitJustification?: string;
};

const GENERIC_TERMS = new Set([
  "a", "an", "the", "and", "or", "to", "for", "with", "from", "into", "that", "this", "when",
  "while", "through", "other", "more", "each", "both", "can", "may", "use", "uses", "using",
  "mana", "card", "cards", "creature", "creatures", "permanent", "permanents", "battlefield",
  "protection", "interaction", "value", "resources", "resource", "effect", "effects", "legal",
  "ready", "access", "capacity", "development", "deployment", "additional", "improved",
  "consistent", "reliable", "successful", "sustained", "reduced", "potential", "normal",
  "functional", "context", "situational", "timely", "selective", "multiple", "repeatable",
  "flexible", "ability", "abilities", "package", "commander", "zone", "zones", "step",
  "turn", "turns", "hand", "library", "board", "base", "outlet", "outlets", "target",
  "targets", "bodies", "body", "presence", "pressure", "flow", "quality", "answer",
  "answers", "engine", "engines", "threat", "threats", "cost", "costs", "window",
  "windows", "path", "paths", "process", "setup", "support", "source", "sources",
  "output", "inputs", "input", "condition", "conditions", "event", "events",
  "conversion", "converted", "recover", "recovery", "rebuild", "refuel", "draw",
  "selection", "selected", "chosen", "chosen", "future", "current", "during", "after",
  "before", "without", "within", "over", "under", "into", "onto", "upon",
]);

const CAUSAL_MECHANISM_TERMS = new Set([
  "graveyard", "topdeck", "top-card", "recursion", "untap", "sacrifice", "discard",
  "self-mill", "mill", "power-4", "power-4-plus", "attack-trigger", "attack-triggers",
  "combat-damage", "ninjutsu", "lifelink", "tutor", "toolbox", "token", "tokens",
  "amplifier", "creature-token", "token-entry", "token-output", "counter", "counters",
  "exile", "cast", "spell", "spells", "landfall", "etb", "dies", "death", "aristocrats",
  "proliferate", "draw-engine", "blink", "copy", "clone", "transform", "transforms",
  "voltron", "equipment", "aura", "enchantment", "artifact", "artifacts", "treasure",
  "food", "clue", "investigate", "treasures", "produces", "creates",
  "scry", "surveil", "explore", "connive", "connives", "conniving",
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractSpecificTerms(text: string): Set<string> {
  const terms = new Set<string>();
  const normalized = normalize(text);

  for (const match of normalized.matchAll(/[a-z0-9]+(?:-[a-z0-9]+)+/g)) {
    const t = match[0];
    if (!GENERIC_TERMS.has(t)) terms.add(t);
  }

  for (const raw of normalized.split(/[^a-z0-9-]+/)) {
    const t = raw.trim();
    if (t.length < 4 || GENERIC_TERMS.has(t)) continue;
    if (CAUSAL_MECHANISM_TERMS.has(t) || t.length >= 6) terms.add(t);
  }

  return terms;
}

function sharedSpecificTerms(a: string, b: string): string[] {
  const ta = extractSpecificTerms(a);
  const tb = extractSpecificTerms(b);
  return [...ta].filter((t) => tb.has(t)).sort();
}

function hasCausalMechanism(terms: string[]): boolean {
  return terms.some((t) => CAUSAL_MECHANISM_TERMS.has(t) || t.includes("-"));
}

function opportunityIds(pkg: SemanticPackage): Set<string> {
  const ids = new Set<string>();
  for (const slot of pkg.semanticRequirements) {
    for (const id of slot.satisfiesOpportunityIds ?? []) ids.add(id);
  }
  return ids;
}

function engineProfile(pkg: SemanticPackage): Set<string> {
  const text = normalize(
    [pkg.title, pkg.purpose, ...pkg.causalChain, pkg.commanderContribution, pkg.commanderIndependentFunction].join(" "),
  );
  const engines = new Set<string>();
  if (/\bgraveyard\b|\brecur|\btopdeck|\btop-card/.test(text)) engines.add("graveyard");
  if (/\btoken\b|\bfood\b|\btreasure/.test(text)) engines.add("tokens");
  if (/\bartifact\b|\bequipment/.test(text)) engines.add("artifacts");
  if (/\bcombat\b|\battack\b|\bdamage\b/.test(text)) engines.add("combat");
  if (/\btutor\b|\btoolbox\b|\bsearch\b/.test(text)) engines.add("tutor");
  if (/\bland\b|\blandfall/.test(text)) engines.add("lands");
  if (/\bcounter\b|\bprolifer/.test(text)) engines.add("counters");
  if (/\bdraw\b|\bcard flow/.test(text)) engines.add("draw");
  return engines;
}

function requiresFrom(produced: string, required: string): { ok: boolean; resource: string; reason: string } {
  const shared = sharedSpecificTerms(produced, required);
  if (shared.length === 0 || !hasCausalMechanism(shared)) {
    return { ok: false, resource: "", reason: "" };
  }

  const prodNorm = normalize(produced);
  const reqNorm = normalize(required);
  const prodProvides =
    /\b(produc|creat|generat|supply|provid|recover|return|put|gain|enable|establish|maintain|preserv)/.test(prodNorm);
  const reqNeeds =
    /\b(requir|need|must|legal|target|access|outlet|amplifier|conversion|setup|feedstock|presence)/.test(reqNorm) ||
    reqNorm.includes("for ");

  if (!prodProvides || !reqNeeds) {
    return { ok: false, resource: "", reason: "" };
  }

  const resource = shared[0];
  return {
    ok: true,
    resource,
    reason: `B produces '${resource}' required by A's causal chain`,
  };
}

function payoffOverlap(a: SemanticPackage, b: SemanticPackage): { ok: boolean; resource: string; reason: string } {
  let best: string[] = [];
  for (const pa of a.payoffs) {
    for (const pb of b.payoffs) {
      const shared = sharedSpecificTerms(pa, pb);
      if (shared.length >= 2 && hasCausalMechanism(shared)) {
        if (shared.length > best.length) best = shared;
      }
    }
  }
  if (best.length < 2) return { ok: false, resource: "", reason: "" };
  return {
    ok: true,
    resource: best[0],
    reason: `Shared payoff mechanism: ${best.join(", ")}`,
  };
}

function enablerOverlap(a: SemanticPackage, b: SemanticPackage): { ok: boolean; resource: string; reason: string } {
  let best: string[] = [];
  for (const ra of a.requiredResources) {
    for (const rb of b.requiredResources) {
      const shared = sharedSpecificTerms(ra, rb);
      if (shared.length >= 2 && hasCausalMechanism(shared)) {
        if (shared.length > best.length) best = shared;
      }
    }
  }
  if (best.length < 2) return { ok: false, resource: "", reason: "" };
  return {
    ok: true,
    resource: best[0],
    reason: `Shared enabler requirement: ${best.join(", ")}`,
  };
}

function redundantOverlap(a: SemanticPackage, b: SemanticPackage): { ok: boolean; resource: string; reason: string } {
  const corpusA = [...a.producedResources, ...a.payoffs].join(" ");
  const corpusB = [...b.producedResources, ...b.payoffs].join(" ");
  const shared = sharedSpecificTerms(corpusA, corpusB);
  if (shared.length < 3 || !hasCausalMechanism(shared)) {
    return { ok: false, resource: "", reason: "" };
  }
  return {
    ok: true,
    resource: shared[0],
    reason: `Redundant payoff/output overlap: ${shared.slice(0, 3).join(", ")}`,
  };
}

function bridgeRelation(a: SemanticPackage, b: SemanticPackage): { ok: boolean; resource: string; reason: string } {
  const enginesA = engineProfile(a);
  const enginesB = engineProfile(b);
  if (enginesA.size === 0 || enginesB.size === 0) return { ok: false, resource: "", reason: "" };

  const sharedEngines = [...enginesA].filter((e) => enginesB.has(e));
  if (sharedEngines.length > 0) return { ok: false, resource: "", reason: "" };

  const depA = a.commanderDependency === "HIGH" || a.commanderDependency === "MEDIUM";
  const indepA = a.worksWithoutCommander === "HIGH" || a.worksWithoutCommander === "MEDIUM";
  const depB = b.commanderDependency === "HIGH" || b.commanderDependency === "MEDIUM";
  const indepB = b.worksWithoutCommander === "HIGH" || b.worksWithoutCommander === "MEDIUM";

  const aBridges = depA && indepA;
  const bBridges = depB && indepB;
  const crossEngine =
    (depA && indepB) ||
    (indepA && depB) ||
    aBridges ||
    bBridges ||
    /bridge|integrat|connect|both mechanisms|land.*artifact|artifact.*land/.test(
      normalize(`${a.title} ${a.purpose} ${b.title} ${b.purpose}`),
    );

  if (!crossEngine) return { ok: false, resource: "", reason: "" };

  const resource = `${[...enginesA].sort().join("+")}<->${[...enginesB].sort().join("+")}`;
  return {
    ok: true,
    resource,
    reason: `Cross-engine bridge between ${resource}`,
  };
}

function opportunityOverlap(a: SemanticPackage, b: SemanticPackage): { ok: boolean; resource: string; reason: string } {
  const shared = [...opportunityIds(a)].filter((id) => opportunityIds(b).has(id));
  if (shared.length === 0) return { ok: false, resource: "", reason: "" };
  return {
    ok: true,
    resource: shared[0],
    reason: `Shared semantic opportunity: ${shared.join(", ")}`,
  };
}

export type PackageSynergyGraphV2 = {
  typedEdges: PackageSynergyTypedEdge[];
  dependsOnPackageIds: Map<string, Set<string>>;
  overlapsWithPackageIds: Map<string, Set<string>>;
  qa: SynergyGraphQA;
};

function addDirected(
  map: Map<string, Set<string>>,
  from: string,
  to: string,
): void {
  if (from === to) return;
  if (!map.has(from)) map.set(from, new Set());
  map.get(from)!.add(to);
}

function addSymmetric(
  map: Map<string, Set<string>>,
  a: string,
  b: string,
): void {
  addDirected(map, a, b);
  addDirected(map, b, a);
}

export function buildPackageSynergyGraphV2(packages: SemanticPackage[]): PackageSynergyGraphV2 {
  const typedEdges: PackageSynergyTypedEdge[] = [];
  const dependsOnPackageIds = new Map<string, Set<string>>();
  const overlapsWithPackageIds = new Map<string, Set<string>>();

  for (const pkg of packages) {
    dependsOnPackageIds.set(pkg.packageId, new Set());
    overlapsWithPackageIds.set(pkg.packageId, new Set());
  }

  for (let i = 0; i < packages.length; i++) {
    for (let j = i + 1; j < packages.length; j++) {
      const a = packages[i];
      const b = packages[j];

      let aRequiresB = false;
      for (const req of a.requiredResources) {
        for (const prod of b.producedResources) {
          const match = requiresFrom(prod, req);
          if (!match.ok) continue;
          typedEdges.push({
            fromPackageId: a.packageId,
            toPackageId: b.packageId,
            kind: "REQUIRES_FROM",
            reason: match.reason,
            resource: match.resource,
            directed: true,
          });
          typedEdges.push({
            fromPackageId: b.packageId,
            toPackageId: a.packageId,
            kind: "PRODUCES_FOR",
            reason: match.reason,
            resource: match.resource,
            directed: true,
          });
          addDirected(dependsOnPackageIds, a.packageId, b.packageId);
          aRequiresB = true;
        }
      }

      let bRequiresA = false;
      for (const req of b.requiredResources) {
        for (const prod of a.producedResources) {
          const match = requiresFrom(prod, req);
          if (!match.ok) continue;
          typedEdges.push({
            fromPackageId: b.packageId,
            toPackageId: a.packageId,
            kind: "REQUIRES_FROM",
            reason: match.reason,
            resource: match.resource,
            directed: true,
          });
          typedEdges.push({
            fromPackageId: a.packageId,
            toPackageId: b.packageId,
            kind: "PRODUCES_FOR",
            reason: match.reason,
            resource: match.resource,
            directed: true,
          });
          addDirected(dependsOnPackageIds, b.packageId, a.packageId);
          bRequiresA = true;
        }
      }

      const opp = opportunityOverlap(a, b);
      if (opp.ok) {
        typedEdges.push({
          fromPackageId: a.packageId,
          toPackageId: b.packageId,
          kind: "SHARED_ENABLER",
          reason: opp.reason,
          resource: opp.resource,
          directed: false,
        });
        addSymmetric(overlapsWithPackageIds, a.packageId, b.packageId);
      }

      const enabler = enablerOverlap(a, b);
      if (enabler.ok) {
        typedEdges.push({
          fromPackageId: a.packageId,
          toPackageId: b.packageId,
          kind: "SHARED_ENABLER",
          reason: enabler.reason,
          resource: enabler.resource,
          directed: false,
        });
        addSymmetric(overlapsWithPackageIds, a.packageId, b.packageId);
      }

      const payoff = payoffOverlap(a, b);
      if (payoff.ok) {
        typedEdges.push({
          fromPackageId: a.packageId,
          toPackageId: b.packageId,
          kind: "SHARED_PAYOFF",
          reason: payoff.reason,
          resource: payoff.resource,
          directed: false,
        });
        addSymmetric(overlapsWithPackageIds, a.packageId, b.packageId);
      }

      const bridge = bridgeRelation(a, b);
      if (bridge.ok) {
        typedEdges.push({
          fromPackageId: a.packageId,
          toPackageId: b.packageId,
          kind: "BRIDGE",
          reason: bridge.reason,
          resource: bridge.resource,
          directed: false,
        });
        addSymmetric(overlapsWithPackageIds, a.packageId, b.packageId);
      }

      const redundant = redundantOverlap(a, b);
      if (redundant.ok) {
        typedEdges.push({
          fromPackageId: a.packageId,
          toPackageId: b.packageId,
          kind: "REDUNDANT_WITH",
          reason: redundant.reason,
          resource: redundant.resource,
          directed: false,
        });
        addSymmetric(overlapsWithPackageIds, a.packageId, b.packageId);
      }

      void aRequiresB;
      void bRequiresA;
    }
  }

  const n = packages.length;
  const possible = n <= 1 ? 0 : n * (n - 1);
  let dependsCount = 0;
  let reciprocal = 0;
  for (const [, deps] of dependsOnPackageIds) dependsCount += deps.size;
  for (const a of packages) {
    for (const bId of dependsOnPackageIds.get(a.packageId) ?? []) {
      if (dependsOnPackageIds.get(bId)?.has(a.packageId)) reciprocal++;
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

  const blockingReasons: string[] = [];
  if (completeOverlapGraph) {
    blockingReasons.push("Complete overlap graph — every package overlaps every other package.");
  }
  if (nearCompleteDependencyGraph) {
    blockingReasons.push(
      `Near-complete dependency graph (density=${dependsDensity.toFixed(3)}, reciprocalRate=${reciprocalRate.toFixed(3)}).`,
    );
  }

  const qa: SynergyGraphQA = {
    version: PACKAGE_SYNERGY_GRAPH_V2_VERSION,
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
  };

  return { typedEdges, dependsOnPackageIds, overlapsWithPackageIds, qa };
}

export function enrichPackagesWithSynergyGraphV2(packages: SemanticPackage[]): {
  packages: SemanticPackage[];
  typedEdges: PackageSynergyTypedEdge[];
  qa: SynergyGraphQA;
} {
  const clean = packages.map((p) => ({
    ...p,
    dependsOnPackageIds: [],
    overlapsWithPackageIds: [],
  }));
  const graph = buildPackageSynergyGraphV2(clean);
  const enriched = clean.map((pkg) => ({
    ...pkg,
    dependsOnPackageIds: [...(graph.dependsOnPackageIds.get(pkg.packageId) ?? [])].sort(),
    overlapsWithPackageIds: [...(graph.overlapsWithPackageIds.get(pkg.packageId) ?? [])].sort(),
  }));
  return { packages: enriched, typedEdges: graph.typedEdges, qa: graph.qa };
}
