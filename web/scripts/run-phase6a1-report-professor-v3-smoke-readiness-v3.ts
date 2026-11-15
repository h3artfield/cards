#!/usr/bin/env npx tsx
/** Smoke-readiness v3 report. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V3_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V3_PATH,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";

const OUT_REPORT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-report-v3.json");
const OUT_AUDIT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-audit-v3.json");

function main() {
  if (!existsSync(OUT_AUDIT)) throw new Error("Missing smoke readiness audit v3");
  const audit = JSON.parse(readFileSync(OUT_AUDIT, "utf8")) as {
    passed: number;
    totalChecks: number;
    failed: number;
  };
  const report = {
    version: "phase6a1-professor-v3-smoke-readiness-report-v3",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V3_PIN_ROOT_AND_FAILURE_BOUNDARY_REQUIRED",
    priorDecision: "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V2_EXECUTION_SEAL_AND_EXACT_IO_REQUIRED",
    executionStatus: "SMOKE_READINESS_V3_ONLY_NO_MODEL_EXECUTION",
    instruction: "REPORT AND WAIT — pin root + staged IO + failure boundary delta submitted. Next authorization: exactly one real Muldrotha Professor v3 smoke run with --execute.",
    audit: {
      artifact: "phase6a1-professor-v3-smoke-readiness-audit-v3.json",
      sha256: sha256File(OUT_AUDIT),
      passed: audit.passed,
      totalChecks: audit.totalChecks,
      failed: audit.failed,
    },
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
      P0: "Expanded 56-file execution import closure + externally reviewed identity JSON anchors (runner, pins artifact, dependency manifest)",
      P1: "Staged model IO: request before fetch, raw response before parse/check, success artifacts afterward",
      P2: "Orchestration onProgress preserves latest execution trace + run ledger on thrown exceptions",
    },
    nextAuthorizedStep:
      "Exactly one real Muldrotha Professor v3 smoke run: npx tsx scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts --execute",
  };
  writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_REPORT, sha256: sha256File(OUT_REPORT), auditPassed: audit.passed, auditTotal: audit.totalChecks }, null, 2));
}

main();
