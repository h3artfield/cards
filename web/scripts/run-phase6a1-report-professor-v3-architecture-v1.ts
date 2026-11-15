#!/usr/bin/env npx tsx
/** Professor v3 architecture review report — no model execution. */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { PROFESSOR_PLANNING_CONTRACTS_V3_VERSION } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { PROFESSOR_PLANNING_EVIDENCE_V3_VERSION } from "../src/lib/deck-synthesis/professor-planning-evidence-v3";
import { STRATEGY_PACKAGE_VALIDATOR_V3_VERSION } from "../src/lib/deck-synthesis/strategy-package-validator-v3";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPORT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-report-v1.json");

const PATHS = {
  contractsV3: resolve(HERE, "../src/lib/deck-synthesis/professor-planning-contracts-v3.ts"),
  evidenceV3: resolve(HERE, "../src/lib/deck-synthesis/professor-planning-evidence-v3.ts"),
  validatorV3: resolve(HERE, "../src/lib/deck-synthesis/strategy-package-validator-v3.ts"),
  promptV3: resolve(HERE, "lib/phase6a1-professor-plan-prompt-v3.ts"),
  normalizerV3: resolve(HERE, "lib/phase6a1-professor-plan-normalizer-v3.ts"),
  agentV3: resolve(HERE, "lib/phase6a1-professor-plan-agent-v3.ts"),
  contextBuilderV3: resolve(HERE, "lib/phase6a1-professor-plan-context-builder-v3.ts"),
  contextPreflightV3: resolve(HERE, "lib/phase6a1-professor-plan-context-preflight-v3.ts"),
  fixtures: resolve(HERE, "lib/phase6a1-professor-v3-grounding-fixtures-v1.ts"),
  fixtureTests: resolve(HERE, "run-phase6a1-test-professor-v3-grounding-fixtures-v1.ts"),
  migrationMap: resolve(MILESTONES, "phase6a1-professor-v2-to-v3-migration-map-v1.json"),
  gateV4Supersession: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-gate-v4-supersession-v1.json"),
  runtimeSchemaV9: resolve(MILESTONES, "phase6a1-semantic-closure-runtime-input-schema-v9.json"),
  fidelityAudit: resolve(HERE, "lib/phase6a1-semantic-opportunity-fidelity-audit-v1.ts"),
  factFamilyRules: resolve(HERE, "lib/phase6a1-semantic-opportunity-fact-family-rules-v1.ts"),
};

function main() {
  const fixtureAuditPath = resolve(MILESTONES, "phase6a1-professor-v3-grounding-fixtures-audit-v1.json");
  const report = {
    version: "phase6a1-professor-v3-architecture-review-report-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_PIVOT",
    executionStatus: "ARCHITECTURE_REVIEW_ONLY_NO_MODEL_EXECUTION",
    instruction: "REPORT AND WAIT — independent architecture review required before any Professor v3 model execution or old gate-v4 pilot run.",
    architecturePivotSummary:
      "Precomputed semanticOpportunityIds no longer define the complete strategy universe. Professor v3 synthesizes strategies from mechanism facts + relationships + knowledge; validator proves grounding.",
    gateV4Disposition: {
      status: "PREPARED_NOT_EXECUTED_SUPERSEDED",
      supersessionArtifact: "phase6a1-professor-plan-serialization-pilot-gate-v4-supersession-v1.json",
      supersessionSha256: existsSync(PATHS.gateV4Supersession) ? sha256File(PATHS.gateV4Supersession) : null,
    },
    criticalMigrationNote:
      "Professor v2 preflight fails on empty semanticOpportunities. Professor v3 preflight does NOT — zero affordances + valid mechanism facts + Oracle = satisfiable.",
    componentVersions: {
      contracts: PROFESSOR_PLANNING_CONTRACTS_V3_VERSION,
      evidence: PROFESSOR_PLANNING_EVIDENCE_V3_VERSION,
      validator: STRATEGY_PACKAGE_VALIDATOR_V3_VERSION,
    },
    componentHashes: Object.fromEntries(
      Object.entries(PATHS).map(([k, p]) => [k, { path: p.replace(/\\/g, "/"), sha256: existsSync(p) ? sha256File(p) : null }]),
    ),
    deterministicFixtures: {
      auditArtifact: "phase6a1-professor-v3-grounding-fixtures-audit-v1.json",
      present: existsSync(fixtureAuditPath),
      sha256: existsSync(fixtureAuditPath) ? sha256File(fixtureAuditPath) : null,
    },
    preservedFromOpportunityRepair: [
      "phase6a1-semantic-opportunity-fidelity-audit-v1",
      "phase6a1-semantic-opportunity-fact-family-rules-v1",
      "optional affordances reinterpretation",
    ],
    prohibitedUntilReview: [
      "OpenAI / Professor model calls",
      "gate-v4 execution",
      "serialization pilot v8 rerun",
      "runtime-input-v9 serializer production binding",
    ],
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: REPORT_PATH, sha256: sha256File(REPORT_PATH) }, null, 2));
}

main();
