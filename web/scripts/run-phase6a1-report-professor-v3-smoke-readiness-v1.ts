#!/usr/bin/env npx tsx
/** Smoke-readiness report for Professor v3 Muldrotha execution delta. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { buildProfessorV3SemanticRelationshipSourceIdentity } from "./lib/phase6a1-professor-v3-semantic-relationship-source-v1";
import { buildProfessorV3SmokeMaterialPinReport } from "./lib/phase6a1-professor-v3-smoke-material-pins-v1";
import { PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES } from "./lib/phase6a1-professor-v3-smoke-output-targets-v1";

const OUT_REPORT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-report-v1.json");
const OUT_AUDIT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-audit-v1.json");

function main() {
  if (!existsSync(OUT_AUDIT)) {
    throw new Error("Missing smoke readiness audit — run run-phase6a1-test-professor-v3-smoke-readiness-v1.ts first");
  }
  const audit = JSON.parse(readFileSync(OUT_AUDIT, "utf8")) as {
    passed: number;
    totalChecks: number;
    failed: number;
    checks: Array<{ id: string; pass: boolean }>;
  };

  const report = {
    version: "phase6a1-professor-v3-smoke-readiness-report-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_V5_PASS_SMOKE_EXECUTION_READINESS_BLOCK_V1",
    priorDecision: "PROFESSOR_V3_ARCHITECTURE_V5_PASS_SMOKE_EXECUTION_BLOCK_V4_FINAL_STRUCTURAL_WIRING_REPAIR_REQUIRED",
    executionStatus: "SMOKE_READINESS_ONLY_NO_MODEL_EXECUTION",
    instruction: "REPORT AND WAIT — smoke execution delta submitted. Execute runner prepared but NOT executed. Next authorization: exactly one real Muldrotha Professor v3 smoke run with --execute.",
    audit: {
      artifact: "phase6a1-professor-v3-smoke-readiness-audit-v1.json",
      sha256: sha256File(OUT_AUDIT),
      passed: audit.passed,
      totalChecks: audit.totalChecks,
      failed: audit.failed,
    },
    executeRunner: {
      script: "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts",
      executeSwitch: "--execute",
      requireLensCoverage: true,
      preparedNotExecuted: true,
    },
    writeOnceOutputTargets: Object.values(PROFESSOR_V3_SMOKE_MULDROTHA_ARTIFACT_BASENAMES),
    materialPins: buildProfessorV3SmokeMaterialPinReport(),
    semanticRelationshipSource: buildProfessorV3SemanticRelationshipSourceIdentity({ caseId: "multi-muldrotha" }),
    repairsDelivered: {
      P0: "New immutable execute runner with --execute gate, model pin + modelCaller binding, material SHA pins",
      P1: "Real smoke requires requireLensCoverage=true and four product lenses",
      P2: "Write-once raw model attempt byte artifacts via modelAttemptArtifactSink",
      P3: "Normalization failures consume maxRepairRounds repair budget",
      P4: "repairPrompt preserved through tool refresh model calls",
      P5: "REAL_SMOKE executionStatus values distinct from architecture-review artifacts",
      P6: "Runtime tool-request object validation — nonblank query, positive integer limit, fail closed",
      P7: "Semantic relationship source identity pinned — no separate Muldrotha frozen v3.2.2 case",
      P8: "Write-once smoke output targets preflighted absent before execution",
    },
    prohibitedUntilAuthorization: [
      "Second Muldrotha smoke run",
      "5-case Professor run",
      "gate-v4 execution",
      "serialization pilot v8 rerun",
      "production closure",
    ],
    nextAuthorizedStep: "Exactly one real Muldrotha Professor v3 smoke run: npx tsx scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts --execute",
  };

  writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_REPORT, sha256: sha256File(OUT_REPORT), auditPassed: audit.passed, auditTotal: audit.totalChecks }, null, 2));
}

main();
