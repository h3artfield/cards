#!/usr/bin/env npx tsx
/** Report Professor v3 successor schema repair readiness bundle v1. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V6 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v6";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V5_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V5_PATH,
  verifyProfessorV3SmokeExecutionAuthorizationV6,
  verifyProfessorV3SmokeExecutionIdentityV5,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v5";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-successor-schema-repair-report-v1.json");
const AUDIT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-successor-schema-repair-audit-v1.json");
const MANIFEST_PATH = resolve(MILESTONES, "phase6a1-professor-v3-successor-schema-repair-v1-manifest.json");

function main() {
  if (!existsSync(AUDIT_PATH)) throw new Error(`Missing audit artifact: ${AUDIT_PATH}`);
  const audit = JSON.parse(readFileSync(AUDIT_PATH, "utf8")) as {
    passed: number;
    totalChecks: number;
    failed: number;
  };
  const identity = verifyProfessorV3SmokeExecutionIdentityV5();
  const authorization = verifyProfessorV3SmokeExecutionAuthorizationV6();

  const report = {
    version: "phase6a1-professor-v3-successor-schema-repair-report-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_SUCCESSOR_SMOKE_V1_SPENT_FAIL_API_SCHEMA_TYPE_ANNOTATION_REPAIR_REQUIRED_NO_MODEL",
    readinessStatus: audit.failed === 0 && identity.ok && authorization.ok ? "PASS" : "FAIL",
    spentSuccessorSmokeV1Preserved: true,
    openAiCallsInThisBlock: 0,
    audit: {
      path: AUDIT_PATH,
      sha256: sha256File(AUDIT_PATH),
      passed: audit.passed,
      totalChecks: audit.totalChecks,
      failed: audit.failed,
    },
    independentlyReviewedExecutionAuthorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V6,
    reviewedExecutionIdentity: identity.ok ? identity.identity : identity,
    executionPinsArtifact: {
      path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V5_PATH,
      sha256: existsSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V5_PATH) ? sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V5_PATH) : null,
    },
    stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v5-successor-v2",
    instruction: "REPORT AND WAIT — schema type-annotation repair submitted. Next authorization: exactly one new Muldrotha Professor v3 successor smoke v2.",
    nextAuthorizedStep: "Exactly one successor Muldrotha Professor v3 smoke v2 run only after independent schema repair pass",
    bundleManifest: existsSync(MANIFEST_PATH)
      ? { path: MANIFEST_PATH, sha256: sha256File(MANIFEST_PATH) }
      : { path: MANIFEST_PATH, sha256: null, note: "Run package script after audit pass" },
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: OUT_PATH, sha256: sha256File(OUT_PATH), readinessStatus: report.readinessStatus }, null, 2));
  if (report.readinessStatus !== "PASS") process.exit(1);
}

main();
