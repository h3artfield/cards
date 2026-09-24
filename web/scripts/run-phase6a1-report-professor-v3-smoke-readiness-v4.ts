#!/usr/bin/env npx tsx
/** Smoke-readiness v4 report. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V4 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v4";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V3_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V3_PATH,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";

const OUT_REPORT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-report-v4.json");
const OUT_AUDIT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-audit-v4.json");

function main() {
  if (!existsSync(OUT_AUDIT)) throw new Error("Missing smoke readiness audit v4");
  const audit = JSON.parse(readFileSync(OUT_AUDIT, "utf8")) as {
    passed: number;
    totalChecks: number;
    failed: number;
  };
  const report = {
    version: "phase6a1-professor-v3-smoke-readiness-report-v4",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V4_INITIAL_RAG_AND_FAILURE_SEAL_CLOSURE_REQUIRED",
    priorDecision: "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V3_PIN_ROOT_AND_FAILURE_BOUNDARY_REQUIRED",
    executionStatus: "SMOKE_READINESS_V4_ONLY_NO_MODEL_EXECUTION",
    instruction: "REPORT AND WAIT — initial RAG + failure seal + authorization root delta submitted. Next authorization: exactly one real Muldrotha Professor v3 smoke run with --execute.",
    audit: {
      artifact: "phase6a1-professor-v3-smoke-readiness-audit-v4.json",
      sha256: sha256File(OUT_AUDIT),
      passed: audit.passed,
      totalChecks: audit.totalChecks,
      failed: audit.failed,
    },
    independentlyReviewedExecutionAuthorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V4,
    reviewedExecutionIdentity: {
      artifact: "phase6a1-professor-v3-smoke-execution-identity-v3.json",
      sha256: existsSync(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V3_PATH)
        ? sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V3_PATH)
        : null,
    },
    reviewedExecutionPins: {
      artifact: "phase6a1-professor-v3-smoke-execution-pins-v3.json",
      sha256: existsSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V3_PATH) ? sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V3_PATH) : null,
    },
    executeRunner: {
      script: "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts",
      executeSwitch: "--execute",
      requireLensCoverage: true,
      preparedNotExecuted: true,
    },
    repairsDelivered: {
      P0: "Real smoke uses async buildProfessorPlanningContextV3 with initial COMMANDER_PRIMER + PACKAGE retrieval",
      P1: "FAILED_EXCEPTION manifest binds all partial attempt-* files with path/byteSize/sha256",
      P2: "Independent authorization root verified before execution; coordinated drift fails closed",
      P3: "Commander truth, async context/RAG, and orchestration share one failure-finalization boundary",
    },
    nextAuthorizedStep:
      "Exactly one real Muldrotha Professor v3 smoke run: npx tsx scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts --execute",
  };
  writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_REPORT, sha256: sha256File(OUT_REPORT), auditPassed: audit.passed, auditTotal: audit.totalChecks }, null, 2));
}

main();
