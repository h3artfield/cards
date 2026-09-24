#!/usr/bin/env npx tsx
/** Professor v3 architecture review report v3 — typed grounding + agent wiring, no model execution. */
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

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPORT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-report-v3.json");

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
  promptV3: resolve(HERE, "lib/phase6a1-professor-plan-prompt-v3.ts"),
  normalizerV3: resolve(HERE, "lib/phase6a1-professor-plan-normalizer-v3.ts"),
  agentV3: resolve(HERE, "lib/phase6a1-professor-plan-agent-v3.ts"),
  contextBuilderV3: resolve(HERE, "lib/phase6a1-professor-plan-context-builder-v3.ts"),
  contextPreflightV3: resolve(HERE, "lib/phase6a1-professor-plan-context-preflight-v3.ts"),
  fixtureAssertionsV1: resolve(HERE, "lib/phase6a1-professor-v3-fixture-assertions-v1.ts"),
  fixturesV1: resolve(HERE, "lib/phase6a1-professor-v3-grounding-fixtures-v1.ts"),
  fixturesV2: resolve(HERE, "lib/phase6a1-professor-v3-grounding-fixtures-v2.ts"),
  fixturesV3: resolve(HERE, "lib/phase6a1-professor-v3-grounding-fixtures-v3.ts"),
  fixtureTestsV3: resolve(HERE, "run-phase6a1-test-professor-v3-grounding-fixtures-v3.ts"),
  migrationMap: resolve(MILESTONES, "phase6a1-professor-v2-to-v3-migration-map-v1.json"),
  gateV4Supersession: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-gate-v4-supersession-v1.json"),
  runtimeSchemaV9: resolve(MILESTONES, "phase6a1-semantic-closure-runtime-input-schema-v9.json"),
  priorReviewReportV2: resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-report-v2.json"),
  priorReviewZipV2: resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-v2.zip"),
};

function main() {
  const fixtureAuditPath = resolve(MILESTONES, "phase6a1-professor-v3-grounding-fixtures-audit-v3.json");
  const report = {
    version: "phase6a1-professor-v3-architecture-review-report-v3",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V2_TYPED_GROUNDING_AND_AGENT_WIRING_REQUIRED",
    priorReviewDecision: "PROFESSOR_V3_GROUNDING_CONTRACT_REPAIR_V2",
    executionStatus: "ARCHITECTURE_REVIEW_ONLY_NO_MODEL_EXECUTION",
    instruction: "REPORT AND WAIT — typed grounding layer + agent orchestration submitted for independent review. No OpenAI, no gate-v4, no pilot.",
    architecturePivotPreserved: {
      semanticLayer: "canonical mechanical truth",
      professorRole: "strategic synthesizer with typed strategicAssertions + causalEdges",
      affordances: "optional hints — not required semanticOpportunityIds",
      validatorRole: "typed assertion graph is primary proof authority; prose regex defense-in-depth only",
      lenses: ["Commander Focused", "Independent", "Harmony"],
      gateV4: "superseded, never executed",
    },
    typedGroundingLayer: {
      strategicAssertions: "versioned predicate/action/object/zone/resource fields with evidenceRefs",
      causalEdges: "producerAssertionId → consumerAssertionId with resourceOrState bridge",
      proseFields: "title, strategicClaim, causalReasoning remain explanatory only",
      primaryValidator: "typed-assertion-grounding-v3.ts",
      defenseInDepth: "mechanism-claim-grounding-v3.ts regex/phrase checks",
    },
    groundingContractRepairs: {
      P0: "Grounding from strategicAssertions[] + causalEdges[]; regex/phrase checks defense-in-depth only",
      P1: "Structural evidence entailment — existence ≠ support; canonical oracle/mechanism precedes RAG/research",
      P2: "Rules evidence resolved from pinned comprehensive-rules ledger, not hardcoded rules catalog",
      P3: "Immutable per-run evidence ledger — all cited refs must resolve against preserved retrieval spans",
      P4: "Harmony from validated PRODUCES/REQUIRES/CONSUMES resource states, not string label equality",
      P5: "Commander dependency inferred from validated assertion graph, not Professor self-declaration alone",
      P6: "Normalizer reference integrity for all relationship lenses + assertion/edge validation",
      P7: "Full v3 agent orchestration wired (preflight → ledger → normalize → validate → repair loop); model call fail-closed",
    },
    gateV4Disposition: {
      status: "PREPARED_NOT_EXECUTED_SUPERSEDED",
      supersessionArtifact: "phase6a1-professor-plan-serialization-pilot-gate-v4-supersession-v1.json",
      supersessionSha256: existsSync(PATHS.gateV4Supersession) ? sha256File(PATHS.gateV4Supersession) : null,
    },
    priorReviewArtifacts: {
      reportV2: "phase6a1-professor-v3-architecture-review-report-v2.json",
      reportV2Sha256: existsSync(PATHS.priorReviewReportV2) ? sha256File(PATHS.priorReviewReportV2) : null,
      zipV2: "phase6a1-professor-v3-architecture-review-v2.zip",
      zipV2Sha256: existsSync(PATHS.priorReviewZipV2) ? sha256File(PATHS.priorReviewZipV2) : null,
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
    },
    componentHashes: Object.fromEntries(
      Object.entries(PATHS).map(([k, p]) => [k, { path: p.replace(/\\/g, "/"), sha256: existsSync(p) ? sha256File(p) : null }]),
    ),
    deterministicFixtures: {
      auditArtifact: "phase6a1-professor-v3-grounding-fixtures-audit-v3.json",
      present: existsSync(fixtureAuditPath),
      sha256: existsSync(fixtureAuditPath) ? sha256File(fixtureAuditPath) : null,
      regressionCount: 10,
      adversarialCountV2: 12,
      typedAdversarialCountV3: 9,
      normalizationCount: 1,
      totalCount: 32,
    },
    typedAdversarialCoverage: [
      "invented hexproof claim + valid Muldrotha evidence → reject",
      "invented tutor claim + valid Muldrotha evidence → reject",
      "valid Oracle span exists but does not entail typed assertion → reject",
      "known rules ID but irrelevant rule → does not ground claim",
      "known research ID but irrelevant evidence → does not ground claim",
      "RAG with high lexical overlap but wrong causal meaning → does not ground claim",
      "matching Harmony resource strings but producer evidence does not prove production → underdetermined",
      "validated producer output + validated consumer requirement → Harmony accept",
      "package claims independence but validated chain requires commander permission → reject/reclassify",
      "dangling relationship endpoint under non-Harmony lens → normalization failure",
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
