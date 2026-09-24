#!/usr/bin/env npx tsx
/** Report Professor v3 incomplete-response output-budget repair bundle v1. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V7 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v7";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V6_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V6_PATH,
  verifyProfessorV3SmokeExecutionAuthorizationV7,
  verifyProfessorV3SmokeExecutionIdentityV6,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v6";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-incomplete-response-output-budget-repair-report-v1.json");
const AUDIT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-incomplete-response-output-budget-repair-audit-v1.json");
const MANIFEST_PATH = resolve(MILESTONES, "phase6a1-professor-v3-incomplete-response-output-budget-repair-v1-manifest.json");
const DECISION = "PROFESSOR_V3_INCOMPLETE_RESPONSE_AND_OUTPUT_BUDGET_REPAIR_V1_AUTHORIZED_NO_MODEL";

function main() {
  if (!existsSync(AUDIT_PATH)) throw new Error(`Missing audit artifact: ${AUDIT_PATH}`);
  const audit = JSON.parse(readFileSync(AUDIT_PATH, "utf8")) as {
    passed: number;
    totalChecks: number;
    failed: number;
  };
  const identity = verifyProfessorV3SmokeExecutionIdentityV6();
  const authorization = verifyProfessorV3SmokeExecutionAuthorizationV7();

  const report = {
    version: "phase6a1-professor-v3-incomplete-response-output-budget-repair-report-v1",
    generatedAt: new Date().toISOString(),
    decision: DECISION,
    readinessStatus: audit.failed === 0 && identity.ok && authorization.ok ? "PASS" : "FAIL",
    spentSuccessorSmokeV1Preserved: true,
    spentSuccessorSmokeV2Preserved: true,
    openAiCallsInThisBlock: 0,
    audit: {
      path: AUDIT_PATH,
      sha256: sha256File(AUDIT_PATH),
      passed: audit.passed,
      totalChecks: audit.totalChecks,
      failed: audit.failed,
    },
    independentlyReviewedExecutionAuthorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V7,
    reviewedExecutionIdentity: identity.ok ? identity.identity : identity,
    executionPinsArtifact: {
      path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V6_PATH,
      sha256: existsSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V6_PATH) ? sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V6_PATH) : null,
    },
    stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v6-successor-v3",
    instruction: "REPORT AND WAIT — incomplete-response/output-budget repair submitted. No Muldrotha rerun. Next gate: separately authorized successor-v3 prospective smoke.",
    nextAuthorizedStep:
      "Fresh successor-v3 prospective smoke only after independent authorization with new external anchors",
    bundleManifest: existsSync(MANIFEST_PATH)
      ? { path: MANIFEST_PATH, sha256: sha256File(MANIFEST_PATH) }
      : { path: MANIFEST_PATH, sha256: null, note: "Run package script after audit pass" },
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: OUT_PATH, sha256: sha256File(OUT_PATH), readinessStatus: report.readinessStatus }, null, 2));
  if (report.readinessStatus !== "PASS") process.exit(1);
}

main();
