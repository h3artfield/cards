#!/usr/bin/env npx tsx
/**
 * Generate SemanticOpportunityModel v3.2 artifacts + independent v3 review comparison.
 * Does NOT invoke Professor PLAN.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEMANTIC_OPPORTUNITY_TYPES_V1_VERSION } from "../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import { getImplementedMechanismCatalog } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import {
  INDEPENDENT_OPPORTUNITY_V3_REVIEW_V1_PATH,
  tryLoadIndependentOpportunityV3Review,
} from "./lib/phase6a1-independent-opportunity-v3-review-loader-v1";
import {
  countByDerivation,
  countByType,
  inferOpportunitiesForCaseV3,
  SEMANTIC_OPPORTUNITY_INFERENCE_V3_VERSION,
} from "./lib/phase6a1-semantic-opportunity-inference-v3";
import { buildV32ComparisonReport } from "./lib/phase6a1-semantic-opportunity-v3.2-comparison-v1";

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const MODEL_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-model-v3.2.json");
const COMPARISON_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-v3.2-vs-independent-review.json");
const COVERAGE_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-v3.2-fact-coverage.json");
const CROSS_FACT_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-v3.2-cross-fact-report.json");
const REPORT_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-v3.2-report-v1.json");

function main() {
  const generatedAt = new Date().toISOString();
  const mechanismEntries = getImplementedMechanismCatalog();
  const review = tryLoadIndependentOpportunityV3Review();

  const v32Cases = mechanismEntries.map((entry) => inferOpportunitiesForCaseV3(entry));
  const totalOpportunities = v32Cases.reduce((n, c) => n + c.opportunities.length, 0);
  const totalNoActionable = v32Cases.reduce((n, c) => n + c.noActionableOpportunities.length, 0);

  const coveredFactIds = new Set<string>();
  for (const c of v32Cases) {
    for (const o of c.opportunities) {
      for (const fid of o.sourceFactIds) coveredFactIds.add(fid);
    }
    for (const n of c.noActionableOpportunities) coveredFactIds.add(n.factId);
  }
  const totalFacts = mechanismEntries.reduce((n, e) => n + e.independentMechanismFacts.length, 0);

  const model = {
    version: "semantic-opportunity-model-v3.2",
    inferenceVersion: SEMANTIC_OPPORTUNITY_INFERENCE_V3_VERSION,
    typesVersion: SEMANTIC_OPPORTUNITY_TYPES_V1_VERSION,
    generatedAt,
    population: {
      cases: v32Cases.length,
      totalOpportunities,
      noActionableRecords: totalNoActionable,
      crossFactEdges: v32Cases.reduce((n, c) => n + c.crossFactEdges.length, 0),
    },
    note: "v3.2 targeted repair against independent v3 review. Not frozen Professor grounding.",
    cases: v32Cases.map((c) => ({
      ...c,
      opportunityCountByType: countByType(c.opportunities),
      opportunityCountByDerivation: countByDerivation(c.opportunities),
    })),
  };

  const comparison = buildV32ComparisonReport({ v32Cases, review });

  const factCoverage = {
    version: "phase6a1-semantic-opportunity-v3.2-fact-coverage-v1",
    generatedAt,
    totalFacts,
    factsWithOpportunityOrNoActionable: coveredFactIds.size,
    factsNoActionable: totalNoActionable,
    fullCoverage: coveredFactIds.size === totalFacts,
    cases: v32Cases.map((c) => {
      const caseFactIds = mechanismEntries.find((e) => e.caseId === c.caseId)!.independentMechanismFacts.map(
        (f) => f.mechanismId,
      );
      return {
        caseId: c.caseId,
        commanders: c.commanders,
        mechanismFactCount: c.mechanismFactCount,
        opportunityCount: c.opportunities.length,
        noActionable: c.noActionableOpportunities,
        memberCoverage: c.memberCoverage,
        uncoveredFacts: caseFactIds.filter(
          (fid) =>
            !c.opportunities.some((o) => o.sourceFactIds.includes(fid)) &&
            !c.noActionableOpportunities.some((n) => n.factId === fid),
        ),
      };
    }),
  };

  const crossFactReport = {
    version: "phase6a1-semantic-opportunity-v3.2-cross-fact-report-v1",
    generatedAt,
    totalEdges: v32Cases.reduce((n, c) => n + c.crossFactEdges.length, 0),
    cases: v32Cases
      .filter((c) => c.crossFactEdges.length > 0)
      .map((c) => ({
        caseId: c.caseId,
        commanders: c.commanders,
        edges: c.crossFactEdges,
        crossOpportunities: c.opportunities.filter((o) => o.opportunityId.includes("--cross-")),
      })),
  };

  const report = {
    version: "phase6a1-semantic-opportunity-v3.2-report-v1",
    generatedAt,
    authorization: {
      semanticOpportunityInferenceV32: "AUTHORIZED / GENERATED",
      independentV3ReviewIncorporated: review ? "YES" : `NO — place review at ${INDEPENDENT_OPPORTUNITY_V3_REVIEW_V1_PATH}`,
      professorPlanRuntime: "WAIT",
      gateB: "WAIT",
      optimizer: "WAIT",
    },
    population: model.population,
    comparisonSummary: comparison.repairSummary,
    noActionableSummary: comparison.noActionableSummary,
    unresolvedReviewVerdicts: comparison.unresolvedReviewVerdicts,
    reviewLoaded: comparison.reviewLoaded,
    acceptanceTargets: {
      wrong: comparison.records.filter(
        (r) => r.reviewVerdict === "WRONG" && r.v32RepairStatus === "refined" && r.note.includes("still emits"),
      ).length,
      rejectedNoActionable:
        comparison.noActionableRecords.filter((r) => r.reviewVerdict.startsWith("REJECT") && r.v32Status !== "covered_by_opportunity")
          .length,
      missing: comparison.records.filter((r) => r.v32RepairStatus === "missing").length,
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2));
  writeFileSync(COMPARISON_PATH, JSON.stringify(comparison, null, 2));
  writeFileSync(COVERAGE_PATH, JSON.stringify(factCoverage, null, 2));
  writeFileSync(CROSS_FACT_PATH, JSON.stringify(crossFactReport, null, 2));
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report.authorization, null, 2));
  console.log(JSON.stringify(report.population, null, 2));
  console.log(JSON.stringify(report.comparisonSummary, null, 2));
  console.log(JSON.stringify(report.acceptanceTargets, null, 2));
  console.log(`\nWrote ${REPORT_PATH}`);
}

main();
