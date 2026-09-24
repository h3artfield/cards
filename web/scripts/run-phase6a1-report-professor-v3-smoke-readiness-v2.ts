#!/usr/bin/env npx tsx
/** Smoke-readiness v2 report. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { PROFESSOR_V3_SMOKE_EXECUTION_PINS_V2_PATH } from "./lib/phase6a1-professor-v3-smoke-material-pins-v2";

const OUT_REPORT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-report-v2.json");
const OUT_AUDIT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-audit-v2.json");

function main() {
  if (!existsSync(OUT_AUDIT)) throw new Error("Missing smoke readiness audit v2");
  const audit = JSON.parse(readFileSync(OUT_AUDIT, "utf8")) as {
    passed: number;
    totalChecks: number;
    failed: number;
  };
  const report = {
    version: "phase6a1-professor-v3-smoke-readiness-report-v2",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V2_EXECUTION_SEAL_AND_EXACT_IO_REQUIRED",
    priorDecision: "PROFESSOR_V3_ARCHITECTURE_V5_PASS_SMOKE_EXECUTION_READINESS_BLOCK_V1",
    executionStatus: "SMOKE_READINESS_V2_ONLY_NO_MODEL_EXECUTION",
    instruction: "REPORT AND WAIT — execution seal + exact IO delta submitted. Next authorization: exactly one real Muldrotha Professor v3 smoke run with --execute.",
    audit: {
      artifact: "phase6a1-professor-v3-smoke-readiness-audit-v2.json",
      sha256: sha256File(OUT_AUDIT),
      passed: audit.passed,
      totalChecks: audit.totalChecks,
      failed: audit.failed,
    },
    reviewedExecutionPins: {
      artifact: "phase6a1-professor-v3-smoke-execution-pins-v2.json",
      sha256: existsSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V2_PATH) ? sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V2_PATH) : null,
    },
    executeRunner: {
      script: "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts",
      executeSwitch: "--execute",
      requireLensCoverage: true,
      preparedNotExecuted: true,
    },
    repairsDelivered: {
      P0: "Reviewed execution pins compared fail-closed before model; negative mutated-byte fixture",
      P1: "Exact API request/response bytes preserved at model-caller boundary with byte-accurate SHAs",
      P2: "Repair instructions supplement refreshed modelVisibleText; tool evidence visible during repair rounds",
      P3: "modelAttemptsDir + stale attempt-* artifacts preflighted absent before model",
      P4: "FAILED_EXCEPTION forensic seal for thrown API/parse/caller failures",
    },
    nextAuthorizedStep:
      "Exactly one real Muldrotha Professor v3 smoke run: npx tsx scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts --execute",
  };
  writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_REPORT, sha256: sha256File(OUT_REPORT), auditPassed: audit.passed, auditTotal: audit.totalChecks }, null, 2));
}

main();
