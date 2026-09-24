/**
 * Deterministic three-lens portfolio selector v5.
 * Evidence-backed Harmony; no forced differentiation; canonical graph v8 + ontology v6.
 */
import type { SemanticPackage } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type {
  PackagePortfolioPlan,
  ThreeLensObjective,
  ThreeLensPortfolioSelection,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import {
  aggregateSemanticEdgesForHarmony,
  enrichPackagesWithSynergyGraphV8,
  type PackageSynergyTypedEdge,
  type SynergyGraphQA,
} from "./phase6a1-package-synergy-graph-v8";

export const THREE_LENS_PORTFOLIO_SELECTOR_V5_VERSION = "phase6a1-three-lens-portfolio-selector-v5";

export type HarmonyDetermination = "DIFFERENTIATED" | "JUSTIFIED_CONVERGENCE" | "HARMONY_UNDERDETERMINED";

export type PairwiseLensEquivalence = {
  lensA: ThreeLensObjective;
  lensB: ThreeLensObjective;
  selectedPackageIds: string[];
  objectiveEquivalentUpToScalar: boolean;
  disposition: "JUSTIFIED_CONVERGENCE" | "UNEXPLAINED_COLLAPSE";
  justification?: string;
};

export type ThreeLensPortfolioSelectionV5 = ThreeLensPortfolioSelection & {
  harmonyDetermination: HarmonyDetermination;
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
  const source = pool.length > 0 ? pool : packages.filter((p) => !isPureDependent(p));
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

function portfolioInternalEdges(ids: string[], edges: PackageSynergyTypedEdge[]): PackageSynergyTypedEdge[] {
  const set = new Set(ids);
  return edges.filter((e) => set.has(e.fromPackageId) && set.has(e.toPackageId));
}

function packageHarmonyWeight(
  pkgId: string,
  portfolioIds: string[],
  edges: PackageSynergyTypedEdge[],
): number {
  const set = new Set(portfolioIds);
  if (!set.has(pkgId)) return 0;
  let score = 0;
  for (const e of edges) {
    if (!set.has(e.fromPackageId) || !set.has(e.toPackageId)) continue;
    if (e.fromPackageId !== pkgId && e.toPackageId !== pkgId) continue;
    if (e.kind === "BRIDGE") score += 8;
    else if (e.kind === "REQUIRES_FROM" || e.kind === "PRODUCES_FOR") score += 6;
    else if (e.kind === "SHARED_ENABLER" || e.kind === "SHARED_PAYOFF") score += 4;
    else if (e.kind === "REDUNDANT_WITH") score -= 2;
  }
  return score;
}

function typedTouchCount(pkgId: string, edges: PackageSynergyTypedEdge[]): number {
  return edges.filter((e) => e.fromPackageId === pkgId || e.toPackageId === pkgId).length;
}

function selectHarmonyLens(
  packages: SemanticPackage[],
  maxPerLens: number,
  independentIds: string[],
  typedEdges: PackageSynergyTypedEdge[],
): { ids: string[]; determination: HarmonyDetermination; rationale: string } {
  if (packages.length <= 1) {
    return {
      ids: packages.map((p) => p.packageId),
      determination: "JUSTIFIED_CONVERGENCE",
      rationale: "Only one validated package available — Harmony must converge.",
    };
  }

  if (typedEdges.length === 0) {
    return {
      ids: independentIds.slice(0, maxPerLens),
      determination: "HARMONY_UNDERDETERMINED",
      rationale:
        "No typed synergy edges in case — Harmony is underdetermined and converges with Independent lens.",
    };
  }

  const ranked = packages
    .slice()
    .sort(
      (a, b) =>
        typedTouchCount(b.packageId, typedEdges) - typedTouchCount(a.packageId, typedEdges) ||
        a.packageId.localeCompare(b.packageId),
    );

  const selected: string[] = [];
  for (const pkg of ranked) {
    if (typedTouchCount(pkg.packageId, typedEdges) === 0) continue;
    const trial = [...selected, pkg.packageId];
    const allPositive = trial.every((id) => packageHarmonyWeight(id, trial, typedEdges) > 0);
    if (selected.length > 0 && !allPositive) continue;
    selected.push(pkg.packageId);
    if (selected.length >= maxPerLens) break;
  }

  while (selected.length < Math.min(2, maxPerLens) && selected.length < ranked.length) {
    for (const pkg of ranked) {
      if (selected.includes(pkg.packageId)) continue;
      const trial = [...selected, pkg.packageId];
      if (portfolioInternalEdges(trial, typedEdges).length === 0) continue;
      if (trial.every((id) => packageHarmonyWeight(id, trial, typedEdges) > 0)) {
        selected.push(pkg.packageId);
        break;
      }
    }
    if (selected.length < 2) break;
  }

  const internal = portfolioInternalEdges(selected, typedEdges);
  const allWeightsPositive = selected.every((id) => packageHarmonyWeight(id, selected, typedEdges) > 0);

  if (selected.length < 2 || internal.length === 0 || !allWeightsPositive) {
    return {
      ids: independentIds.slice(0, maxPerLens),
      determination: "HARMONY_UNDERDETERMINED",
      rationale:
        "Insufficient typed internal connectivity for a supported Harmony portfolio — converging with Independent lens.",
    };
  }

  if (setEqual(selected, independentIds)) {
    return {
      ids: selected,
      determination: "JUSTIFIED_CONVERGENCE",
      rationale:
        "Harmony portfolio matches Independent — typed graph supports convergence but not a distinct cross-engine portfolio.",
    };
  }

  return {
    ids: selected,
    determination: "DIFFERENTIATED",
    rationale: `Harmony portfolio supported by ${internal.length} internal typed edge(s) across cross-engine packages.`,
  };
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
  harmonyDetermination: HarmonyDetermination;
  harmonyInternalEdgeCount: number;
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

    const harmonyPair = lensA === "HARMONY" || lensB === "HARMONY";
    const dependentHarmonyPair =
      (lensA === "DEPENDENT_SYNERGY" && lensB === "HARMONY") ||
      (lensA === "HARMONY" && lensB === "DEPENDENT_SYNERGY");
    if (input.packages.length <= 1) {
      disposition = "JUSTIFIED_CONVERGENCE";
      justification = justifyFullConvergence(input.packages);
    } else if (
      dependentHarmonyPair &&
      input.harmonyDetermination === "DIFFERENTIATED" &&
      input.harmonyInternalEdgeCount > 0
    ) {
      disposition = "JUSTIFIED_CONVERGENCE";
      justification =
        "Evidence-backed Harmony portfolio coincides with Dependent lens — cross-engine packages are commander-linked.";
    } else if (harmonyPair && (input.harmonyDetermination === "JUSTIFIED_CONVERGENCE" || input.harmonyDetermination === "HARMONY_UNDERDETERMINED")) {
      disposition = "JUSTIFIED_CONVERGENCE";
      justification =
        input.harmonyDetermination === "HARMONY_UNDERDETERMINED"
          ? "Harmony underdetermined — converges with Independent due to insufficient typed graph support."
          : "Harmony converges with peer lens under typed-graph support.";
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
  harmonyDetermination: HarmonyDetermination;
  unexplainedPairwise: boolean;
}): { mode: ThreeLensPortfolioSelection["convergenceMode"]; justification?: string } {
  if (input.unexplainedPairwise) {
    return { mode: "DIFFERENTIATED" };
  }

  const allSame =
    setEqual(input.dependentIds, input.independentIds) &&
    setEqual(input.independentIds, input.harmonyIds) &&
    input.packages.length > 1;

  const justifiedPairs = input.pairwiseEquivalences.filter((p) => p.disposition === "JUSTIFIED_CONVERGENCE");

  if (allSame && justifiedPairs.length >= 3) {
    return { mode: "TRUE_CONVERGENCE", justification: justifyFullConvergence(input.packages) };
  }

  if (
    input.harmonyDetermination === "HARMONY_UNDERDETERMINED" ||
    input.harmonyDetermination === "JUSTIFIED_CONVERGENCE"
  ) {
    const indepHarm = input.pairwiseEquivalences.find(
      (p) =>
        (p.lensA === "INDEPENDENT_SYNERGY" && p.lensB === "HARMONY") ||
        (p.lensA === "HARMONY" && p.lensB === "INDEPENDENT_SYNERGY"),
    );
    if (indepHarm?.disposition === "JUSTIFIED_CONVERGENCE") {
      return {
        mode: "TRUE_CONVERGENCE",
        justification: indepHarm.justification,
      };
    }
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

export function selectThreeLensPortfoliosV5(
  caseId: string,
  rawPackages: SemanticPackage[],
  maxPerLens = 4,
): ThreeLensPortfolioSelectionV5 {
  const { packages, typedEdges, qa } = enrichPackagesWithSynergyGraphV8(caseId, rawPackages);
  const harmonyEdges = aggregateSemanticEdgesForHarmony(typedEdges);

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
      harmonyDetermination: "HARMONY_UNDERDETERMINED",
      pairwiseEquivalences: [],
      enrichedPackages: [],
      packageSynergyTypedEdges: [],
      synergyGraphQA: qa,
    };
  }

  const dependentIds = selectDependentLens(packages, maxPerLens);
  const independentIds = selectIndependentLens(packages, maxPerLens);
  const harmonyResult = selectHarmonyLens(packages, maxPerLens, independentIds, harmonyEdges);

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
  const harmonyPlan = buildPlan(
    "HARMONY",
    harmonyResult.ids,
    packages,
    harmonyResult.rationale,
    (pkg) => packageHarmonyWeight(pkg.packageId, harmonyResult.ids, harmonyEdges),
  );

  const shared = computeShared(dependentIds, independentIds, harmonyResult.ids);
  const harmonyInternalEdgeCount = portfolioInternalEdges(harmonyResult.ids, harmonyEdges).length;
  const pairwiseEquivalences = analyzePairwiseEquivalences({
    dependent: dependentPlan,
    independent: independentPlan,
    harmony: harmonyPlan,
    packages,
    harmonyDetermination: harmonyResult.determination,
    harmonyInternalEdgeCount,
  });

  const unexplainedPairwise = pairwiseEquivalences.some((p) => p.disposition === "UNEXPLAINED_COLLAPSE");
  const convergence = deriveConvergenceMode({
    dependentIds,
    independentIds,
    harmonyIds: harmonyResult.ids,
    packages,
    pairwiseEquivalences,
    harmonyDetermination: harmonyResult.determination,
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
    harmonyDetermination: harmonyResult.determination,
    pairwiseEquivalences,
    enrichedPackages: packages,
    packageSynergyTypedEdges: typedEdges,
    synergyGraphQA: qa,
  };
}

export function hasUnexplainedThreeLensCollapseV5(selection: ThreeLensPortfolioSelectionV5): boolean {
  if (selection.availablePackageIds.length === 0) return false;
  if (!selection.synergyGraphQA.passed) return true;
  if (selection.pairwiseEquivalences.some((p) => p.disposition === "UNEXPLAINED_COLLAPSE")) return true;

  if (selection.harmonyDetermination === "DIFFERENTIATED") {
    const internal = portfolioInternalEdges(selection.harmony.selectedPackageIds, selection.packageSynergyTypedEdges);
    if (internal.length === 0) return true;
    const zeroWeight = selection.harmony.selectedPackageIds.some(
      (id) => (selection.harmony.objectiveWeights[id] ?? 0) <= 0,
    );
    if (zeroWeight) return true;
  }

  const dep = selection.dependent.selectedPackageIds;
  const indep = selection.independent.selectedPackageIds;
  const harm = selection.harmony.selectedPackageIds;
  const collapsed = setEqual(dep, indep) && setEqual(indep, harm);
  if (!collapsed) return false;
  return selection.convergenceMode !== "TRUE_CONVERGENCE";
}
