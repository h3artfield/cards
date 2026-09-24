#!/usr/bin/env npx tsx
/** Professor v3 architecture review report v4 — prompt payload, orchestration, ledger, state entailment. */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { PROFESSOR_PLANNING_CONTRACTS_V3_VERSION } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { PROFESSOR_PLANNING_EVIDENCE_V3_VERSION } from "../src/lib/deck-synthesis/professor-planning-evidence-v3";
import { PROFESSOR_PLANNING_EVIDENCE_RESOLVER_V3_VERSION } from "../src/lib/deck-synthesis/professor-planning-evidence-resolver-v3";
import { PROFESSOR_V3_EVIDENCE_LEDGER_V1_VERSION } from "../src/lib/deck-synthesis/professor-v3-evidence-ledger-v1";
import { STRATEGIC_ASSERTION_VOCABULARY_V3_VERSION } from "../src/lib/deck-synthesis/strategic-assertion-vocabulary-v3";
import { TYPED_ASSERTION_GROUNDING_V3_VERSION } from "../src/lib/deck-synthesis/typed-assertion-grounding-v3";
import { MECHANISM_CLAIM_GROUNDING_V3_VERSION } from "../src/lib/deck-synthesis/mechanism-claim-grounding-v3";
import { STRATEGY_PACKAGE_VALIDATOR_V3_VERSION } from "../src/lib/deck-synthesis/strategy-package-validator-v3";
import { PROFESSOR_V3_PROMPT_PAYLOAD_V1_VERSION } from "./lib/phase6a1-professor-v3-prompt-payload-v1";
import { PROFESSOR_PLAN_AGENT_V3_VERSION } from "./lib/phase6a1-professor-plan-agent-v3";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPORT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-report-v4.json");

const PATHS = {
  contractsV3: resolve(HERE, "../src/lib/deck-synthesis/professor-planning-contracts-v3.ts"),
  evidenceV3: resolve(HERE, "../src/lib/deck-synthesis/professor-planning-evidence-v3.ts"),
  evidenceResolverV3: resolve(HERE, "../src/lib/deck-synthesis/professor-planning-evidence-resolver-v3.ts"),
  evidenceLedgerV1: resolve(HERE, "../src/lib/deck-synthesis/professor-v3-evidence-ledger-v1.ts"),
  strategicAssertionVocabularyV3: resolve(HERE, "../src/lib/deck-synthesis/strategic-assertion-vocabulary-v3.ts"),
  typedAssertionGroundingV3: resolve(HERE, "../src/lib/deck-synthesis/typed-assertion-grounding-v3.ts"),
  mechanismClaimGroundingV3: resolve(HERE, "../src/lib/deck-synthesis/mechanism-claim-grounding-v3.ts"),
  rulesCatalogV1: resolve(HERE, "../src/lib/deck-synthesis/professor-v3-rules-catalog-v1.ts"),
  validatorV3: resolve(HERE, "../src/lib/deck-synthesis/strategy-package-validator-v3.ts"),
  promptPayloadV1: resolve(HERE, "lib/phase6a1-professor-v3-prompt-payload-v1.ts"),
  promptV3: resolve(HERE, "lib/phase6a1-professor-plan-prompt-v3.ts"),
  normalizerV3: resolve(HERE, "lib/phase6a1-professor-plan-normalizer-v3.ts"),
  agentV3: resolve(HERE, "lib/phase6a1-professor-plan-agent-v3.ts"),
  contextBuilderV3: resolve(HERE, "lib/phase6a1-professor-plan-context-builder-v3.ts"),
  contextPreflightV3: resolve(HERE, "lib/phase6a1-professor-plan-context-preflight-v3.ts"),
  fixtureAssertionsV1: resolve(HERE, "lib/phase6a1-professor-v3-fixture-assertions-v1.ts"),
  fixturesV1: resolve(HERE, "lib/phase6a1-professor-v3-grounding-fixtures-v1.ts"),
  fixturesV2: resolve(HERE, "lib/phase6a1-professor-v3-grounding-fixtures-v2.ts"),
  fixturesV3: resolve(HERE, "lib/phase6a1-professor-v3-grounding-fixtures-v3.ts"),
  fixturesV4: resolve(HERE, "lib/phase6a1-professor-v3-grounding-fixtures-v4.ts"),
  fixtureTestsV4: resolve(HERE, "run-phase6a1-test-professor-v3-grounding-fixtures-v4.ts"),
  snapshotTestV1: resolve(HERE, "run-phase6a1-test-professor-v3-prompt-payload-snapshot-v1.ts"),
  priorReviewReportV3: resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-report-v3.json"),
  priorReviewZipV3: resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-v3.zip"),
  gateV4Supersession: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-gate-v4-supersession-v1.json"),
};

function main() {
  const fixtureAuditPath = resolve(MILESTONES, "phase6a1-professor-v3-grounding-fixtures-audit-v4.json");
  const snapshotPath = resolve(MILESTONES, "phase6a1-professor-v3-prompt-payload-snapshot-muldrotha-v1.json");
  const report = {
    version: "phase6a1-professor-v3-architecture-review-report-v4",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V3_PROMPT_AGENT_LEDGER_AND_STATE_ENTAILMENT_REQUIRED",
    priorReviewDecision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V2_TYPED_GROUNDING_AND_AGENT_WIRING_REQUIRED",
    executionStatus: "ARCHITECTURE_REVIEW_ONLY_NO_MODEL_EXECUTION",
    instruction: "REPORT AND WAIT — prompt payload, orchestration skeleton, append-only ledger, and state entailment submitted. No OpenAI, no gate-v4, no pilot.",
    architecturePivotPreserved: {
      semanticLayer: "canonical mechanical truth",
      professorRole: "strategic synthesizer with typed strategicAssertions + causalEdges",
      affordances: "optional hints — not required semanticOpportunityIds",
      validatorRole: "typed assertion graph is primary proof authority",
      modelInput: "buildProfessorV3PromptPayload exposes full semantic layer to model-visible text",
      gateV4: "superseded, never executed",
    },
    repairsDelivered: {
      P0: "buildProfessorV3PromptPayload() — Oracle, mechanism facts, relationships, affordances, constraints, RAG/rules/research, evidence ID index, output contract in modelVisibleText; Muldrotha snapshot fixture",
      P1: "Real orchestration skeleton: preflight → ledger → payload → model request (blocked) → tool loop → normalize → validate → repair loop with maxRepairRounds; monotonic callIndex; tool/evidence budgets",
      P2: "Append-only evidence ledger — provenance-rich entries win deduplication; context builder stores tool/query/mode on initial retrieval",
      P3: "State/resource entailment — PRODUCES/REQUIRES/CONSUMES require structural state proof; action match alone insufficient (e.g. CAST_FROM_GRAVEYARD ≠ INFINITE_MANA)",
      P4: "Generic semantic coverage fixtures: Muldrotha graveyard replay, Zaxara X→Hydra→counters, Omnath landfall→Elemental→damage, Prosper exile→Treasure, Korvold sacrifice→value",
    },
    componentVersions: {
      contracts: PROFESSOR_PLANNING_CONTRACTS_V3_VERSION,
      evidence: PROFESSOR_PLANNING_EVIDENCE_V3_VERSION,
      evidenceResolver: PROFESSOR_PLANNING_EVIDENCE_RESOLVER_V3_VERSION,
      evidenceLedger: PROFESSOR_V3_EVIDENCE_LEDGER_V1_VERSION,
      strategicAssertionVocabulary: STRATEGIC_ASSERTION_VOCABULARY_V3_VERSION,
      typedAssertionGrounding: TYPED_ASSERTION_GROUNDING_V3_VERSION,
      mechanismClaimGrounding: MECHANISM_CLAIM_GROUNDING_V3_VERSION,
      validator: STRATEGY_PACKAGE_VALIDATOR_V3_VERSION,
      promptPayload: PROFESSOR_V3_PROMPT_PAYLOAD_V1_VERSION,
      agent: PROFESSOR_PLAN_AGENT_V3_VERSION,
    },
    componentHashes: Object.fromEntries(
      Object.entries(PATHS).map(([k, p]) => [k, { path: p.replace(/\\/g, "/"), sha256: existsSync(p) ? sha256File(p) : null }]),
    ),
    deterministicFixtures: {
      auditArtifact: "phase6a1-professor-v3-grounding-fixtures-audit-v4.json",
      present: existsSync(fixtureAuditPath),
      sha256: existsSync(fixtureAuditPath) ? sha256File(fixtureAuditPath) : null,
      totalCount: 44,
      snapshotArtifact: "phase6a1-professor-v3-prompt-payload-snapshot-muldrotha-v1.json",
      snapshotSha256: existsSync(snapshotPath) ? sha256File(snapshotPath) : null,
    },
    priorReviewArtifacts: {
      reportV3: "phase6a1-professor-v3-architecture-review-report-v3.json",
      reportV3Sha256: existsSync(PATHS.priorReviewReportV3) ? sha256File(PATHS.priorReviewReportV3) : null,
      zipV3: "phase6a1-professor-v3-architecture-review-v3.zip",
      zipV3Sha256: existsSync(PATHS.priorReviewZipV3) ? sha256File(PATHS.priorReviewZipV3) : null,
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
