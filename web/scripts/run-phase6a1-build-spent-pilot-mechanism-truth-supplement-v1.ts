#!/usr/bin/env npx tsx
/**
 * Build immutable spent-pilot mechanism-truth + semantic-opportunity supplements (3 cases only).
 * Does not mutate phase6a1-independent-commander-mechanism-truth-v1.json.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ImplementedMechanismCatalogEntry } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import { IMPLEMENTED_MECHANISM_CATALOG_V1_VERSION } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import { FROZEN_TRUTH_SHA256 } from "./lib/phase6a1-independent-truth-loader-v1";
import {
  buildSpentPilotMechanismTruthCases,
  SPENT_PILOT_CATALOG_ORACLE_PINS,
  SPENT_PILOT_MECHANISM_TRUTH_ADJUDICATION_V1_VERSION,
} from "./lib/phase6a1-spent-pilot-mechanism-truth-adjudication-v1";
import {
  inferOpportunitiesForCaseV3,
  SEMANTIC_OPPORTUNITY_INFERENCE_V3_VERSION,
} from "./lib/phase6a1-semantic-opportunity-inference-v3";
import { SEMANTIC_OPPORTUNITY_CROSS_FACT_V3_VERSION } from "./lib/phase6a1-semantic-opportunity-cross-fact-v3";
import {
  MECHANISM_TRUTH_SUPPLEMENT_PATH,
  OPPORTUNITY_SUPPLEMENT_PATH,
  SPENT_PILOT_MECHANISM_TRUTH_CASE_IDS,
} from "./lib/phase6a1-serialization-pilot-v8-config-v1";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const OUT = resolve(HERE, "../data/milestones/deck-synthesis");
const GENERATED_AT = "2026-08-15T03:30:00.000Z";

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toCatalogEntry(caseRecord: ReturnType<typeof buildSpentPilotMechanismTruthCases>[number]): ImplementedMechanismCatalogEntry {
  return {
    ...caseRecord,
    implementationSource: "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1",
    implementationVersion: IMPLEMENTED_MECHANISM_CATALOG_V1_VERSION,
    loaderVersion: "phase6a1-spent-pilot-truth-loader-v1",
    adjudicationStatus: "FROZEN_DEV_TRUTH",
  };
}

function main() {
  const cases = buildSpentPilotMechanismTruthCases();
  if (cases.length !== 3) throw new Error("FAIL_CLOSED: supplement must contain exactly 3 cases");
  for (const id of SPENT_PILOT_MECHANISM_TRUTH_CASE_IDS) {
    if (!cases.some((c) => c.caseId === id)) {
      throw new Error(`FAIL_CLOSED: missing supplement case ${id}`);
    }
  }

  const mechanismSupplement = {
    version: "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1",
    decision: "SERIALIZATION_PILOT_IMPLEMENTATION_AUTHORIZED_NO_COMMANDER_SUBSTITUTION",
    generatedAt: GENERATED_AT,
    reviewer: "Implementation build from canonical Oracle/catalog pins",
    reviewMethod:
      "Adjudicated mechanism facts from pinned catalog oracle text using independent-truth-v1 schema; no strategy inference.",
    supersedesNothing: "phase6a1-independent-commander-mechanism-truth-v1.json",
    immutableBaseTruthSha256: FROZEN_TRUTH_SHA256.mechanismTruth,
    sourceArtifacts: {
      catalogOraclePins: SPENT_PILOT_CATALOG_ORACLE_PINS,
      adjudicationModule: SPENT_PILOT_MECHANISM_TRUTH_ADJUDICATION_V1_VERSION,
    },
    policy: {
      canonicalFactSource: "Pinned golden catalog oracle text for spent pilot commanders only",
      strategyInferenceAllowedInFacts: false,
      spentPilotInputsOnly: true,
      notProspectiveBenchmarkMaterial: true,
    },
    population: {
      cases: cases.length,
      caseIds: cases.map((c) => c.caseId),
    },
    cases,
  };

  const oppCases = cases.map((c) => inferOpportunitiesForCaseV3(toCatalogEntry(c)));
  const opportunitySupplement = {
    version: "phase6a1-spent-pilot-semantic-opportunity-supplement-v1",
    decision: "SERIALIZATION_PILOT_IMPLEMENTATION_AUTHORIZED_NO_COMMANDER_SUBSTITUTION",
    generatedAt: GENERATED_AT,
    inferenceVersion: SEMANTIC_OPPORTUNITY_INFERENCE_V3_VERSION,
    crossFactVersion: SEMANTIC_OPPORTUNITY_CROSS_FACT_V3_VERSION,
    extendsMechanismTruthSupplement: "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1.json",
    note: "Spent pilot opportunity inputs only; does not extend frozen v3.2.2 opportunity model.",
    population: {
      cases: oppCases.length,
      totalOpportunities: oppCases.reduce((n, c) => n + c.opportunities.length, 0),
      noActionableRecords: oppCases.reduce((n, c) => n + c.noActionableOpportunities.length, 0),
      crossFactEdges: oppCases.reduce((n, c) => n + c.crossFactEdges.length, 0),
    },
    cases: oppCases,
  };

  const mechanismBytes = JSON.stringify(mechanismSupplement, null, 2);
  const opportunityBytes = JSON.stringify(opportunitySupplement, null, 2);
  const mechanismSha256 = createHash("sha256").update(mechanismBytes).digest("hex");
  const opportunitySha256 = createHash("sha256").update(opportunityBytes).digest("hex");

  if (existsSync(MECHANISM_TRUTH_SUPPLEMENT_PATH)) {
    const existing = readFileSync(MECHANISM_TRUTH_SUPPLEMENT_PATH, "utf8");
    const existingSha = createHash("sha256").update(existing).digest("hex");
    if (existingSha !== mechanismSha256) {
      throw new Error(
        "FAIL_CLOSED: mechanism-truth supplement exists with different bytes; create versioned successor.",
      );
    }
  } else {
    writeOnceMilestoneArtifact(MECHANISM_TRUTH_SUPPLEMENT_PATH, mechanismSupplement);
  }

  if (existsSync(OPPORTUNITY_SUPPLEMENT_PATH)) {
    const existing = readFileSync(OPPORTUNITY_SUPPLEMENT_PATH, "utf8");
    const existingSha = createHash("sha256").update(existing).digest("hex");
    if (existingSha !== opportunitySha256) {
      throw new Error(
        "FAIL_CLOSED: opportunity supplement exists with different bytes; create versioned successor.",
      );
    }
  } else {
    writeOnceMilestoneArtifact(OPPORTUNITY_SUPPLEMENT_PATH, opportunitySupplement);
  }

  console.log(
    JSON.stringify(
      {
        status: "SPENT_PILOT_SUPPLEMENTS_BUILT",
        mechanismTruthSupplement: {
          artifact: "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1.json",
          sha256: mechanismSha256,
          caseIds: cases.map((c) => c.caseId),
        },
        opportunitySupplement: {
          artifact: "phase6a1-spent-pilot-semantic-opportunity-supplement-v1.json",
          sha256: opportunitySha256,
        },
        instruction: "Pin supplement SHA in pilot stack identity; do not execute pilot until verifier PASS independently confirmed.",
      },
      null,
      2,
    ),
  );
}

main();
