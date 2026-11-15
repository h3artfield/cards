/**
 * Deterministic three-lens package portfolio selector — objective functions over validated packages.
 */
import type { SemanticPackage } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type {
  PackagePortfolioPlan,
  ThreeLensObjective,
  ThreeLensPortfolioSelection,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";

export const THREE_LENS_PORTFOLIO_SELECTOR_V1_VERSION = "phase6a1-three-lens-portfolio-selector-v1";

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
  return depScore(p) + indepScore(p) + (p.overlapsWithPackageIds.length > 0 ? 1 : 0);
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
      ? "Maximize commander-linked package weight (commanderDependency HIGH/MEDIUM)."
      : lens === "INDEPENDENT_SYNERGY"
        ? "Maximize commander-independent package weight (worksWithoutCommander HIGH/MEDIUM)."
        : "Balance commander dependence, independence, and bridge overlap.";

  return { lens, selectedPackageIds, objectiveWeights: weights, rationale };
}

export function selectThreeLensPortfolios(
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
    };
  }

  const n = Math.min(maxPerLens, packages.length);
  const dependentIds = [...packages]
    .sort((a, b) => depScore(b) - depScore(a))
    .slice(0, n)
    .map((p) => p.packageId);
  const independentIds = [...packages]
    .sort((a, b) => indepScore(b) - indepScore(a))
    .slice(0, n)
    .map((p) => p.packageId);
  const harmonyIds = [...packages]
    .sort((a, b) => harmonyScore(b) - harmonyScore(a))
    .slice(0, n)
    .map((p) => p.packageId);

  const shared = [...new Set([...dependentIds, ...independentIds, ...harmonyIds].filter(
    (id) =>
      (dependentIds.includes(id) ? 1 : 0) +
        (independentIds.includes(id) ? 1 : 0) +
        (harmonyIds.includes(id) ? 1 : 0) >=
      2,
  ))];

  return {
    caseId,
    availablePackageIds: packages.map((p) => p.packageId),
    dependent: buildPlan("DEPENDENT_SYNERGY", dependentIds, packages),
    independent: buildPlan("INDEPENDENT_SYNERGY", independentIds, packages),
    harmony: buildPlan("HARMONY", harmonyIds, packages),
    sharedPackageIds: shared,
  };
}
