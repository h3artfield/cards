#!/usr/bin/env npx tsx
/** Professor v3 architecture review report v2 — grounding contract repair, no model execution. */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { PROFESSOR_PLANNING_CONTRACTS_V3_VERSION } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { PROFESSOR_PLANNING_EVIDENCE_V3_VERSION } from "../src/lib/deck-synthesis/professor-planning-evidence-v3";
import { PROFESSOR_PLANNING_EVIDENCE_RESOLVER_V3_VERSION } from "../src/lib/deck-synthesis/professor-planning-evidence-resolver-v3";
import { MECHANISM_CLAIM_GROUNDING_V3_VERSION } from "../src/lib/deck-synthesis/mechanism-claim-grounding-v3";
import { STRATEGY_PACKAGE_VALIDATOR_V3_VERSION } from "../src/lib/deck-synthesis/strategy-package-validator-v3";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPORT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-report-v2.json");

const PATHS = {
  contractsV3: resolve(HERE, "../src/lib/deck-synthesis/professor-planning-contracts-v3.ts"),
  evidenceV3: resolve(HERE, "../src/lib/deck-synthesis/professor-planning-evidence-v3.ts"),
  evidenceResolverV3: resolve(HERE, "../src/lib/deck-synthesis/professor-planning-evidence-resolver-v3.ts"),
  mechanismClaimGroundingV3: resolve(HERE, "../src/lib/deck-synthesis/mechanism-claim-grounding-v3.ts"),
  rulesCatalogV1: resolve(HERE, "../src/lib/deck-synthesis/professor-v3-rules-catalog-v1.ts"),
  validatorV3: resolve(HERE, "../src/lib/deck-synthesis/strategy-package-validator-v3.ts"),
  promptV3: resolve(HERE, "lib/phase6a1-professor-plan-prompt-v3.ts"),
  normalizerV3: resolve(HERE, "lib/phase6a1-professor-plan-normalizer-v3.ts"),
  agentV3: resolve(HERE, "lib/phase6a1-professor-plan-agent-v3.ts"),
  contextBuilderV3: resolve(HERE, "lib/phase6a1-professor-plan-context-builder-v3.ts"),
  contextPreflightV3: resolve(HERE, "lib/phase6a1-professor-plan-context-preflight-v3.ts"),
  fixturesV1: resolve(HERE, "lib/phase6a1-professor-v3-grounding-fixtures-v1.ts"),
  fixturesV2: resolve(HERE, "lib/phase6a1-professor-v3-grounding-fixtures-v2.ts"),
  fixtureTestsV2: resolve(HERE, "run-phase6a1-test-professor-v3-grounding-fixtures-v2.ts"),
  migrationMap: resolve(MILESTONES, "phase6a1-professor-v2-to-v3-migration-map-v1.json"),
  gateV4Supersession: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-gate-v4-supersession-v1.json"),
  runtimeSchemaV9: resolve(MILESTONES, "phase6a1-semantic-closure-runtime-input-schema-v9.json"),
  fidelityAudit: resolve(HERE, "lib/phase6a1-semantic-opportunity-fidelity-audit-v1.ts"),
  factFamilyRules: resolve(HERE, "lib/phase6a1-semantic-opportunity-fact-family-rules-v1.ts"),
};

function main() {
  const fixtureAuditPath = resolve(MILESTONES, "phase6a1-professor-v3-grounding-fixtures-audit-v2.json");
  const report = {
    version: "phase6a1-professor-v3-architecture-review-report-v2",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_GROUNDING_CONTRACT_REPAIR_V2",
    priorReviewDecision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V1_GROUNDING_CONTRACT_INCOMPLETE",
    executionStatus: "ARCHITECTURE_REVIEW_ONLY_NO_MODEL_EXECUTION",
    instruction: "REPORT AND WAIT — grounding contract repair submitted for independent review. No OpenAI, no gate-v4, no pilot.",
    architecturePivotPreserved: {
      semanticLayer: "canonical mechanical truth",
      professorRole: "strategic synthesizer",
      affordances: "optional hints — not required semanticOpportunityIds",
      validatorRole: "grounding proof authority",
      lenses: ["Commander Focused", "Independent", "Harmony"],
      gateV4: "superseded, never executed",
    },
    groundingContractRepairs: {
      P0: "Structural claim/evidence validation against mechanism model; lexical checks defense-in-depth only",
      P1: "Fail-closed EvidenceRef resolution (oracle span, empty IDs, RAG entailment, rules/research catalogs)",
      P2: "Runtime fail-closed normalizer-v3 — no raw type casts on packages/relationships",
      P3: "Structural dependent vs independent — evidence chain inference, not Professor self-declaration",
      P4: "Harmony causal validation — producer/consumer resource match + package existence",
      P5: "Preflight requires canonical Oracle + mechanism facts; RAG alone insufficient",
      P6: "Context builder wires frozen MTG retrieval stack; evidence preserved for validator resolution",
    },
    gateV4Disposition: {
      status: "PREPARED_NOT_EXECUTED_SUPERSEDED",
      supersessionArtifact: "phase6a1-professor-plan-serialization-pilot-gate-v4-supersession-v1.json",
      supersessionSha256: existsSync(PATHS.gateV4Supersession) ? sha256File(PATHS.gateV4Supersession) : null,
    },
    componentVersions: {
      contracts: PROFESSOR_PLANNING_CONTRACTS_V3_VERSION,
      evidence: PROFESSOR_PLANNING_EVIDENCE_V3_VERSION,
      evidenceResolver: PROFESSOR_PLANNING_EVIDENCE_RESOLVER_V3_VERSION,
      mechanismClaimGrounding: MECHANISM_CLAIM_GROUNDING_V3_VERSION,
      validator: STRATEGY_PACKAGE_VALIDATOR_V3_VERSION,
    },
    componentHashes: Object.fromEntries(
      Object.entries(PATHS).map(([k, p]) => [k, { path: p.replace(/\\/g, "/"), sha256: existsSync(p) ? sha256File(p) : null }]),
    ),
    deterministicFixtures: {
      auditArtifact: "phase6a1-professor-v3-grounding-fixtures-audit-v2.json",
      present: existsSync(fixtureAuditPath),
      sha256: existsSync(fixtureAuditPath) ? sha256File(fixtureAuditPath) : null,
      regressionCount: 10,
      adversarialCount: 12,
    },
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
