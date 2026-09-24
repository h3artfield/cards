/**
 * Deterministic three-lens package portfolio selector v2 — inclusion/exclusion per lens, not reorder-only.
 */
import type { SemanticPackage } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type {
  PackagePortfolioPlan,
  ThreeLensObjective,
  ThreeLensPortfolioSelection,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";

export const THREE_LENS_PORTFOLIO_SELECTOR_V2_VERSION = "phase6a1-three-lens-portfolio-selector-v2";

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

function harmonyScore(p: SemanticPackage): number {
  return depScore(p) + indepScore(p) + (p.overlapsWithPackageIds.length > 0 ? 2 : 0);
}

function isPureIndependent(p: SemanticPackage): boolean {
  return p.worksWithoutCommander === "HIGH" && p.commanderDependency === "LOW";
}

function isPureDependent(p: SemanticPackage): boolean {
  return p.commanderDependency === "HIGH" && p.worksWithoutCommander === "LOW";
}

function isBridgeOrBalanced(p: SemanticPackage): boolean {
  return p.overlapsWithPackageIds.length > 0 || (depScore(p) >= 2 && indepScore(p) >= 2);
}

function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((id) => sa.has(id));
}

function buildPlan(
  lens: ThreeLensObjective,
  selectedPackageIds: string[],
  packages: SemanticPackage[],
): PackagePortfolioPlan {
  const weights: Record<string, number> = {};
  for (const id of selectedPackageIds) {
    const pkg = packages.find((p) => p.packageId === id);
    if (!pkg) continue;
    weights[id] =
      lens === "DEPENDENT_SYNERGY"
        ? depScore(pkg)
        : lens === "INDEPENDENT_SYNERGY"
          ? indepScore(pkg)
          : harmonyScore(pkg);
  }

  const rationale =
    lens === "DEPENDENT_SYNERGY"
      ? "Include commander-linked packages (HIGH/MEDIUM commanderDependency); exclude pure-independent packages when alternatives exist."
      : lens === "INDEPENDENT_SYNERGY"
        ? "Include commander-independent packages (HIGH/MEDIUM worksWithoutCommander); exclude pure-dependent packages when alternatives exist."
        : "Include bridge/balanced packages that connect dependence and independence dimensions.";

  return { lens, selectedPackageIds, objectiveWeights: weights, rationale };
}

function selectDependentLens(packages: SemanticPackage[], maxPerLens: number): string[] {
  const commanderLinked = packages.filter((p) => p.commanderDependency === "HIGH" || p.commanderDependency === "MEDIUM");
  const core = commanderLinked.filter((p) => !isPureIndependent(p));
  const pool = (core.length > 0 ? core : commanderLinked.length > 0 ? commanderLinked : packages)
    .slice()
    .sort((a, b) => depScore(b) - depScore(a) || a.packageId.localeCompare(b.packageId));
  return pool.slice(0, Math.min(maxPerLens, pool.length)).map((p) => p.packageId);
}

function selectIndependentLens(packages: SemanticPackage[], maxPerLens: number): string[] {
  const independent = packages.filter((p) => p.worksWithoutCommander === "HIGH" || p.worksWithoutCommander === "MEDIUM");
  const core = independent.filter((p) => !isPureDependent(p));
  const pool = (core.length > 0 ? core : independent.length > 0 ? independent : packages)
    .slice()
    .sort((a, b) => indepScore(b) - indepScore(a) || a.packageId.localeCompare(b.packageId));
  return pool.slice(0, Math.min(maxPerLens, pool.length)).map((p) => p.packageId);
}

function selectHarmonyLens(
  packages: SemanticPackage[],
  maxPerLens: number,
  dependentIds: string[],
  independentIds: string[],
): string[] {
  const bridges = packages.filter((p) => isBridgeOrBalanced(p));
  const depSet = new Set(dependentIds);
  const indepSet = new Set(independentIds);
  const complementary = packages.filter((p) => depSet.has(p.packageId) !== indepSet.has(p.packageId));
  const poolSource =
    bridges.length > 0 ? bridges : complementary.length > 0 ? complementary : packages;
  const pool = poolSource
    .slice()
    .sort((a, b) => harmonyScore(b) - harmonyScore(a) || a.packageId.localeCompare(b.packageId));
  return pool.slice(0, Math.min(maxPerLens, pool.length)).map((p) => p.packageId);
}

function computeShared(
  dependentIds: string[],
  independentIds: string[],
  harmonyIds: string[],
): string[] {
  const counts = new Map<string, number>();
  for (const id of [...dependentIds, ...independentIds, ...harmonyIds]) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
}

function justifyConvergence(packages: SemanticPackage[]): string {
  if (packages.length <= 1) {
    return "Only one validated package available — all lenses must select the same portfolio.";
  }
  const allBalanced = packages.every((p) => depScore(p) >= 2 && indepScore(p) >= 2);
  if (allBalanced) {
    return "All validated packages score MEDIUM+ on both commander dependence and independence — no lens-exclusive candidates remain.";
  }
  return "Validated package universe is too small or uniformly balanced for lens-exclusive portfolios.";
}

export function selectThreeLensPortfoliosV2(
  caseId: string,
  packages: SemanticPackage[],
  maxPerLens = 4,
): ThreeLensPortfolioSelection {
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
    };
  }

  const dependentIds = selectDependentLens(packages, maxPerLens);
  const independentIds = selectIndependentLens(packages, maxPerLens);
  const harmonyIds = selectHarmonyLens(packages, maxPerLens, dependentIds, independentIds);
  const shared = computeShared(dependentIds, independentIds, harmonyIds);

  const allSame =
    setEqual(dependentIds, independentIds) &&
    setEqual(independentIds, harmonyIds) &&
    packages.length > 1;

  const legitimateConvergence =
    packages.length <= maxPerLens ||
    packages.every((p) => depScore(p) >= 2 && indepScore(p) >= 2) ||
    new Set(packages.map((p) => `${depScore(p)}:${indepScore(p)}`)).size === 1;

  return {
    caseId,
    availablePackageIds: packages.map((p) => p.packageId),
    dependent: buildPlan("DEPENDENT_SYNERGY", dependentIds, packages),
    independent: buildPlan("INDEPENDENT_SYNERGY", independentIds, packages),
    harmony: buildPlan("HARMONY", harmonyIds, packages),
    sharedPackageIds: shared,
    convergenceMode: allSame && legitimateConvergence ? "TRUE_CONVERGENCE" : "DIFFERENTIATED",
    convergenceJustification: allSame && legitimateConvergence ? justifyConvergence(packages) : undefined,
  };
}

export function hasUnexplainedThreeLensCollapse(selection: ThreeLensPortfolioSelection): boolean {
  if (selection.availablePackageIds.length === 0) return false;
  const dep = selection.dependent.selectedPackageIds;
  const indep = selection.independent.selectedPackageIds;
  const harm = selection.harmony.selectedPackageIds;
  const collapsed = setEqual(dep, indep) && setEqual(indep, harm);
  if (!collapsed) return false;
  return selection.convergenceMode !== "TRUE_CONVERGENCE";
}
