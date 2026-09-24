/**
 * Deterministic three-lens portfolio selector v4.
 * Uses discriminative synergy graph v2, fixed pairwise equivalence metadata, fail-closed graph QA.
 */
import type { SemanticPackage } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type {
  PackagePortfolioPlan,
  ThreeLensObjective,
  ThreeLensPortfolioSelection,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import {
  buildPackageSynergyGraphV2,
  enrichPackagesWithSynergyGraphV2,
  type PackageSynergyTypedEdge,
  type SynergyGraphQA,
} from "./phase6a1-package-synergy-graph-v2";

export const THREE_LENS_PORTFOLIO_SELECTOR_V4_VERSION = "phase6a1-three-lens-portfolio-selector-v4";

export type PairwiseLensEquivalence = {
  lensA: ThreeLensObjective;
  lensB: ThreeLensObjective;
  selectedPackageIds: string[];
  objectiveEquivalentUpToScalar: boolean;
  disposition: "JUSTIFIED_CONVERGENCE" | "UNEXPLAINED_COLLAPSE";
  justification?: string;
};

export type ThreeLensPortfolioSelectionV4 = ThreeLensPortfolioSelection & {
  pairwiseEquivalences: PairwiseLensEquivalence[];
  enrichedPackages: SemanticPackage[];
  packageSynergyTypedEdges: PackageSynergyTypedEdge[];
  synergyGraphQA: SynergyGraphQA;
};

function depScore(p: SemanticPackage): number {
  if (p.commanderDependency === "HIGH") return 3;
  if (p.commanderDependency === "MEDIUM") return 2;
  return 1;
}

function indepScore(p: SemanticPackage): number {
  if (p.worksWithoutCommander === "HIGH") return 3;
  if (p.worksWithoutCommander === "MEDIUM") return 2;
  return 1;
}

function isPureIndependent(p: SemanticPackage): boolean {
  return p.worksWithoutCommander === "HIGH" && p.commanderDependency === "LOW";
}

function isPureDependent(p: SemanticPackage): boolean {
  return p.commanderDependency === "HIGH" && p.worksWithoutCommander === "LOW";
}

function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((id) => sa.has(id));
}

function weightsProportional(
  weightsA: Record<string, number>,
  weightsB: Record<string, number>,
  ids: string[],
): boolean {
  if (ids.length === 0) return true;
  const ratios: number[] = [];
  for (const id of ids) {
    const a = weightsA[id];
    const b = weightsB[id];
    if (a == null || b == null || a === 0 || b === 0) return false;
    ratios.push(b / a);
  }
  const first = ratios[0];
  return ratios.every((r) => Math.abs(r - first) < 1e-6);
}

function buildPlan(
  lens: ThreeLensObjective,
  selectedPackageIds: string[],
  packages: SemanticPackage[],
  rationale: string,
  weightFn: (pkg: SemanticPackage) => number,
): PackagePortfolioPlan {
  const weights: Record<string, number> = {};
  for (const id of selectedPackageIds) {
    const pkg = packages.find((p) => p.packageId === id);
    if (pkg) weights[id] = weightFn(pkg);
  }
  return { lens, selectedPackageIds, objectiveWeights: weights, rationale };
}

function selectDependentLens(packages: SemanticPackage[], maxPerLens: number): string[] {
  const pool = packages
    .filter((p) => p.commanderDependency === "HIGH" || p.commanderDependency === "MEDIUM")
    .filter((p) => !isPureIndependent(p));
  const source = pool.length > 0 ? pool : packages.filter((p) => !isPureIndependent(p));
  const finalPool = (source.length > 0 ? source : packages)
    .slice()
    .sort((a, b) => depScore(b) - depScore(a) || a.packageId.localeCompare(b.packageId));
  return finalPool.slice(0, Math.min(maxPerLens, finalPool.length)).map((p) => p.packageId);
}

function selectIndependentLens(packages: SemanticPackage[], maxPerLens: number): string[] {
  const pool = packages
    .filter((p) => p.worksWithoutCommander === "HIGH" || p.worksWithoutCommander === "MEDIUM")
    .filter((p) => !isPureDependent(p));
  const source = pool.length > 0 ? pool : packages.filter((p) => !isPureDependent(p));
  const finalPool = (source.length > 0 ? source : packages)
    .slice()
    .sort((a, b) => indepScore(b) - indepScore(a) || a.packageId.localeCompare(b.packageId));
  return finalPool.slice(0, Math.min(maxPerLens, finalPool.length)).map((p) => p.packageId);
}

function bridgeScore(
  pkg: SemanticPackage,
  typedEdges: PackageSynergyTypedEdge[],
  packages: SemanticPackage[],
): number {
  const bridgeEdges = typedEdges.filter(
    (e) =>
      (e.fromPackageId === pkg.packageId || e.toPackageId === pkg.packageId) &&
      (e.kind === "BRIDGE" || e.kind === "SHARED_ENABLER" || e.kind === "SHARED_PAYOFF"),
  );
  const dep = depScore(pkg);
  const indep = indepScore(pkg);
  let score = bridgeEdges.length * 5 + (dep >= 2 && indep >= 2 ? 4 : 0);
  score += pkg.overlapsWithPackageIds.length;
  score += pkg.dependsOnPackageIds.length * 0.5;
  const text = `${pkg.title} ${pkg.purpose}`.toLowerCase();
  if (/integrat|connect|bridge|both mechanisms|land.*artifact|artifact.*land/.test(text)) score += 6;
  if (packages.length > 1 && dep >= 2 && indep >= 2) score += 3;
  return score;
}

function crossPackageSynergy(ids: string[], typedEdges: PackageSynergyTypedEdge[]): number {
  let score = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      for (const edge of typedEdges) {
        const touches =
          (edge.fromPackageId === a && edge.toPackageId === b) ||
          (edge.fromPackageId === b && edge.toPackageId === a);
        if (!touches) continue;
        if (edge.kind === "BRIDGE") score += 8;
        else if (edge.kind === "SHARED_ENABLER" || edge.kind === "SHARED_PAYOFF") score += 5;
        else if (edge.kind === "REQUIRES_FROM" || edge.kind === "PRODUCES_FOR") score += 4;
        else if (edge.kind === "REDUNDANT_WITH") score -= 2;
      }
    }
  }
  return score;
}

function harmonyCompletenessJustified(
  ids: string[],
  packages: SemanticPackage[],
  typedEdges: PackageSynergyTypedEdge[],
): string | undefined {
  if (ids.length >= 2) return undefined;
  if (packages.length <= 1) {
    return "Only one validated package available — Harmony portfolio cannot diversify further.";
  }
  const pkg = packages.find((p) => p.packageId === ids[0]);
  if (!pkg) return undefined;
  if (bridgeScore(pkg, typedEdges, packages) >= 10) {
    return "Single-package Harmony justified: selected package explicitly bridges multiple engines.";
  }
  return undefined;
}

function selectHarmonyLens(
  packages: SemanticPackage[],
  maxPerLens: number,
  dependentIds: string[],
  independentIds: string[],
  typedEdges: PackageSynergyTypedEdge[],
): string[] {
  const depSet = new Set(dependentIds);
  const indepSet = new Set(independentIds);
  const bridgeCandidates = packages
    .slice()
    .sort(
      (a, b) =>
        bridgeScore(b, typedEdges, packages) - bridgeScore(a, typedEdges, packages) ||
        a.packageId.localeCompare(b.packageId),
    );

  const selected: string[] = [];
  const add = (id: string) => {
    if (!selected.includes(id) && selected.length < maxPerLens) selected.push(id);
  };

  for (const pkg of bridgeCandidates) {
    if (bridgeScore(pkg, typedEdges, packages) >= 6) add(pkg.packageId);
    if (selected.length >= Math.min(2, maxPerLens)) break;
  }

  if (selected.length === 0) {
    for (const pkg of packages.filter((p) => depSet.has(p.packageId) !== indepSet.has(p.packageId))) {
      add(pkg.packageId);
      if (selected.length >= maxPerLens) break;
    }
  }

  const ranked = packages.slice().sort((a, b) => {
    const scoreA = crossPackageSynergy([...selected, a.packageId], typedEdges) + bridgeScore(a, typedEdges, packages);
    const scoreB = crossPackageSynergy([...selected, b.packageId], typedEdges) + bridgeScore(b, typedEdges, packages);
    return scoreB - scoreA || a.packageId.localeCompare(b.packageId);
  });

  for (const pkg of ranked) {
    if (selected.length >= maxPerLens) break;
    add(pkg.packageId);
  }

  if (selected.length < 2 && packages.length >= 2) {
    for (const pkg of bridgeCandidates) {
      add(pkg.packageId);
      if (selected.length >= 2) break;
    }
  }

  return selected.slice(0, maxPerLens);
}

function diversifyHarmonyIfEquivalent(
  harmonyIds: string[],
  otherIds: string[],
  packages: SemanticPackage[],
  typedEdges: PackageSynergyTypedEdge[],
  maxPerLens: number,
): string[] {
  if (!setEqual(harmonyIds, otherIds)) return harmonyIds;

  const excluded = new Set(otherIds);
  const alternatives = packages
    .filter((p) => !excluded.has(p.packageId))
    .slice()
    .sort(
      (a, b) =>
        bridgeScore(b, typedEdges, packages) - bridgeScore(a, typedEdges, packages) ||
        a.packageId.localeCompare(b.packageId),
    );

  if (alternatives.length === 0) return harmonyIds;

  const next: string[] = [];
  const altQueue = [...alternatives];
  for (const alt of altQueue) {
    if (next.length >= maxPerLens) break;
    next.push(alt.packageId);
  }
  for (const id of otherIds) {
    if (next.length >= maxPerLens) break;
    if (!next.includes(id)) next.push(id);
  }

  if (setEqual(next.slice(0, maxPerLens), otherIds)) {
    const forced = [...otherIds];
    if (alternatives[0]) {
      forced[forced.length - 1] = alternatives[0].packageId;
    }
    return forced.slice(0, maxPerLens);
  }

  return next.slice(0, maxPerLens);
}

function computeShared(dependentIds: string[], independentIds: string[], harmonyIds: string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of [...dependentIds, ...independentIds, ...harmonyIds]) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
}

function justifyFullConvergence(packages: SemanticPackage[]): string {
  if (packages.length <= 1) {
    return "Only one validated package available — all lenses must select the same portfolio.";
  }
  if (packages.every((p) => depScore(p) >= 2 && indepScore(p) >= 2)) {
    return "All validated packages score MEDIUM+ on both commander dependence and independence — no lens-exclusive candidates remain.";
  }
  return "Validated package universe is too small or uniformly balanced for lens-exclusive portfolios.";
}

function analyzePairwiseEquivalences(input: {
  dependent: PackagePortfolioPlan;
  independent: PackagePortfolioPlan;
  harmony: PackagePortfolioPlan;
  packages: SemanticPackage[];
}): PairwiseLensEquivalence[] {
  const pairs: Array<[ThreeLensObjective, ThreeLensObjective, PackagePortfolioPlan, PackagePortfolioPlan]> = [
    ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", input.dependent, input.independent],
    ["DEPENDENT_SYNERGY", "HARMONY", input.dependent, input.harmony],
    ["INDEPENDENT_SYNERGY", "HARMONY", input.independent, input.harmony],
  ];

  const out: PairwiseLensEquivalence[] = [];
  for (const [lensA, lensB, planA, planB] of pairs) {
    const sameSet = setEqual(planA.selectedPackageIds, planB.selectedPackageIds);
    if (!sameSet) continue;

    const proportional = weightsProportional(planA.objectiveWeights, planB.objectiveWeights, planA.selectedPackageIds);
    let disposition: PairwiseLensEquivalence["disposition"] = "UNEXPLAINED_COLLAPSE";
    let justification: string | undefined;

    if (input.packages.length <= 1) {
      disposition = "JUSTIFIED_CONVERGENCE";
      justification = justifyFullConvergence(input.packages);
    } else if (proportional) {
      disposition = "JUSTIFIED_CONVERGENCE";
      justification = justifyFullConvergence(input.packages);
    }

    out.push({
      lensA,
      lensB,
      selectedPackageIds: planA.selectedPackageIds,
      objectiveEquivalentUpToScalar: proportional,
      disposition,
      justification,
    });
  }
  return out;
}

function deriveConvergenceMode(input: {
  dependentIds: string[];
  independentIds: string[];
  harmonyIds: string[];
  packages: SemanticPackage[];
  pairwiseEquivalences: PairwiseLensEquivalence[];
  unexplainedPairwise: boolean;
}): { mode: ThreeLensPortfolioSelection["convergenceMode"]; justification?: string } {
  const allSame =
    setEqual(input.dependentIds, input.independentIds) &&
    setEqual(input.independentIds, input.harmonyIds) &&
    input.packages.length > 1;

  const justifiedPairs = input.pairwiseEquivalences.filter((p) => p.disposition === "JUSTIFIED_CONVERGENCE");
  const legitimateConvergence =
    input.packages.length <= 1 ||
    input.packages.every((p) => depScore(p) >= 2 && indepScore(p) >= 2) ||
    new Set(input.packages.map((p) => `${depScore(p)}:${indepScore(p)}`)).size === 1;

  if (input.unexplainedPairwise) {
    return { mode: "DIFFERENTIATED" };
  }

  if (allSame && legitimateConvergence && justifiedPairs.length >= 3) {
    return { mode: "TRUE_CONVERGENCE", justification: justifyFullConvergence(input.packages) };
  }

  if (justifiedPairs.length > 0) {
    const pairLabels = justifiedPairs.map((p) => `${p.lensA}<->${p.lensB}`).join(", ");
    return {
      mode: "TRUE_CONVERGENCE",
      justification: `Pairwise convergence (${pairLabels}): ${justifiedPairs[0]?.justification ?? justifyFullConvergence(input.packages)}`,
    };
  }

  return { mode: "DIFFERENTIATED" };
}

export function selectThreeLensPortfoliosV4(
  caseId: string,
  rawPackages: SemanticPackage[],
  maxPerLens = 4,
): ThreeLensPortfolioSelectionV4 {
  const { packages, typedEdges, qa } = enrichPackagesWithSynergyGraphV2(rawPackages);
  const graph = buildPackageSynergyGraphV2(
    rawPackages.map((p) => ({ ...p, dependsOnPackageIds: [], overlapsWithPackageIds: [] })),
  );

  if (packages.length === 0) {
    const empty = (lens: ThreeLensObjective): PackagePortfolioPlan => ({
      lens,
      selectedPackageIds: [],
      objectiveWeights: {},
      rationale: "No validated packages available.",
    });
    return {
      caseId,
      availablePackageIds: [],
      dependent: empty("DEPENDENT_SYNERGY"),
      independent: empty("INDEPENDENT_SYNERGY"),
      harmony: empty("HARMONY"),
      sharedPackageIds: [],
      convergenceMode: "DIFFERENTIATED",
      pairwiseEquivalences: [],
      enrichedPackages: [],
      packageSynergyTypedEdges: [],
      synergyGraphQA: qa,
    };
  }

  const dependentIds = selectDependentLens(packages, maxPerLens);
  const independentIds = selectIndependentLens(packages, maxPerLens);
  let harmonyIds = selectHarmonyLens(packages, maxPerLens, dependentIds, independentIds, typedEdges);

  harmonyIds = diversifyHarmonyIfEquivalent(harmonyIds, independentIds, packages, typedEdges, maxPerLens);
  harmonyIds = diversifyHarmonyIfEquivalent(harmonyIds, dependentIds, packages, typedEdges, maxPerLens);

  const dependentPlan = buildPlan(
    "DEPENDENT_SYNERGY",
    dependentIds,
    packages,
    "Include commander-linked packages (HIGH/MEDIUM commanderDependency); exclude pure-independent packages when alternatives exist.",
    depScore,
  );
  const independentPlan = buildPlan(
    "INDEPENDENT_SYNERGY",
    independentIds,
    packages,
    "Include commander-independent packages (HIGH/MEDIUM worksWithoutCommander); exclude pure-dependent packages when alternatives exist.",
    indepScore,
  );

  const harmonyJustification = harmonyCompletenessJustified(harmonyIds, packages, typedEdges);
  const harmonyPlan = buildPlan(
    "HARMONY",
    harmonyIds,
    packages,
    harmonyJustification
      ? `Cross-engine reinforcement portfolio: ${harmonyJustification}`
      : "Include bridge/cross-package packages that connect commander-linked and independent engines via typed synergy edges.",
    (pkg) => bridgeScore(pkg, typedEdges, packages) + crossPackageSynergy(harmonyIds, typedEdges),
  );

  const shared = computeShared(dependentIds, independentIds, harmonyIds);
  const pairwiseEquivalences = analyzePairwiseEquivalences({
    dependent: dependentPlan,
    independent: independentPlan,
    harmony: harmonyPlan,
    packages,
  });

  const unexplainedPairwise = pairwiseEquivalences.some((p) => p.disposition === "UNEXPLAINED_COLLAPSE");
  const convergence = deriveConvergenceMode({
    dependentIds,
    independentIds,
    harmonyIds,
    packages,
    pairwiseEquivalences,
    unexplainedPairwise,
  });

  return {
    caseId,
    availablePackageIds: packages.map((p) => p.packageId),
    dependent: dependentPlan,
    independent: independentPlan,
    harmony: harmonyPlan,
    sharedPackageIds: shared,
    convergenceMode: convergence.mode,
    convergenceJustification: convergence.justification,
    pairwiseEquivalences,
    enrichedPackages: packages,
    packageSynergyTypedEdges: typedEdges,
    synergyGraphQA: graph.qa,
  };
}

export function hasUnexplainedThreeLensCollapseV4(selection: ThreeLensPortfolioSelectionV4): boolean {
  if (selection.availablePackageIds.length === 0) return false;
  if (!selection.synergyGraphQA.passed) return true;
  if (selection.pairwiseEquivalences.some((p) => p.disposition === "UNEXPLAINED_COLLAPSE")) return true;

  const dep = selection.dependent.selectedPackageIds;
  const indep = selection.independent.selectedPackageIds;
  const harm = selection.harmony.selectedPackageIds;
  const collapsed = setEqual(dep, indep) && setEqual(indep, harm);
  if (!collapsed) return false;
  return selection.convergenceMode !== "TRUE_CONVERGENCE";
}
