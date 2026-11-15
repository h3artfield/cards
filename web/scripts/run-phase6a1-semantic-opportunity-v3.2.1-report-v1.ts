#!/usr/bin/env npx tsx
/**
 * Generate SemanticOpportunityModel v3.2.1 artifacts + residual audit closure.
 * Does NOT invoke Professor PLAN.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEMANTIC_OPPORTUNITY_TYPES_V1_VERSION } from "../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import { getImplementedMechanismCatalog } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import {
  loadSemanticOpportunityV32ResidualAudit,
  SEMANTIC_OPPORTUNITY_V32_RESIDUAL_AUDIT_V1_PATH,
} from "./lib/phase6a1-semantic-opportunity-v3.2-independent-residual-audit-loader-v1";
import {
  countByDerivation,
  countByType,
  inferOpportunitiesForCaseV3,
  SEMANTIC_OPPORTUNITY_INFERENCE_V3_VERSION,
} from "./lib/phase6a1-semantic-opportunity-inference-v3";
import { SEMANTIC_OPPORTUNITY_CROSS_FACT_V3_VERSION } from "./lib/phase6a1-semantic-opportunity-cross-fact-v3";
import { buildV321ResidualAuditReport } from "./lib/phase6a1-semantic-opportunity-v3.2.1-residual-audit-v1";

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const MODEL_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-model-v3.2.1.json");
const RESIDUAL_AUDIT_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-v3.2.1-residual-audit.json");
const CROSS_FACT_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-v3.2.1-cross-fact-report.json");
const REPORT_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-v3.2.1-report-v1.json");

function main() {
  const generatedAt = new Date().toISOString();
  const mechanismEntries = getImplementedMechanismCatalog();
  const sourceAudit = loadSemanticOpportunityV32ResidualAudit();

  const v321Cases = mechanismEntries.map((entry) => inferOpportunitiesForCaseV3(entry));
  const totalOpportunities = v321Cases.reduce((n, c) => n + c.opportunities.length, 0);
  const totalNoActionable = v321Cases.reduce((n, c) => n + c.noActionableOpportunities.length, 0);

  const coveredFactIds = new Set<string>();
  for (const c of v321Cases) {
    for (const o of c.opportunities) {
      for (const fid of o.sourceFactIds) coveredFactIds.add(fid);
    }
    for (const n of c.noActionableOpportunities) coveredFactIds.add(n.factId);
  }
  const totalFacts = mechanismEntries.reduce((n, e) => n + e.independentMechanismFacts.length, 0);

  const model = {
    version: "semantic-opportunity-model-v3.2.1",
    inferenceVersion: SEMANTIC_OPPORTUNITY_INFERENCE_V3_VERSION,
    crossFactVersion: SEMANTIC_OPPORTUNITY_CROSS_FACT_V3_VERSION,
    typesVersion: SEMANTIC_OPPORTUNITY_TYPES_V1_VERSION,
    generatedAt,
    population: {
      cases: v321Cases.length,
      totalOpportunities,
      noActionableRecords: totalNoActionable,
      crossFactEdges: v321Cases.reduce((n, c) => n + c.crossFactEdges.length, 0),
    },
    note: "v3.2.1 targeted repair against independent v3.2 residual audit. Not frozen Professor grounding.",
    cases: v321Cases.map((c) => ({
      ...c,
      opportunityCountByType: countByType(c.opportunities),
      opportunityCountByDerivation: countByDerivation(c.opportunities),
    })),
  };

  const residualAudit = buildV321ResidualAuditReport({
    cases: v321Cases,
    sourceAudit,
    generatedAt,
  });

  const crossFactReport = {
    version: "phase6a1-semantic-opportunity-v3.2.1-cross-fact-report-v1",
    generatedAt,
    totalEdges: v321Cases.reduce((n, c) => n + c.crossFactEdges.length, 0),
    faceCompatibility: "ENFORCED",
    provenance: "DERIVED_CAUSAL_INFERENCE_ONLY",
    cases: v321Cases
      .filter((c) => c.crossFactEdges.length > 0)
      .map((c) => ({
        caseId: c.caseId,
        commanders: c.commanders,
        edges: c.crossFactEdges,
        crossOpportunities: c.opportunities.filter((o) => o.opportunityId.includes("--cross-")),
      })),
  };

  const report = {
    version: "phase6a1-semantic-opportunity-v3.2.1-report-v1",
    generatedAt,
    authorization: {
      semanticOpportunityArchitecture: "ACCEPTED",
      semanticOpportunityV32: "NEAR_PASS / NOT_FROZEN",
      semanticOpportunityV321Repair: residualAudit.acceptanceTargetsMet ? "COMPLETE / AWAIT_FREEZE_REVIEW" : "INCOMPLETE",
      professorPlanRuntime: "WAIT",
      gateB: "WAIT",
      liveRetrieval: "WAIT",
      optimizer: "WAIT",
    },
    sourceAudit: {
      path: SEMANTIC_OPPORTUNITY_V32_RESIDUAL_AUDIT_V1_PATH,
      version: sourceAudit.version,
    },
    population: model.population,
    factCoverage: {
      totalFacts,
      factsWithOpportunityOrNoActionable: coveredFactIds.size,
      fullCoverage: coveredFactIds.size === totalFacts,
    },
    acceptanceMetrics: residualAudit.acceptanceMetrics,
    acceptanceTargetsMet: residualAudit.acceptanceTargetsMet,
    overallVerdict: residualAudit.overallVerdict,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2));
  writeFileSync(RESIDUAL_AUDIT_PATH, JSON.stringify(residualAudit, null, 2));
  writeFileSync(CROSS_FACT_PATH, JSON.stringify(crossFactReport, null, 2));
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report.authorization, null, 2));
  console.log(JSON.stringify(report.population, null, 2));
  console.log(JSON.stringify(report.acceptanceMetrics, null, 2));
  console.log(JSON.stringify({ acceptanceTargetsMet: report.acceptanceTargetsMet, overallVerdict: report.overallVerdict }, null, 2));
  console.log(`\nWrote ${REPORT_PATH}`);
}

main();
