/**
 * Predeclared read-only gold comparison: Professor sealed outputs vs BuildPath v3 gold (84 paths).
 * Does NOT expose gold to Professor, tune retrieval, or mutate package bodies.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BuildPathClass } from "../../src/lib/deck-synthesis/build-path-types-v1";
import type { CommandZoneBuildPathBundleV3 } from "../../src/lib/deck-synthesis/build-path-types-v3";
import type {
  SemanticPackage,
  ThreeLensPortfolioSelection,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type { ProfessorCaseExperimentRecordV2 } from "./phase6a1-professor-plan-agent-v2";
import { expectedMechanicsForPath } from "./phase6a1-build-path-audit-v3";
import type { ImplementedStrategyCatalogEntry } from "./phase6a1-implemented-strategy-catalog-v1";
import { normalizeForSpanMatch } from "./phase6a1-semantic-evidence-v3";
import { deriveRetrievalRepresentation } from "./phase6a1-strategy-retrieval-representation-v3";

export const PROFESSOR_PLAN_GOLD_BUILD_PATH_COMPARISON_V1_VERSION =
  "phase6a1-professor-plan-gold-build-path-comparison-v1";

export const GOLD_BUILD_PATH_CATALOG_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-build-path-catalog-v3.json",
);

/** Deterministic token-overlap threshold for major gold-strategy coverage. */
export const GOLD_MECHANIC_COVERAGE_THRESHOLD = 0.45;

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "from",
  "your",
  "you",
  "when",
  "repeatable",
  "standalone",
  "high",
  "value",
  "useful",
  "cards",
  "card",
  "deck",
  "engine",
  "engines",
  "support",
  "package",
  "packages",
  "creature",
  "creatures",
  "permanent",
  "permanents",
]);

export type GoldMechanicCoverageRecord = {
  goldMechanicLabel: string;
  goldMechanicKind: "coreMechanic" | "bridgeMechanic";
  covered: boolean;
  bestScore: number;
  matchedPackageIds: string[];
  matchBasis: Array<"TOKEN_OVERLAP" | "RETRIEVAL_TOKEN">;
};

export type GoldPathComparisonRecord = {
  caseId: string;
  pathClass: BuildPathClass;
  pathId: string;
  goldStrategyChain: string[];
  goldMechanicCount: number;
  professorPortfolioPackageIds: string[];
  mechanicCoverage: GoldMechanicCoverageRecord[];
  missingGoldMechanics: string[];
  coveredGoldMechanics: number;
  pathStatus: "PASS" | "FAIL";
  unresolvedGoldStatus: string | null;
};

export type GoldCaseComparisonRecord = {
  caseId: string;
  commanders: string[];
  caseStatus: string;
  lensDifferentiation: {
    convergenceMode: ThreeLensPortfolioSelection["convergenceMode"];
    threeLensCollapseUnexplained: boolean;
    dependentPackageIds: string[];
    independentPackageIds: string[];
    harmonyPackageIds: string[];
    pairwiseEquivalences: string[];
  };
  pathComparisons: GoldPathComparisonRecord[];
  pathsPassed: number;
  pathsFailed: number;
  caseStatusGold: "PASS" | "FAIL";
  novelProfessorPackageIds: string[];
};

export type GoldComparisonPopulationSummary = {
  casesCompared: number;
  pathsCompared: number;
  pathsPassed: number;
  pathsFailed: number;
  casesPassed: number;
  casesFailed: number;
  goldMechanicsTotal: number;
  goldMechanicsCovered: number;
  goldMechanicsMissing: number;
  novelProfessorPackagesTotal: number;
};

export type ProfessorPlanGoldBuildPathComparisonReport = {
  version: typeof PROFESSOR_PLAN_GOLD_BUILD_PATH_COMPARISON_V1_VERSION;
  generatedAt: string;
  readOnly: true;
  predeclaredProtocol: {
    source: "Professor PLAN 28-case experiment authorization (2026-08-13)",
    goldReference: "BuildPath v3 — 84 paths (28 × 3 lenses)",
    comparisonMode: "SEMANTIC_STRATEGY_AGREEMENT_NOT_EXACT_PROSE",
    dimensions: [
      "mechanical validity (inherited pre-gold PASS)",
      "causal coherence (inherited pre-gold PASS)",
      "commander dependence correctness (inherited pre-gold PASS)",
      "commander-independent functionality (inherited pre-gold PASS)",
      "package completeness (inherited pre-gold PASS)",
      "bridge validity (inherited pre-gold PASS)",
      "evidence sufficiency (inherited pre-gold PASS)",
      "path/lens differentiation",
      "major gold-strategy coverage",
      "novel valid strategies not present in gold (informational)",
    ],
    note: "Gold disagreement is not automatically Professor error. Failures are post-gold evaluation findings only.",
  };
  inputs: {
    professorPopulationDir: string;
    professorManifestSha256: string;
    professorCaseSetSha256: string;
    preGoldReauditArtifact: string;
    preGoldReauditStatus: "PASS";
    goldBuildPathCatalog: string;
    goldBuildPathCatalogSha256: string;
    goldStrategySource: string;
  };
  inheritedPreGoldDimensions: {
    status: "PASS_DELEGATED";
    note: "Independent Amendment v8 pre-gold re-audit PASS — validator and graph gates not re-run with gold open.",
  };
  population: GoldComparisonPopulationSummary;
  cases: GoldCaseComparisonRecord[];
  overallStatus: "PASS" | "FAIL";
  gateDisposition: {
    goldComparison: "SEALED";
    corpusIngest: "KEEP_BLOCKED";
    tuningAgainstHoldout: "PROHIBITED";
  };
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function significantTokens(text: string): string[] {
  return normalizeForSpanMatch(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function packageTextCorpus(pkg: SemanticPackage): string {
  return normalizeForSpanMatch(
    [
      pkg.title,
      pkg.purpose,
      ...pkg.causalChain,
      ...pkg.payoffs,
      ...pkg.semanticRequirements.map((r) => `${r.requirement} ${(r.alternatives ?? []).join(" ")}`),
      ...pkg.requiredResources,
      ...pkg.producedResources,
      pkg.commanderContribution,
      pkg.commanderIndependentFunction,
      ...(pkg.vulnerabilities ?? []),
    ].join(" "),
  );
}

function tokenOverlapScore(mechanicLabel: string, corpus: string): number {
  const tokens = significantTokens(mechanicLabel);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => corpus.includes(t)).length;
  return hits / tokens.length;
}

function retrievalTokenMatches(mechanicLabel: string, corpus: string): boolean {
  const rep = deriveRetrievalRepresentation(mechanicLabel);
  const token = rep.retrievalToken?.trim();
  if (!token || token.length < 3) return false;
  return corpus.includes(normalizeForSpanMatch(token));
}

export function evaluateGoldMechanicCoverage(
  mechanicLabel: string,
  kind: "coreMechanic" | "bridgeMechanic",
  packages: SemanticPackage[],
): GoldMechanicCoverageRecord {
  let bestScore = 0;
  const matchedPackageIds: string[] = [];
  const matchBasis = new Set<"TOKEN_OVERLAP" | "RETRIEVAL_TOKEN">();

  for (const pkg of packages) {
    const corpus = packageTextCorpus(pkg);
    const overlap = tokenOverlapScore(mechanicLabel, corpus);
    const retrievalHit = retrievalTokenMatches(mechanicLabel, corpus);
    const score = retrievalHit ? Math.max(overlap, GOLD_MECHANIC_COVERAGE_THRESHOLD) : overlap;
    if (score >= GOLD_MECHANIC_COVERAGE_THRESHOLD || retrievalHit) {
      matchedPackageIds.push(pkg.packageId);
      if (retrievalHit) matchBasis.add("RETRIEVAL_TOKEN");
      if (overlap >= GOLD_MECHANIC_COVERAGE_THRESHOLD) matchBasis.add("TOKEN_OVERLAP");
    }
    if (score > bestScore) bestScore = score;
  }

  return {
    goldMechanicLabel: mechanicLabel,
    goldMechanicKind: kind,
    covered: matchedPackageIds.length > 0,
    bestScore: Number(bestScore.toFixed(4)),
    matchedPackageIds: [...new Set(matchedPackageIds)],
    matchBasis: [...matchBasis],
  };
}

function portfolioPackages(
  record: ProfessorCaseExperimentRecordV2,
  pathClass: BuildPathClass,
): SemanticPackage[] {
  const byId = new Map(record.finalValidatedPackages.map((p) => [p.packageId, p]));
  const selection = record.threeLensPortfolios;
  const selectedIds =
    pathClass === "DEPENDENT_SYNERGY"
      ? selection.dependent.selectedPackageIds
      : pathClass === "INDEPENDENT_SYNERGY"
        ? selection.independent.selectedPackageIds
        : selection.harmony.selectedPackageIds;
  return selectedIds.map((id) => byId.get(id)).filter((p): p is SemanticPackage => Boolean(p));
}

function goldMechanicsForPath(
  strat: ImplementedStrategyCatalogEntry,
  pathClass: BuildPathClass,
): Array<{ label: string; kind: "coreMechanic" | "bridgeMechanic" }> {
  return expectedMechanicsForPath(strat, pathClass).map((label) => ({
    label,
    kind: pathClass === "HARMONY" ? ("bridgeMechanic" as const) : ("coreMechanic" as const),
  }));
}

function allGoldMechanicLabels(strat: ImplementedStrategyCatalogEntry): Set<string> {
  const labels = new Set<string>();
  for (const pathClass of ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"] as BuildPathClass[]) {
    for (const label of expectedMechanicsForPath(strat, pathClass)) {
      labels.add(normalizeForSpanMatch(label));
    }
  }
  return labels;
}

function compareGoldPath(args: {
  caseId: string;
  pathClass: BuildPathClass;
  bundle: CommandZoneBuildPathBundleV3;
  strat: ImplementedStrategyCatalogEntry;
  record: ProfessorCaseExperimentRecordV2;
}): GoldPathComparisonRecord {
  const path = args.bundle.buildPaths.find((p) => p.pathClass === args.pathClass)!;
  const portfolio = portfolioPackages(args.record, args.pathClass);
  const mechanics = goldMechanicsForPath(args.strat, args.pathClass);
  const mechanicCoverage = mechanics.map((m) =>
    evaluateGoldMechanicCoverage(m.label, m.kind, portfolio),
  );
  const missingGoldMechanics = mechanicCoverage.filter((m) => !m.covered).map((m) => m.goldMechanicLabel);

  return {
    caseId: args.caseId,
    pathClass: args.pathClass,
    pathId: path.pathId,
    goldStrategyChain: path.pathThesis.sourceStrategyChain,
    goldMechanicCount: mechanics.length,
    professorPortfolioPackageIds: portfolio.map((p) => p.packageId),
    mechanicCoverage,
    missingGoldMechanics,
    coveredGoldMechanics: mechanicCoverage.filter((m) => m.covered).length,
    pathStatus: missingGoldMechanics.length === 0 ? "PASS" : "FAIL",
    unresolvedGoldStatus:
      path.pathThesis.unresolvedStatus !== "RESOLVED" ? path.pathThesis.unresolvedStatus : null,
  };
}

export function compareProfessorCaseToGoldBuildPath(args: {
  record: ProfessorCaseExperimentRecordV2;
  bundle: CommandZoneBuildPathBundleV3;
  strat: ImplementedStrategyCatalogEntry;
}): GoldCaseComparisonRecord {
  const pathClasses: BuildPathClass[] = ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"];
  const pathComparisons = pathClasses.map((pathClass) =>
    compareGoldPath({
      caseId: args.record.caseId,
      pathClass,
      bundle: args.bundle,
      strat: args.strat,
      record: args.record,
    }),
  );

  const goldLabels = allGoldMechanicLabels(args.strat);
  const novelProfessorPackageIds = args.record.finalValidatedPackages
    .filter((pkg) => {
      const corpus = packageTextCorpus(pkg);
      for (const label of goldLabels) {
        const overlap = tokenOverlapScore(label, corpus);
        if (overlap >= GOLD_MECHANIC_COVERAGE_THRESHOLD) return false;
      }
      return true;
    })
    .map((p) => p.packageId);

  const pathsPassed = pathComparisons.filter((p) => p.pathStatus === "PASS").length;
  const pathsFailed = pathComparisons.filter((p) => p.pathStatus === "FAIL").length;

  return {
    caseId: args.record.caseId,
    commanders: args.record.commanders,
    caseStatus: args.record.caseStatus,
    lensDifferentiation: {
      convergenceMode: args.record.threeLensPortfolios.convergenceMode,
      threeLensCollapseUnexplained: args.record.threeLensCollapseUnexplained,
      dependentPackageIds: args.record.threeLensPortfolios.dependent.selectedPackageIds,
      independentPackageIds: args.record.threeLensPortfolios.independent.selectedPackageIds,
      harmonyPackageIds: args.record.threeLensPortfolios.harmony.selectedPackageIds,
      pairwiseEquivalences: args.record.threeLensPairwiseEquivalences ?? [],
    },
    pathComparisons,
    pathsPassed,
    pathsFailed,
    caseStatusGold: pathsFailed === 0 ? "PASS" : "FAIL",
    novelProfessorPackageIds,
  };
}

export function buildGoldComparisonPopulationSummary(
  cases: GoldCaseComparisonRecord[],
): GoldComparisonPopulationSummary {
  let pathsCompared = 0;
  let pathsPassed = 0;
  let pathsFailed = 0;
  let goldMechanicsTotal = 0;
  let goldMechanicsCovered = 0;
  let novelProfessorPackagesTotal = 0;

  for (const c of cases) {
    pathsCompared += c.pathComparisons.length;
    pathsPassed += c.pathsPassed;
    pathsFailed += c.pathsFailed;
    novelProfessorPackagesTotal += c.novelProfessorPackageIds.length;
    for (const path of c.pathComparisons) {
      goldMechanicsTotal += path.goldMechanicCount;
      goldMechanicsCovered += path.coveredGoldMechanics;
    }
  }

  return {
    casesCompared: cases.length,
    pathsCompared,
    pathsPassed,
    pathsFailed,
    casesPassed: cases.filter((c) => c.caseStatusGold === "PASS").length,
    casesFailed: cases.filter((c) => c.caseStatusGold === "FAIL").length,
    goldMechanicsTotal,
    goldMechanicsCovered,
    goldMechanicsMissing: goldMechanicsTotal - goldMechanicsCovered,
    novelProfessorPackagesTotal,
  };
}

export function loadGoldBuildPathCatalog(): {
  catalogSha256: string;
  bundles: CommandZoneBuildPathBundleV3[];
} {
  const catalogSha256 = sha256File(GOLD_BUILD_PATH_CATALOG_PATH);
  const catalog = JSON.parse(readFileSync(GOLD_BUILD_PATH_CATALOG_PATH, "utf8")) as {
    bundles: CommandZoneBuildPathBundleV3[];
  };
  return { catalogSha256, bundles: catalog.bundles };
}
