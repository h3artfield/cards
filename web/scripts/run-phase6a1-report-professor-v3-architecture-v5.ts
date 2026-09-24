#!/usr/bin/env npx tsx
/** Professor v3 architecture review report v5 — final structural wiring repair. */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { TYPED_ASSERTION_GROUNDING_V3_VERSION } from "../src/lib/deck-synthesis/typed-assertion-grounding-v3";
import { PROFESSOR_FUNCTIONAL_ROLES_V3_VERSION } from "../src/lib/deck-synthesis/professor-functional-roles-v3";
import { PROFESSOR_V3_RUN_LEDGER_V1_VERSION } from "../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import { PROFESSOR_V3_EXECUTION_TRACE_V1_VERSION } from "../src/lib/deck-synthesis/professor-v3-execution-trace-v1";
import { PROFESSOR_PLAN_AGENT_V3_VERSION } from "./lib/phase6a1-professor-plan-agent-v3";
import { PROFESSOR_V3_PROMPT_PAYLOAD_V1_VERSION } from "./lib/phase6a1-professor-v3-prompt-payload-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPORT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-architecture-review-report-v5.json");

function main() {
  const auditPath = resolve(MILESTONES, "phase6a1-professor-v3-grounding-fixtures-audit-v5.json");
  const smokePath = resolve(MILESTONES, "phase6a1-professor-v3-smoke-muldrotha-prepared-v1.json");
  const report = {
    version: "phase6a1-professor-v3-architecture-review-report-v5",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V4_FINAL_STRUCTURAL_WIRING_REPAIR_REQUIRED",
    priorReviewDecision: "PROFESSOR_V3_ARCHITECTURE_CORE_PASS_MODEL_EXECUTION_BLOCK_V3_PROMPT_AGENT_LEDGER_AND_STATE_ENTAILMENT_REQUIRED",
    executionStatus: "ARCHITECTURE_REVIEW_ONLY_NO_MODEL_EXECUTION",
    instruction:
      "REPORT AND WAIT — final structural wiring repair submitted. Prepared Muldrotha smoke runner included but NOT executed. Next authorization target: one real Muldrotha Professor v3 smoke run only.",
    repairsDelivered: {
      P0: "Coherent per-fact mechanical matching — no cross-fact dimension pooling; cross-fact composition requires SEMANTIC_RELATIONSHIP",
      P1: "Source-faithful state derivation — Treasure≠creature tokens, exile removal≠playable, opponent mill≠controller graveyard permanents",
      P2: "Real model→tool→refreshed payload→model orchestration with tool/mode/chunk budget enforcement",
      P3: "Append-only run ledger + execution trace — evidence objects separate from retrieval events; per-attempt payload/response SHAs",
      P4: "Authoritative semantic relationships from mechanism truth + fact-family derivation; opportunity edges optional hints",
      P5: "AUTO lens defined; required four-lens coverage validator; versioned functional role vocabulary enforced at normalization",
    },
    componentVersions: {
      typedAssertionGrounding: TYPED_ASSERTION_GROUNDING_V3_VERSION,
      functionalRoles: PROFESSOR_FUNCTIONAL_ROLES_V3_VERSION,
      runLedger: PROFESSOR_V3_RUN_LEDGER_V1_VERSION,
      executionTrace: PROFESSOR_V3_EXECUTION_TRACE_V1_VERSION,
      agent: PROFESSOR_PLAN_AGENT_V3_VERSION,
      promptPayload: PROFESSOR_V3_PROMPT_PAYLOAD_V1_VERSION,
    },
    deterministicFixtures: {
      auditArtifact: "phase6a1-professor-v3-grounding-fixtures-audit-v5.json",
      sha256: existsSync(auditPath) ? sha256File(auditPath) : null,
      totalCount: 57,
    },
    preparedSmokeRunner: {
      artifact: "phase6a1-professor-v3-smoke-muldrotha-prepared-v1.json",
      sha256: existsSync(smokePath) ? sha256File(smokePath) : null,
      executed: false,
    },
    prohibitedUntilReview: ["OpenAI / Professor model calls", "gate-v4 execution", "serialization pilot v8 rerun"],
    nextAuthorizedStep: "One real Muldrotha Professor v3 smoke run only, after independent v5 review pass",
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: REPORT_PATH, sha256: sha256File(REPORT_PATH) }, null, 2));
}

main();
