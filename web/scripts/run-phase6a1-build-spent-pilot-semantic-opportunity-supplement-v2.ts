#!/usr/bin/env npx tsx
/** Build spent-pilot semantic-opportunity supplement v2 via generic fact-family rules. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MECHANISM_TRUTH_SUPPLEMENT_PATH,
  OPPORTUNITY_SUPPLEMENT_V2_PATH,
  SPENT_PILOT_MECHANISM_TRUTH_CASE_IDS,
} from "./lib/phase6a1-serialization-pilot-v8-config-v1";
import {
  deriveOpportunitiesForMechanismFacts,
  SEMANTIC_OPPORTUNITY_FACT_FAMILY_RULES_V1_VERSION,
} from "./lib/phase6a1-semantic-opportunity-fact-family-rules-v1";
import { sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const GENERATED_AT = new Date().toISOString();

type MechanismSupplement = {
  cases: Array<{
    caseId: string;
    commanders: string[];
    commandZoneConfiguration: string;
    independentMechanismFacts: Array<Record<string, unknown>>;
  }>;
};

function main() {
  const mechanismSupplement = JSON.parse(readFileSync(MECHANISM_TRUTH_SUPPLEMENT_PATH, "utf8")) as MechanismSupplement;
  const cases = SPENT_PILOT_MECHANISM_TRUTH_CASE_IDS.map((caseId) => {
    const truth = mechanismSupplement.cases.find((c) => c.caseId === caseId);
    if (!truth) throw new Error(`Missing mechanism-truth case ${caseId}`);
    const derived = deriveOpportunitiesForMechanismFacts({
      caseId: truth.caseId,
      commanders: truth.commanders,
      commandZoneConfiguration: truth.commandZoneConfiguration,
      facts: truth.independentMechanismFacts as never,
    });
    return {
      ...derived,
      memberCoverage: [
        {
          commanderMember: truth.commanders[0],
          factIds: truth.independentMechanismFacts.map((f) => String(f.mechanismId)),
          opportunityCount: derived.opportunities.length,
        },
      ],
      derivationSource: "phase6a1-commander-mechanism-facts-v4-implemented",
      adjudicationStatus: "DERIVED_FROM_FROZEN_FACTS_V3",
      factFamilyRulesVersion: SEMANTIC_OPPORTUNITY_FACT_FAMILY_RULES_V1_VERSION,
    };
  });

  const supplement = {
    version: "phase6a1-spent-pilot-semantic-opportunity-supplement-v2",
    decision: "PROFESSOR_NORMALIZATION_INVESTIGATION_AUTHORIZED_NO_MODEL_RERUN",
    generatedAt: GENERATED_AT,
    inferenceVersion: SEMANTIC_OPPORTUNITY_FACT_FAMILY_RULES_V1_VERSION,
    crossFactVersion: SEMANTIC_OPPORTUNITY_FACT_FAMILY_RULES_V1_VERSION,
    extendsMechanismTruthSupplement: "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1.json",
    supersedesOpportunitySupplement: "phase6a1-spent-pilot-semantic-opportunity-supplement-v1.json",
    note: "Spent pilot opportunity inputs v2 — generic fact-family bridge repair. Does not extend frozen v3.2.2 opportunity model.",
    population: {
      cases: cases.length,
      totalOpportunities: cases.reduce((n, c) => n + c.opportunities.length, 0),
      noActionableRecords: cases.reduce((n, c) => n + c.noActionableOpportunities.length, 0),
      crossFactEdges: cases.reduce((n, c) => n + c.crossFactEdges.length, 0),
    },
    cases,
  };

  writeFileSync(OPPORTUNITY_SUPPLEMENT_V2_PATH, JSON.stringify(supplement, null, 2));
  console.log(
    JSON.stringify(
      {
        artifact: OPPORTUNITY_SUPPLEMENT_V2_PATH,
        sha256: sha256File(OPPORTUNITY_SUPPLEMENT_V2_PATH),
        population: supplement.population,
      },
      null,
      2,
    ),
  );
}

main();
