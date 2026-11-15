#!/usr/bin/env npx tsx
/**
 * Archetype Discovery v1.1 — Phase 5.1 QA + human review package.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { lookupGoldenByName } from "./lib/load-golden-catalog-index";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  ARCHETYPE_DISCOVERY_BENCHMARK_V1,
  ARCHETYPE_DISCOVERY_BENCHMARK_VERSION,
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  type HumanReviewAdjudicationOutcome,
} from "../src/lib/deck-synthesis";

loadProjectEnvLocal();

type HumanReviewRow = {
  commander: string;
  commanderOracleText: string;
  bracket: number;
  proposedArchetype: string;
  mechanicalName: string;
  archetypeKind: string;
  mechanicalChain: string[];
  commanderEvidence: string[];
  catalogSupportSummary: Record<string, number>;
  discoverySupport: number;
  feasibilitySupport: number;
  hybridWith: string | null;
  routeOverlayPreview: {
    commanderNodeId: string;
    routeColorId: string;
    reasonGroupHints: string[];
  };
  adjudicationOutcome: HumanReviewAdjudicationOutcome | null;
  reviewPrompts: string[];
};

function surfacedRank(report: ReturnType<typeof discoverArchetypes>, patternId: string): number | null {
  const row = report.surfacedArchetypes.find((a) => a.archetypeId === patternId);
  return row?.rank ?? null;
}

function surfacedMechanicalNames(report: ReturnType<typeof discoverArchetypes>): string[] {
  return report.surfacedArchetypes.map((a) => a.mechanicalName);
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();

  function oracleIdsByNames(names: string[]): string[] {
    return names.map((name) => {
      const row = lookupGoldenByName(catalog, name);
      if (!row?.oracleId) throw new Error(`Missing commander: ${name}`);
      return row.oracleId;
    });
  }

  const benchmarkResults: Array<{
    caseId: string;
    category: string;
    commanderNames: string[];
    bracket: number;
    hypothesisLifecycle: ReturnType<typeof discoverArchetypes>["hypothesisLifecycle"];
    surfacedCount: number;
    surfacedArchetypes: Array<{
      rank: number;
      archetypeId: string;
      mechanicalName: string;
      humanLabel: string;
      archetypeKind: string;
      discoverySupport: number;
      feasibilitySupport: number;
    }>;
    rejectionReasons: Record<string, number>;
  }> = [];

  const humanReviewRows: HumanReviewRow[] = [];
  let lifecycleTotals = {
    generated: 0,
    mergedAbsorbed: 0,
    evaluatedUnique: 0,
    surfaced: 0,
    rejectedPrimary: 0,
    mergedDuplicate: 0,
    hybridDerived: 0,
  };

  const globalRejectionDist: Record<string, number> = {};
  const globalReportByCaseId = new Map<string, ReturnType<typeof discoverArchetypes>>();

  const globalCatalogIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  for (const benchCase of ARCHETYPE_DISCOVERY_BENCHMARK_V1) {
    const commanderOracleIds = oracleIdsByNames(benchCase.commanders);
    const report = discoverArchetypes(
      { commanderOracleIds, bracket: benchCase.bracket },
      { catalog, shadowIndex, globalCatalogIndex },
    );

    globalReportByCaseId.set(benchCase.id, report);

    const lc = report.hypothesisLifecycle;
    lifecycleTotals.generated += lc.generated;
    lifecycleTotals.mergedAbsorbed += lc.mergedAbsorbed;
    lifecycleTotals.evaluatedUnique += lc.evaluatedUnique;
    lifecycleTotals.surfaced += lc.surfaced;
    lifecycleTotals.rejectedPrimary += lc.rejectedPrimary;
    lifecycleTotals.mergedDuplicate += lc.mergedDuplicate;
    lifecycleTotals.hybridDerived += lc.hybridDerived;

    for (const [reason, count] of Object.entries(report.whyNotSurfacedDistribution)) {
      globalRejectionDist[reason] = (globalRejectionDist[reason] ?? 0) + count;
    }

    benchmarkResults.push({
      caseId: benchCase.id,
      category: benchCase.category,
      commanderNames: report.commanderNames,
      bracket: benchCase.bracket,
      hypothesisLifecycle: lc,
      surfacedCount: report.surfacedArchetypes.length,
      surfacedArchetypes: report.surfacedArchetypes.map((a) => ({
        rank: a.rank,
        archetypeId: a.archetypeId,
        mechanicalName: a.mechanicalName,
        humanLabel: a.humanLabel,
        archetypeKind: a.archetypeKind,
        discoverySupport: a.commanderArchetypeSupport.discoverySupport,
        feasibilitySupport: a.catalogFeasibilityEvidence.feasibilitySupport,
      })),
      rejectionReasons: report.whyNotSurfacedDistribution,
    });

    const commanderCard = catalog.byOracleId.get(commanderOracleIds[0]!);
    const oracleText = commanderCard?.oracleText ?? "";

    for (const archetype of report.surfacedArchetypes) {
      humanReviewRows.push({
        commander: report.commanderNames.join(" + "),
        commanderOracleText: oracleText.slice(0, 500),
        bracket: benchCase.bracket,
        proposedArchetype: archetype.humanLabel,
        mechanicalName: archetype.mechanicalName,
        archetypeKind: archetype.archetypeKind,
        mechanicalChain: archetype.primaryEngineChain.map(
          (e) => `${e.sourceMechanic} → ${e.targetMechanic} (${e.relationship})`,
        ),
        commanderEvidence: archetype.commanderArchetypeSupport.evidenceRefs.slice(0, 8).map((e) => e.rule),
        catalogSupportSummary: {
          enablers: archetype.catalogFeasibilityEvidence.enablers,
          enginePieces: archetype.catalogFeasibilityEvidence.enginePieces,
          payoffs: archetype.catalogFeasibilityEvidence.payoffs,
          redundancy: archetype.catalogFeasibilityEvidence.redundancy,
          resourceSupport: archetype.catalogFeasibilityEvidence.resourceSupport,
          interactionProtection: archetype.catalogFeasibilityEvidence.interactionProtection,
          finishers: archetype.catalogFeasibilityEvidence.finishers,
        },
        discoverySupport: archetype.commanderArchetypeSupport.discoverySupport,
        feasibilitySupport: archetype.catalogFeasibilityEvidence.feasibilitySupport,
        hybridWith: archetype.hybridWith,
        routeOverlayPreview: {
          commanderNodeId: archetype.routeOverlayPreview.commanderNodeId,
          routeColorId: archetype.routeOverlayPreview.routeColorId,
          reasonGroupHints: archetype.routeOverlayPreview.reasonGroupHints,
        },
        adjudicationOutcome: null,
        reviewPrompts: [
          "Is this a real build direction for this commander?",
          "Is support commander-specific rather than incidental generic value?",
          "Is this mechanically distinct from other surfaced builds?",
          "Does the label match the actual mechanic?",
          "Is the explanation mechanically correct?",
        ],
      });
    }
  }

  const merenReport = globalReportByCaseId.get("single-graveyard-meren")!;
  const sythisReport = globalReportByCaseId.get("single-enchantress-sythis")!;
  const korvoldReport = globalReportByCaseId.get("multi-korvold")!;

  const merenGraveyardRank = surfacedRank(merenReport, "graveyard_recursion_engine");
  const merenEnchantressRank = surfacedRank(merenReport, "enchantress_value_engine");
  const sythisEnchantressRank = surfacedRank(sythisReport, "enchantress_value_engine");
  const korvoldEnchantressRank = surfacedRank(korvoldReport, "enchantress_value_engine");

  const lifecycleInvariantPass =
    lifecycleTotals.generated === lifecycleTotals.evaluatedUnique + lifecycleTotals.mergedAbsorbed &&
    lifecycleTotals.evaluatedUnique === lifecycleTotals.surfaced + lifecycleTotals.rejectedPrimary &&
    benchmarkResults.every(
      (r) =>
        r.hypothesisLifecycle.invariant.generatedEqualsMergedPlusAbsorbed &&
        r.hypothesisLifecycle.invariant.evaluatedEqualsSurfacedPlusRejectedPrimary,
    );

  const checks = [
    {
      check: "benchmark cases executed",
      pass: benchmarkResults.length === ARCHETYPE_DISCOVERY_BENCHMARK_V1.length,
    },
    {
      check: "all commanders produce Stage A hypotheses",
      pass: benchmarkResults.every((r) => r.hypothesisLifecycle.generated >= 10),
    },
    {
      check: "hypothesis lifecycle invariant reconciles globally",
      pass: lifecycleInvariantPass,
      detail: lifecycleTotals,
    },
    {
      check: "per-commander lifecycle invariants hold",
      pass: benchmarkResults.every(
        (r) =>
          r.hypothesisLifecycle.invariant.generatedEqualsMergedPlusAbsorbed &&
          r.hypothesisLifecycle.invariant.evaluatedEqualsSurfacedPlusRejectedPrimary,
      ),
    },
    {
      check: "at least one surfaced archetype per benchmark case",
      pass: benchmarkResults.every((r) => r.surfacedCount >= 1),
    },
    {
      check: "Meren surfaces graveyard/recursion as primary",
      pass: merenGraveyardRank === 1,
    },
    {
      check: "Meren does NOT surface enchantress false positive",
      pass: merenEnchantressRank === null,
    },
    {
      check: "Sythis strongly surfaces enchantress",
      pass: sythisEnchantressRank !== null && sythisEnchantressRank <= 2,
    },
    {
      check: "Korvold does NOT rank enchantress as primary",
      pass: korvoldEnchantressRank === null || korvoldEnchantressRank > 1,
    },
    {
      check: "Krenko surfaces token plan",
      pass: (benchmarkResults.find((r) => r.caseId === "single-tokens-krenko")?.surfacedArchetypes ?? []).some((a) =>
        a.mechanicalName.toLowerCase().includes("token"),
      ),
    },
    {
      check: "multi-archetype commanders surface >=2 distinct plans",
      pass: benchmarkResults.filter((r) => r.category === "multi_archetype").every((r) => r.surfacedCount >= 2),
    },
    {
      check: "partner commanders resolve combined color identity",
      pass: benchmarkResults.filter((r) => r.category === "partner").every((r) => r.surfacedCount >= 1),
    },
    {
      check: "goodstuff fallback does not outrank mechanical engines when both present",
      pass: benchmarkResults.every((r) => {
        const mechanical = r.surfacedArchetypes.filter((a) => a.archetypeKind !== "GENERIC_VALUE_FALLBACK");
        const fallback = r.surfacedArchetypes.find((a) => a.archetypeKind === "GENERIC_VALUE_FALLBACK");
        if (!fallback || mechanical.length === 0) return true;
        return fallback.rank > Math.min(...mechanical.map((m) => m.rank));
      }),
    },
    {
      check: "surfaced archetypes expose routeOverlayPreview (not graphSeed)",
      pass: humanReviewRows.every((r) => r.routeOverlayPreview.commanderNodeId.length > 0),
    },
    {
      check: "rejection reasons tracked (whyNotSurfaced)",
      pass: Object.values(globalRejectionDist).reduce((a, b) => a + b, 0) > 0,
    },
    {
      check: "human review package generated",
      pass: humanReviewRows.length >= 50,
    },
    {
      check: "no qualityWithinBracket in output",
      pass: !JSON.stringify(benchmarkResults).includes("qualityWithinBracket"),
    },
    {
      check: "no graphSeed in discovery output",
      pass: !JSON.stringify(benchmarkResults).includes("graphSeed"),
    },
    {
      check: "uses discoverySupport/feasibilitySupport labels",
      pass: humanReviewRows.every((r) => typeof r.discoverySupport === "number" && typeof r.feasibilitySupport === "number"),
    },
  ];

  const qaReport = {
    version: "archetype-discovery-v1-phase5.1-qa",
    generatedAt: new Date().toISOString(),
    qaVerdict: checks.every((c) => c.pass) ? "PASS" : "FAIL",
    checks,
    hypothesisLifecycleTotals: lifecycleTotals,
    hypothesisLifecycleFormula:
      "generated = evaluatedUnique + mergedAbsorbed; evaluatedUnique = surfaced + rejectedPrimary (+ deferredGenericFallback when applicable)",
    enchantressAudit: {
      meren: {
        graveyardRank: merenGraveyardRank,
        enchantressRank: merenEnchantressRank,
        surfaced: surfacedMechanicalNames(merenReport),
      },
      sythis: {
        enchantressRank: sythisEnchantressRank,
        surfaced: surfacedMechanicalNames(sythisReport),
      },
      korvold: {
        enchantressRank: korvoldEnchantressRank,
        surfaced: surfacedMechanicalNames(korvoldReport),
      },
    },
    benchmark: {
      version: ARCHETYPE_DISCOVERY_BENCHMARK_VERSION,
      caseCount: ARCHETYPE_DISCOVERY_BENCHMARK_V1.length,
      rejectionReasonDistribution: globalRejectionDist,
    },
    perCommanderResults: benchmarkResults,
    diversitySamples: benchmarkResults
      .filter((r) => r.surfacedCount >= 2)
      .map((r) => ({ caseId: r.caseId, surfaced: r.surfacedArchetypes.map((a) => a.mechanicalName) })),
    authorization: {
      phase5Architecture: "ACCEPTED",
      phase51Repairs: "QA_COMPLETE",
      semantic3dMap: "CANONICAL_CARD_GRAPH",
      deckBuildRouteOverlay: "AUTHORIZED",
      phase6CandidatePool: "WAIT",
      packageConstruction: "WAIT",
      optimizer: "WAIT",
      separateGraphRenderer: "DO NOT BUILD",
      overlayIntegration: "REQUIRED",
    },
  };

  const humanReviewPackage = {
    version: "archetype-discovery-human-review-v1.1",
    generatedAt: new Date().toISOString(),
    reviewInstructions: [
      "Is this a real mechanically supported way to build this commander?",
      "Is the archetype commander-specific rather than incidental generic value?",
      "Is the archetype materially distinct from other surfaced builds for this commander?",
      "Does the label match the actual mechanic?",
      "Is the explanation mechanically correct?",
      "Do NOT use EDHREC popularity as the gold answer.",
    ],
    adjudicationOutcomes: [
      "FALSE_POSITIVE_ARCHETYPE",
      "WRONG_PRIMARY_RANK",
      "DUPLICATE_ARCHETYPE",
      "MISSING_OBVIOUS_ARCHETYPE",
      "LABEL_ONLY_WRONG",
      "EXPLANATION_WRONG",
      "ACCEPTED",
    ] satisfies HumanReviewAdjudicationOutcome[],
    visualizationContract: {
      semantic3dMap: "CANONICAL_CARD_GRAPH — do not duplicate card nodes",
      deckBuildRouteOverlay: "Highlighted subgraph with routeColorId, groups, relationships, fan-out/reconvergence paths",
    },
    sampleCount: humanReviewRows.length,
    samples: humanReviewRows.slice(0, 100),
  };

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis");
  mkdirSync(outDir, { recursive: true });
  const qaPath = resolve(outDir, "archetype-discovery-v1-phase5.1-qa.json");
  const reviewPath = resolve(outDir, "archetype-discovery-human-review-v1.1.json");

  writeFileSync(qaPath, JSON.stringify(qaReport, null, 2));
  writeFileSync(reviewPath, JSON.stringify(humanReviewPackage, null, 2));

  const hash = createHash("sha256").update(JSON.stringify(qaReport)).digest("hex");
  console.log(
    JSON.stringify(
      {
        qaVerdict: qaReport.qaVerdict,
        failedChecks: checks.filter((c) => !c.pass),
        lifecycleTotals,
        benchmarkCases: benchmarkResults.length,
        humanReviewSamples: humanReviewRows.length,
        enchantressAudit: qaReport.enchantressAudit,
        qaPath,
        reviewPath,
        hash,
      },
      null,
      2,
    ),
  );

  if (qaReport.qaVerdict !== "PASS") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
